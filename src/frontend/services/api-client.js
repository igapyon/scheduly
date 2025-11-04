const runtimeConfig = require("../shared/runtime-config");

const buildUrl = (path) => {
  const baseUrl = runtimeConfig.getApiBaseUrl() || "";
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!baseUrl) {
    return normalizedPath;
  }
  const trimmedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return `${trimmedBase}${normalizedPath}`;
};

const parseResponseBody = async (response) => {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch (error) {
    void error;
  }
  return text || null;
};

const request = async (method, path, body, options = {}) => {
  const url = buildUrl(path);
  const headers = new Headers(options.headers || {});
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }
  const init = {
    method,
    headers,
    credentials: options.credentials || "same-origin",
    signal: options.signal
  };
  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
    init.body = JSON.stringify(body);
  }

  const response = await fetch(url, init);
  const payload = await parseResponseBody(response);

  if (!response.ok) {
    const error = new Error(
      `[Scheduly] API request failed (${response.status} ${response.statusText || ""})`.trim()
    );
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
};

const get = (path, options) => request("GET", path, undefined, options);
const post = (path, body, options) => request("POST", path, body, options);
const put = (path, body, options) => request("PUT", path, body, options);
const del = (path, body, options) => request("DELETE", path, body, options);

module.exports = {
  request,
  get,
  post,
  put,
  del
};
