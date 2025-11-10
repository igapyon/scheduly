// Copyright (c) Toshiki Iga. All Rights Reserved.

const projectStore = require("../store/project-store");
const apiClient = require("./api-client");
const tallyService = require("./tally-service");
const { runOptimisticUpdate } = require("../shared/optimistic-update");
const { participantInputSchema, collectZodIssueFields } = require("../../shared/schema");
const { createServiceDriver } = require("./service-driver");
const { emitMutationEvent } = require("./sync-events");

const randomUUID = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
};

const generateToken = () => {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 12; i += 1) {
    token += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return token;
};

const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;

const ensureUniqueToken = (preferredToken, projectId, allowParticipantId = null) => {
  let candidate = preferredToken ? String(preferredToken).toLowerCase() : "";
  const maxAttempts = 10;
  let attempts = 0;
  while (attempts < maxAttempts) {
    const tokenValue = candidate || generateToken();
    const lookup = projectStore.findParticipantByToken(tokenValue);
    if (
      !lookup ||
      (lookup.projectId === projectId && lookup.participant && lookup.participant.id === allowParticipantId)
    ) {
      return tokenValue;
    }
    candidate = "";
    attempts += 1;
  }
  return `${generateToken()}-${Math.floor(Math.random() * 1000)}`;
};

const listParticipants = (projectId) => {
  return projectStore.getParticipants(projectId);
};

const getParticipant = (projectId, participantId) => {
  const participants = projectStore.getParticipants(projectId);
  return participants.find((item) => item && item.id === participantId) || null;
};

const doesParticipantExist = (projectId, participantId) => {
  if (!participantId) return false;
  const participants = projectStore.getParticipants(projectId);
  return participants.some((participant) => participant && participant.id === participantId);
};

const isDuplicateDisplayName = (projectId, name, ignoreParticipantId = null) => {
  if (!isNonEmptyString(name)) return false;
  const normalized = name.trim().toLowerCase();
  const participants = projectStore.getParticipants(projectId);
  return participants.some((participant) => {
    if (!participant || !isNonEmptyString(participant.displayName)) return false;
    if (ignoreParticipantId && participant.id === ignoreParticipantId) return false;
    return participant.displayName.trim().toLowerCase() === normalized;
  });
};

const parseParticipantInput = (payload) => {
  const result = participantInputSchema.safeParse(payload);
  if (!result.success) {
    const err = new Error("participant validation failed");
    err.code = 422;
    err.fields = collectZodIssueFields(result.error.errors);
    throw err;
  }
  return result.data;
};

const mapApiParticipant = (participant) => {
  if (!participant || typeof participant !== "object") return null;
  const participantId = participant.participantId || participant.id || randomUUID();
  return {
    id: participantId,
    token: participant.token || "",
    displayName: participant.displayName || "",
    email: participant.email || "",
    comment: participant.comment || "",
    status: participant.status || "active",
    createdAt: participant.createdAt || new Date().toISOString(),
    updatedAt: participant.updatedAt || new Date().toISOString(),
    version: Number.isInteger(participant.version) ? participant.version : 1
  };
};

const getProjectService = (() => {
  let cached = null;
  return () => {
    if (cached) return cached;
    try {
      cached = require("./project-service");
    } catch (error) {
      console.warn("[Scheduly][participantService] Failed to load project-service", error);
      cached = null;
    }
    return cached;
  };
})();

const syncSnapshot = (projectId, reason) => {
  const service = getProjectService();
  if (service && typeof service.syncProjectSnapshot === "function") {
    return service.syncProjectSnapshot(projectId, { force: true, reason });
  }
  return Promise.resolve();
};

const captureParticipantSnapshot = (projectId) => ({
  participants: projectStore.getParticipants(projectId),
  responses: projectStore.getResponses(projectId),
  tallies: projectStore.getTallies(projectId)
});

const restoreParticipantSnapshot = (projectId, snapshot) => {
  if (!snapshot) return;
  if (snapshot.participants) {
    projectStore.replaceParticipants(projectId, snapshot.participants);
  }
  if (snapshot.responses) {
    projectStore.replaceResponses(projectId, snapshot.responses);
  }
  if (snapshot.tallies) {
    projectStore.replaceTallies(projectId, snapshot.tallies);
  }
};

const updateParticipantsVersion = (projectId, version) => {
  if (Number.isInteger(version) && version >= 0) {
    projectStore.updateProjectVersions(projectId, { participantsVersion: version });
  }
};

const localAddParticipant = (projectId, payload) => {
  const timestamp = new Date().toISOString();
  const preferredId = payload?.id;
  const id = preferredId && !doesParticipantExist(projectId, preferredId) ? preferredId : randomUUID();
  const parsed = parseParticipantInput({
    displayName: payload?.displayName || "",
    email: payload?.email || "",
    comment: payload?.comment || ""
  });
  const displayName = parsed.displayName;
  if (isDuplicateDisplayName(projectId, displayName)) {
    throw new Error("同じ表示名の参加者が既に存在します。別の名前を入力してください。");
  }
  const token = ensureUniqueToken(payload?.token, projectId, id);
  const createdAt = payload?.createdAt || timestamp;
  const updatedAt = payload?.updatedAt || timestamp;
  const participant = {
    id,
    token,
    displayName,
    email: parsed.email || "",
    comment: parsed.comment || "",
    createdAt,
    updatedAt,
    version: 1,
    status: payload?.status || "active"
  };
  projectStore.upsertParticipant(projectId, participant);
  tallyService.recalculate(projectId);
  return participant;
};

const apiAddParticipant = async (projectId, payload) => {
  const participantPayload = parseParticipantInput({
    displayName: payload?.displayName || "",
    email: payload?.email || "",
    comment: payload?.comment || ""
  });
  const body = { participant: { ...payload, ...participantPayload } };
  const metaInfo = {
    participantId: payload?.id || null,
    displayName: participantPayload.displayName || payload?.displayName || ""
  };
  return runOptimisticUpdate({
    request: () =>
      apiClient.post(`/api/projects/${encodeURIComponent(projectId)}/participants`, body),
    onSuccess: (response) => {
      const participant = mapApiParticipant(response?.participant || payload);
      if (!participant) {
        throw new Error("Failed to create participant");
      }
      projectStore.upsertParticipant(projectId, participant);
      updateParticipantsVersion(projectId, response?.version);
      tallyService.recalculate(projectId);
      return participant;
    },
    refetch: () => syncSnapshot(projectId, "participants_conflict"),
    onConflict: (error) => {
      if (error && error.status === 409) {
        notifyParticipantMutation(projectId, "add", "conflict", error, metaInfo);
      }
    },
    onError: (error) => {
      notifyParticipantMutation(projectId, "add", "error", error, metaInfo);
    },
    transformError: (error) => {
      if (error && error.status === 409) {
        error.message = "Participant creation conflict";
      }
      return error;
    }
  });
};

const localUpdateParticipant = (projectId, participantId, changes) => {
  const existing = getParticipant(projectId, participantId);
  if (!existing) {
    throw new Error("Participant not found");
  }
  const parsed = parseParticipantInput({
    displayName: changes?.displayName ?? existing.displayName ?? "",
    email: changes?.email ?? existing.email ?? "",
    comment: changes?.comment ?? existing.comment ?? ""
  });
  const nextDisplayName = parsed.displayName;
  if (isDuplicateDisplayName(projectId, nextDisplayName, participantId)) {
    throw new Error("同じ表示名の参加者が既に存在します。別の名前を入力してください。");
  }
  const nextToken = changes?.token
    ? ensureUniqueToken(changes.token, projectId, participantId)
    : existing.token;
  const nextParticipant = {
    ...existing,
    displayName: nextDisplayName,
    email: parsed.email,
    comment: parsed.comment,
    token: nextToken,
    status: (changes?.status ?? existing.status) || "active",
    updatedAt: changes?.updatedAt || new Date().toISOString(),
    version: typeof changes?.version === "number" ? changes.version : (existing.version ?? 1)
  };
  projectStore.upsertParticipant(projectId, nextParticipant);
  return nextParticipant;
};

const apiUpdateParticipant = async (projectId, participantId, changes) => {
  const existing = getParticipant(projectId, participantId);
  const parsed = parseParticipantInput({
    displayName: changes?.displayName ?? existing?.displayName ?? "",
    email: changes?.email ?? existing?.email ?? "",
    comment: changes?.comment ?? existing?.comment ?? ""
  });
  const body = {
    participant: {
      ...changes,
      ...parsed
    },
    version: changes?.version ?? existing?.version ?? 1
  };
  return runOptimisticUpdate({
    applyLocal: () => {
      const snapshot = captureParticipantSnapshot(projectId);
      localUpdateParticipant(projectId, participantId, changes);
      return () => restoreParticipantSnapshot(projectId, snapshot);
    },
    request: () =>
      apiClient.put(
        `/api/projects/${encodeURIComponent(projectId)}/participants/${encodeURIComponent(participantId)}`,
        body
      ),
    onSuccess: (response) => {
      const participant = mapApiParticipant(response?.participant);
      if (!participant) {
        throw new Error("Failed to update participant");
      }
      projectStore.upsertParticipant(projectId, participant);
      updateParticipantsVersion(projectId, response?.version);
      return participant;
    },
    refetch: () => syncSnapshot(projectId, "participants_conflict"),
    onConflict: (error) => {
      if (error && error.status === 409) {
        notifyParticipantMutation(projectId, "update", "conflict", error, { participantId });
      }
    },
    onError: (error) => {
      notifyParticipantMutation(projectId, "update", "error", error, { participantId });
    },
    transformError: (error) => {
      if (error && error.status === 409) {
        error.message = "Participant version mismatch";
      }
      return error;
    }
  });
};

const localRemoveParticipant = (projectId, participantId) => {
  projectStore.removeParticipant(projectId, participantId);
  tallyService.recalculate(projectId);
};

const apiRemoveParticipant = async (projectId, participantId) => {
  const existing = getParticipant(projectId, participantId);
  const version = existing?.version ?? 1;
  return runOptimisticUpdate({
    applyLocal: () => {
      const snapshot = captureParticipantSnapshot(projectId);
      localRemoveParticipant(projectId, participantId);
      return () => restoreParticipantSnapshot(projectId, snapshot);
    },
    request: () =>
      apiClient.del(
        `/api/projects/${encodeURIComponent(projectId)}/participants/${encodeURIComponent(participantId)}`,
        { version }
      ),
    onSuccess: (response) => {
      updateParticipantsVersion(projectId, response?.version);
      tallyService.recalculate(projectId);
      return true;
    },
    refetch: () => syncSnapshot(projectId, "participants_conflict"),
    onConflict: (error) => {
      if (error && error.status === 409) {
        notifyParticipantMutation(projectId, "remove", "conflict", error, { participantId });
      }
    },
    onError: (error) => {
      notifyParticipantMutation(projectId, "remove", "error", error, { participantId });
    },
    transformError: (error) => {
      if (error && error.status === 409) {
        error.message = "Participant removal conflict";
      }
      return error;
    }
  });
};

const participantDriver = createServiceDriver({
  local: {
    addParticipant: localAddParticipant,
    updateParticipant: localUpdateParticipant,
    removeParticipant: localRemoveParticipant
  },
  api: {
    addParticipant: apiAddParticipant,
    updateParticipant: apiUpdateParticipant,
    removeParticipant: apiRemoveParticipant
  }
});

const addParticipant = (projectId, payload) => participantDriver.run("addParticipant", projectId, payload);

const updateParticipant = (projectId, participantId, changes) =>
  participantDriver.run("updateParticipant", projectId, participantId, changes);

const removeParticipant = (projectId, participantId) =>
  participantDriver.run("removeParticipant", projectId, participantId);

const setParticipantServiceDriver = (driverName) => participantDriver.setDriverOverride(driverName);
const clearParticipantServiceDriver = () => participantDriver.clearDriverOverride();

const bulkUpsertParticipants = (projectId, list) => {
  if (!Array.isArray(list) || list.length === 0) return [];
  const existingById = new Map();
  const existingParticipants = projectStore.getParticipants(projectId);
  existingParticipants.forEach((participant) => {
    if (participant && participant.id) {
      existingById.set(participant.id, participant);
    }
  });
  const results = [];

  list.forEach((item) => {
    if (!item) return;
    const existing = item.id ? existingById.get(item.id) : null;
    const preferredId = item.id;
    const baseId =
      (existing && existing.id) ||
      (preferredId && !doesParticipantExist(projectId, preferredId) ? preferredId : randomUUID());
    const base = existing || {
      id: baseId,
      createdAt: item.createdAt || new Date().toISOString()
    };
    const parsed = parseParticipantInput({
      displayName: item.displayName || base.displayName || "",
      email: item.email || base.email || "",
      comment: item.comment || base.comment || ""
    });
    const token = ensureUniqueToken(item.token || base.token, projectId, base.id);
    const participant = {
      ...base,
      token,
      displayName: parsed.displayName,
      email: parsed.email,
      comment: parsed.comment,
      createdAt: base.createdAt || item.createdAt || new Date().toISOString(),
      updatedAt: item.updatedAt || new Date().toISOString(),
      status: item.status || base.status || "active",
      version: typeof item.version === "number" ? item.version : base.version || 1
    };
    projectStore.upsertParticipant(projectId, participant);
    results.push(participant);
  });

  return results;
};

const resolveByToken = (token) => {
  const hit = projectStore.findParticipantByToken(token);
  if (!hit) return null;
  return {
    projectId: hit.projectId,
    participantId: hit.participant.id,
    participant: hit.participant
  };
};

const getToken = (projectId, participantId) => {
  const participant = getParticipant(projectId, participantId);
  return participant ? participant.token : null;
};

module.exports = {
  listParticipants,
  getParticipant,
  addParticipant,
  updateParticipant,
  removeParticipant,
  bulkUpsertParticipants,
  resolveByToken,
  getToken,
  setParticipantServiceDriver,
  clearParticipantServiceDriver
};
const notifyParticipantMutation = (projectId, action, phase, error, meta = {}) => {
  if (!projectId) return;
  emitMutationEvent({
    projectId,
    entity: "participant",
    action,
    phase,
    error,
    meta
  });
};
