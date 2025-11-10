// Copyright (c) Toshiki Iga. All Rights Reserved.

/**
 * Runs an optimistic mutation and handles rollback / refetch when errors occur.
 *
 * @param {Object} options
 * @param {() => (void | (() => void) | Promise<() => void>)} [options.applyLocal] Apply optimistic change. Return a rollback function.
 * @param {() => Promise<any>} options.request Execute the remote request.
 * @param {(payload: any) => any | Promise<any>} [options.onSuccess] Called on success, result becomes the return value.
 * @param {(error: any) => void} [options.onConflict] Called when a 409/422 style conflict occurs.
 * @param {(error: any) => void} [options.onError] Called for non-conflict errors.
 * @param {(error: any) => Promise<void> | void} [options.refetch] Refetch latest data after a conflict.
 * @param {(error: any) => any} [options.transformError] Mutate/replace the thrown error before propagation.
 * @param {() => void} [options.onSettled] Always called after success/error.
 * @returns {Promise<any>}
 */
async function runOptimisticUpdate({
  applyLocal,
  request,
  onSuccess,
  onConflict,
  onError,
  refetch,
  transformError,
  onSettled
}) {
  let rollback = null;
  let rollbackReady = false;
  try {
    if (typeof applyLocal === "function") {
      const maybeRollback = await applyLocal();
      if (typeof maybeRollback === "function") {
        rollback = maybeRollback;
      }
      rollbackReady = true;
    }
    const payload = await request();
    if (typeof onSuccess === "function") {
      return await onSuccess(payload);
    }
    return payload;
  } catch (originalError) {
    let error = originalError;
    if (typeof transformError === "function") {
      try {
        error = transformError(originalError) || originalError;
      } catch (transformFailure) {
        console.warn("[Scheduly][optimistic] transformError failed", transformFailure);
        error = originalError;
      }
    }
    if (rollbackReady && typeof rollback === "function") {
      try {
        rollback();
      } catch (rollbackError) {
        console.warn("[Scheduly][optimistic] rollback failed", rollbackError);
      }
    }
    const isConflict = error && (error.status === 409 || error.status === 422);
    if (isConflict) {
      if (typeof onConflict === "function") {
        onConflict(error);
      }
      if (typeof refetch === "function") {
        try {
          await refetch(error);
        } catch (refetchError) {
          console.warn("[Scheduly][optimistic] refetch failed", refetchError);
        }
      }
    } else if (typeof onError === "function") {
      onError(error);
    }
    throw error;
  } finally {
    if (typeof onSettled === "function") {
      try {
        onSettled();
      } catch (settleError) {
        console.warn("[Scheduly][optimistic] onSettled failed", settleError);
      }
    }
  }
}

module.exports = {
  runOptimisticUpdate
};
