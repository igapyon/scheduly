const apiClient = require("./api-client");

const logDebugEvent = async (token, event = {}) => {
  if (!token || process.env.NODE_ENV === "production") return;
  try {
    const payload = {
      token,
      ...event
    };
    await apiClient.post("/api/dev/log", payload);
  } catch (error) {
    console.warn("[Scheduly][devlog] failed to submit log", error);
  }
};

const fetchDebugLogs = async (token) => {
  if (!token || process.env.NODE_ENV === "production") return [];
  try {
    const body = await apiClient.get(`/api/dev/log?token=${encodeURIComponent(token)}`);
    return Array.isArray(body.logs) ? body.logs : [];
  } catch (error) {
    console.warn("[Scheduly][devlog] failed to fetch logs", error);
    return [];
  }
};

const clearDebugLogs = async (token) => {
  if (!token || process.env.NODE_ENV === "production") return;
  try {
    await apiClient.del(`/api/dev/log?token=${encodeURIComponent(token)}`);
  } catch (error) {
    console.warn("[Scheduly][devlog] failed to clear logs", error);
  }
};

const devLogService = {
  logDebugEvent,
  fetchDebugLogs,
  clearDebugLogs
};

module.exports = devLogService;
module.exports.logDebugEvent = logDebugEvent;
module.exports.fetchDebugLogs = fetchDebugLogs;
module.exports.clearDebugLogs = clearDebugLogs;
