// Copyright (c) Toshiki Iga. All Rights Reserved.

const { DEFAULT_TZID } = require("../shared/ical-utils");
const projectStore = require("../store/project-store");
const participantService = require("./participant-service");
const runtimeConfig = require("../shared/runtime-config");
const apiClient = require("./api-client");

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

const isApiEnabled = () => runtimeConfig.isProjectDriverApi();

const apiSyncState = {
  readyProjects: new Set(),
  snapshotPromises: new Map(),
  metaTimers: new Map()
};

const META_SYNC_DELAY_MS = 600;

// --- Local driver helpers --------------------------------------------------

const localCreate = (payload = {}) => {
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

const localLoad = (identifier = null) => {
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
  }
  const projectId = ensureProjectId(lookupKey);
  return {
    projectId,
    state: projectStore.getProjectStateSnapshot(projectId)
  };
};

const localLoadByParticipantToken = (token) => {
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

const localUpdateMeta = (projectId, changes) => {
  if (!projectId) throw new Error("projectId is required");
  return projectStore.updateProjectMeta(projectId, changes || {});
};

const localExportState = (projectId, options = {}) => {
  const snapshot = projectStore.exportProjectState(projectId);
  if (options.returnJson === true) {
    return JSON.stringify(snapshot, null, 2);
  }
  return snapshot;
};

const localImportState = (projectId, payload) => {
  if (!projectId) throw new Error("projectId is required");
  return projectStore.importProjectState(projectId, payload);
};

const localReset = (projectId) => {
  if (!projectId) throw new Error("projectId is required");
  return projectStore.resetProject(projectId);
};

const localSubscribe = (projectId, callback) => {
  if (!projectId || typeof callback !== "function") return () => {};
  return projectStore.subscribeProjectState(projectId, callback);
};

const localResolveProjectFromLocation = () => {
  const projectId = projectStore.resolveProjectIdFromLocation();
  return {
    projectId,
    state: projectStore.getProjectStateSnapshot(projectId),
    routeContext: projectStore.getCurrentRouteContext()
  };
};

const localGetRouteContext = () => projectStore.getCurrentRouteContext();

const localGetState = (projectId) => projectStore.getProjectStateSnapshot(projectId);

// --- API helpers -----------------------------------------------------------

const syncProjectSnapshot = (projectId, { force } = {}) => {
  if (!isApiEnabled() || !projectId) {
    return Promise.resolve(null);
  }
  if (!force && apiSyncState.snapshotPromises.has(projectId)) {
    return apiSyncState.snapshotPromises.get(projectId);
  }
  const promise = (async () => {
    try {
      const snapshot = await apiClient.get(`/api/projects/${encodeURIComponent(projectId)}/snapshot`);
      if (snapshot && snapshot.project) {
        projectStore.replaceStateFromApi(projectId, snapshot);
        apiSyncState.readyProjects.add(projectId);
      }
      return snapshot;
    } catch (error) {
      console.warn("[Scheduly] Failed to synchronize project snapshot", error);
      return null;
    } finally {
      apiSyncState.snapshotPromises.delete(projectId);
    }
  })();
  apiSyncState.snapshotPromises.set(projectId, promise);
  return promise;
};

const scheduleMetaSync = (projectId) => {
  if (!isApiEnabled() || !projectId) return;

  if (!apiSyncState.readyProjects.has(projectId)) {
    syncProjectSnapshot(projectId).then(() => {
      if (apiSyncState.readyProjects.has(projectId)) {
        scheduleMetaSync(projectId);
      }
    });
    return;
  }

  const existing = apiSyncState.metaTimers.get(projectId);
  if (existing) {
    clearTimeout(existing);
  }
  const timer = setTimeout(() => {
    apiSyncState.metaTimers.delete(projectId);
    persistProjectMeta(projectId);
  }, META_SYNC_DELAY_MS);
  apiSyncState.metaTimers.set(projectId, timer);
};

const persistProjectMeta = async (projectId) => {
  try {
    const state = projectStore.getProjectStateSnapshot(projectId);
    if (!state) return;
    const versions = state.versions || {};
    const versionValue = Number.isInteger(versions.metaVersion) ? versions.metaVersion : 1;
    const metaPayload = {
      name: typeof state.project?.name === "string" ? state.project.name : "",
      description: typeof state.project?.description === "string" ? state.project.description : "",
      defaultTzid:
        typeof state.project?.defaultTzid === "string" && state.project.defaultTzid
          ? state.project.defaultTzid
          : DEFAULT_TZID
    };
    const response = await apiClient.put(
      `/api/projects/${encodeURIComponent(projectId)}/meta`,
      {
        version: versionValue,
        meta: metaPayload
      }
    );
    if (response && response.meta) {
      projectStore.updateProjectMeta(projectId, {
        name: response.meta.name,
        description: response.meta.description,
        defaultTzid: response.meta.defaultTzid
      });
    }
    if (response && typeof response.version === "number") {
      projectStore.updateProjectVersions(projectId, { metaVersion: response.version });
    }
  } catch (error) {
    if (error && error.status === 409) {
      syncProjectSnapshot(projectId, { force: true });
    } else {
      console.warn("[Scheduly] Failed to persist project meta", error);
    }
  }
};

const apiCreate = async (payload = {}) => {
  try {
    const meta = {
      name: typeof payload.name === "string" ? payload.name : "",
      description: typeof payload.description === "string" ? payload.description : "",
      defaultTzid:
        typeof payload.defaultTzid === "string" && payload.defaultTzid
          ? payload.defaultTzid
          : DEFAULT_TZID
    };
    const response = await apiClient.post("/api/projects", { meta });
    if (response && response.projectId) {
      const snapshot = {
        project: response.project,
        candidates: [],
        participants: [],
        responses: [],
        shareTokens: response.shareTokens,
        versions: response.versions
      };
      projectStore.replaceStateFromApi(response.projectId, snapshot);
      apiSyncState.readyProjects.add(response.projectId);
      return {
        projectId: response.projectId,
        state: projectStore.getProjectStateSnapshot(response.projectId)
      };
    }
  } catch (error) {
    console.warn("[Scheduly] Failed to create project via API. Falling back to local driver.", error);
  }
  return localCreate(payload);
};

const apiLoad = (identifier = null) => {
  const result = localLoad(identifier);
  if (result && result.projectId) {
    syncProjectSnapshot(result.projectId);
  }
  return result;
};

const apiLoadByParticipantToken = (token) => {
  const result = localLoadByParticipantToken(token);
  if (result && result.projectId) {
    syncProjectSnapshot(result.projectId);
  }
  return result;
};

const apiUpdateMeta = (projectId, changes) => {
  const snapshot = localUpdateMeta(projectId, changes);
  scheduleMetaSync(projectId);
  return snapshot;
};

const apiReset = (projectId) => {
  const snapshot = localReset(projectId);
  syncProjectSnapshot(projectId, { force: true });
  return snapshot;
};

const apiImportState = (projectId, payload) => {
  const snapshot = localImportState(projectId, payload);
  apiSyncState.readyProjects.delete(projectId);
  syncProjectSnapshot(projectId, { force: true });
  return snapshot;
};

const apiResolveProjectFromLocation = () => {
  const resolved = localResolveProjectFromLocation();
  if (resolved && resolved.projectId) {
    syncProjectSnapshot(resolved.projectId);
  }
  return resolved;
};

const apiSubscribe = (projectId, callback) => {
  if (projectId) {
    syncProjectSnapshot(projectId);
  }
  return localSubscribe(projectId, callback);
};

// --- Public API ------------------------------------------------------------

const create = (payload) => (isApiEnabled() ? apiCreate(payload) : localCreate(payload));

const load = (identifier) => (isApiEnabled() ? apiLoad(identifier) : localLoad(identifier));

const loadByParticipantToken = (token) =>
  (isApiEnabled() ? apiLoadByParticipantToken(token) : localLoadByParticipantToken(token));

const updateMeta = (projectId, changes) =>
  (isApiEnabled() ? apiUpdateMeta(projectId, changes) : localUpdateMeta(projectId, changes));

const exportState = (projectId, options) => localExportState(projectId, options);

const importState = (projectId, payload) =>
  (isApiEnabled() ? apiImportState(projectId, payload) : localImportState(projectId, payload));

const reset = (projectId) => (isApiEnabled() ? apiReset(projectId) : localReset(projectId));

const subscribe = (projectId, callback) =>
  (isApiEnabled() ? apiSubscribe(projectId, callback) : localSubscribe(projectId, callback));

const resolveProjectFromLocation = () =>
  (isApiEnabled() ? apiResolveProjectFromLocation() : localResolveProjectFromLocation());

const getRouteContext = () => localGetRouteContext();

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
  getState: localGetState
};

