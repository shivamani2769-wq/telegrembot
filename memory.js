const { getChats } = require('./db');

const MAX_MESSAGES = 20; // last 10 exchanges (user + bot)

// One read gives both the history and the reset counter
async function getChatState(chatId) {
  const doc = await getChats().findOne({ _id: chatId });
  return { history: doc?.messages || [], epoch: doc?.epoch || 0 };
}

// Saves an exchange only if the chat was not reset since the reply started.
// The filter { _id, epoch } is what makes this safe: after a reset the epoch
// no longer matches, the upsert hits a duplicate _id, and nothing is saved.
async function addExchange(chatId, userText, botText, epoch = 0) {
  try {
    await getChats().updateOne(
      { _id: chatId, epoch },
      {
        $push: {
          messages: {
            $each: [
              { role: 'user', parts: [{ text: userText }] },
              { role: 'model', parts: [{ text: botText }] },
            ],
            $slice: -MAX_MESSAGES, // keep only the newest messages
          },
        },
        $set: { updatedAt: new Date() },
      },
      { upsert: true }
    );
    return true;
  } catch (err) {
    if (err.code === 11000) {
      console.log(`[memory] chat ${chatId} was reset during this reply, not saving it`);
      return false;
    }
    throw err;
  }
}

async function clearHistory(chatId) {
  await getChats().updateOne(
    { _id: chatId },
    { $set: { messages: [], updatedAt: new Date() }, $inc: { epoch: 1 } },
    { upsert: true }
  );
  console.log(`[memory] chat ${chatId} cleared`);
}

module.exports = { getChatState, addExchange, clearHistory };