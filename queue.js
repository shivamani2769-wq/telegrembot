const tails = new Map();   // chatId -> the last task in that chat's line
const counts = new Map();  // chatId -> how many tasks are waiting or running
const MAX_PENDING = 5;     // stops someone from spamming 50 messages

// Runs task() after all earlier tasks of the same chat have finished.
// Returns null if the chat already has too many messages waiting.
function enqueue(chatId, task) {
  const waiting = counts.get(chatId) || 0;
  if (waiting >= MAX_PENDING) return null;

  counts.set(chatId, waiting + 1);

  const previous = tails.get(chatId) || Promise.resolve();
  const current = previous
    .catch(() => {})  // an earlier failure must not block the line
    .then(task)
    .finally(() => {
      const left = (counts.get(chatId) || 1) - 1;
      if (left <= 0) {
        counts.delete(chatId);
        tails.delete(chatId);
      } else {
        counts.set(chatId, left);
      }
    });

  tails.set(chatId, current);
  return current;
}

module.exports = { enqueue };