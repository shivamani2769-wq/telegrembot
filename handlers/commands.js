const { clearHistory } = require('../memory');
const { checkAccess } = require('../guard');
const { log } = require('../logger');

function registerCommands(bot) {
  bot.setMyCommands([
    { command: 'start', description: 'Start the bot' },
    { command: 'help', description: 'How to use this bot' },
    { command: 'reset', description: 'Start a fresh conversation' },
    { command: 'id', description: 'Show your Telegram ID' },
  ]);

  // Works for everyone, so people can send you their ID to get added
  bot.onText(/^\/id\b/, (msg) => {
    bot.sendMessage(msg.chat.id, `Your Telegram ID: ${msg.from?.id}`);
  });

  bot.onText(/^\/start/, (msg) => {
    if (!checkAccess(bot, msg)) return;
    const name = msg.from?.first_name || 'there';
    bot.sendMessage(
      msg.chat.id,
      `Hi ${name}! 👋 I'm an AI chatbot. Ask me anything and I'll do my best to answer.\n\nType /help to see what I can do.`
    );
  });

  bot.onText(/^\/help/, (msg) => {
    if (!checkAccess(bot, msg)) return;
    bot.sendMessage(
      msg.chat.id,
      'Just send me any question, photo, PDF, text file or voice message. I remember our recent conversation.\n\n' +
        'Commands:\n' +
        '/start - start the bot\n' +
        '/help - show this message\n' +
        '/reset - clear my memory and start fresh\n' +
        '/id - show your Telegram ID'
    );
  });

  bot.onText(/^\/reset/, async (msg) => {
    if (!checkAccess(bot, msg)) return;
    try {
      await clearHistory(msg.chat.id);
      await bot.sendMessage(msg.chat.id, 'Memory cleared! 🧹 Starting a fresh conversation.');
    } catch (err) {
      log.error('reset failed:', err.message);
      bot.sendMessage(msg.chat.id, "Couldn't clear memory right now. Try again in a minute.").catch(() => {});
    }
  });
}

module.exports = { registerCommands };