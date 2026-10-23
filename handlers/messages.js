const { askGeminiStream } = require('../gemini');
const { getChatState, addExchange } = require('../memory');
const { splitMessage, sendReply } = require('../utils');
const { buildUserInput } = require('../media');
const { enqueue } = require('../queue');
const { checkAccess } = require('../guard');
const { log } = require('../logger');

const EDIT_INTERVAL_MS = 1500;
const LIVE_LIMIT = 4000;

function registerMessages(bot) {
  async function handleMessage(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    const kind = msg.text ? 'text' : msg.photo ? 'photo' : msg.voice ? 'voice' : 'file';

    let placeholder = null;
    let lastEdit = 0;
    let lastShown = '';

    function liveEdit(current) {
      const now = Date.now();
      if (!placeholder || now - lastEdit < EDIT_INTERVAL_MS) return;

      const shown = current.length > LIVE_LIMIT ? current.slice(0, LIVE_LIMIT) + ' …' : current;
      if (shown === lastShown) return;

      lastEdit = now;
      lastShown = shown;
      bot
        .editMessageText(shown, { chat_id: chatId, message_id: placeholder.message_id })
        .catch(() => {});
    }

    const start = Date.now();
    try {
      placeholder = await bot.sendMessage(chatId, '…');

      const { history, epoch } = await getChatState(chatId);

      const input = await buildUserInput(bot, msg);
      if (!input) throw new Error('Unsupported message type');

      const answer = await askGeminiStream(history, input.parts, liveEdit);
      log.info(`user ${userId} (${kind}) answered in ${((Date.now() - start) / 1000).toFixed(1)}s`);

      await addExchange(chatId, input.label, answer, epoch);

      const chunks = splitMessage(answer);
      const target = { chat_id: chatId, message_id: placeholder.message_id };
      try {
        await bot.editMessageText(chunks[0], { ...target, parse_mode: 'Markdown' });
      } catch (e) {
        try {
          await bot.editMessageText(chunks[0], target);
        } catch (e2) {
          // "message is not modified" means it is already correct
        }
      }
      for (const chunk of chunks.slice(1)) {
        await sendReply(bot, chatId, chunk);
      }
    } catch (err) {
      log.error(`user ${userId} (${kind}) failed: ${err.message}`);
      const failText = err.userMessage || 'Sorry, something went wrong. Try again in a minute.';
      if (placeholder) {
        bot
          .editMessageText(failText, { chat_id: chatId, message_id: placeholder.message_id })
          .catch(() => bot.sendMessage(chatId, failText));
      } else {
        bot.sendMessage(chatId, failText).catch(() => {});
      }
    }
  }

  bot.on('message', (msg) => {
    const chatId = msg.chat.id;

    if (msg.text && msg.text.startsWith('/')) return;
    if (!(msg.text || msg.photo || msg.document || msg.voice)) return;

    // Allowlist + rate limit, before anything costs money
    if (!checkAccess(bot, msg, { rateLimit: true })) return;

    const queued = enqueue(chatId, () => handleMessage(msg));
    if (queued === null) {
      bot.sendMessage(chatId, 'Too many messages at once. Please wait for my replies first. 🙏').catch(() => {});
    }
  });
}

module.exports = { registerMessages };