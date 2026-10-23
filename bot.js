require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { connectDb, closeDb } = require('./db');
const { registerCommands } = require('./handlers/commands');
const { registerMessages } = require('./handlers/messages');
const { accessSummary } = require('./guard');
const { log } = require('./logger');

const token = process.env.TELEGRAM_TOKEN;
if (!token) {
  console.error('Missing TELEGRAM_TOKEN in .env');
  process.exit(1);
}

// A stray promise error should be logged, not crash the whole bot
process.on('unhandledRejection', (reason) => {
  log.error('Unhandled rejection:', reason?.message || reason);
});

async function main() {
  await connectDb();
  log.info('MongoDB connected');

  const bot = new TelegramBot(token, { polling: true });

  registerCommands(bot);
  registerMessages(bot);

  bot.on('polling_error', (err) => log.error('Polling error:', err.message));

  // Clean shutdown on Ctrl + C
  let stopping = false;
  async function shutdown(signal) {
    if (stopping) return;
    stopping = true;
    log.info(`${signal} received, shutting down...`);
    try { await bot.stopPolling(); } catch (e) {}
    try { await closeDb(); } catch (e) {}
    process.exit(0);
  }
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  log.info(`Bot is running. Access: ${accessSummary()}`);
}

main().catch((err) => {
  log.error('Startup failed:', err.message);
  process.exit(1);
});