const sharedIcalUtils = require("./ical-utils");
const scheduleService = require("../services/schedule-service");
const participantService = require("../services/participant-service");
const projectStore = require("../store/project-store");

const { waitForIcal, ensureICAL, getSampleIcsUrl, createLogger } = sharedIcalUtils;

const logDebug = createLogger("demo-data");

// Map VCALENDAR UID to a stable alias used in sample datasets.
const SAMPLE_CANDIDATE_ALIAS_BY_UID = {
  "igapyon-scheduly-5a2a47d2-56eb-4329-b3c2-92d9275480a2": "day1",
  "igapyon-scheduly-6b5cd8fe-0f61-43c1-9aa3-7b8f22d6a140": "day2",
  "igapyon-scheduly-44f4cf2e-c82e-4d6d-915b-676f2755c51a": "day3",
  "igapyon-scheduly-0c8b19f2-5aba-4e24-9f06-0f1aeb8a2afb": "day4"
};

const SAMPLE_PARTICIPANTS = [
  {
    id: "sato",
    displayName: "佐藤 太郎",
    email: "",
    comment: "在宅＋出社を組み合わせて参加予定",
    token: "demo-sato",
    createdAt: "2025-04-01T09:00:00+09:00",
    updatedAt: "2025-04-12T17:42:00+09:00"
  },
  {
    id: "suzuki",
    displayName: "鈴木 花子",
    email: "",
    comment: "子育てと両立中。夜間帯の参加可否を確認する必要あり",
    token: "demo-suzuki",
    createdAt: "2025-04-01T09:10:00+09:00",
    updatedAt: "2025-04-10T09:15:00+09:00"
  },
  {
    id: "tanaka",
    displayName: "田中 一郎",
    email: "",
    comment: "繁忙期のため夜間の予定が混み合っています",
    token: "demo-tanaka",
    createdAt: "2025-04-02T20:30:00+09:00",
    updatedAt: "2025-04-05T21:03:00+09:00"
  }
];

const SAMPLE_RESPONSES = [
  { participantId: "sato", candidateAlias: "day1", mark: "o", comment: "オフィス参加可" },
  { participantId: "sato", candidateAlias: "day2", mark: "d", comment: "オンラインなら参加可能" },
  { participantId: "sato", candidateAlias: "day3", mark: "o", comment: "" },
  { participantId: "sato", candidateAlias: "day4", mark: "o", comment: "終日参加可能" },

  { participantId: "suzuki", candidateAlias: "day1", mark: "d", comment: "子どものお迎えがあるため 16:30 まで" },
  { participantId: "suzuki", candidateAlias: "day2", mark: "x", comment: "開始時間を 19:00 にできれば参加可" },
  { participantId: "suzuki", candidateAlias: "day3", mark: "o", comment: "20:00 までなら参加可" },
  { participantId: "suzuki", candidateAlias: "day4", mark: "o", comment: "午前は在宅参加になります" },

  { participantId: "tanaka", candidateAlias: "day1", mark: "o", comment: "自家用車で参加予定" },
  { participantId: "tanaka", candidateAlias: "day2", mark: "x", comment: "平日は別件の会議があり難しい" },
  { participantId: "tanaka", candidateAlias: "day3", mark: "x", comment: "他プロジェクトとバッティング" },
  { participantId: "tanaka", candidateAlias: "day4", mark: "pending", comment: "未回答（フォロー待ち）" }
];

const inflight = new Map();

const buildAliasToCandidateMap = (projectId) => {
  const snapshot = projectStore.getProjectStateSnapshot(projectId);
  const aliasMap = new Map();
  (snapshot.candidates || []).forEach((candidate) => {
    if (!candidate || !candidate.uid) return;
    const alias = SAMPLE_CANDIDATE_ALIAS_BY_UID[candidate.uid];
    if (!alias) return;
    aliasMap.set(alias, candidate);
  });
  return aliasMap;
};

const seedParticipantsIfNeeded = (projectId) => {
  const existing = projectStore.getParticipants(projectId);
  if (existing && existing.length) return;
  SAMPLE_PARTICIPANTS.forEach((participant) => {
    projectStore.upsertParticipant(projectId, { ...participant });
  });
  logDebug("participants seeded", SAMPLE_PARTICIPANTS.length);
};

const seedResponsesIfNeeded = (projectId, aliasMap) => {
  const existing = projectStore.getResponses(projectId);
  if (existing && existing.length) return;
  const payload = [];
  SAMPLE_RESPONSES.forEach((item) => {
    const candidate = aliasMap.get(item.candidateAlias);
    if (!candidate) return;
    payload.push({
      id: `${item.participantId}::${candidate.id}`,
      participantId: item.participantId,
      candidateId: candidate.id,
      mark: item.mark,
      comment: item.comment,
      createdAt: candidate.dtstamp || new Date().toISOString(),
      updatedAt: candidate.dtstamp || new Date().toISOString()
    });
  });
  if (payload.length) {
    projectStore.replaceResponses(projectId, payload);
  }
  logDebug("responses seeded", payload.length);
};

const seedCandidatesIfNeeded = async (projectId) => {
  const snapshot = projectStore.getProjectStateSnapshot(projectId);
  if (snapshot.candidates && snapshot.candidates.length) return;

  await waitForIcal();
  const icsUrl = getSampleIcsUrl();
  logDebug("fetching ICS", icsUrl);
  const response = await fetch(icsUrl, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`Failed to fetch sample ICS: ${response.status}`);
  }
  const text = await response.text();
  const ICAL = ensureICAL();
  const parsed = ICAL.parse(text);
  const component = new ICAL.Component(parsed);
  const vevents = component.getAllSubcomponents("vevent") || [];
  const imported = [];
  for (let i = 0; i < vevents.length; i += 1) {
    const candidate = scheduleService.createCandidateFromVevent(vevents[i]);
    if (candidate) {
      imported.push(candidate);
    }
  }
  if (!imported.length) {
    throw new Error("No VEVENT entries found in sample ICS");
  }
  scheduleService.replaceCandidatesFromImport(projectId, imported, text);
  logDebug("candidates seeded", imported.length);
};

const ensureDemoProjectData = (projectId) => {
  if (inflight.has(projectId)) {
    return inflight.get(projectId);
  }

  const promise = (async () => {
    await seedCandidatesIfNeeded(projectId);
    const aliasMap = buildAliasToCandidateMap(projectId);
    seedParticipantsIfNeeded(projectId);
    seedResponsesIfNeeded(projectId, aliasMap);
  })()
    .catch((error) => {
      logDebug("demo data seeding failed", error);
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
  SAMPLE_PARTICIPANTS,
  SAMPLE_RESPONSES,
  SAMPLE_CANDIDATE_ALIAS_BY_UID
};
