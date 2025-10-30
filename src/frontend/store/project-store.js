// Copyright (c) Toshiki Iga. All Rights Reserved.

const { DEFAULT_TZID } = require("../shared/ical-utils");

const DEFAULT_PROJECT_ID = "demo-project";
const DEFAULT_PROJECT_NAME = "";
const DEFAULT_PROJECT_DESCRIPTION = "";
const DEMO_ADMIN_TOKEN = "demo-admin";
const PROJECT_EXPORT_VERSION = 1;
const SHARE_TOKEN_TYPES = ["admin", "participant"];

const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
const isPlaceholderShareToken = (token) => typeof token === "string" && token.startsWith("demo-");

const sanitizeShareTokenEntry = (input) => {
  if (!input) return null;
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return null;
    return {
      token: trimmed,
      url: "",
      issuedAt: ""
    };
  }
  if (typeof input !== "object") return null;
  const token = isNonEmptyString(input.token) ? input.token.trim() : "";
  if (!token) return null;
  const entry = {
    token,
    url: isNonEmptyString(input.url) ? input.url.trim() : "",
    issuedAt: isNonEmptyString(input.issuedAt) ? input.issuedAt : ""
  };
  if (isNonEmptyString(input.revokedAt)) {
    entry.revokedAt = input.revokedAt;
  }
  if (isNonEmptyString(input.lastGeneratedBy)) {
    entry.lastGeneratedBy = input.lastGeneratedBy;
  }
  return entry;
};

const normalizeShareTokens = (raw, { includeDemo = false } = {}) => {
  const source = raw && typeof raw === "object" ? raw : {};
  const next = {};
  const adminSource =
    source.admin !== undefined
      ? source.admin
      : includeDemo
        ? DEMO_ADMIN_TOKEN
        : null;
  const participantSource = source.participant ?? source.guest ?? null;

  const adminEntry = sanitizeShareTokenEntry(adminSource);
  if (adminEntry) {
    next.admin = adminEntry;
  }
  const participantEntry = sanitizeShareTokenEntry(participantSource);
  if (participantEntry) {
    next.participant = participantEntry;
  }
  return next;
};

const cloneShareTokens = (shareTokens) => {
  if (!shareTokens || typeof shareTokens !== "object") return {};
  const next = {};
  SHARE_TOKEN_TYPES.forEach((type) => {
    const entry = shareTokens[type];
    if (entry && typeof entry === "object") {
      next[type] = { ...entry };
    }
  });
  return next;
};

const createInitialDerivedState = () => ({
  tallies: {
    candidates: {},
    participants: {}
  }
});

const cloneTallies = (tallies) => {
  const next = {
    candidates: {},
    participants: {}
  };
  if (tallies && typeof tallies === "object") {
    if (tallies.candidates && typeof tallies.candidates === "object") {
      Object.entries(tallies.candidates).forEach(([candidateId, entry]) => {
        if (!entry || typeof entry !== "object") return;
        next.candidates[candidateId] = { ...entry };
      });
    }
    if (tallies.participants && typeof tallies.participants === "object") {
      Object.entries(tallies.participants).forEach(([participantId, entry]) => {
        if (!entry || typeof entry !== "object") return;
        next.participants[participantId] = { ...entry };
      });
    }
  }
  return next;
};

const projectStore = new Map();
const listeners = new Map();
const participantTokenIndex = new Map();
const participantTokenProjectMap = new Map();
const shareTokenIndex = {
  admin: new Map(),
  participant: new Map()
};
const shareTokenProjectMap = new Map();

const STORAGE_KEY = "scheduly:project-store";
const defaultRouteContext = Object.freeze({
  projectId: DEFAULT_PROJECT_ID,
  kind: "default",
  token: null,
  shareType: null,
  participantId: null
});
let currentRouteContext = { ...defaultRouteContext };

const setRouteContext = (context) => {
  currentRouteContext = { ...defaultRouteContext, ...context };
};

const getCurrentRouteContext = () => ({ ...currentRouteContext });

const decodePathToken = (value) => {
  if (!isNonEmptyString(value)) return "";
  try {
    return decodeURIComponent(value);
  } catch (error) {
    return value;
  }
};

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
      const sanitized = ensureProjectStateShape(projectId, state, { includeDemoToken: true });
      projectStore.set(projectId, sanitized);
      rebuildParticipantTokenIndex(projectId);
      rebuildShareTokenIndex(projectId);
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
      shareTokens: normalizeShareTokens({ admin: DEMO_ADMIN_TOKEN }, { includeDemo: true }),
      createdAt: timestamp,
      updatedAt: timestamp,
      demoSeedOptOut
    },
    icsText: "",
    candidates: [],
    participants: [],
    responses: [],
    derived: createInitialDerivedState()
  };
};

const ensureProjectStateShape = (projectId, rawState, { includeDemoToken = false } = {}) => {
  if (!rawState || typeof rawState !== "object") {
    return createInitialProjectState(projectId);
  }
  const nextState = { ...rawState };
  const project = rawState.project && typeof rawState.project === "object" ? { ...rawState.project } : {};
  project.id = isNonEmptyString(project.id) ? project.id : projectId;
  project.shareTokens = normalizeShareTokens(project.shareTokens, { includeDemo: includeDemoToken });
  nextState.project = project;
  const baseDerived = rawState.derived && typeof rawState.derived === "object" ? rawState.derived : {};
  nextState.derived = {
    ...createInitialDerivedState(),
    ...baseDerived,
    tallies: cloneTallies(baseDerived.tallies)
  };
  return nextState;
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

function rebuildShareTokenIndex(projectId) {
  const previous = shareTokenProjectMap.get(projectId);
  if (previous && typeof previous === "object") {
    SHARE_TOKEN_TYPES.forEach((type) => {
      const token = previous[type];
      if (!token) return;
      const indexMap = shareTokenIndex[type];
      const current = indexMap.get(token);
      if (current && current.projectId === projectId) {
        indexMap.delete(token);
      }
    });
  }

  const state = projectStore.get(projectId);
  if (!state) {
    shareTokenProjectMap.delete(projectId);
    return;
  }

  const nextTracked = {};
  const tokens = state.project?.shareTokens;
  SHARE_TOKEN_TYPES.forEach((type) => {
    const entry = tokens?.[type];
    if (!entry || !isNonEmptyString(entry.token) || isPlaceholderShareToken(entry.token)) return;
    const tokenKey = String(entry.token);
    const indexMap = shareTokenIndex[type];
    indexMap.set(tokenKey, { projectId });
    nextTracked[type] = tokenKey;
  });

  if (Object.keys(nextTracked).length > 0) {
    shareTokenProjectMap.set(projectId, nextTracked);
  } else {
    shareTokenProjectMap.delete(projectId);
  }
}

loadFromStorage();

const ensureProjectEntry = (projectId = DEFAULT_PROJECT_ID) => {
  if (!projectStore.has(projectId)) {
    projectStore.set(projectId, createInitialProjectState(projectId));
    rebuildParticipantTokenIndex(projectId);
    rebuildShareTokenIndex(projectId);
    persistToStorage();
  }
  return projectStore.get(projectId);
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
  const sanitized = ensureProjectStateShape(projectId, nextState, { includeDemoToken: false });
  projectStore.set(projectId, sanitized);
  rebuildParticipantTokenIndex(projectId);
  rebuildShareTokenIndex(projectId);
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

const getShareTokens = (projectId = DEFAULT_PROJECT_ID) => {
  const state = ensureProjectEntry(projectId);
  return cloneShareTokens(state.project?.shareTokens);
};

const findProjectByShareToken = (type, token) => {
  if (!isNonEmptyString(token)) return null;
  if (!SHARE_TOKEN_TYPES.includes(type)) return null;
  const indexMap = shareTokenIndex[type];
  const key = String(token);
  const entry = indexMap.get(key);
  if (!entry) return null;
  const projectId = entry.projectId;
  if (!projectId) return null;
  const state = ensureProjectEntry(projectId);
  const tokens = state.project?.shareTokens;
  const matched = tokens?.[type];
  if (!matched || !isNonEmptyString(matched.token) || matched.token !== key) {
    return null;
  }
  return {
    projectId,
    token: key,
    entry: { ...matched }
  };
};

const updateShareTokens = (projectId, updater) => {
  const state = ensureProjectEntry(projectId);
  const currentTokens = cloneShareTokens(state.project?.shareTokens);
  const nextInput =
    typeof updater === "function" ? updater(currentTokens) ?? currentTokens : updater ?? {};
  const nextTokens = normalizeShareTokens(nextInput);
  const nextProject = {
    ...state.project,
    shareTokens: nextTokens,
    updatedAt: new Date().toISOString()
  };
  const nextState = {
    ...state,
    project: nextProject
  };
  setProjectState(projectId, nextState);
  return cloneShareTokens(nextTokens);
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

const getTallies = (projectId = DEFAULT_PROJECT_ID) => {
  const state = ensureProjectEntry(projectId);
  const tallies = state.derived?.tallies ?? createInitialDerivedState().tallies;
  return cloneTallies(tallies);
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

const replaceTallies = (projectId, nextTallies) => {
  const state = ensureProjectEntry(projectId);
  const tallies = cloneTallies(nextTallies);
  const nextState = {
    ...state,
    derived: {
      ...(state.derived || createInitialDerivedState()),
      tallies
    }
  };
  setProjectState(projectId, nextState);
  return cloneTallies(tallies);
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
  setProjectState(projectId, nextState);
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
    const importedShareTokens = normalizeShareTokens(project.shareTokens);
    if (Object.keys(importedShareTokens).length > 0) {
      nextProject.shareTokens = importedShareTokens;
    } else {
      nextProject.shareTokens = normalizeShareTokens(defaultProject.shareTokens, { includeDemo: true });
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
  setProjectState(projectId, sanitized);
  return getProjectStateSnapshot(projectId);
};

const cloneState = (state) => JSON.parse(JSON.stringify(state));

const resolveProjectIdFromLocation = () => {
  if (typeof window === "undefined") {
    setRouteContext({ projectId: DEFAULT_PROJECT_ID, kind: "server" });
    return DEFAULT_PROJECT_ID;
  }

  const { pathname, hash } = window.location;
  const normalizedPath = typeof pathname === "string" ? pathname.replace(/^\/+/, "") : "";

  if (normalizedPath) {
    const segments = normalizedPath.split("/");
    const prefix = segments[0] || "";
    const rawToken = segments[1] || "";
    const token = decodePathToken(rawToken);

    if (prefix === "a" && token) {
      const matched = findProjectByShareToken("admin", token);
      if (matched) {
        setRouteContext({
          projectId: matched.projectId,
          kind: "share",
          shareType: "admin",
          token
        });
        return matched.projectId;
      }
      setRouteContext({
        projectId: DEFAULT_PROJECT_ID,
        kind: "share-miss",
        shareType: "admin",
        token
      });
      return DEFAULT_PROJECT_ID;
    }

    if (prefix === "p" && token) {
      const shareMatch = findProjectByShareToken("participant", token);
      if (shareMatch) {
        setRouteContext({
          projectId: shareMatch.projectId,
          kind: "share",
          shareType: "participant",
          token
        });
        return shareMatch.projectId;
      }
      const participantMatch = findParticipantByToken(token);
      if (participantMatch) {
        setRouteContext({
          projectId: participantMatch.projectId,
          kind: "participant-token",
          shareType: "participant",
          token,
          participantId: participantMatch.participant.id
        });
        return participantMatch.projectId;
      }
      setRouteContext({
        projectId: DEFAULT_PROJECT_ID,
        kind: "share-miss",
        shareType: "participant",
        token
      });
      return DEFAULT_PROJECT_ID;
    }

    if (prefix === "r" && token) {
      const participantMatch = findParticipantByToken(token);
      if (participantMatch) {
        setRouteContext({
          projectId: participantMatch.projectId,
          kind: "participant-token",
          shareType: "participant",
          token,
          participantId: participantMatch.participant.id
        });
        return participantMatch.projectId;
      }
      const shareMatch = findProjectByShareToken("participant", token);
      if (shareMatch) {
        setRouteContext({
          projectId: shareMatch.projectId,
          kind: "share",
          shareType: "participant",
          token
        });
        return shareMatch.projectId;
      }
      setRouteContext({
        projectId: DEFAULT_PROJECT_ID,
        kind: "participant-token-miss",
        shareType: "participant",
        token
      });
      return DEFAULT_PROJECT_ID;
    }
  }

  if (hash && hash.includes("project=")) {
    const match = hash.match(/project=([\w-]+)/);
    if (match && match[1]) {
      const projectId = match[1];
      setRouteContext({
        projectId,
        kind: "hash",
        token: null,
        shareType: null
      });
      return projectId;
    }
  }

  setRouteContext(defaultRouteContext);
  return DEFAULT_PROJECT_ID;
};

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
  getCurrentRouteContext,
  getShareTokens,
  findProjectByShareToken,
  updateShareTokens,
  getParticipants,
  replaceParticipants,
  upsertParticipant,
  removeParticipant,
  findParticipantByToken,
  getResponses,
  getTallies,
  replaceResponses,
  upsertResponse,
  removeResponsesByCandidate,
  resetProject,
  exportProjectState,
  importProjectState,
  replaceTallies
};
