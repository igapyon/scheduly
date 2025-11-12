// Shared event bus for project/APIs sync notifications.

const listeners = new Set();

const addSyncListener = (listener) => {
  if (typeof listener !== "function") {
    return () => {};
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const emitSyncEvent = (event) => {
  if (!event || typeof event !== "object") return;
  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch (error) {
      console.warn("[Scheduly][sync-events] listener failed", error);
    }
  });
};

const emitMutationEvent = (payload = {}) => {
  if (!payload.projectId) {
    return;
  }
  emitSyncEvent({
    scope: "mutation",
    ...payload
  });
};

module.exports = {
  addSyncListener,
  emitSyncEvent,
  emitMutationEvent
};
