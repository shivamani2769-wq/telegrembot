// Split long text into chunks under Telegram's 4096-character limit
function splitMessage(text, limit = 4000) {
  const chunks = [];
  let rest = text;

  while (rest.length > limit) {
    let cut = rest.lastIndexOf('\n', limit);
    if (cut < limit * 0.5) cut = rest.lastIndexOf(' ', limit);
    if (cut < limit * 0.5) cut = limit;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }

  if (rest) chunks.push(rest);
  return chunks;
}

// Send a reply with formatting; fall back to plain text if Telegram can't parse it
async function sendReply(bot, chatId, text) {
  for (const chunk of splitMessage(text)) {
    try {
      await bot.sendMessage(chatId, chunk, { parse_mode: 'Markdown' });
    } catch (err) {
      await bot.sendMessage(chatId, chunk);
    }
  }
}

module.exports = { splitMessage, sendReply };