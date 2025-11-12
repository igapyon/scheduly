// Runtime configuration helpers for switching API endpoints.

const DRIVER_API = "api";
let apiBaseUrlOverride = null;
const envApiBaseLiteral = process.env.SCHEDULY_API_BASE_URL || "";

const injectWindowDefaults = () => {
  if (typeof window === "undefined") return;
  if (!window.__SCHEDULY_API_BASE_URL__ && envApiBaseLiteral) {
    window.__SCHEDULY_API_BASE_URL__ = envApiBaseLiteral;
    if (process.env.NODE_ENV !== "production") {
      console.info("[Scheduly][runtime-config] applied window api base from env", envApiBaseLiteral);
    }
  }
};

injectWindowDefaults();

const detectApiBaseUrl = () => {
  if (apiBaseUrlOverride) {
    return apiBaseUrlOverride;
  }
  if (typeof window !== "undefined" && typeof window.__SCHEDULY_API_BASE_URL__ === "string") {
    return window.__SCHEDULY_API_BASE_URL__;
  }
  if (typeof process !== "undefined" && process.env && process.env.SCHEDULY_API_BASE_URL) {
    if (process.env.NODE_ENV !== "production") {
      console.info(
        "[Scheduly][runtime-config] api base url from env",
        process.env.SCHEDULY_API_BASE_URL
      );
    }
    return process.env.SCHEDULY_API_BASE_URL;
  }
  return "";
};

const getProjectDriver = () => DRIVER_API;
const isProjectDriverApi = () => true;

const setApiBaseUrl = (url) => {
  apiBaseUrlOverride = typeof url === "string" ? url : null;
};

const clearApiBaseUrlOverride = () => {
  apiBaseUrlOverride = null;
};

module.exports = {
  DRIVER_API,
  getProjectDriver,
  isProjectDriverApi,
  getApiBaseUrl: detectApiBaseUrl,
  setApiBaseUrl,
  clearApiBaseUrlOverride
};
