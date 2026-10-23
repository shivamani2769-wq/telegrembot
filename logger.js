function stamp() {
  return new Date().toLocaleString('sv-SE'); // 2026-10-22 19:32:10 (local time)
}

const log = {
  info: (...args) => console.log(stamp(), 'INFO ', ...args),
  warn: (...args) => console.warn(stamp(), 'WARN ', ...args),
  error: (...args) => console.error(stamp(), 'ERROR', ...args),
};

module.exports = { log };