// Frontend config reader. Values are injected at build time via DefinePlugin.

const read = (key, fallback = "") => {
  try {
    const v = process.env[key];
    if (typeof v === "string" && v.length > 0) return v;
  } catch (e) {
    // ignore
  }
  return fallback;
};

const getConfig = () => {
  const baseUrl = read("BASE_URL", typeof window !== "undefined" ? window.location.origin : "");
  const apiBaseUrl = read("API_BASE_URL", "");
  const nodeEnv = read("NODE_ENV", "development");
  return { baseUrl, apiBaseUrl, nodeEnv };
};

module.exports = {
  getConfig
};

