// Copyright (c) Toshiki Iga. All Rights Reserved.

const projectStore = require("../store/project-store");
const tallyService = require("./tally-service");
const { validate, buildResponseRules } = require("../shared/validation");

const VALID_MARKS = new Set(["o", "d", "x", "pending"]);

const buildResponseId = (participantId, candidateId) => `${participantId}::${candidateId}`;

const normalizeMark = (mark) => {
  const normalized = typeof mark === "string" ? mark.trim().toLowerCase() : "";
  if (!normalized || !VALID_MARKS.has(normalized)) {
    return "pending";
  }
  return normalized;
};

const listResponses = (projectId) => {
  return projectStore.getResponses(projectId);
};

const getResponse = (projectId, participantId, candidateId) => {
  const responses = projectStore.getResponses(projectId);
  const id = buildResponseId(participantId, candidateId);
  return responses.find((item) => item && item.id === id) || null;
};

const upsertResponse = (projectId, payload) => {
  if (!payload || !payload.participantId || !payload.candidateId) {
    throw new Error("participantId and candidateId are required");
  }
  // Minimal input validation (replaceable by zod later)
  const rules = buildResponseRules({});
  const check = validate(
    {
      participantId: String(payload.participantId || ""),
      candidateId: String(payload.candidateId || ""),
      mark: String((payload.mark || "").toString()),
      comment: String(payload.comment || "")
    },
    rules
  );
  if (!check.ok) {
    const fields = check.errors.join(", ");
    const err = new Error(`validation failed: ${fields}`);
    err.code = 422;
    throw err;
  }
  const candidateList = projectStore.getCandidates(projectId);
  if (candidateList && !candidateList.some((item) => item.id === payload.candidateId)) {
    throw new Error("candidate not found");
  }

  const responses = projectStore.getResponses(projectId);
  const id = buildResponseId(payload.participantId, payload.candidateId);
  const existing = responses.find((item) => item && item.id === id);
  const timestamp = new Date().toISOString();
  const createdAt = payload?.createdAt || (existing && existing.createdAt) || timestamp;
  const updatedAt = payload?.updatedAt || timestamp;
  const response = {
    id,
    participantId: payload.participantId,
    candidateId: payload.candidateId,
    mark: normalizeMark(payload.mark),
    comment: payload.comment || "",
    createdAt,
    updatedAt
  };
  projectStore.upsertResponse(projectId, response);
  tallyService.recalculate(projectId, payload.candidateId);
  return response;
};

const bulkImportResponses = (projectId, list) => {
  if (!Array.isArray(list) || list.length === 0) return [];
  const merged = new Map();
  const existing = projectStore.getResponses(projectId);
  existing.forEach((item) => {
    if (item && item.id) merged.set(item.id, item);
  });

  const imported = [];
  list.forEach((item) => {
    if (!item || !item.participantId || !item.candidateId) return;
    const id = buildResponseId(item.participantId, item.candidateId);
    const previous = merged.get(id);
    const timestamp = new Date().toISOString();
    const response = {
      id,
      participantId: item.participantId,
      candidateId: item.candidateId,
      mark: normalizeMark(item.mark),
      comment: item.comment || "",
      createdAt: item.createdAt || previous?.createdAt || timestamp,
      updatedAt: item.updatedAt || timestamp
    };
    merged.set(id, response);
    imported.push(response);
  });

  projectStore.replaceResponses(projectId, Array.from(merged.values()));
  tallyService.recalculate(projectId);
  return imported;
};

const clearResponsesForParticipant = (projectId, participantId) => {
  const responses = projectStore.getResponses(projectId).filter((item) => item && item.participantId !== participantId);
  projectStore.replaceResponses(projectId, responses);
  tallyService.recalculate(projectId);
};

module.exports = {
  listResponses,
  getResponse,
  upsertResponse,
  bulkImportResponses,
  clearResponsesForParticipant
};
