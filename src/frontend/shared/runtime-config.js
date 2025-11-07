// Runtime configuration helpers for switching drivers or API endpoints.

const DRIVER_LOCAL = "local";
const DRIVER_API = "api";

let driverOverride = null;
let apiBaseUrlOverride = null;

const normalizeDriver = (input) => {
  if (!input) return DRIVER_LOCAL;
  const value = String(input).toLowerCase();
  if (value === DRIVER_API) return DRIVER_API;
  return DRIVER_LOCAL;
};

const detectDriverFromEnvironment = () => {
  if (driverOverride) {
    return normalizeDriver(driverOverride);
  }
  if (typeof window !== "undefined") {
    const win = window;
    if (typeof win.__SCHEDULY_PROJECT_DRIVER__ === "string") {
      return normalizeDriver(win.__SCHEDULY_PROJECT_DRIVER__);
    }
    if (win.__SCHEDULY_USE_API_DRIVER__ === true) {
      return DRIVER_API;
    }
  }
  if (
    typeof process !== "undefined" &&
    process.env &&
    typeof process.env.SCHEDULY_PROJECT_DRIVER === "string"
  ) {
    if (process.env.NODE_ENV !== "production") {
      console.info(
        "[Scheduly][runtime-config] driver from env",
        process.env.SCHEDULY_PROJECT_DRIVER
      );
    }
    return normalizeDriver(process.env.SCHEDULY_PROJECT_DRIVER);
  }
  return DRIVER_LOCAL;
};

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

const getProjectDriver = () => detectDriverFromEnvironment();

const isProjectDriverApi = () => getProjectDriver() === DRIVER_API;

const setProjectDriver = (driver) => {
  driverOverride = normalizeDriver(driver);
};

const clearProjectDriverOverride = () => {
  driverOverride = null;
};

const setApiBaseUrl = (url) => {
  apiBaseUrlOverride = typeof url === "string" ? url : null;
};

const clearApiBaseUrlOverride = () => {
  apiBaseUrlOverride = null;
};

module.exports = {
  DRIVER_LOCAL,
  DRIVER_API,
  getProjectDriver,
  isProjectDriverApi,
  setProjectDriver,
  clearProjectDriverOverride,
  getApiBaseUrl: detectApiBaseUrl,
  setApiBaseUrl,
  clearApiBaseUrlOverride
};
