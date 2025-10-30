// Copyright (c) Toshiki Iga. All Rights Reserved.

const projectStore = require("../store/project-store");
const participantService = require("./participant-service");

const randomProjectId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `project-${crypto.randomUUID()}`;
  }
  const seed = Math.random().toString(36).slice(2, 10);
  return `project-${Date.now().toString(36)}-${seed}`;
};

const ensureProjectId = (projectId) => {
  if (typeof projectId === "string" && projectId.trim()) {
    return projectId.trim();
  }
  return projectStore.getDefaultProjectId();
};

const create = (payload = {}) => {
  const projectId = payload.projectId || randomProjectId();
  const base = projectStore.resetProject(projectId);
  const nextMeta = {
    name: typeof payload.name === "string" ? payload.name : base.project.name,
    description: typeof payload.description === "string" ? payload.description : base.project.description,
    defaultTzid: typeof payload.defaultTzid === "string" ? payload.defaultTzid : base.project.defaultTzid
  };
  projectStore.updateProjectMeta(projectId, nextMeta);
  return {
    projectId,
    state: projectStore.getProjectStateSnapshot(projectId)
  };
};

const load = (identifier = null) => {
  if (!identifier) {
    const projectId = projectStore.getDefaultProjectId();
    return {
      projectId,
      state: projectStore.getProjectStateSnapshot(projectId)
    };
  }
  const lookupKey = String(identifier).trim();
  const shareTypes = ["admin", "participant"];
  for (let i = 0; i < shareTypes.length; i += 1) {
    const match = projectStore.findProjectByShareToken(shareTypes[i], lookupKey);
    if (match) {
      return {
        projectId: match.projectId,
        state: projectStore.getProjectStateSnapshot(match.projectId)
      };
    }
  }
  try {
    const parsed = participantService.resolveByToken(lookupKey);
    if (parsed && parsed.projectId) {
      return {
        projectId: parsed.projectId,
        state: projectStore.getProjectStateSnapshot(parsed.projectId),
        participantId: parsed.participantId
      };
    }
  } catch (error) {
    void error;
    // ignore participant resolution failure
  }
  const projectId = ensureProjectId(lookupKey);
  return {
    projectId,
    state: projectStore.getProjectStateSnapshot(projectId)
  };
};

const loadByParticipantToken = (token) => {
  if (!token) return null;
  const match = participantService.resolveByToken(token);
  if (!match) return null;
  return {
    projectId: match.projectId,
    participantId: match.participantId,
    participant: match.participant,
    state: projectStore.getProjectStateSnapshot(match.projectId)
  };
};

const updateMeta = (projectId, changes) => {
  if (!projectId) throw new Error("projectId is required");
  return projectStore.updateProjectMeta(projectId, changes || {});
};

const exportState = (projectId, options = {}) => {
  const snapshot = projectStore.exportProjectState(projectId);
  if (options.returnJson === true) {
    return JSON.stringify(snapshot, null, 2);
  }
  return snapshot;
};

const importState = (projectId, payload) => {
  if (!projectId) throw new Error("projectId is required");
  return projectStore.importProjectState(projectId, payload);
};

const reset = (projectId) => {
  if (!projectId) throw new Error("projectId is required");
  return projectStore.resetProject(projectId);
};

const subscribe = (projectId, callback) => {
  if (!projectId || typeof callback !== "function") return () => {};
  return projectStore.subscribeProjectState(projectId, callback);
};

const resolveProjectFromLocation = () => {
  const projectId = projectStore.resolveProjectIdFromLocation();
  return {
    projectId,
    state: projectStore.getProjectStateSnapshot(projectId),
    routeContext: projectStore.getCurrentRouteContext()
  };
};

const getRouteContext = () => projectStore.getCurrentRouteContext();

module.exports = {
  create,
  load,
  loadByParticipantToken,
  updateMeta,
  exportState,
  importState,
  reset,
  subscribe,
  resolveProjectFromLocation,
  getRouteContext,
  getDefaultProjectId: projectStore.getDefaultProjectId,
  getState: projectStore.getProjectStateSnapshot
};
