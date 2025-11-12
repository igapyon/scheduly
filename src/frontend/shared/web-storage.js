const SAFE_TEST_KEY = "__scheduly_storage_test__";

const tryGetStorage = (name) => {
  if (typeof window === "undefined" || !window[name]) {
    return null;
  }
  try {
    const storage = window[name];
    // Simple write/remove to confirm availability (Safari private mode, etc).
    storage.setItem(SAFE_TEST_KEY, "1");
    storage.removeItem(SAFE_TEST_KEY);
    return storage;
  } catch (error) {
    console.warn(`[Scheduly][web-storage] ${name} unavailable`, error);
    return null;
  }
};

const getPersistentStorage = () => tryGetStorage("localStorage") || tryGetStorage("sessionStorage");

const getSessionStorage = () => tryGetStorage("sessionStorage");

module.exports = {
  getPersistentStorage,
  getSessionStorage
};
