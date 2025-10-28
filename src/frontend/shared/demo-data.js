// Copyright (c) Toshiki Iga. All Rights Reserved.

const sharedIcalUtils = require("./ical-utils");
const scheduleService = require("../services/schedule-service");
const participantService = require("../services/participant-service");
const responseService = require("../services/response-service");
const projectStore = require("../store/project-store");

const { waitForIcal, ensureICAL, getSampleIcsUrl, getSampleProjectJsonUrl, createLogger } = sharedIcalUtils;

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

const fetchSampleProjectPayload = async () => {
  const url = getSampleProjectJsonUrl();
  logDebug("fetching sample project JSON", { url });
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`Failed to fetch sample project JSON: ${response.status} ${response.statusText}`);
  }
  return response.json();
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

const inflight = new Map();

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

const ensureDemoProjectData = (projectId = projectStore.getDefaultProjectId()) => {
  if (inflight.has(projectId)) return inflight.get(projectId);

  const promise = (async () => {
    const snapshotBefore = projectStore.getProjectStateSnapshot(projectId);
    if (snapshotBefore?.project?.demoSeedOptOut) {
      logDebug("demo seed skipped: project opted out", { projectId });
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
  })()
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
