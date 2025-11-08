// Copyright (c) Toshiki Iga. All Rights Reserved.

const projectStore = require("../store/project-store");
const runtimeConfig = require("../shared/runtime-config");
const apiClient = require("./api-client");
const tallyService = require("./tally-service");
const { participantInputSchema, collectZodIssueFields } = require("../../shared/schema");

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

const isApiEnabled = () => runtimeConfig.isProjectDriverApi();

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
  const response = await apiClient.post(
    `/api/projects/${encodeURIComponent(projectId)}/participants`,
    body
  );
  const participant = mapApiParticipant(response?.participant || payload);
  if (!participant) {
    throw new Error("Failed to create participant");
  }
  projectStore.upsertParticipant(projectId, participant);
  updateParticipantsVersion(projectId, response?.version);
  tallyService.recalculate(projectId);
  return participant;
};

const addParticipant = (projectId, payload) => (
  isApiEnabled() ? apiAddParticipant(projectId, payload) : localAddParticipant(projectId, payload)
);

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
  const response = await apiClient.put(
    `/api/projects/${encodeURIComponent(projectId)}/participants/${encodeURIComponent(participantId)}`,
    body
  );
  const participant = mapApiParticipant(response?.participant);
  if (!participant) {
    throw new Error("Failed to update participant");
  }
  projectStore.upsertParticipant(projectId, participant);
  updateParticipantsVersion(projectId, response?.version);
  return participant;
};

const updateParticipant = (projectId, participantId, changes) => (
  isApiEnabled()
    ? apiUpdateParticipant(projectId, participantId, changes)
    : localUpdateParticipant(projectId, participantId, changes)
);

const localRemoveParticipant = (projectId, participantId) => {
  projectStore.removeParticipant(projectId, participantId);
  tallyService.recalculate(projectId);
};

const apiRemoveParticipant = async (projectId, participantId) => {
  const existing = getParticipant(projectId, participantId);
  const version = existing?.version ?? 1;
  const response = await apiClient.del(
    `/api/projects/${encodeURIComponent(projectId)}/participants/${encodeURIComponent(participantId)}`,
    { version }
  );
  projectStore.removeParticipant(projectId, participantId);
  updateParticipantsVersion(projectId, response?.version);
  tallyService.recalculate(projectId);
};

const removeParticipant = (projectId, participantId) => (
  isApiEnabled() ? apiRemoveParticipant(projectId, participantId) : localRemoveParticipant(projectId, participantId)
);

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
  getToken
};
