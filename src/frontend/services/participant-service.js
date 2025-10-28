// Copyright (c) Toshiki Iga. All Rights Reserved.

const projectStore = require("../store/project-store");

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

const addParticipant = (projectId, payload) => {
  const timestamp = new Date().toISOString();
  const preferredId = payload?.id;
  const id = preferredId && !doesParticipantExist(projectId, preferredId) ? preferredId : randomUUID();
  const displayName = payload?.displayName || "";
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
    email: payload?.email || "",
    comment: payload?.comment || "",
    createdAt,
    updatedAt
  };
  projectStore.upsertParticipant(projectId, participant);
  return participant;
};

const updateParticipant = (projectId, participantId, changes) => {
  const existing = getParticipant(projectId, participantId);
  if (!existing) {
    throw new Error("Participant not found");
  }
  const nextDisplayName = changes?.displayName ?? existing.displayName;
  if (isDuplicateDisplayName(projectId, nextDisplayName, participantId)) {
    throw new Error("同じ表示名の参加者が既に存在します。別の名前を入力してください。");
  }
  const nextToken = changes?.token
    ? ensureUniqueToken(changes.token, projectId, participantId)
    : existing.token;
  const nextParticipant = {
    ...existing,
    displayName: nextDisplayName,
    email: changes?.email ?? existing.email,
    comment: changes?.comment ?? existing.comment,
    token: nextToken,
    updatedAt: changes?.updatedAt || new Date().toISOString()
  };
  projectStore.upsertParticipant(projectId, nextParticipant);
  return nextParticipant;
};

const removeParticipant = (projectId, participantId) => {
  projectStore.removeParticipant(projectId, participantId);
};

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
    const token = ensureUniqueToken(item.token || base.token, projectId, base.id);
    const participant = {
      ...base,
      token,
      displayName: item.displayName || base.displayName || "",
      email: item.email || base.email || "",
      comment: item.comment || base.comment || "",
      createdAt: base.createdAt || item.createdAt || new Date().toISOString(),
      updatedAt: item.updatedAt || new Date().toISOString()
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
