// Copyright (c) Toshiki Iga. All Rights Reserved.

const projectStore = require("../store/project-store");
const tallyService = require("./tally-service");
const runtimeConfig = require("../shared/runtime-config");
const apiClient = require("./api-client");
const { responseInputSchema, collectZodIssueFields } = require("../../shared/schema");

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

const parseResponseInput = (payload) => {
  const result = responseInputSchema.safeParse(payload);
  if (!result.success) {
    const err = new Error("response validation failed");
    err.code = 422;
    err.fields = collectZodIssueFields(result.error.errors);
    throw err;
  }
  return result.data;
};

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
  const parsed = parseResponseInput({
    participantId: payload.participantId,
    candidateId: payload.candidateId,
    mark: payload.mark || "",
    comment: payload.comment || ""
  });
  const candidateList = projectStore.getCandidates(projectId);
  if (candidateList && !candidateList.some((item) => item.id === parsed.candidateId)) {
    throw new Error("candidate not found");
  }

  const responses = projectStore.getResponses(projectId);
  const id = buildResponseId(parsed.participantId, parsed.candidateId);
  const existing = responses.find((item) => item && item.id === id);
  const timestamp = new Date().toISOString();
  const createdAt = payload?.createdAt || (existing && existing.createdAt) || timestamp;
  const updatedAt = payload?.updatedAt || timestamp;
  const response = {
    id,
    participantId: parsed.participantId,
    candidateId: parsed.candidateId,
    mark: normalizeMark(parsed.mark),
    comment: parsed.comment || "",
    createdAt,
    updatedAt
  };
  projectStore.upsertResponse(projectId, response);
  tallyService.recalculate(projectId, parsed.candidateId);
  return response;
};

const apiUpsertResponse = async (projectId, payload) => {
  const parsed = parseResponseInput({
    participantId: payload.participantId,
    candidateId: payload.candidateId,
    mark: payload.mark || "",
    comment: payload.comment || ""
  });
  const existing = getResponse(projectId, parsed.participantId, parsed.candidateId);
  const body = {
    participantId: parsed.participantId,
    candidateId: parsed.candidateId,
    mark: parsed.mark,
    comment: parsed.comment || "",
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
  tallyService.recalculate(projectId, parsed.candidateId);
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
    const parsed = parseResponseInput({
      participantId: item.participantId,
      candidateId: item.candidateId,
      mark: item.mark || "",
      comment: item.comment || ""
    });
    const response = {
      id,
      participantId: parsed.participantId,
      candidateId: parsed.candidateId,
      mark: normalizeMark(parsed.mark),
      comment: parsed.comment || "",
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
