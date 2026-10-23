const { log } = require('./logger');

const RATE_LIMIT = 8;           // max AI messages per user...
const RATE_WINDOW_MS = 60_000;  // ...per minute
const NOTICE_COOLDOWN_MS = 60_000;

let allowed = null; // loaded lazily so .env is already read
function getAllowed() {
  if (!allowed) {
    allowed = new Set(
      (process.env.ALLOWED_USERS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map(Number)
    );
  }
  return allowed;
}

const hits = new Map();     // userId -> timestamps of recent messages
const notified = new Map(); // "kind:userId" -> time of last notice

function isAllowed(userId) {
  const set = getAllowed();
  return set.size === 0 || set.has(userId); // empty list = open to everyone
}

function accessSummary() {
  const n = getAllowed().size;
  return n === 0
    ? 'OPEN TO EVERYONE (set ALLOWED_USERS in .env to restrict)'
    : `restricted to ${n} allowed user(s)`;
}

function checkRate(userId) {
  const now = Date.now();
  const recent = (hits.get(userId) || []).filter((t) => now - t < RATE_WINDOW_MS);

  if (recent.length >= RATE_LIMIT) {
    hits.set(userId, recent);
    return { ok: false, retryAfter: Math.ceil((RATE_WINDOW_MS - (now - recent[0])) / 1000) };
  }

  recent.push(now);
  hits.set(userId, recent);
  return { ok: true };
}

// Send a notice at most once per minute per user, so we don't answer spam with spam
function shouldNotify(key) {
  const now = Date.now();
  if (now - (notified.get(key) || 0) < NOTICE_COOLDOWN_MS) return false;
  notified.set(key, now);
  return true;
}

// Returns true if the message may be processed
function checkAccess(bot, msg, { rateLimit = false } = {}) {
  const userId = msg.from?.id;
  if (!userId) return false;

  if (!isAllowed(userId)) {
    log.warn(`blocked user ${userId}`);
    if (shouldNotify(`deny:${userId}`)) {
      bot
        .sendMessage(msg.chat.id, `Sorry, this bot is private. 🔒\n(Your ID: ${userId})`)
        .catch(() => {});
    }
    return false;
  }

  if (rateLimit) {
    const result = checkRate(userId);
    if (!result.ok) {
      log.warn(`rate limit hit by user ${userId}`);
      if (shouldNotify(`rate:${userId}`)) {
        bot
          .sendMessage(msg.chat.id, `You're sending messages too fast. Please wait ${result.retryAfter}s. ⏳`)
          .catch(() => {});
      }
      return false;
    }
  }

  return true;
}

// Clean up old entries every 5 minutes so the maps don't grow forever
setInterval(() => {
  const now = Date.now();
  for (const [id, times] of hits) {
    const recent = times.filter((t) => now - t < RATE_WINDOW_MS);
    if (recent.length) hits.set(id, recent);
    else hits.delete(id);
  }
  for (const [key, time] of notified) {
    if (now - time > NOTICE_COOLDOWN_MS) notified.delete(key);
  }
}, 5 * 60_000).unref();

module.exports = { checkAccess, accessSummary };