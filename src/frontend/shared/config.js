// Frontend config reader. Values are injected at build time via DefinePlugin.

const read = (key, fallback = "") => {
  try {
    const v = process.env[key];
    if (typeof v === "string" && v.length > 0) return v;
  } catch {
    // ignore
  }
  return fallback;
};

const parseList = (v) =>
  (typeof v === "string" ? v : "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

const getConfig = () => {
  const baseUrl = read("BASE_URL", typeof window !== "undefined" ? window.location.origin : "");
  const apiBaseUrl = read("API_BASE_URL", "");
  const nodeEnv = read("NODE_ENV", "development");
  const corsAllowedOrigins = parseList(read("CORS_ALLOWED_ORIGINS", ""));
  return { baseUrl, apiBaseUrl, nodeEnv, corsAllowedOrigins };
};

module.exports = {
  getConfig
};
