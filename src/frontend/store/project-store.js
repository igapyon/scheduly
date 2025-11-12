// Copyright (c) Toshiki Iga. All Rights Reserved.

/**
 * @typedef {import("../../shared/types").ShareTokens} ShareTokens
 * @typedef {import("../../shared/types").ProjectSnapshot} ProjectSnapshot
 * @typedef {import("../../shared/types").ScheduleCandidate} ScheduleCandidate
 * @typedef {import("../../shared/types").Participant} ProjectParticipant
 * @typedef {import("../../shared/types").ParticipantResponse} ProjectResponse
 * @typedef {import("../../shared/types").VersionState} VersionState
 */

const { DEFAULT_TZID } = require("../shared/ical-utils");

const DEFAULT_PROJECT_ID = "demo-project";
const DEFAULT_PROJECT_NAME = "";
const DEFAULT_PROJECT_DESCRIPTION = "";
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

const normalizeShareTokens = (raw) => {
  const source = raw && typeof raw === "object" ? raw : {};
  const next = {};
  const adminSource = source.admin ?? null;
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

const createInitialVersions = () => ({
  metaVersion: 1,
  candidatesVersion: 0,
  candidatesListVersion: 0,
  participantsVersion: 0,
  responsesVersion: 0,
  shareTokensVersion: 1
});

const sanitizeVersions = (raw) => {
  const defaults = createInitialVersions();
  if (!raw || typeof raw !== "object") {
    return defaults;
  }
  Object.keys(defaults).forEach((key) => {
    const value = raw[key];
    if (Number.isInteger(value) && value >= 0) {
      defaults[key] = value;
    }
  });
  return defaults;
};

const projectStore = {
  projectId: DEFAULT_PROJECT_ID,
  state: null
};
const listeners = new Map();

const getSessionStorage = () => {
  if (typeof window === "undefined" || !window.sessionStorage) {
    return null;
  }
  return window.sessionStorage;
};

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
    void error;
    return value;
  }
};

const persistToStorage = () => {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    const payload = {
      projectId: projectStore.projectId,
      state: projectStore.state
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("[Scheduly] Failed to persist project store", error);
  }
};

const loadFromStorage = () => {
  const storage = getSessionStorage();
  if (!storage) {
    projectStore.projectId = DEFAULT_PROJECT_ID;
    projectStore.state = createInitialProjectState(DEFAULT_PROJECT_ID);
    return;
  }
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      projectStore.projectId = DEFAULT_PROJECT_ID;
      projectStore.state = createInitialProjectState(DEFAULT_PROJECT_ID);
      return;
    }
    const payload = JSON.parse(raw);
    if (payload && typeof payload === "object") {
      const storedId = isNonEmptyString(payload.projectId) ? payload.projectId : DEFAULT_PROJECT_ID;
      const sanitized = ensureProjectStateShape(storedId, payload.state);
      projectStore.projectId = storedId;
      projectStore.state = sanitized;
    } else {
      projectStore.projectId = DEFAULT_PROJECT_ID;
      projectStore.state = createInitialProjectState(DEFAULT_PROJECT_ID);
    }
  } catch (error) {
    console.warn("[Scheduly] Failed to load project store from storage", error);
    projectStore.projectId = DEFAULT_PROJECT_ID;
    projectStore.state = createInitialProjectState(DEFAULT_PROJECT_ID);
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
      shareTokens: normalizeShareTokens(options.shareTokens),
      createdAt: timestamp,
      updatedAt: timestamp,
      demoSeedOptOut
    },
    icsText: "",
    candidates: [],
    participants: [],
    responses: [],
    derived: createInitialDerivedState(),
    versions: createInitialVersions()
  };
};

const ensureProjectStateShape = (projectId, rawState) => {
  if (!rawState || typeof rawState !== "object") {
    return createInitialProjectState(projectId);
  }
  const nextState = { ...rawState };
  const project = rawState.project && typeof rawState.project === "object" ? { ...rawState.project } : {};
  project.id = isNonEmptyString(project.id) ? project.id : projectId;
  project.shareTokens = normalizeShareTokens(project.shareTokens);
  nextState.project = project;
  const baseDerived = rawState.derived && typeof rawState.derived === "object" ? rawState.derived : {};
  nextState.derived = {
    ...createInitialDerivedState(),
    ...baseDerived,
    tallies: cloneTallies(baseDerived.tallies)
  };
  nextState.versions = sanitizeVersions(rawState.versions);
  return nextState;
};

const notify = (projectId) => {
  const subs = listeners.get(projectId);
  if (!subs || subs.size === 0) return;
  const snapshot = getProjectStateSnapshot(projectId);
  subs.forEach((callback) => callback(snapshot));
};

/**
 * @param {ScheduleCandidate[]} candidates
 * @returns {ScheduleCandidate[]}
 */
const cloneCandidates = (candidates) => candidates.map((item) => ({ ...item }));

/**
 * @param {ProjectParticipant[]} participants
 * @returns {ProjectParticipant[]}
 */
const cloneParticipants = (participants) => participants.map((item) => ({ ...item }));

/**
 * @param {ProjectResponse[]} responses
 * @returns {ProjectResponse[]}
 */
const cloneResponses = (responses) => responses.map((item) => ({ ...item }));

loadFromStorage();

const ensureProjectEntry = () => {
  if (!projectStore.state) {
    projectStore.projectId = DEFAULT_PROJECT_ID;
    projectStore.state = createInitialProjectState(DEFAULT_PROJECT_ID);
    persistToStorage();
  }
  return projectStore.state;
};

const getProjectStateSnapshot = (projectId = DEFAULT_PROJECT_ID) => {
  const state = ensureProjectEntry();
  if (!projectId || projectId === projectStore.projectId) {
    return cloneState(state);
  }
  return cloneState(createInitialProjectState(projectId));
};

const isActiveProject = (projectId) => !projectId || projectId === projectStore.projectId;

const getStateForMutation = (projectId) => {
  if (isActiveProject(projectId)) {
    return ensureProjectEntry();
  }
  return ensureProjectStateShape(projectId, createInitialProjectState(projectId));
};

const getCandidates = (projectId = DEFAULT_PROJECT_ID) => {
  if (!isActiveProject(projectId)) {
    return [];
  }
  const state = ensureProjectEntry();
  return cloneCandidates(state.candidates || []);
};

const setProjectState = (projectId, nextState) => {
  const targetId = projectId || DEFAULT_PROJECT_ID;
  const sanitized = ensureProjectStateShape(targetId, nextState);
  projectStore.projectId = targetId;
  projectStore.state = sanitized;
  persistToStorage();
  notify(targetId);
};

const replaceCandidates = (projectId, nextCandidates, nextIcsText = null) => {
  const state = getStateForMutation(projectId);
  const candidatesArray = Array.isArray(nextCandidates) ? cloneCandidates(nextCandidates) : [];
  const nextState = {
    ...state,
    candidates: candidatesArray
  };
  if (typeof nextIcsText === "string") {
    nextState.icsText = nextIcsText;
  }
  const targetId = projectId || projectStore.projectId;
  setProjectState(targetId, nextState);
  return getProjectStateSnapshot(targetId);
};

const getIcsText = (projectId = DEFAULT_PROJECT_ID) => {
  if (!isActiveProject(projectId)) {
    return "";
  }
  const state = ensureProjectEntry();
  return state.icsText || "";
};

const getParticipants = (projectId = DEFAULT_PROJECT_ID) => {
  if (!isActiveProject(projectId)) {
    return [];
  }
  const state = ensureProjectEntry();
  return cloneParticipants(state.participants || []);
};

const getShareTokens = (projectId = DEFAULT_PROJECT_ID) => {
  if (!isActiveProject(projectId)) {
    return {};
  }
  const state = ensureProjectEntry();
  return cloneShareTokens(state.project?.shareTokens);
};

const findProjectByShareToken = (type, token) => {
  if (!isNonEmptyString(token)) return null;
  if (!SHARE_TOKEN_TYPES.includes(type)) return null;
  const state = ensureProjectEntry();
  const entry = state.project?.shareTokens?.[type];
  if (!entry || !isNonEmptyString(entry.token)) return null;
  if (entry.token !== token || isPlaceholderShareToken(entry.token)) {
    return null;
  }
  return {
    projectId: projectStore.projectId,
    token: entry.token,
    entry: { ...entry }
  };
};

const updateShareTokens = (projectId, updater) => {
  const state = getStateForMutation(projectId);
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
  const targetId = projectId || projectStore.projectId;
  setProjectState(targetId, nextState);
  return cloneShareTokens(nextTokens);
};

const replaceParticipants = (projectId, nextParticipants) => {
  const state = getStateForMutation(projectId);
  const participantsArray = Array.isArray(nextParticipants) ? cloneParticipants(nextParticipants) : [];
  const nextState = {
    ...state,
    participants: participantsArray
  };
  const targetId = projectId || projectStore.projectId;
  setProjectState(targetId, nextState);
  return getProjectStateSnapshot(targetId);
};

const upsertParticipant = (projectId, participant) => {
  if (!participant || !participant.id) throw new Error("participant must have id");
  const state = getStateForMutation(projectId);
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
  const targetId = projectId || projectStore.projectId;
  setProjectState(targetId, nextState);
  return { ...nextParticipant };
};

const removeParticipant = (projectId, participantId) => {
  const state = getStateForMutation(projectId);
  const nextParticipants = (state.participants || []).filter((item) => item && item.id !== participantId);
  const nextResponses = (state.responses || []).filter((item) => item && item.participantId !== participantId);
  const nextState = {
    ...state,
    participants: nextParticipants,
    responses: nextResponses
  };
  const targetId = projectId || projectStore.projectId;
  setProjectState(targetId, nextState);
  return getProjectStateSnapshot(targetId);
};

const findParticipantByToken = (token) => {
  if (!token) return null;
  const state = ensureProjectEntry();
  const participant = (state.participants || []).find((item) => item && item.token === token);
  if (!participant) return null;
  return { projectId: projectStore.projectId, participant: { ...participant } };
};

const getResponses = (projectId = DEFAULT_PROJECT_ID) => {
  if (!isActiveProject(projectId)) {
    return [];
  }
  const state = ensureProjectEntry();
  return cloneResponses(state.responses || []);
};

const getTallies = (projectId = DEFAULT_PROJECT_ID) => {
  if (!isActiveProject(projectId)) {
    return cloneTallies(createInitialDerivedState().tallies);
  }
  const state = ensureProjectEntry();
  const tallies = state.derived?.tallies ?? createInitialDerivedState().tallies;
  return cloneTallies(tallies);
};

const replaceResponses = (projectId, nextResponses) => {
  const state = getStateForMutation(projectId);
  const responsesArray = Array.isArray(nextResponses) ? cloneResponses(nextResponses) : [];
  const nextState = {
    ...state,
    responses: responsesArray
  };
  const targetId = projectId || projectStore.projectId;
  setProjectState(targetId, nextState);
  return getProjectStateSnapshot(targetId);
};

const upsertResponse = (projectId, response) => {
  if (!response || !response.id) throw new Error("response must have id");
  const state = getStateForMutation(projectId);
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
  const targetId = projectId || projectStore.projectId;
  setProjectState(targetId, nextState);
  return { ...nextResponse };
};

const replaceTallies = (projectId, nextTallies) => {
  const state = getStateForMutation(projectId);
  const tallies = cloneTallies(nextTallies);
  const nextState = {
    ...state,
    derived: {
      ...(state.derived || createInitialDerivedState()),
      tallies
    }
  };
  const targetId = projectId || projectStore.projectId;
  setProjectState(targetId, nextState);
  return cloneTallies(tallies);
};

const removeResponsesByCandidate = (projectId, candidateId) => {
  const state = getStateForMutation(projectId);
  const nextResponses = (state.responses || []).filter((item) => item && item.candidateId !== candidateId);
  const nextState = {
    ...state,
    responses: nextResponses
  };
  const targetId = projectId || projectStore.projectId;
  setProjectState(targetId, nextState);
  return getProjectStateSnapshot(targetId);
};

const updateProjectMeta = (projectId, changes) => {
  const state = getStateForMutation(projectId);
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
  const targetId = projectId || projectStore.projectId;
  setProjectState(targetId, nextState);
  return getProjectStateSnapshot(targetId);
};

const updateProjectVersions = (projectId, changes) => {
  const state = getStateForMutation(projectId);
  const nextVersions = sanitizeVersions({
    ...state.versions,
    ...(changes && typeof changes === "object" ? changes : {})
  });
  const current = state.versions || createInitialVersions();
  const isSame = Object.keys(nextVersions).every((key) => nextVersions[key] === current[key]);
  if (isSame) {
    return getProjectStateSnapshot(projectId);
  }
  const nextState = {
    ...state,
    versions: nextVersions
  };
  const targetId = projectId || projectStore.projectId;
  setProjectState(targetId, nextState);
  return getProjectStateSnapshot(targetId);
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
      updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : new Date().toISOString(),
      version: Number.isInteger(item.version) ? item.version : 1
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
      createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
      updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : new Date().toISOString(),
      version: Number.isInteger(item.version) ? item.version : 1
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
      nextProject.shareTokens = normalizeShareTokens(defaultProject.shareTokens);
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
  if (rawState?.versions && typeof rawState.versions === "object") {
    nextState.versions = sanitizeVersions(rawState.versions);
  }
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

const convertApiCandidates = (list) => {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const id = isNonEmptyString(item.candidateId) ? item.candidateId : null;
      if (!id) return null;
      return {
        id,
        uid: isNonEmptyString(item.uid) ? item.uid : "",
        summary: typeof item.summary === "string" ? item.summary : "",
        dtstart: typeof item.dtstart === "string" ? item.dtstart : "",
        dtend: typeof item.dtend === "string" ? item.dtend : "",
        tzid: typeof item.tzid === "string" && item.tzid ? item.tzid : DEFAULT_TZID,
        status: typeof item.status === "string" ? item.status : "TENTATIVE",
        location: typeof item.location === "string" ? item.location : "",
        description: typeof item.description === "string" ? item.description : "",
        sequence: Number.isInteger(item.sequence) ? item.sequence : 0,
        dtstamp: typeof item.dtstamp === "string" ? item.dtstamp : "",
        rawICalVevent: null,
        version: Number.isInteger(item.version) ? item.version : undefined,
        createdAt: typeof item.createdAt === "string" ? item.createdAt : undefined,
        updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : undefined
      };
    })
    .filter(Boolean);
};

const convertApiParticipants = (list) => {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const id = isNonEmptyString(item.participantId) ? item.participantId : null;
      if (!id) return null;
      return {
        id,
        token: isNonEmptyString(item.token) ? item.token : "",
        displayName: typeof item.displayName === "string" ? item.displayName : "",
        email: typeof item.email === "string" ? item.email : "",
        comment: typeof item.comment === "string" ? item.comment : "",
        status: typeof item.status === "string" ? item.status : "active",
        createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
        updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : new Date().toISOString()
      };
    })
    .filter(Boolean);
};

const convertApiResponses = (list) => {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const participantId = isNonEmptyString(item.participantId) ? item.participantId : null;
      const candidateId = isNonEmptyString(item.candidateId) ? item.candidateId : null;
      if (!participantId || !candidateId) return null;
      const responseId = isNonEmptyString(item.responseId) ? item.responseId : `${participantId}:${candidateId}`;
      return {
        id: responseId,
        participantId,
        candidateId,
        mark: typeof item.mark === "string" ? item.mark : "",
        comment: typeof item.comment === "string" ? item.comment : "",
        createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
        updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : new Date().toISOString(),
        version: Number.isInteger(item.version) ? item.version : 1
      };
    })
    .filter(Boolean);
};

const replaceStateFromApi = (projectId, snapshot) => {
  if (!snapshot || typeof snapshot !== "object") {
    return getProjectStateSnapshot(projectId);
  }

  const shareTokens = snapshot.shareTokens || {};
  const basePayload = {
    version: PROJECT_EXPORT_VERSION,
    state: {
      project: {
        id: snapshot.project?.projectId || projectId,
        name: typeof snapshot.project?.name === "string" ? snapshot.project.name : "",
        description: typeof snapshot.project?.description === "string" ? snapshot.project.description : "",
        defaultTzid:
          typeof snapshot.project?.defaultTzid === "string" && snapshot.project.defaultTzid
            ? snapshot.project.defaultTzid
            : DEFAULT_TZID,
        shareTokens: {
          admin: shareTokens.admin,
          participant: shareTokens.participant
        },
        createdAt: typeof snapshot.project?.createdAt === "string" ? snapshot.project.createdAt : undefined,
        updatedAt: typeof snapshot.project?.updatedAt === "string" ? snapshot.project.updatedAt : undefined
      },
      icsText: "",
      candidates: convertApiCandidates(snapshot.candidates),
      participants: convertApiParticipants(snapshot.participants),
      responses: convertApiResponses(snapshot.responses),
      versions: snapshot.versions
    }
  };

  return importProjectState(projectId, basePayload);
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
  updateProjectVersions,
  subscribeProjectState,
  getCandidates,
  replaceCandidates,
  getIcsText,
  getDefaultProjectId,
  getCurrentRouteContext,
  getShareTokens,
  findProjectByShareToken,
  updateShareTokens,
  updateProjectVersions,
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
  replaceStateFromApi,
  replaceTallies,
  setRouteContext
};
