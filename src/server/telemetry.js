const MAX_ERROR_LOGS = 50;

const routeStats = new Map();
const telemetryState = {
  totalRequests: 0,
  totalErrors: 0,
  lastUpdated: null,
  recentErrors: []
};

const normalizePath = (path = "/") => {
  if (typeof path !== "string") return "/";
  if (!path.startsWith("/")) return `/${path}`;
  return path;
};

const recordRequestComplete = ({ method, path, status, durationMs }) => {
  const normalizedPath = normalizePath(path);
  const key = `${method.toUpperCase()} ${normalizedPath}`;
  const entry = routeStats.get(key) || {
    method: method.toUpperCase(),
    path: normalizedPath,
    count: 0,
    errorCount: 0,
    totalDurationMs: 0,
    statusCounts: {}
  };
  entry.count += 1;
  entry.totalDurationMs += typeof durationMs === "number" ? durationMs : 0;
  entry.statusCounts[status] = (entry.statusCounts[status] || 0) + 1;
  if (status >= 400) {
    entry.errorCount += 1;
    telemetryState.totalErrors += 1;
  }
  routeStats.set(key, entry);
  telemetryState.totalRequests += 1;
  telemetryState.lastUpdated = new Date().toISOString();
};

const recordError = ({ method, path, status, message }) => {
  telemetryState.totalErrors += 1;
  const normalizedPath = normalizePath(path);
  telemetryState.recentErrors.unshift({
    ts: new Date().toISOString(),
    method: method?.toUpperCase() || "UNKNOWN",
    path: normalizedPath,
    status: status || 500,
    message: message || ""
  });
  if (telemetryState.recentErrors.length > MAX_ERROR_LOGS) {
    telemetryState.recentErrors.splice(MAX_ERROR_LOGS);
  }
};

const getMetricsSnapshot = () => {
  const routes = Array.from(routeStats.values()).map((entry) => ({
    route: `${entry.method} ${entry.path}`,
    count: entry.count,
    errorCount: entry.errorCount,
    errorRate: entry.count ? Number((entry.errorCount / entry.count).toFixed(4)) : 0,
    avgDurationMs: entry.count ? Number((entry.totalDurationMs / entry.count).toFixed(3)) : 0,
    statusCounts: entry.statusCounts
  }));
  routes.sort((a, b) => b.count - a.count);
  return {
    generatedAt: new Date().toISOString(),
    uptimeSeconds: Number(process.uptime().toFixed(0)),
    totalRequests: telemetryState.totalRequests,
    totalErrors: telemetryState.totalErrors,
    lastUpdated: telemetryState.lastUpdated,
    routes,
    recentErrors: telemetryState.recentErrors
  };
};

module.exports = {
  recordRequestComplete,
  recordError,
  getMetricsSnapshot
};
