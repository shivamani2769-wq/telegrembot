const MAX_BYTES = 10 * 1024 * 1024; // 10 MB limit per file
const MAX_TEXT_CHARS = 30000;       // limit for text/code files

// An error whose message is safe to show to the user
function userError(message) {
  const err = new Error(message);
  err.userMessage = message;
  return err;
}

async function downloadFile(bot, fileId) {
  const link = await bot.getFileLink(fileId); // this link contains your bot token, never log it
  const res = await fetch(link);
  if (!res.ok) throw new Error(`File download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function checkSize(size) {
  if (size && size > MAX_BYTES) throw userError('That file is too big. The limit is 10 MB.');
}

// Turns a Telegram message into { parts, label }
// parts = what we send to Gemini, label = short text saved in memory
async function buildUserInput(bot, msg) {
  const caption = msg.caption || '';

  // Plain text
  if (msg.text) {
    return { parts: [{ text: msg.text }], label: msg.text };
  }

  // Photo (Telegram sends several sizes, the last one is the biggest)
  if (msg.photo) {
    const best = msg.photo[msg.photo.length - 1];
    checkSize(best.file_size);
    const buf = await downloadFile(bot, best.file_id);
    return {
      parts: [
        { inlineData: { mimeType: 'image/jpeg', data: buf.toString('base64') } },
        { text: caption || 'Describe this image.' },
      ],
      label: `[Photo] ${caption}`.trim(),
    };
  }

  // Voice message
  if (msg.voice) {
    checkSize(msg.voice.file_size);
    const buf = await downloadFile(bot, msg.voice.file_id);
    return {
      parts: [
        { inlineData: { mimeType: msg.voice.mime_type || 'audio/ogg', data: buf.toString('base64') } },
        { text: 'Listen to this voice message and reply to what the person says, in the same language they speak.' },
      ],
      label: '[Voice message]',
    };
  }

  // Files: PDF, images sent as files, text and code files
  if (msg.document) {
    const doc = msg.document;
    checkSize(doc.file_size);
    const mime = doc.mime_type || '';
    const name = doc.file_name || 'file';

    if (mime === 'application/pdf' || mime.startsWith('image/')) {
      const buf = await downloadFile(bot, doc.file_id);
      const fallback = mime === 'application/pdf' ? 'Summarize this document.' : 'Describe this image.';
      return {
        parts: [
          { inlineData: { mimeType: mime, data: buf.toString('base64') } },
          { text: caption || fallback },
        ],
        label: `[File: ${name}] ${caption}`.trim(),
      };
    }

    const looksLikeText = mime.startsWith('text/') || /\.(txt|md|csv|json|js|py|html|css|c|cpp|java)$/i.test(name);
    if (looksLikeText) {
      const buf = await downloadFile(bot, doc.file_id);
      let content = buf.toString('utf8');
      if (content.length > MAX_TEXT_CHARS) content = content.slice(0, MAX_TEXT_CHARS) + '\n[...file truncated]';
      const prompt = caption || 'Summarize this file.';
      return {
        parts: [{ text: `${prompt}\n\nFile "${name}":\n${content}` }],
        label: `[File: ${name}] ${caption}`.trim(),
      };
    }

    throw userError('I can read photos, PDFs, text/code files and voice messages. That file type is not supported yet.');
  }

  return null;
}

module.exports = { buildUserInput };