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

const addParticipant = (projectId, payload) => {
  const timestamp = new Date().toISOString();
  const id = randomUUID();
  const token = ensureUniqueToken(payload?.token, projectId, id);
  const participant = {
    id,
    token,
    displayName: payload?.displayName || "",
    email: payload?.email || "",
    comment: payload?.comment || "",
    createdAt: timestamp,
    updatedAt: timestamp
  };
  projectStore.upsertParticipant(projectId, participant);
  return participant;
};

const updateParticipant = (projectId, participantId, changes) => {
  const existing = getParticipant(projectId, participantId);
  if (!existing) {
    throw new Error("Participant not found");
  }
  const nextToken = changes?.token
    ? ensureUniqueToken(changes.token, projectId, participantId)
    : existing.token;
  const nextParticipant = {
    ...existing,
    displayName: changes?.displayName ?? existing.displayName,
    email: changes?.email ?? existing.email,
    comment: changes?.comment ?? existing.comment,
    token: nextToken,
    updatedAt: new Date().toISOString()
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
    const base = existing || {
      id: item.id || randomUUID(),
      createdAt: new Date().toISOString()
    };
    const token = ensureUniqueToken(item.token || base.token, projectId, base.id);
    const participant = {
      ...base,
      token,
      displayName: item.displayName || base.displayName || "",
      email: item.email || base.email || "",
      comment: item.comment || base.comment || "",
      updatedAt: new Date().toISOString()
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
