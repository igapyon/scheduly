const LEVELS = new Set(["debug", "info", "warn", "error"]);

const log = (level, message, meta = {}) => {
  const normalizedLevel = LEVELS.has(level) ? level : "info";
  const payload = {
    ts: new Date().toISOString(),
    level: normalizedLevel,
    msg: message,
    ...meta
  };
  const serialized = JSON.stringify(payload);
  if (normalizedLevel === "error") {
    console.error(serialized);
  } else if (normalizedLevel === "warn") {
    console.warn(serialized);
  } else {
    console.log(serialized);
  }
};

module.exports = {
  log
};
