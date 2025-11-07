// Copyright (c) Toshiki Iga. All Rights Reserved.

const projectStore = require("../store/project-store");
const tallyService = require("./tally-service");
const { validate, buildResponseRules } = require("../shared/validation");
const runtimeConfig = require("../shared/runtime-config");
const apiClient = require("./api-client");

const VALID_MARKS = new Set(["o", "d", "x", "pending"]);

const buildResponseId = (participantId, candidateId) => `${participantId}::${candidateId}`;

const normalizeMark = (mark) => {
  const normalized = typeof mark === "string" ? mark.trim().toLowerCase() : "";
  if (!normalized || !VALID_MARKS.has(normalized)) {
    return "pending";
  }
  return normalized;
};

const isApiEnabled = () => runtimeConfig.isProjectDriverApi();

const mapApiResponse = (response) => {
  if (!response || typeof response !== "object") return null;
  const participantId = response.participantId;
  const candidateId = response.candidateId;
  if (!participantId || !candidateId) return null;
  const id = response.responseId || buildResponseId(participantId, candidateId);
  return {
    id,
    participantId,
    candidateId,
    mark: normalizeMark(response.mark),
    comment: response.comment || "",
    createdAt: response.createdAt || new Date().toISOString(),
    updatedAt: response.updatedAt || new Date().toISOString(),
    version: Number.isInteger(response.version) ? response.version : 1
  };
};

const listResponses = (projectId) => {
  return projectStore.getResponses(projectId);
};

const getResponse = (projectId, participantId, candidateId) => {
  const responses = projectStore.getResponses(projectId);
  const id = buildResponseId(participantId, candidateId);
  return responses.find((item) => item && item.id === id) || null;
};

const localUpsertResponse = (projectId, payload) => {
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

const apiUpsertResponse = async (projectId, payload) => {
  const id = buildResponseId(payload.participantId, payload.candidateId);
  const existing = getResponse(projectId, payload.participantId, payload.candidateId);
  const body = {
    participantId: payload.participantId,
    candidateId: payload.candidateId,
    mark: payload.mark,
    comment: payload.comment || "",
    version: payload.version ?? existing?.version ?? 1
  };
  const response = await apiClient.post(
    `/api/projects/${encodeURIComponent(projectId)}/responses`,
    body
  );
  const mapped = mapApiResponse(response?.response || body);
  if (!mapped) {
    throw new Error("Failed to upsert response");
  }
  projectStore.upsertResponse(projectId, mapped);
  tallyService.recalculate(projectId, payload.candidateId);
  if (Number.isInteger(response?.version)) {
    projectStore.updateProjectVersions(projectId, { responsesVersion: response.version });
  }
  return mapped;
};

const upsertResponse = (projectId, payload) => (
  isApiEnabled() ? apiUpsertResponse(projectId, payload) : localUpsertResponse(projectId, payload)
);

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
