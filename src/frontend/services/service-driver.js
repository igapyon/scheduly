// Utility for switching service implementations based on the active project driver.

const runtimeConfig = require("../shared/runtime-config");

const { DRIVER_LOCAL, DRIVER_API } = runtimeConfig;

const normalizeDriver = (value) => (value === DRIVER_API ? DRIVER_API : DRIVER_LOCAL);

const detectDriver = () => {
  if (typeof runtimeConfig.getProjectDriver === "function") {
    return normalizeDriver(runtimeConfig.getProjectDriver());
  }
  return DRIVER_LOCAL;
};

const createServiceDriver = (drivers = {}) => {
  const localImpl = drivers.local || drivers[DRIVER_LOCAL];
  if (!localImpl || typeof localImpl !== "object") {
    throw new Error("Local driver implementation is required");
  }
  const apiImpl = drivers.api || drivers[DRIVER_API] || localImpl;
  let override = null;

  const getActiveDriverName = () => normalizeDriver(override || detectDriver());

  const getActiveDriver = () => {
    const driverName = getActiveDriverName();
    return driverName === DRIVER_API ? apiImpl : localImpl;
  };

  const run = (method, ...args) => {
    const driver = getActiveDriver();
    const fn = driver?.[method];
    if (typeof fn !== "function") {
      throw new Error(`Driver method "${method}" is not implemented for ${getActiveDriverName()} driver`);
    }
    return fn(...args);
  };

  const setDriverOverride = (value) => {
    override = value ? normalizeDriver(value) : null;
  };

  const clearDriverOverride = () => {
    override = null;
  };

  return {
    run,
    getActiveDriverName,
    setDriverOverride,
    clearDriverOverride
  };
};

module.exports = {
  createServiceDriver
};
