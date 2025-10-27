// Copyright (c) Toshiki Iga. All Rights Reserved.

const { DEFAULT_TZID } = require("../shared/ical-utils");

const DEFAULT_PROJECT_ID = "demo-project";
const DEFAULT_PROJECT_NAME = "";
const DEFAULT_PROJECT_DESCRIPTION = "";
const DEMO_ADMIN_TOKEN = "demo-admin";
const PROJECT_EXPORT_VERSION = 1;

const projectStore = new Map();
const listeners = new Map();
const participantTokenIndex = new Map();
const participantTokenProjectMap = new Map();

const STORAGE_KEY = "scheduly:project-store";

const persistToStorage = () => {
  if (typeof window === "undefined") return;
  try {
    const payload = {};
    projectStore.forEach((state, projectId) => {
      payload[projectId] = state;
    });
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("[Scheduly] Failed to persist project store", error);
  }
};

const loadFromStorage = () => {
  if (typeof window === "undefined") return;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const payload = JSON.parse(raw);
    Object.entries(payload).forEach(([projectId, state]) => {
      if (!state || typeof state !== "object") return;
      projectStore.set(projectId, state);
      rebuildParticipantTokenIndex(projectId);
    });
  } catch (error) {
    console.warn("[Scheduly] Failed to load project store from storage", error);
  }
};

const createInitialProjectState = (projectId = DEFAULT_PROJECT_ID, options = {}) => {
  const timestamp = new Date().toISOString();
  const name = typeof options.name === "string" ? options.name : DEFAULT_PROJECT_NAME;
  const description = typeof options.description === "string" ? options.description : DEFAULT_PROJECT_DESCRIPTION;
  const demoSeedOptOut = Boolean(options.demoSeedOptOut);
  return {
    project: {
      id: projectId,
      name,
      description,
      defaultTzid: DEFAULT_TZID,
      shareTokens: { admin: DEMO_ADMIN_TOKEN },
      createdAt: timestamp,
      updatedAt: timestamp,
      demoSeedOptOut
    },
    icsText: "",
    candidates: [],
    participants: [],
    responses: []
  };
};

const notify = (projectId) => {
  const subs = listeners.get(projectId);
  if (!subs || subs.size === 0) return;
  const snapshot = getProjectStateSnapshot(projectId);
  subs.forEach((callback) => callback(snapshot));
};

const cloneCandidates = (candidates) => candidates.map((item) => ({ ...item }));

const cloneParticipants = (participants) => participants.map((item) => ({ ...item }));

const cloneResponses = (responses) => responses.map((item) => ({ ...item }));

function rebuildParticipantTokenIndex(projectId) {
  const tokens = participantTokenProjectMap.get(projectId);
  if (tokens) {
    tokens.forEach((token) => {
      const current = participantTokenIndex.get(token);
      if (current && current.projectId === projectId) {
        participantTokenIndex.delete(token);
      }
    });
  }

  const state = projectStore.get(projectId);
  if (!state) {
    participantTokenProjectMap.delete(projectId);
    return;
  }

  const trackedTokens = new Set();
  const participants = Array.isArray(state.participants) ? state.participants : [];
  participants.forEach((participant) => {
    if (!participant || !participant.token) return;
    const key = String(participant.token);
    trackedTokens.add(key);
    participantTokenIndex.set(key, { projectId, participantId: participant.id });
  });

  if (trackedTokens.size > 0) {
    participantTokenProjectMap.set(projectId, trackedTokens);
  } else {
    participantTokenProjectMap.delete(projectId);
  }
}

loadFromStorage();

const ensureProjectEntry = (projectId = DEFAULT_PROJECT_ID) => {
  if (!projectStore.has(projectId)) {
    projectStore.set(projectId, createInitialProjectState(projectId));
    rebuildParticipantTokenIndex(projectId);
    persistToStorage();
  }
  return projectStore.get(projectId);
};

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
  rebuildParticipantTokenIndex(projectId);
  persistToStorage();
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

const getParticipants = (projectId = DEFAULT_PROJECT_ID) => {
  const state = ensureProjectEntry(projectId);
  return cloneParticipants(state.participants || []);
};

const replaceParticipants = (projectId, nextParticipants) => {
  const state = ensureProjectEntry(projectId);
  const participantsArray = Array.isArray(nextParticipants) ? cloneParticipants(nextParticipants) : [];
  const nextState = {
    ...state,
    participants: participantsArray
  };
  setProjectState(projectId, nextState);
  return getProjectStateSnapshot(projectId);
};

const upsertParticipant = (projectId, participant) => {
  if (!participant || !participant.id) throw new Error("participant must have id");
  const state = ensureProjectEntry(projectId);
  const participants = Array.isArray(state.participants) ? state.participants.slice() : [];
  const nextParticipant = { ...participant };
  const index = participants.findIndex((item) => item && item.id === participant.id);
  if (index >= 0) {
    participants[index] = nextParticipant;
  } else {
    participants.push(nextParticipant);
  }
  const nextState = {
    ...state,
    participants
  };
  setProjectState(projectId, nextState);
  return { ...nextParticipant };
};

const removeParticipant = (projectId, participantId) => {
  const state = ensureProjectEntry(projectId);
  const nextParticipants = (state.participants || []).filter((item) => item && item.id !== participantId);
  const nextResponses = (state.responses || []).filter((item) => item && item.participantId !== participantId);
  const nextState = {
    ...state,
    participants: nextParticipants,
    responses: nextResponses
  };
  setProjectState(projectId, nextState);
  return getProjectStateSnapshot(projectId);
};

const findParticipantByToken = (token) => {
  if (!token) return null;
  const entry = participantTokenIndex.get(String(token));
  if (!entry) return null;
  const state = ensureProjectEntry(entry.projectId);
  const participant = (state.participants || []).find((item) => item && item.id === entry.participantId);
  if (!participant) return null;
  return { projectId: entry.projectId, participant: { ...participant } };
};

const getResponses = (projectId = DEFAULT_PROJECT_ID) => {
  const state = ensureProjectEntry(projectId);
  return cloneResponses(state.responses || []);
};

const replaceResponses = (projectId, nextResponses) => {
  const state = ensureProjectEntry(projectId);
  const responsesArray = Array.isArray(nextResponses) ? cloneResponses(nextResponses) : [];
  const nextState = {
    ...state,
    responses: responsesArray
  };
  setProjectState(projectId, nextState);
  return getProjectStateSnapshot(projectId);
};

const upsertResponse = (projectId, response) => {
  if (!response || !response.id) throw new Error("response must have id");
  const state = ensureProjectEntry(projectId);
  const responses = Array.isArray(state.responses) ? state.responses.slice() : [];
  const nextResponse = { ...response };
  const index = responses.findIndex((item) => item && item.id === response.id);
  if (index >= 0) {
    responses[index] = nextResponse;
  } else {
    responses.push(nextResponse);
  }
  const nextState = {
    ...state,
    responses
  };
  setProjectState(projectId, nextState);
  return { ...nextResponse };
};

const removeResponsesByCandidate = (projectId, candidateId) => {
  const state = ensureProjectEntry(projectId);
  const nextResponses = (state.responses || []).filter((item) => item && item.candidateId !== candidateId);
  const nextState = {
    ...state,
    responses: nextResponses
  };
  setProjectState(projectId, nextState);
  return getProjectStateSnapshot(projectId);
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

const resetProject = (projectId = DEFAULT_PROJECT_ID) => {
  const nextState = createInitialProjectState(projectId, { name: "", description: "", demoSeedOptOut: true });
  projectStore.set(projectId, nextState);
  rebuildParticipantTokenIndex(projectId);
  persistToStorage();
  notify(projectId);
  return getProjectStateSnapshot(projectId);
};

const sanitizeParticipants = (list) => {
  if (!Array.isArray(list)) return [];
  const seenIds = new Set();
  return list.reduce((acc, item) => {
    if (!item || typeof item !== "object") return acc;
    const id = typeof item.id === "string" && item.id.trim() ? item.id.trim() : null;
    if (!id || seenIds.has(id)) return acc;
    seenIds.add(id);
    acc.push({
      id,
      token: typeof item.token === "string" ? item.token : "",
      displayName: typeof item.displayName === "string" ? item.displayName : "",
      email: typeof item.email === "string" ? item.email : "",
      comment: typeof item.comment === "string" ? item.comment : "",
      createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
      updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : new Date().toISOString()
    });
    return acc;
  }, []);
};

const sanitizeCandidatesForImport = (list) => {
  if (!Array.isArray(list)) return [];
  const seenIds = new Set();
  return list.reduce((acc, item) => {
    if (!item || typeof item !== "object") return acc;
    const id = typeof item.id === "string" && item.id.trim() ? item.id.trim() : null;
    if (!id || seenIds.has(id)) return acc;
    seenIds.add(id);
    acc.push({
      id,
      uid: typeof item.uid === "string" ? item.uid : "",
      summary: typeof item.summary === "string" ? item.summary : "",
      dtstart: typeof item.dtstart === "string" ? item.dtstart : "",
      dtend: typeof item.dtend === "string" ? item.dtend : "",
      tzid: typeof item.tzid === "string" ? item.tzid : DEFAULT_TZID,
      status: typeof item.status === "string" ? item.status : "CONFIRMED",
      sequence: typeof item.sequence === "number" ? item.sequence : 0,
      dtstamp: typeof item.dtstamp === "string" ? item.dtstamp : "",
      location: typeof item.location === "string" ? item.location : "",
      description: typeof item.description === "string" ? item.description : "",
      rawICalVevent: item.rawICalVevent !== undefined ? item.rawICalVevent : null
    });
    return acc;
  }, []);
};

const sanitizeResponsesForImport = (list, validParticipantIds, validCandidateIds) => {
  if (!Array.isArray(list)) return [];
  return list.reduce((acc, item) => {
    if (!item || typeof item !== "object") return acc;
    const participantId = typeof item.participantId === "string" && item.participantId.trim() ? item.participantId.trim() : null;
    const candidateId = typeof item.candidateId === "string" && item.candidateId.trim() ? item.candidateId.trim() : null;
    if (!participantId || !candidateId) return acc;
    if (!validParticipantIds.has(participantId) || !validCandidateIds.has(candidateId)) return acc;
    acc.push({
      id: typeof item.id === "string" && item.id.trim() ? item.id.trim() : `${participantId}:${candidateId}`,
      participantId,
      candidateId,
      mark: typeof item.mark === "string" ? item.mark : "",
      comment: typeof item.comment === "string" ? item.comment : "",
      updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : new Date().toISOString()
    });
    return acc;
  }, []);
};

const sanitizeProjectForImport = (projectId, project, defaultProject) => {
  const nextProject = { ...defaultProject };
  if (project && typeof project === "object") {
    if (typeof project.name === "string") nextProject.name = project.name;
    if (typeof project.description === "string") nextProject.description = project.description;
    if (typeof project.defaultTzid === "string" && project.defaultTzid.trim()) {
      nextProject.defaultTzid = project.defaultTzid;
    }
    if (project.shareTokens && typeof project.shareTokens === "object") {
      nextProject.shareTokens = { ...defaultProject.shareTokens, ...project.shareTokens };
    }
    if (typeof project.createdAt === "string") nextProject.createdAt = project.createdAt;
    if (typeof project.updatedAt === "string") nextProject.updatedAt = project.updatedAt;
  }
  nextProject.id = projectId;
  nextProject.demoSeedOptOut = true;
  return nextProject;
};

const sanitizeImportedState = (projectId, rawState) => {
  const base = createInitialProjectState(projectId, { demoSeedOptOut: true });
  const nextState = {
    ...base,
    project: sanitizeProjectForImport(projectId, rawState?.project, base.project),
    icsText: typeof rawState?.icsText === "string" ? rawState.icsText : "",
    candidates: [],
    participants: [],
    responses: []
  };

  const participants = sanitizeParticipants(rawState?.participants);
  const candidates = sanitizeCandidatesForImport(rawState?.candidates);
  const participantIdSet = new Set(participants.map((item) => item.id));
  const candidateIdSet = new Set(candidates.map((item) => item.id));
  const responses = sanitizeResponsesForImport(rawState?.responses, participantIdSet, candidateIdSet);

  nextState.participants = participants;
  nextState.candidates = candidates;
  nextState.responses = responses;
  return nextState;
};

const exportProjectState = (projectId = DEFAULT_PROJECT_ID) => {
  const snapshot = getProjectStateSnapshot(projectId);
  return {
    version: PROJECT_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    projectId,
    state: snapshot
  };
};

const importProjectState = (projectId = DEFAULT_PROJECT_ID, payload = null) => {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid import payload");
  }
  const version = payload.version ?? PROJECT_EXPORT_VERSION;
  if (version !== PROJECT_EXPORT_VERSION) {
    throw new Error(`Unsupported project export version: ${version}`);
  }
  const rawState = payload.state ?? payload;
  if (!rawState || typeof rawState !== "object") {
    throw new Error("Import data missing state");
  }

  const sanitized = sanitizeImportedState(projectId, rawState);
  projectStore.set(projectId, sanitized);
  rebuildParticipantTokenIndex(projectId);
  persistToStorage();
  notify(projectId);
  return getProjectStateSnapshot(projectId);
};

const cloneState = (state) => JSON.parse(JSON.stringify(state));

module.exports = {
  resolveProjectIdFromLocation,
  getProjectStateSnapshot,
  updateProjectMeta,
  subscribeProjectState,
  getCandidates,
  replaceCandidates,
  getIcsText,
  getDefaultProjectId,
  getDemoAdminToken,
  getParticipants,
  replaceParticipants,
  upsertParticipant,
  removeParticipant,
  findParticipantByToken,
  getResponses,
  replaceResponses,
  upsertResponse,
  removeResponsesByCandidate,
  resetProject,
  exportProjectState,
  importProjectState
};
