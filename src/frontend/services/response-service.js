// Copyright (c) Toshiki Iga. All Rights Reserved.

const projectStore = require("../store/project-store");
const tallyService = require("./tally-service");
const apiClient = require("./api-client");
const projectService = require("./project-service");
const { runOptimisticUpdate } = require("../shared/optimistic-update");
const { responseInputSchema, collectZodIssueFields } = require("../../shared/schema");
const { createServiceDriver } = require("./service-driver");
const { emitMutationEvent } = require("./sync-events");

const VALID_MARKS = new Set(["o", "d", "x", "pending"]);

const buildResponseId = (participantId, candidateId) => `${participantId}::${candidateId}`;

const normalizeMark = (mark) => {
  const normalized = typeof mark === "string" ? mark.trim().toLowerCase() : "";
  if (!normalized || !VALID_MARKS.has(normalized)) {
    return "pending";
  }
  return normalized;
};

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
  const id = buildResponseId(participantId, candidateId);
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

const captureResponseSnapshot = (projectId) => ({
  responses: projectStore.getResponses(projectId),
  tallies: projectStore.getTallies(projectId)
});

const restoreResponseSnapshot = (projectId, snapshot) => {
  if (snapshot && Array.isArray(snapshot.responses)) {
    projectStore.replaceResponses(projectId, snapshot.responses);
  }
  if (snapshot && snapshot.tallies) {
    projectStore.replaceTallies(projectId, snapshot.tallies);
  }
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
  const optimisticResponse = () => {
    const now = new Date().toISOString();
    const versionValue = Number.isInteger(existing?.version) ? existing.version + 1 : 1;
    return mapApiResponse({
      responseId: existing?.id || buildResponseId(parsed.participantId, parsed.candidateId),
      participantId: parsed.participantId,
      candidateId: parsed.candidateId,
      mark: parsed.mark,
      comment: parsed.comment || "",
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      version: versionValue
    });
  };

  const response = await runOptimisticUpdate({
    applyLocal: () => {
      const snapshot = captureResponseSnapshot(projectId);
      const optimistic = optimisticResponse();
      if (optimistic) {
        projectStore.upsertResponse(projectId, optimistic);
        tallyService.recalculate(projectId, parsed.candidateId);
      }
      return () => restoreResponseSnapshot(projectId, snapshot);
    },
    request: () =>
      apiClient.post(`/api/projects/${encodeURIComponent(projectId)}/responses`, body),
    onSuccess: (payload) => {
      const mapped = mapApiResponse(payload?.response || body);
      if (!mapped) {
        throw new Error("Failed to upsert response");
      }
      projectStore.upsertResponse(projectId, mapped);
      tallyService.recalculate(projectId, parsed.candidateId);
      if (Number.isInteger(payload?.version)) {
        projectStore.updateProjectVersions(projectId, { responsesVersion: payload.version });
      }
      return mapped;
    },
    refetch: () => projectService.syncProjectSnapshot(projectId, { force: true, reason: "responses_conflict" }),
    onConflict: (error) => {
      if (error && error.status === 409) {
        notifyResponseMutation(projectId, "upsert", "conflict", error, {
          participantId: parsed.participantId,
          candidateId: parsed.candidateId
        });
      }
    },
    onError: (error) => {
      notifyResponseMutation(projectId, "upsert", "error", error, {
        participantId: parsed.participantId,
        candidateId: parsed.candidateId
      });
    },
    transformError: (error) => {
      if (error && error.status === 409) {
        error.message = "Response version mismatch";
      }
      return error;
    }
  });
  return response;
};

const responseDriver = createServiceDriver({
  local: {
    upsertResponse: localUpsertResponse
  },
  api: {
    upsertResponse: apiUpsertResponse
  }
});

const upsertResponse = (projectId, payload) => responseDriver.run("upsertResponse", projectId, payload);

const setResponseServiceDriver = (driverName) => responseDriver.setDriverOverride(driverName);
const clearResponseServiceDriver = () => responseDriver.clearDriverOverride();

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
  clearResponsesForParticipant,
  setResponseServiceDriver,
  clearResponseServiceDriver
};
const notifyResponseMutation = (projectId, action, phase, error, meta = {}) => {
  if (!projectId) return;
  emitMutationEvent({
    projectId,
    entity: "response",
    action,
    phase,
    error,
    meta
  });
};
