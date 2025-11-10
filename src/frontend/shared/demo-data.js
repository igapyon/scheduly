// Copyright (c) Toshiki Iga. All Rights Reserved.

const sharedIcalUtils = require("./ical-utils");
const scheduleService = require("../services/schedule-service");
const participantService = require("../services/participant-service");
const responseService = require("../services/response-service");
const projectStore = require("../store/project-store");
const runtimeConfig = require("./runtime-config");
const apiClient = require("../services/api-client");

const {
  waitForIcal,
  ensureICAL,
  getSampleIcsUrl,
  getSampleProjectJsonUrl,
  createLogger,
  DEFAULT_TZID
} = sharedIcalUtils;

const logDebug = createLogger("demo-data");

const SAMPLE_CANDIDATE_ALIAS_BY_UID = {
  "5o29ma9bmfqm1knaq17vsn0cb0@google.com": "slot_rehearsal_reading",
  "6ukce5fk013s99nju13d4ivtk4@google.com": "slot_rehearsal_nerimabunka",
  "32qsrebbrvdiafk7a91771hvg2@google.com": "slot_rehearsal_tokyobunka",
  "2dkvsni9j0bhvnvbpidadu0aov@google.com": "slot_rehearsal_geigeki",
  "54hr9aps2ei6mmfq4clelscf67@google.com": "slot_gp_morning",
  "5ps4k1vk0v6u5fqgp59gg4c44f@google.com": "slot_performance",
  "1u3jrtqfk20kule5nnknelrv2o@google.com": "slot_afterparty"
};

const SAMPLE_PARTICIPANTS = [
  {
    id: "10123751-d92f-4466-9030-d8ed8b8521e4",
    displayName: "Vn白髪",
    email: "",
    comment: "",
    token: "igywtsk3z71y",
    createdAt: "2025-10-27T23:07:20.424Z",
    updatedAt: "2025-10-27T23:07:20.424Z"
  },
  {
    id: "e060eeec-1a0a-42f9-9461-5b7880a470de",
    displayName: "Vnかはし",
    email: "",
    comment: "",
    token: "dxwsbv0wdsbm",
    createdAt: "2025-10-27T23:07:31.190Z",
    updatedAt: "2025-10-27T23:07:31.190Z"
  },
  {
    id: "c90014d8-fa53-467b-bbb2-541633cec134",
    displayName: "Vlaひげ",
    email: "",
    comment: "",
    token: "itgnq4a73goc",
    createdAt: "2025-10-27T23:07:42.143Z",
    updatedAt: "2025-10-27T23:07:42.143Z"
  },
  {
    id: "ee25f324-711a-43ed-953f-bb086a302d10",
    displayName: "Vcどら",
    email: "",
    comment: "",
    token: "dm1xc4vztbts",
    createdAt: "2025-10-27T23:07:59.407Z",
    updatedAt: "2025-10-27T23:07:59.407Z"
  }
];

const SAMPLE_RESPONSES = [
  { participantId: "10123751-d92f-4466-9030-d8ed8b8521e4", candidateAlias: "slot_rehearsal_reading", mark: "o", comment: "頑張って譜読みします。" },
  { participantId: "10123751-d92f-4466-9030-d8ed8b8521e4", candidateAlias: "slot_rehearsal_nerimabunka", mark: "o", comment: "練文の練習楽しみ" },
  { participantId: "10123751-d92f-4466-9030-d8ed8b8521e4", candidateAlias: "slot_rehearsal_tokyobunka", mark: "o", comment: "リニューアルの東京文化楽しみ" },
  { participantId: "10123751-d92f-4466-9030-d8ed8b8521e4", candidateAlias: "slot_rehearsal_geigeki", mark: "o", comment: "本番前日がんばるぞい。" },
  { participantId: "10123751-d92f-4466-9030-d8ed8b8521e4", candidateAlias: "slot_gp_morning", mark: "o", comment: "当日GPがんばるぞい。" },
  { participantId: "10123751-d92f-4466-9030-d8ed8b8521e4", candidateAlias: "slot_performance", mark: "o", comment: "本番！" },
  { participantId: "10123751-d92f-4466-9030-d8ed8b8521e4", candidateAlias: "slot_afterparty", mark: "o", comment: "のむどー" },
  { participantId: "e060eeec-1a0a-42f9-9461-5b7880a470de", candidateAlias: "slot_rehearsal_reading", mark: "o", comment: "" },
  { participantId: "e060eeec-1a0a-42f9-9461-5b7880a470de", candidateAlias: "slot_rehearsal_nerimabunka", mark: "d", comment: "この日の日程いま見え切っていません。" },
  { participantId: "e060eeec-1a0a-42f9-9461-5b7880a470de", candidateAlias: "slot_rehearsal_tokyobunka", mark: "x", comment: "この日都合悪いのです。" },
  { participantId: "e060eeec-1a0a-42f9-9461-5b7880a470de", candidateAlias: "slot_rehearsal_geigeki", mark: "o", comment: "" },
  { participantId: "e060eeec-1a0a-42f9-9461-5b7880a470de", candidateAlias: "slot_gp_morning", mark: "o", comment: "" },
  { participantId: "e060eeec-1a0a-42f9-9461-5b7880a470de", candidateAlias: "slot_performance", mark: "o", comment: "" },
  { participantId: "e060eeec-1a0a-42f9-9461-5b7880a470de", candidateAlias: "slot_afterparty", mark: "o", comment: "" },
  { participantId: "ee25f324-711a-43ed-953f-bb086a302d10", candidateAlias: "slot_rehearsal_reading", mark: "o", comment: "" },
  { participantId: "ee25f324-711a-43ed-953f-bb086a302d10", candidateAlias: "slot_rehearsal_nerimabunka", mark: "o", comment: "" },
  { participantId: "ee25f324-711a-43ed-953f-bb086a302d10", candidateAlias: "slot_rehearsal_tokyobunka", mark: "o", comment: "" },
  { participantId: "ee25f324-711a-43ed-953f-bb086a302d10", candidateAlias: "slot_rehearsal_geigeki", mark: "o", comment: "" },
  { participantId: "ee25f324-711a-43ed-953f-bb086a302d10", candidateAlias: "slot_gp_morning", mark: "o", comment: "" },
  { participantId: "ee25f324-711a-43ed-953f-bb086a302d10", candidateAlias: "slot_performance", mark: "o", comment: "" },
  { participantId: "ee25f324-711a-43ed-953f-bb086a302d10", candidateAlias: "slot_afterparty", mark: "x", comment: "打ち上げは欠席します。" },
  { participantId: "c90014d8-fa53-467b-bbb2-541633cec134", candidateAlias: "slot_rehearsal_reading", mark: "o", comment: "" },
  { participantId: "c90014d8-fa53-467b-bbb2-541633cec134", candidateAlias: "slot_rehearsal_nerimabunka", mark: "pending", comment: "予定が未定" },
  { participantId: "c90014d8-fa53-467b-bbb2-541633cec134", candidateAlias: "slot_rehearsal_tokyobunka", mark: "d", comment: "遅れて参加します。" },
  { participantId: "c90014d8-fa53-467b-bbb2-541633cec134", candidateAlias: "slot_rehearsal_geigeki", mark: "o", comment: "" },
  { participantId: "c90014d8-fa53-467b-bbb2-541633cec134", candidateAlias: "slot_gp_morning", mark: "o", comment: "" },
  { participantId: "c90014d8-fa53-467b-bbb2-541633cec134", candidateAlias: "slot_performance", mark: "o", comment: "" },
  { participantId: "c90014d8-fa53-467b-bbb2-541633cec134", candidateAlias: "slot_afterparty", mark: "o", comment: "" }
];

const pad = (value) => String(value).padStart(2, "0");

const INITIAL_VERSION_STATE = {
  metaVersion: 1,
  candidatesVersion: 0,
  candidatesListVersion: 0,
  participantsVersion: 0,
  responsesVersion: 0,
  shareTokensVersion: 1
};

const randomId = (prefix = "id") => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
};

const isApiDriverEnabled = () =>
  typeof runtimeConfig.isProjectDriverApi === "function" && runtimeConfig.isProjectDriverApi();

const hasProjectData = (snapshot) => {
  if (!snapshot || typeof snapshot !== "object") return false;
  return Boolean(
    (Array.isArray(snapshot.candidates) && snapshot.candidates.length) ||
      (Array.isArray(snapshot.participants) && snapshot.participants.length) ||
      (Array.isArray(snapshot.responses) && snapshot.responses.length)
  );
};

const fetchSampleProjectPayload = async () => {
  const url = getSampleProjectJsonUrl();
  logDebug("fetching sample project JSON", { url });
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`Failed to fetch sample project JSON: ${response.status} ${response.statusText}`);
  }
  return response.json();
};

const ensureIsoString = (value) => {
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
    return value.trim();
  }
  return new Date().toISOString();
};

const datetimeLocalPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const trailingSecondsPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z)?$/i;

const formatDateToLocalInput = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
};

const normalizeLocalDateTime = (value) => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (datetimeLocalPattern.test(trimmed)) {
      return trimmed;
    }
    if (trailingSecondsPattern.test(trimmed)) {
      const date = new Date(trimmed);
      if (!Number.isNaN(date.getTime())) {
        return formatDateToLocalInput(date);
      }
    }
  }
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return formatDateToLocalInput(date);
  }
  return "";
};

const normalizeShareTokenEntry = (entry, fallbackPrefix) => {
  const now = new Date().toISOString();
  if (!entry) {
    return {
      token: `${fallbackPrefix}_${Math.random().toString(36).slice(2, 10)}`,
      issuedAt: now
    };
  }
  if (typeof entry === "string") {
    const token = entry.trim();
    if (!token) {
      return {
        token: `${fallbackPrefix}_${Math.random().toString(36).slice(2, 10)}`,
        issuedAt: now
      };
    }
    return {
      token,
      issuedAt: now
    };
  }
  if (typeof entry === "object") {
    const token = typeof entry.token === "string" && entry.token.trim() ? entry.token.trim() : null;
    if (!token) {
      return normalizeShareTokenEntry(null, fallbackPrefix);
    }
    return {
      token,
      issuedAt: typeof entry.issuedAt === "string" ? entry.issuedAt : now,
      url: typeof entry.url === "string" ? entry.url : undefined,
      revokedAt: typeof entry.revokedAt === "string" ? entry.revokedAt : undefined,
      lastGeneratedBy: typeof entry.lastGeneratedBy === "string" ? entry.lastGeneratedBy : undefined
    };
  }
  return normalizeShareTokenEntry(null, fallbackPrefix);
};

const normalizeShareTokensForApi = (tokens = {}) => {
  return {
    admin: normalizeShareTokenEntry(tokens.admin, "scheduly-admin"),
    participant: normalizeShareTokenEntry(tokens.participant || tokens.guest, "scheduly-participant")
  };
};

const sanitizeVersions = (raw = {}) => {
  const next = { ...INITIAL_VERSION_STATE };
  Object.keys(next).forEach((key) => {
    const value = Number(raw[key]);
    if (Number.isInteger(value) && value >= 0) {
      next[key] = value;
    }
  });
  return next;
};

const normalizeResponseMark = (mark) => {
  const value = typeof mark === "string" ? mark.trim().toLowerCase() : "";
  if (value === "pending") return "d";
  if (value === "o" || value === "d" || value === "x") return value;
  return "d";
};

const ensureParticipantName = (name, takenSet, fallbackIndex) => {
  const base = typeof name === "string" && name.trim() ? name.trim() : `参加者${fallbackIndex + 1}`;
  let candidate = base;
  let suffix = 2;
  while (takenSet.has(candidate.toLowerCase())) {
    candidate = `${base} (${suffix})`;
    suffix += 1;
  }
  takenSet.add(candidate.toLowerCase());
  return candidate;
};

const convertLegacyExportToApiSnapshot = (payload = {}, projectId) => {
  const legacyState = payload.state || {};
  const legacyProject = legacyState.project || {};
  const resolvedProjectId =
    projectId || payload.projectId || legacyProject.id || projectStore.getDefaultProjectId();
  const now = new Date().toISOString();

  const apiCandidates = Array.isArray(legacyState.candidates)
    ? legacyState.candidates
        .map((item) => {
          if (!item) return null;
          const candidateId = item.id || randomId("cand");
          return {
            candidateId,
            summary: typeof item.summary === "string" ? item.summary : "",
            description: typeof item.description === "string" ? item.description : "",
            location: typeof item.location === "string" ? item.location : "",
            status:
              typeof item.status === "string" && item.status.trim()
                ? item.status.trim().toUpperCase()
                : "TENTATIVE",
            dtstart: normalizeLocalDateTime(item.dtstart),
            dtend: normalizeLocalDateTime(item.dtend),
            tzid: typeof item.tzid === "string" && item.tzid.trim() ? item.tzid : DEFAULT_TZID,
            uid: typeof item.uid === "string" ? item.uid : candidateId,
            sequence: Number.isInteger(item.sequence) ? item.sequence : 0,
            dtstamp: ensureIsoString(item.dtstamp || now),
            createdAt: ensureIsoString(item.createdAt || now),
            updatedAt: ensureIsoString(item.updatedAt || now),
            version: Number.isInteger(item.version) && item.version > 0 ? item.version : 1
          };
        })
        .filter(Boolean)
    : [];

  const participantNameSet = new Set();
  const apiParticipants = Array.isArray(legacyState.participants)
    ? legacyState.participants
        .map((item, index) => {
          if (!item) return null;
          const participantId = item.id || randomId("part");
          const displayName = ensureParticipantName(item.displayName, participantNameSet, index);
          return {
            participantId,
            displayName,
            email: typeof item.email === "string" ? item.email : "",
            comment: typeof item.comment === "string" ? item.comment : "",
            status: typeof item.status === "string" ? item.status : "active",
            token:
              typeof item.token === "string" && item.token.trim()
                ? item.token.trim()
                : randomId("token"),
            createdAt: ensureIsoString(item.createdAt || now),
            updatedAt: ensureIsoString(item.updatedAt || now),
            version: Number.isInteger(item.version) && item.version > 0 ? item.version : 1
          };
        })
        .filter(Boolean)
    : [];

  const participantIdSet = new Set(apiParticipants.map((p) => p.participantId));
  const candidateIdSet = new Set(apiCandidates.map((c) => c.candidateId));

  const apiResponses = Array.isArray(legacyState.responses)
    ? legacyState.responses
        .map((item) => {
          if (!item) return null;
          const participantId = item.participantId;
          const candidateId = item.candidateId;
          if (!participantIdSet.has(participantId) || !candidateIdSet.has(candidateId)) {
            return null;
          }
          return {
            responseId:
              (typeof item.id === "string" && item.id) || randomId("resp"),
            participantId,
            candidateId,
            mark: normalizeResponseMark(item.mark),
            comment: typeof item.comment === "string" ? item.comment : "",
            createdAt: ensureIsoString(item.createdAt || now),
            updatedAt: ensureIsoString(item.updatedAt || now),
            version: Number.isInteger(item.version) && item.version > 0 ? item.version : 1
          };
        })
        .filter(Boolean)
    : [];

  const versions = sanitizeVersions(legacyState.versions);

  return {
    project: {
      projectId: resolvedProjectId,
      name: typeof legacyProject.name === "string" ? legacyProject.name : "",
      description: typeof legacyProject.description === "string" ? legacyProject.description : "",
      defaultTzid:
        typeof legacyProject.defaultTzid === "string" && legacyProject.defaultTzid
          ? legacyProject.defaultTzid
          : DEFAULT_TZID,
      createdAt: ensureIsoString(legacyProject.createdAt || now),
      updatedAt: ensureIsoString(legacyProject.updatedAt || now)
    },
    candidates: apiCandidates,
    participants: apiParticipants,
    responses: apiResponses,
    shareTokens: normalizeShareTokensForApi(legacyProject.shareTokens),
    versions
  };
};

const fetchServerSnapshot = async (projectId) => {
  try {
    const snapshot = await apiClient.get(`/api/projects/${encodeURIComponent(projectId)}/snapshot`);
    return snapshot || null;
  } catch (error) {
    if (error && error.status === 404) {
      return null;
    }
    logDebug("failed to fetch project snapshot from API", { projectId, error });
    return null;
  }
};

const importSampleSnapshotViaApi = async (projectId, payload, versionHint) => {
  const body = {
    version: Number(versionHint) || Number(payload?.versions?.metaVersion) || 1,
    snapshot: payload
  };
  const response = await apiClient.post(
    `/api/projects/${encodeURIComponent(projectId)}/import/json`,
    body
  );
  return response && response.snapshot ? response.snapshot : payload;
};

const seedProjectFromJsonIfNeeded = async (projectId) => {
  const snapshot = projectStore.getProjectStateSnapshot(projectId);
  const hasData =
    (snapshot.candidates && snapshot.candidates.length) ||
    (snapshot.participants && snapshot.participants.length) ||
    (snapshot.responses && snapshot.responses.length);
  if (hasData) {
    logDebug("project already initialized, skipping JSON seed", { projectId });
    return snapshot;
  }

  const payload = await fetchSampleProjectPayload();
  projectStore.importProjectState(projectId, payload);
  const imported = projectStore.getProjectStateSnapshot(projectId);
  logDebug("imported sample project JSON", {
    projectId,
    candidateCount: imported.candidates?.length ?? 0,
    participantCount: imported.participants?.length ?? 0,
    responseCount: imported.responses?.length ?? 0
  });
  return imported;
};

const buildAliasMap = (projectId) => {
  const snapshot = projectStore.getProjectStateSnapshot(projectId);
  const aliasMap = new Map();
  (snapshot.candidates || []).forEach((candidate) => {
    if (!candidate || !candidate.uid) return;
    const alias = SAMPLE_CANDIDATE_ALIAS_BY_UID[candidate.uid];
    if (alias) aliasMap.set(alias, candidate);
  });
  return aliasMap;
};

const seedCandidatesIfNeeded = async (projectId) => {
  const snapshot = projectStore.getProjectStateSnapshot(projectId);
  if (snapshot.candidates && snapshot.candidates.length) {
    logDebug("candidates already seeded", projectId);
    return;
  }

  await waitForIcal();
  const icsUrl = getSampleIcsUrl();
  logDebug("fetching sample ICS", { projectId, icsUrl });
  const response = await fetch(icsUrl, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`Failed to fetch sample ICS: ${response.status}`);
  }
  const text = await response.text();
  const ICAL = ensureICAL();
  const parsed = ICAL.parse(text);
  const component = new ICAL.Component(parsed);
  const vevents = component.getAllSubcomponents("vevent") || [];
  if (!vevents.length) throw new Error("No VEVENT entries in sample ICS");

  const candidates = [];
  vevents.forEach((vevent) => {
    const candidate = scheduleService.createCandidateFromVevent(vevent);
    if (candidate) candidates.push(candidate);
  });
  if (!candidates.length) throw new Error("Failed to map VEVENT entries to candidates");

  scheduleService.replaceCandidatesFromImport(projectId, candidates, text);
  logDebug("seeded candidates", { projectId, count: candidates.length });
};

const seedParticipantsIfNeeded = (projectId) => {
  const existing = projectStore.getParticipants(projectId);
  if (existing && existing.length) {
    logDebug("participants already seeded", { projectId, count: existing.length });
    return existing;
  }
  const seeded = SAMPLE_PARTICIPANTS.map((participant) =>
    participantService.addParticipant(projectId, participant)
  );
  logDebug("seeded participants", { projectId, count: seeded.length });
  return seeded;
};

const seedResponsesIfNeeded = (projectId, aliasMap) => {
  const existing = projectStore.getResponses(projectId);
  if (existing && existing.length) {
    logDebug("responses already seeded", { projectId, count: existing.length });
    return existing;
  }
  const imported = [];
  SAMPLE_RESPONSES.forEach((item) => {
    const candidate = aliasMap.get(item.candidateAlias);
    if (!candidate) return;
    const response = responseService.upsertResponse(projectId, {
      participantId: item.participantId,
      candidateId: candidate.id,
      mark: item.mark,
      comment: item.comment || ""
    });
    imported.push(response);
  });
  logDebug("seeded responses", { projectId, count: imported.length });
  return imported;
};

const seedProjectFromLegacySamples = async (projectId) => {
  await seedCandidatesIfNeeded(projectId);
  const aliasMap = buildAliasMap(projectId);
  seedParticipantsIfNeeded(projectId);
  seedResponsesIfNeeded(projectId, aliasMap);
  return projectStore.getProjectStateSnapshot(projectId);
};

const ensureDemoProjectDataLocal = async (projectId) => {
  const snapshotBefore = projectStore.getProjectStateSnapshot(projectId);
  if (snapshotBefore?.project?.demoSeedOptOut) {
    logDebug("demo seed skipped: project opted out (local)", { projectId });
    return snapshotBefore;
  }
  try {
    return await seedProjectFromJsonIfNeeded(projectId);
  } catch (jsonError) {
    logDebug("failed to seed from sample project JSON, falling back to legacy seeds", {
      projectId,
      error: jsonError
    });
    await seedProjectFromLegacySamples(projectId);
    return projectStore.getProjectStateSnapshot(projectId);
  }
};

const ensureDemoProjectDataViaApi = async (projectId) => {
  const currentSnapshot = await fetchServerSnapshot(projectId);
  if (currentSnapshot?.project?.demoSeedOptOut) {
    projectStore.replaceStateFromApi(projectId, currentSnapshot);
    logDebug("demo seed skipped: project opted out (api)", { projectId });
    return projectStore.getProjectStateSnapshot(projectId);
  }
  if (hasProjectData(currentSnapshot)) {
    projectStore.replaceStateFromApi(projectId, currentSnapshot);
    logDebug("project already initialized on API, skipping demo seed", { projectId });
    return projectStore.getProjectStateSnapshot(projectId);
  }

  const payload = await fetchSampleProjectPayload();
  const snapshotPayload = convertLegacyExportToApiSnapshot(payload, projectId);
  const importedSnapshot = await importSampleSnapshotViaApi(
    projectId,
    snapshotPayload,
    snapshotPayload?.versions?.metaVersion
  );
  projectStore.replaceStateFromApi(projectId, importedSnapshot);
  logDebug("seeded demo project via API import", {
    projectId,
    candidateCount: importedSnapshot.candidates?.length ?? 0,
    participantCount: importedSnapshot.participants?.length ?? 0,
    responseCount: importedSnapshot.responses?.length ?? 0
  });
  return projectStore.getProjectStateSnapshot(projectId);
};

const inflight = new Map();

const ensureDemoProjectData = (projectId = projectStore.getDefaultProjectId()) => {
  if (inflight.has(projectId)) return inflight.get(projectId);

  const runner = isApiDriverEnabled()
    ? ensureDemoProjectDataViaApi(projectId)
    : ensureDemoProjectDataLocal(projectId);

  const promise = runner
    .catch((error) => {
      logDebug("failed to seed demo data", { projectId, error });
      throw error;
    })
    .finally(() => {
      inflight.delete(projectId);
    });

  inflight.set(projectId, promise);
  return promise;
};

module.exports = {
  ensureDemoProjectData,
  SAMPLE_CANDIDATE_ALIAS_BY_UID,
  SAMPLE_PARTICIPANTS,
  SAMPLE_RESPONSES
};
