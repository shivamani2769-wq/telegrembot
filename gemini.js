const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const SYSTEM_PROMPT =
  'You are a friendly, helpful AI assistant chatting on Telegram. ' +
  'For simple questions, keep answers short and clear. ' +
  'When the user asks for something long, such as an essay, a detailed explanation, or a specific word count, ' +
  'write the full thing at the requested length. Never refuse or shorten a request because of length; ' +
  'long replies are automatically split into several messages. ' +
  'Reply in the same language the user writes in. ' +
  'Formatting rules: do not use asterisks or # headers. Use "-" for lists. ' +
  'Put code in triple-backtick blocks and short code in single backticks. ' +
  'If a question contains a wrong assumption, politely correct it. ' +
  'If you are unsure, or the information may be out of date, say so.';

const FALLBACK_TEXT = "I couldn't come up with a reply. Try rephrasing.";

// Reads the streamed response and calls onText(fullTextSoFar) after each piece
async function readStream(res, onText) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  function processLine(line) {
    if (!line.startsWith('data:')) return;
    const json = line.slice(5).trim();
    if (!json || json === '[DONE]') return;
    try {
      const data = JSON.parse(json);
      const piece =
        data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
      if (piece) {
        full += piece;
        onText(full);
      }
    } catch (e) {
      // ignore incomplete JSON
    }
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop(); // keep the unfinished last line for the next round
    lines.forEach(processLine);
  }
  processLine(buffer);

  return full || FALLBACK_TEXT;
}

async function askGeminiStream(history, userParts, onText) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [...history, { role: 'user', parts: userParts }],
  });

  const maxAttempts = 4;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body,
    });

    if (res.ok) return await readStream(res, onText);

    const retryable = [429, 500, 503].includes(res.status);
    if (retryable && attempt < maxAttempts) {
      const waitMs = attempt * 3000;
      console.log(`Gemini ${res.status}, retrying in ${waitMs / 1000}s (attempt ${attempt}/${maxAttempts})`);
      await sleep(waitMs);
      continue;
    }

    const errText = await res.text();
    throw new Error(`Gemini ${res.status}: ${errText}`);
  }
}

module.exports = { askGeminiStream };