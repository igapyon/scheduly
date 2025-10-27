const { DEFAULT_TZID } = require("../shared/ical-utils");

const DEFAULT_PROJECT_ID = "demo-project";
const DEFAULT_PROJECT_NAME = "秋の合宿 調整会議";
const DEFAULT_PROJECT_DESCRIPTION = "秋の合宿に向けた日程調整を行います。候補から都合の良いものを選択してください。";
const DEMO_ADMIN_TOKEN = "demo-admin";

const projectStore = new Map();
const listeners = new Map();

const cloneState = (state) => JSON.parse(JSON.stringify(state));

const createInitialProjectState = (projectId = DEFAULT_PROJECT_ID) => {
  const timestamp = new Date().toISOString();
  return {
    project: {
      id: projectId,
      name: DEFAULT_PROJECT_NAME,
      description: DEFAULT_PROJECT_DESCRIPTION,
      defaultTzid: DEFAULT_TZID,
      shareTokens: { admin: DEMO_ADMIN_TOKEN },
      createdAt: timestamp,
      updatedAt: timestamp
    },
    icsText: "",
    candidates: [],
    participants: [],
    responses: []
  };
};

const ensureProjectEntry = (projectId = DEFAULT_PROJECT_ID) => {
  if (!projectStore.has(projectId)) {
    projectStore.set(projectId, createInitialProjectState(projectId));
  }
  return projectStore.get(projectId);
};

const notify = (projectId) => {
  const subs = listeners.get(projectId);
  if (!subs || subs.size === 0) return;
  const snapshot = getProjectStateSnapshot(projectId);
  subs.forEach((callback) => callback(snapshot));
};

const cloneCandidates = (candidates) => candidates.map((item) => ({ ...item }));

const resolveProjectIdFromLocation = () => {
  if (typeof window === "undefined") return DEFAULT_PROJECT_ID;
  const { pathname, hash } = window.location;

  // TODO: 後ほど `/a/{adminToken}` / `/p/{participantToken}` などを解析する
  if (pathname && pathname.length > 3) {
    const normalized = pathname.replace(/^\//, "");
    if (normalized.startsWith("a/")) return DEFAULT_PROJECT_ID;
    if (normalized.startsWith("p/")) return DEFAULT_PROJECT_ID;
    if (normalized.startsWith("r/")) return DEFAULT_PROJECT_ID;
  }

  if (hash && hash.includes("project=")) {
    const match = hash.match(/project=([\w-]+)/);
    if (match && match[1]) return match[1];
  }

  return DEFAULT_PROJECT_ID;
};

const getProjectStateSnapshot = (projectId = DEFAULT_PROJECT_ID) => {
  const state = ensureProjectEntry(projectId);
  return cloneState(state);
};

const getCandidates = (projectId = DEFAULT_PROJECT_ID) => {
  const state = ensureProjectEntry(projectId);
  return cloneCandidates(state.candidates || []);
};

const setProjectState = (projectId, nextState) => {
  projectStore.set(projectId, nextState);
  notify(projectId);
};

const replaceCandidates = (projectId, nextCandidates, nextIcsText = null) => {
  const state = ensureProjectEntry(projectId);
  const candidatesArray = Array.isArray(nextCandidates) ? cloneCandidates(nextCandidates) : [];
  const nextState = {
    ...state,
    candidates: candidatesArray
  };
  if (typeof nextIcsText === "string") {
    nextState.icsText = nextIcsText;
  }
  setProjectState(projectId, nextState);
  return getProjectStateSnapshot(projectId);
};

const getIcsText = (projectId = DEFAULT_PROJECT_ID) => {
  const state = ensureProjectEntry(projectId);
  return state.icsText || "";
};

const updateProjectMeta = (projectId, changes) => {
  const state = ensureProjectEntry(projectId);
  const nextProject = { ...state.project };
  let dirty = false;

  if (typeof changes.name === "string" && changes.name !== nextProject.name) {
    nextProject.name = changes.name;
    dirty = true;
  }

  if (typeof changes.description === "string" && changes.description !== nextProject.description) {
    nextProject.description = changes.description;
    dirty = true;
  }

  if (typeof changes.defaultTzid === "string" && changes.defaultTzid !== nextProject.defaultTzid) {
    nextProject.defaultTzid = changes.defaultTzid;
    dirty = true;
  }

  if (!dirty) {
    return getProjectStateSnapshot(projectId);
  }

  nextProject.updatedAt = new Date().toISOString();
  const nextState = {
    ...state,
    project: nextProject
  };
  setProjectState(projectId, nextState);
  return getProjectStateSnapshot(projectId);
};

const subscribeProjectState = (projectId, callback) => {
  const subs = listeners.get(projectId) ?? new Set();
  subs.add(callback);
  listeners.set(projectId, subs);
  return () => {
    const current = listeners.get(projectId);
    if (!current) return;
    current.delete(callback);
    if (current.size === 0) {
      listeners.delete(projectId);
    }
  };
};

const getDefaultProjectId = () => DEFAULT_PROJECT_ID;
const getDemoAdminToken = () => DEMO_ADMIN_TOKEN;

module.exports = {
  resolveProjectIdFromLocation,
  getProjectStateSnapshot,
  updateProjectMeta,
  subscribeProjectState,
  getCandidates,
  replaceCandidates,
  getIcsText,
  getDefaultProjectId,
  getDemoAdminToken
};
