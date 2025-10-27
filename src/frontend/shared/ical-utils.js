// Copyright (c) Toshiki Iga. All Rights Reserved.

const DEFAULT_TZID = "Asia/Tokyo";
const SAMPLE_ICS_RELATIVE_PATH = "ics/sample-candidates.ics";
const DEFAULT_LOG_SCOPE = "shared";

const ensureICAL = () => {
  if (typeof window === "undefined" || !window.ICAL) {
    throw new Error("ical.js が読み込まれていません。public の HTML に CDN スクリプトを追加してください。");
  }
  return window.ICAL;
};

const waitForIcal = () => {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("window is undefined"));
  }
  if (window.ICAL) return Promise.resolve(window.ICAL);

  return new Promise((resolve, reject) => {
    const start = Date.now();
    const timer = setInterval(() => {
      if (window.ICAL) {
        clearInterval(timer);
        resolve(window.ICAL);
      } else if (Date.now() - start > 5000) {
        clearInterval(timer);
        reject(new Error("ical.js did not load within timeout"));
      }
    }, 50);
  });
};

const getSampleIcsUrl = () => {
  if (typeof window === "undefined") return `/${SAMPLE_ICS_RELATIVE_PATH}`;
  try {
    return new URL(SAMPLE_ICS_RELATIVE_PATH, window.location.href).toString();
  } catch (error) {
    console.warn("[Scheduly][shared] failed to resolve sample ICS URL", error);
    return `/${SAMPLE_ICS_RELATIVE_PATH}`;
  }
};

const createLogger = (scope = DEFAULT_LOG_SCOPE) => (...messages) => {
  console.debug(`[Scheduly][${scope}]`, ...messages);
};

const sanitizeTzid = (tzid) => {
  const normalized = typeof tzid === "string" ? tzid.trim() : "";
  if (!normalized || normalized.toLowerCase() === "floating") return DEFAULT_TZID;
  return normalized;
};

module.exports = {
  DEFAULT_TZID,
  SAMPLE_ICS_RELATIVE_PATH,
  ensureICAL,
  waitForIcal,
  getSampleIcsUrl,
  createLogger,
  sanitizeTzid
};
