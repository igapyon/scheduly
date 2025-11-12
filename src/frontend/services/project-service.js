// Copyright (c) Toshiki Iga. All Rights Reserved.

const { DEFAULT_TZID } = require("../shared/ical-utils");
const projectStore = require("../store/project-store");
const apiClient = require("./api-client");
const { addSyncListener, emitSyncEvent } = require("./sync-events");

const apiSyncState = {
  readyProjects: new Set(),
  snapshotPromises: new Map(),
  metaTimers: new Map(),
  metaValidationIssues: new Map()
};

const SESSION_PROJECT_STORAGE_KEY = "scheduly:project-id";

const getSessionStorage = () => {
  if (typeof window === "undefined" || !window.sessionStorage) {
    return null;
  }
  return window.sessionStorage;
};

const getStoredSessionProjectId = () => {
  const storage = getSessionStorage();
  if (!storage) return null;
  try {
    return storage.getItem(SESSION_PROJECT_STORAGE_KEY);
  } catch (error) {
    console.warn("[Scheduly] Failed to read session project id", error);
    return null;
  }
};

const setStoredSessionProjectId = (projectId) => {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    if (projectId) {
      storage.setItem(SESSION_PROJECT_STORAGE_KEY, projectId);
    } else {
      storage.removeItem(SESSION_PROJECT_STORAGE_KEY);
    }
  } catch (error) {
    console.warn("[Scheduly] Failed to write session project id", error);
  }
};

const parseRouteFromLocation = () => {
  if (typeof window === "undefined" || !window.location) {
    return { kind: "server" };
  }
  const pathname = window.location.pathname || "/";
  const normalized = pathname.replace(/^\/+/, "");
  if (!normalized || normalized === "index.html" || normalized === "user.html") {
    return { kind: "root" };
  }
  const segments = normalized.split("/");
  const prefix = segments[0] || "";
  const rawToken = segments[1] || "";
  const token = decodeURIComponent(rawToken);
  if ((prefix === "a" || prefix === "p" || prefix === "r") && token) {
    return {
      kind: prefix === "a" ? "admin" : "participant",
      token
    };
  }
  return { kind: "root" };
};

const META_SYNC_DELAY_MS = 600;
const META_NAME_MAX = 120;
const META_DESCRIPTION_MAX = 2000;

const cancelPendingMetaSync = (projectId) => {
  const existing = apiSyncState.metaTimers.get(projectId);
  if (existing) {
    clearTimeout(existing);
    apiSyncState.metaTimers.delete(projectId);
  }
};

const ensureMetaPayloadShape = (project = {}) => ({
  name: typeof project?.name === "string" ? project.name : "",
  description: typeof project?.description === "string" ? project.description : "",
  defaultTzid:
    typeof project?.defaultTzid === "string" && project.defaultTzid
      ? project.defaultTzid
      : DEFAULT_TZID
});

const validateMetaPayload = (payload = {}) => {
  const issues = [];
  const rawName = typeof payload.name === "string" ? payload.name : "";
  const trimmedName = rawName.trim();
  if (!trimmedName) {
    issues.push("name_missing");
  } else if (rawName.length > META_NAME_MAX) {
    issues.push("name_length");
  }

  const description = typeof payload.description === "string" ? payload.description : "";
  if (description.length > META_DESCRIPTION_MAX) {
    issues.push("description_length");
  }

  const tzid =
    typeof payload.defaultTzid === "string" && payload.defaultTzid.trim()
      ? payload.defaultTzid.trim()
      : "";
  if (!tzid) {
    issues.push("defaultTzid_missing");
  }

  return {
    valid: issues.length === 0,
    issues,
    normalized: {
      name: trimmedName,
      description,
      defaultTzid: tzid || DEFAULT_TZID
    }
  };
};

const issuesToFieldList = (issues = []) =>
  Array.from(
    new Set(
      issues.map((issue) => {
        if (issue.startsWith("name")) return "name";
        if (issue.startsWith("description")) return "description";
        if (issue.startsWith("defaultTzid")) return "defaultTzid";
        return "meta";
      })
    )
  );

const describeMetaValidationIssues = (issues = []) => {
  if (issues.includes("name_missing")) {
    return "プロジェクト名を入力してください";
  }
  if (issues.includes("name_length")) {
    return `プロジェクト名は ${META_NAME_MAX} 文字以内で入力してください`;
  }
  if (issues.includes("description_length")) {
    return `説明は ${META_DESCRIPTION_MAX} 文字以内で入力してください`;
  }
  if (issues.includes("defaultTzid_missing")) {
    return "デフォルトのタイムゾーンを入力してください";
  }
  return "Project meta validation failed";
};

const rememberMetaValidationIssues = (projectId, issues) => {
  const key = issues.join("|") || "none";
  const previous = apiSyncState.metaValidationIssues.get(projectId);
  apiSyncState.metaValidationIssues.set(projectId, key);
  return previous !== key;
};

const clearMetaValidationIssues = (projectId) => {
  apiSyncState.metaValidationIssues.delete(projectId);
};

const emitMetaValidationError = (projectId, issues) => {
  const message = describeMetaValidationIssues(issues);
  const error = new Error(message);
  error.status = 422;
  error.payload = {
    code: 422,
    message,
    fields: issuesToFieldList(issues)
  };
  emitSyncEvent({ scope: "meta", phase: "validation-error", projectId, error });
};

const handleMetaValidationFailure = (projectId, issues) => {
  cancelPendingMetaSync(projectId);
  if (rememberMetaValidationIssues(projectId, issues)) {
    emitMetaValidationError(projectId, issues);
  }
};

// --- Local driver helpers --------------------------------------------------

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

const normalizeImportSnapshot = (payload) => {
  if (payload && typeof payload === "object" && typeof payload.state === "object") {
    return payload.state;
  }
  return payload;
};

const getLocalMetaVersion = (projectId) => {
  const snapshot = projectStore.getProjectStateSnapshot(projectId);
  const version = snapshot?.versions?.metaVersion;
  return Number.isInteger(version) && version > 0 ? version : 1;
};

const apiImportState = async (projectId, payload, { version } = {}) => {
  if (!projectId) throw new Error("projectId is required");
  const snapshotPayload = normalizeImportSnapshot(payload);
  if (!snapshotPayload || typeof snapshotPayload !== "object") {
    throw new Error("Invalid import payload");
  }
  const requestBody = {
    version: Number.isInteger(version) && version > 0 ? version : getLocalMetaVersion(projectId),
    snapshot: snapshotPayload
  };
  const response = await apiClient.post(
    `/api/projects/${encodeURIComponent(projectId)}/import/json`,
    requestBody
  );
  apiSyncState.readyProjects.delete(projectId);
  const importedSnapshot = response?.snapshot;
  if (importedSnapshot && typeof importedSnapshot === "object") {
    projectStore.replaceStateFromApi(projectId, importedSnapshot);
  } else {
    projectStore.importProjectState(projectId, payload);
  }
  await syncProjectSnapshot(projectId, { force: true, reason: "import" });
  return projectStore.getProjectStateSnapshot(projectId);
};

const apiReset = async (projectId) => {
  if (!projectId) throw new Error("projectId is required");
  const expectedVersion = getLocalMetaVersion(projectId);
  projectStore.resetProject(projectId);
  const blankSnapshot = projectStore.getProjectStateSnapshot(projectId);
  return apiImportState(projectId, blankSnapshot, { version: expectedVersion });
};

const localSubscribe = (projectId, callback) => {
  if (!projectId || typeof callback !== "function") return () => {};
  return projectStore.subscribeProjectState(projectId, callback);
};

const localGetState = (projectId) => projectStore.getProjectStateSnapshot(projectId);

// --- API helpers -----------------------------------------------------------

const syncProjectSnapshot = (projectId, { force, reason } = {}) => {
  if (!projectId) {
    return Promise.resolve(null);
  }
  if (!force && apiSyncState.snapshotPromises.has(projectId)) {
    return apiSyncState.snapshotPromises.get(projectId);
  }
  if (process.env.NODE_ENV !== "production") {
    console.info("[Scheduly][projectService] syncProjectSnapshot start", { projectId, reason });
  }
  emitSyncEvent({ scope: "snapshot", phase: "start", projectId, meta: { reason } });
  const promise = (async () => {
    try {
      const wasReady = apiSyncState.readyProjects.has(projectId);
      const snapshot = await apiClient.get(`/api/projects/${encodeURIComponent(projectId)}/snapshot`);
      if (snapshot && snapshot.project) {
        projectStore.replaceStateFromApi(projectId, snapshot);
        apiSyncState.readyProjects.add(projectId);
        if (process.env.NODE_ENV !== "production") {
          console.info("[Scheduly][projectService] syncProjectSnapshot success", { projectId, reason });
        }
        emitSyncEvent({
          scope: "snapshot",
          phase: "success",
          projectId,
          payload: snapshot,
          meta: { reason, firstReady: !wasReady }
        });
      }
      return snapshot;
    } catch (error) {
      console.warn("[Scheduly] Failed to synchronize project snapshot", error);
      emitSyncEvent({ scope: "snapshot", phase: "error", projectId, error, meta: { reason } });
      return null;
    } finally {
      apiSyncState.snapshotPromises.delete(projectId);
    }
  })();
  apiSyncState.snapshotPromises.set(projectId, promise);
  return promise;
};

const scheduleMetaSync = (projectId) => {
  if (!projectId) return;

  if (!apiSyncState.readyProjects.has(projectId)) {
    syncProjectSnapshot(projectId, { reason: "meta-prereq" }).then(() => {
      if (apiSyncState.readyProjects.has(projectId)) {
        scheduleMetaSync(projectId);
      }
    });
    return;
  }

  emitSyncEvent({ scope: "meta", phase: "pending", projectId });
  cancelPendingMetaSync(projectId);
  clearMetaValidationIssues(projectId);
  const timer = setTimeout(() => {
    apiSyncState.metaTimers.delete(projectId);
    if (process.env.NODE_ENV !== "production") {
      console.info("[Scheduly][projectService] persistProjectMeta scheduled", { projectId });
    }
    persistProjectMeta(projectId);
  }, META_SYNC_DELAY_MS);
  apiSyncState.metaTimers.set(projectId, timer);
};

const persistProjectMeta = async (projectId) => {
  try {
    emitSyncEvent({ scope: "meta", phase: "sending", projectId });
    if (process.env.NODE_ENV !== "production") {
      console.info("[Scheduly][projectService] persistProjectMeta sending", { projectId });
    }
    const state = projectStore.getProjectStateSnapshot(projectId);
    if (!state) return;
    const versions = state.versions || {};
    const versionValue = Number.isInteger(versions.metaVersion) ? versions.metaVersion : 1;
    const metaPayload = ensureMetaPayloadShape(state.project);
    const validation = validateMetaPayload(metaPayload);
    if (!validation.valid) {
      handleMetaValidationFailure(projectId, validation.issues);
      return;
    }
    clearMetaValidationIssues(projectId);
    const response = await apiClient.put(
      `/api/projects/${encodeURIComponent(projectId)}/meta`,
      {
        version: versionValue,
        meta: validation.normalized
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
    emitSyncEvent({ scope: "meta", phase: "success", projectId });
    if (process.env.NODE_ENV !== "production") {
      console.info("[Scheduly][projectService] persistProjectMeta success", { projectId });
    }
  } catch (error) {
    if (error && error.status === 409) {
      emitSyncEvent({ scope: "meta", phase: "conflict", projectId, error });
      if (process.env.NODE_ENV !== "production") {
        console.warn("[Scheduly][projectService] persistProjectMeta conflict", { projectId, error });
      }
      syncProjectSnapshot(projectId, { force: true, reason: "conflict" });
    } else if (error && error.status === 422) {
      emitSyncEvent({ scope: "meta", phase: "validation-error", projectId, error });
      if (process.env.NODE_ENV !== "production") {
        console.warn("[Scheduly][projectService] persistProjectMeta validation error", { projectId, error });
      }
    } else {
      emitSyncEvent({ scope: "meta", phase: "error", projectId, error });
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
    throw new Error("Failed to create project via API");
  } catch (error) {
    console.warn("[Scheduly] Failed to create project via API.", error);
    throw error;
  }
};

const apiUpdateMeta = (projectId, changes) => {
  const snapshot = localUpdateMeta(projectId, changes);
  if (!projectId) {
    return snapshot;
  }
  const metaPayload = ensureMetaPayloadShape(snapshot?.project);
  const validation = validateMetaPayload(metaPayload);
  if (!validation.valid) {
    handleMetaValidationFailure(projectId, validation.issues);
    return snapshot;
  }
  clearMetaValidationIssues(projectId);
  scheduleMetaSync(projectId);
  return snapshot;
};

const resolveViaShareToken = async (routeInfo) => {
  const typePath = routeInfo.kind === "admin" ? "admin" : "participant";
  try {
    const response = await apiClient.get(
      `/api/projects/share/${typePath}/${encodeURIComponent(routeInfo.token)}`
    );
    const snapshot = {
      project: response.project,
      candidates: response.candidates,
      participants: response.participants,
      responses: response.responses,
      shareTokens: response.shareTokens,
      versions: response.versions
    };
    projectStore.replaceStateFromApi(response.projectId, snapshot);
    projectStore.setRouteContext({
      projectId: response.projectId,
      kind: "share",
      shareType: typePath,
      token: routeInfo.token
    });
    apiSyncState.readyProjects.add(response.projectId);
    return {
      projectId: response.projectId,
      state: projectStore.getProjectStateSnapshot(response.projectId),
      routeContext: projectStore.getCurrentRouteContext()
    };
  } catch (error) {
    if (error && error.status === 404) {
      projectStore.setRouteContext({
        projectId: projectStore.getDefaultProjectId(),
        kind: "share-miss",
        shareType: typePath,
        token: routeInfo.token
      });
      return {
        projectId: projectStore.getDefaultProjectId(),
        state: projectStore.getProjectStateSnapshot(projectStore.getDefaultProjectId()),
        routeContext: projectStore.getCurrentRouteContext()
      };
    }
    throw error;
  }
};

const loadSessionProjectSnapshot = async (projectId) => {
  projectStore.setRouteContext({ projectId, kind: "default" });
  const snapshot = await syncProjectSnapshot(projectId, { reason: "initial-load" });
  if (!snapshot) {
    return null;
  }
  return {
    projectId,
    state: projectStore.getProjectStateSnapshot(projectId),
    routeContext: projectStore.getCurrentRouteContext()
  };
};

const createFreshSessionProject = async () => {
  try {
    const created = await apiCreate();
    if (created && created.projectId) {
      setStoredSessionProjectId(created.projectId);
      projectStore.setRouteContext({ projectId: created.projectId, kind: "default" });
      return {
        projectId: created.projectId,
        state: created.state || projectStore.getProjectStateSnapshot(created.projectId),
        routeContext: projectStore.getCurrentRouteContext()
      };
    }
  } catch (error) {
    console.warn("[Scheduly] Falling back to default project after create failure", error);
  }
  const fallbackId = projectStore.getDefaultProjectId();
  projectStore.setRouteContext({ projectId: fallbackId, kind: "default" });
  return {
    projectId: fallbackId,
    state: projectStore.getProjectStateSnapshot(fallbackId),
    routeContext: projectStore.getCurrentRouteContext()
  };
};

const resolveSessionProject = async () => {
  const storedProjectId = getStoredSessionProjectId();
  if (storedProjectId) {
    const resolved = await loadSessionProjectSnapshot(storedProjectId);
    if (resolved) {
      return resolved;
    }
    setStoredSessionProjectId(null);
  }
  return createFreshSessionProject();
};

const apiResolveProjectFromLocation = async () => {
  const routeInfo = parseRouteFromLocation();
  if (routeInfo.kind === "admin" || routeInfo.kind === "participant") {
    return resolveViaShareToken(routeInfo);
  }
  return resolveSessionProject();
};

const apiSubscribe = (projectId, callback) => {
  if (projectId) {
    syncProjectSnapshot(projectId, { reason: "subscription" });
  }
  return localSubscribe(projectId, callback);
};

// --- Public API ------------------------------------------------------------

const updateMeta = (projectId, changes) => apiUpdateMeta(projectId, changes);

const exportState = (projectId, options) => localExportState(projectId, options);

const importState = (projectId, payload) => apiImportState(projectId, payload);

const reset = (projectId) => apiReset(projectId);

const subscribe = (projectId, callback) => apiSubscribe(projectId, callback);

const resolveProjectFromLocation = () => apiResolveProjectFromLocation();

const getRouteContext = () => projectStore.getCurrentRouteContext();

const isProjectReady = (projectId) => apiSyncState.readyProjects.has(projectId);

module.exports = {
  updateMeta,
  exportState,
  importState,
  reset,
  subscribe,
  resolveProjectFromLocation,
  getRouteContext,
  addSyncListener,
  getDefaultProjectId: projectStore.getDefaultProjectId,
  getState: localGetState,
  syncProjectSnapshot,
  isProjectReady
};
