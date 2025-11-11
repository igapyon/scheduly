const crypto = require("crypto");
const {
  NotFoundError,
  ValidationError,
  ConflictError
} = require("./errors");
const {
  candidateInputSchema,
  participantInputSchema,
  responseInputSchema,
  projectMetaSchema,
  collectZodIssueFields
} = require("../shared/schema");

/**
 * @typedef {import("../shared/types").ProjectSnapshot} ProjectSnapshot
 * @typedef {import("../shared/types").ScheduleCandidate} ScheduleCandidate
 * @typedef {import("../shared/types").Participant} ProjectParticipant
 * @typedef {import("../shared/types").ParticipantResponse} ProjectResponse
 * @typedef {import("../shared/types").ShareTokens} ShareTokens
 * @typedef {import("../shared/types").VersionState} VersionState
 */

const DEFAULT_TZID = "Asia/Tokyo";
const VALID_CANDIDATE_STATUS = new Set(["CONFIRMED", "TENTATIVE", "CANCELLED"]);
const PARTICIPANT_STATUS = new Set(["active", "archived"]);
const VALID_RESPONSE_MARKS = new Set(["o", "d", "x"]);
const SHARE_TOKEN_TYPES = ["admin", "participant"];
const SHARE_URL_PREFIX = {
  admin: "a",
  participant: "p"
};
const ICAL_HEADER_LINES = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Scheduly//Backend//JA",
  "CALSCALE:GREGORIAN",
  "METHOD:PUBLISH"
];

const pad = (value) => String(value).padStart(2, "0");

const formatUtcForICal = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  const hour = pad(date.getUTCHours());
  const minute = pad(date.getUTCMinutes());
  const second = pad(date.getUTCSeconds());
  return `${year}${month}${day}T${hour}${minute}${second}Z`;
};

const escapeIcalText = (value) => {
  if (value === undefined || value === null) return "";
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
};

const TZID_PATTERN = /^[A-Za-z0-9_\-]+\/[A-Za-z0-9_\-]+$/;
const CUSTOM_TZID_PATTERN = /^X-SCHEDULY-[A-Z0-9_\-]+$/i;

const PLACEHOLDER_PREFIX = "demo-";

const generateId = (prefix) => {
  const random =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : crypto.randomBytes(16).toString("hex");
  return prefix ? `${prefix}_${random}` : random;
};

const isPlaceholderToken = (token) => typeof token === "string" && token.startsWith(PLACEHOLDER_PREFIX);

const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;

const sanitizeString = (input, { fallback = "" } = {}) => {
  if (typeof input !== "string") return fallback;
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

const trimTrailingSlash = (value) => {
  if (typeof value !== "string" || !value) return "";
  return value.replace(/\/+$/, "");
};

const SHARE_BASE_URL = trimTrailingSlash(
  process.env.SCHEDULY_SHARE_BASE_URL || process.env.BASE_URL || ""
);

const buildShareUrl = (type, token, baseUrl = SHARE_BASE_URL) => {
  if (!token) return "";
  const prefix = SHARE_URL_PREFIX[type];
  if (!prefix) return "";
  if (!baseUrl) return "";
  const normalizedBase = trimTrailingSlash(baseUrl) || "";
  if (!normalizedBase) return "";
  return `${normalizedBase}/${prefix}/${token}`;
};

const parseWithValidationError = (schema, payload, message) => {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new ValidationError(message, collectZodIssueFields(result.error.errors));
  }
  return result.data;
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
  const base = createInitialVersions();
  if (!raw || typeof raw !== "object") {
    return base;
  }
  Object.keys(base).forEach((key) => {
    const value = raw[key];
    if (Number.isInteger(value) && value >= 0) {
      base[key] = value;
    }
  });
  return base;
};

const isValidDateTime = (value) => {
  if (typeof value !== "string" || !value.trim()) return false;
  const parsed = Date.parse(value);
  return !Number.isNaN(parsed);
};

const sanitizeMetaInput = (meta = {}) => {
  if (!meta || typeof meta !== "object") {
    throw new ValidationError("meta is required", ["meta"]);
  }
  const parsed = parseWithValidationError(
    projectMetaSchema,
    {
      name: meta.name ?? "",
      description: meta.description ?? "",
      defaultTzid: meta.defaultTzid ?? DEFAULT_TZID
    },
    "Project meta validation failed"
  );
  return parsed;
};

const sanitizeShareTokenEntry = (raw, type, baseUrl = SHARE_BASE_URL) => {
  if (!raw || typeof raw !== "object") return null;
  const token = sanitizeString(raw.token);
  if (!token) return null;
  const entry = {
    token,
    url: sanitizeString(raw.url),
    issuedAt: sanitizeString(raw.issuedAt)
  };
  const revokedAt = sanitizeString(raw.revokedAt);
  if (revokedAt) entry.revokedAt = revokedAt;
  const lastGeneratedBy = sanitizeString(raw.lastGeneratedBy);
  if (lastGeneratedBy) entry.lastGeneratedBy = lastGeneratedBy;
  if (isNonEmptyString(baseUrl) && !isNonEmptyString(entry.url)) {
    entry.url = buildShareUrl(type, token, baseUrl);
  }
  if (!entry.issuedAt) {
    entry.issuedAt = new Date().toISOString();
  }
  return entry;
};

const sanitizeShareTokens = (rawTokens, baseUrl = SHARE_BASE_URL) => {
  const next = {};
  if (rawTokens && typeof rawTokens === "object") {
    SHARE_TOKEN_TYPES.forEach((type) => {
      const entry = sanitizeShareTokenEntry(rawTokens[type], type, baseUrl);
      if (entry) {
        next[type] = entry;
      }
    });
  }
  if (!next.admin) {
    next.admin = createShareTokenEntry("admin", baseUrl);
  }
  if (!next.participant) {
    next.participant = createShareTokenEntry("participant", baseUrl);
  }
  return next;
};

const sanitizeCandidateInput = (input = {}, { allowPartial = false } = {}) => {
  if (!input || typeof input !== "object") {
    throw new ValidationError("candidate payload is required", ["candidate"]);
  }
  const parsed = parseWithValidationError(
    candidateInputSchema,
    {
      summary: input.summary ?? "",
      dtstart: input.dtstart ?? "",
      dtend: input.dtend ?? "",
      tzid: input.tzid ?? DEFAULT_TZID,
      status: input.status ?? "TENTATIVE",
      location: input.location ?? "",
      description: input.description ?? ""
    },
    "Candidate validation failed"
  );
  if (!allowPartial) {
    const missing = [];
    if (!parsed.dtstart) missing.push("dtstart");
    if (!parsed.dtend) missing.push("dtend");
    if (missing.length) {
      throw new ValidationError("Candidate datetime is required", missing);
    }
    if (parsed.dtstart && parsed.dtend && Date.parse(parsed.dtend) <= Date.parse(parsed.dtstart)) {
      throw new ValidationError("Candidate dtend must be after dtstart", ["dtstart", "dtend"]);
    }
  }
  if (
    parsed.tzid &&
    !TZID_PATTERN.test(parsed.tzid) &&
    !CUSTOM_TZID_PATTERN.test(parsed.tzid)
  ) {
    throw new ValidationError("Candidate validation failed", ["tzid"]);
  }
  return {
    summary: parsed.summary,
    description: parsed.description,
    location: parsed.location,
    status: parsed.status || "TENTATIVE",
    tzid: parsed.tzid || DEFAULT_TZID,
    dtstart: parsed.dtstart,
    dtend: parsed.dtend
  };
};

const sanitizeParticipantInput = (
  input = {},
  { allowPartial = false, participants = [], currentId = null } = {}
) => {
  if (!input || typeof input !== "object") {
    throw new ValidationError("participant payload is required", ["participant"]);
  }
  const parsed = parseWithValidationError(
    participantInputSchema,
    {
      displayName: input.displayName ?? "",
      email: input.email ?? "",
      comment: input.comment ?? ""
    },
    "Participant validation failed"
  );
  if (!allowPartial && !parsed.displayName) {
    throw new ValidationError("displayName is required", ["displayName"]);
  }
  if (parsed.displayName && participants.length) {
    const normalized = parsed.displayName.toLowerCase();
    const conflict = participants.some(
      (entry) =>
        entry &&
        entry.participantId !== currentId &&
        typeof entry.displayName === "string" &&
        entry.displayName.toLowerCase() === normalized
    );
    if (conflict) {
      throw new ValidationError("Participant displayName must be unique", ["displayName"]);
    }
  }
  const result = {
    displayName: parsed.displayName,
    email: parsed.email || "",
    comment: parsed.comment || ""
  };
  if (!allowPartial) {
    result.status = sanitizeString(input.status, { fallback: "active" }).toLowerCase();
    if (!PARTICIPANT_STATUS.has(result.status)) {
      result.status = "active";
    }
  } else if (input.status) {
    const statusValue = sanitizeString(input.status).toLowerCase();
    if (PARTICIPANT_STATUS.has(statusValue)) {
      result.status = statusValue;
    }
  }
  if (!result.status) {
    result.status = "active";
  }
  return result;
};

const sanitizeResponseInput = (input = {}) => {
  if (!input || typeof input !== "object") {
    throw new ValidationError("response payload is required", ["response"]);
  }
  const parsed = parseWithValidationError(
    responseInputSchema,
    {
      participantId: input.participantId ?? "",
      candidateId: input.candidateId ?? "",
      mark: input.mark ?? "",
      comment: input.comment ?? ""
    },
    "Response validation failed"
  );
  return parsed;
};

const createShareTokenEntry = (type, baseUrl = SHARE_BASE_URL) => {
  const issuedAt = new Date().toISOString();
  const token = generateId(`scheduly-${type}`);
  return {
    token,
    url: baseUrl ? buildShareUrl(type, token, baseUrl) : "",
    issuedAt
  };
};

const createPlaceholderShareTokenEntry = (type, projectId) => ({
  token: `${PLACEHOLDER_PREFIX}${type}-${projectId}`,
  url: "",
  issuedAt: ""
});

const createInitialProjectState = (projectId, metaInput = {}) => {
  const timestamp = new Date().toISOString();
  const meta = {
    projectId,
    name: sanitizeString(metaInput.name),
    description: sanitizeString(metaInput.description),
    defaultTzid: sanitizeString(metaInput.defaultTzid, { fallback: DEFAULT_TZID }),
    createdAt: timestamp,
    updatedAt: timestamp
  };
  const shareTokens = {
    admin: createPlaceholderShareTokenEntry("admin", projectId),
    participant: createPlaceholderShareTokenEntry("participant", projectId)
  };
  return {
    project: meta,
    candidates: [],
    participants: [],
    responses: [],
    shareTokens,
    versions: {
      metaVersion: 1,
      candidatesVersion: 0,
      candidatesListVersion: 0,
      participantsVersion: 0,
      responsesVersion: 0,
      shareTokensVersion: 1
    }
  };
};

const clone = (value) => JSON.parse(JSON.stringify(value));

const createEmptyTally = () => ({
  o: 0,
  d: 0,
  x: 0,
  total: 0
});

const tallyMark = (tally, mark) => {
  if (!VALID_RESPONSE_MARKS.has(mark)) return;
  tally[mark] += 1;
  tally.total += 1;
};

const cloneTally = (tally) => {
  if (!tally) {
    return createEmptyTally();
  }
  return {
    o: tally.o || 0,
    d: tally.d || 0,
    x: tally.x || 0,
    total: tally.total || 0
  };
};

const computeCandidateTallyFor = (responses, candidateId) => {
  const tally = createEmptyTally();
  responses.forEach((item) => {
    if (item && item.candidateId === candidateId) {
      tallyMark(tally, item.mark);
    }
  });
  return cloneTally(tally);
};

const computeParticipantTallyFor = (responses, participantId) => {
  const tally = createEmptyTally();
  responses.forEach((item) => {
    if (item && item.participantId === participantId) {
      tallyMark(tally, item.mark);
    }
  });
  return cloneTally(tally);
};

const computeResponsesSummary = (state) => {
  const candidateMap = new Map();
  const participantMap = new Map();

  state.candidates.forEach((candidate) => {
    if (!candidate) return;
    candidateMap.set(candidate.candidateId, createEmptyTally());
  });
  state.participants.forEach((participant) => {
    if (!participant) return;
    participantMap.set(participant.participantId, createEmptyTally());
  });

  state.responses.forEach((response) => {
    if (!response) return;
    const candidateTally = candidateMap.get(response.candidateId) || createEmptyTally();
    tallyMark(candidateTally, response.mark);
    candidateMap.set(response.candidateId, candidateTally);

    const participantTally = participantMap.get(response.participantId) || createEmptyTally();
    tallyMark(participantTally, response.mark);
    participantMap.set(response.participantId, participantTally);
  });

  return {
    candidates: state.candidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      tally: cloneTally(candidateMap.get(candidate.candidateId))
    })),
    participants: state.participants.map((participant) => ({
      participantId: participant.participantId,
      tallies: cloneTally(participantMap.get(participant.participantId))
    }))
  };
};

const buildIcsFromState = (state) => {
  const lines = ICAL_HEADER_LINES.slice();
  const dtstamp = formatUtcForICal(new Date().toISOString());

  state.candidates.forEach((candidate) => {
    const dtstart = formatUtcForICal(candidate.dtstart);
    const dtend = formatUtcForICal(candidate.dtend);
    const status = (candidate.status || "CONFIRMED").toUpperCase();
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${candidate.uid || candidate.candidateId}`);
    lines.push(`SEQUENCE:${Number.isInteger(candidate.sequence) ? candidate.sequence : 0}`);
    if (dtstamp) lines.push(`DTSTAMP:${dtstamp}`);
    if (dtstart) lines.push(`DTSTART:${dtstart}`);
    if (dtend) lines.push(`DTEND:${dtend}`);
    lines.push(`STATUS:${status}`);
    lines.push(`SUMMARY:${escapeIcalText(candidate.summary || "")}`);
    lines.push(`LOCATION:${escapeIcalText(candidate.location || "")}`);
    lines.push(`DESCRIPTION:${escapeIcalText(candidate.description || "")}`);
    const tzid = candidate.tzid || DEFAULT_TZID;
    if (tzid) {
      lines.push(`X-SCHEDULY-TZID:${escapeIcalText(tzid)}`);
    }
    lines.push("END:VEVENT");
  });

  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
};

class InMemoryProjectStore {
  constructor() {
    this.projects = new Map();
    this.shareTokenIndex = {
      admin: new Map(),
      participant: new Map()
    };
  }

  createProject(metaInput = {}) {
    const sanitizedMeta = sanitizeMetaInput(metaInput);
    const projectId = generateId("proj");
    const state = createInitialProjectState(projectId, sanitizedMeta);
    this.projects.set(projectId, state);
    this.#indexShareTokens(projectId, state.shareTokens);
    return this.#serializeProject(projectId);
  }

  getSnapshot(projectId) {
    let state = this.projects.get(projectId);
    if (!state) {
      state = createInitialProjectState(projectId, {});
      this.projects.set(projectId, state);
      this.#indexShareTokens(projectId, state.shareTokens);
      return this.#serializeProject(projectId);
    }
    return this.#serializeProject(projectId);
  }

  updateMeta(projectId, payload = {}) {
    const state = this.#requireProject(projectId);
    if (!payload || typeof payload !== "object") {
      throw new ValidationError("meta payload is required", ["meta"]);
    }
    const expectedVersion = Number(payload.version);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      throw new ValidationError("version must be a positive integer", ["version"]);
    }
    if (expectedVersion !== state.versions.metaVersion) {
      throw new ConflictError("Meta version mismatch", {
        entity: "meta",
        reason: "version_mismatch",
        latest: {
          meta: clone(state.project),
          version: state.versions.metaVersion
        }
      });
    }
    const metaInput = sanitizeMetaInput(payload.meta);
    const now = new Date().toISOString();
    state.project = {
      ...state.project,
      ...metaInput,
      updatedAt: now
    };
    state.versions.metaVersion += 1;
    return {
      meta: clone(state.project),
      version: state.versions.metaVersion
    };
  }

  createCandidate(projectId, candidateInput = {}) {
    const state = this.#requireProject(projectId);
    const sanitized = sanitizeCandidateInput(candidateInput);
    const candidateId = sanitizeString(candidateInput.candidateId) || generateId("cand");
    const now = new Date().toISOString();

    const candidate = {
      candidateId,
      summary: sanitized.summary,
      description: sanitized.description,
      location: sanitized.location,
      status: sanitized.status,
      dtstart: sanitized.dtstart,
      dtend: sanitized.dtend,
      tzid: sanitized.tzid,
      createdAt: now,
      updatedAt: now,
      version: 1
    };

    const existingIndex = state.candidates.findIndex((item) => item.candidateId === candidateId);
    if (existingIndex >= 0) {
      throw new ConflictError("Candidate ID already exists", {
        entity: "candidate",
        reason: "version_mismatch",
        latest: clone(state.candidates[existingIndex])
      });
    }

    state.candidates.push(candidate);
    state.versions.candidatesVersion += 1;
    state.versions.candidatesListVersion += 1;
    return {
      candidate: clone(candidate)
    };
  }

  updateCandidate(projectId, candidateId, payload = {}) {
    const state = this.#requireProject(projectId);
    const index = this.#findCandidateIndex(state, candidateId);
    const candidate = state.candidates[index];

    if (!payload || typeof payload !== "object") {
      throw new ValidationError("candidate payload is required", ["candidate"]);
    }

    const expectedVersion = Number(payload.version);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      throw new ValidationError("version must be a positive integer", ["version"]);
    }
    if (expectedVersion !== candidate.version) {
      throw new ConflictError("Candidate version mismatch", {
        entity: "candidate",
        reason: "version_mismatch",
        latest: clone(candidate)
      });
    }

    const sanitized = sanitizeCandidateInput(payload.candidate || payload);
    const now = new Date().toISOString();
    const nextCandidate = {
      ...candidate,
      ...sanitized,
      updatedAt: now,
      version: candidate.version + 1
    };
    state.candidates[index] = nextCandidate;
    state.versions.candidatesVersion += 1;
    return {
      candidate: clone(nextCandidate)
    };
  }

  removeCandidate(projectId, candidateId, payload = {}) {
    const state = this.#requireProject(projectId);
    const index = this.#findCandidateIndex(state, candidateId);
    const candidate = state.candidates[index];
    const expectedVersion = Number(payload?.version);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      throw new ValidationError("version must be a positive integer", ["version"]);
    }
    if (expectedVersion !== candidate.version) {
      throw new ConflictError("Candidate version mismatch", {
        entity: "candidate",
        reason: "version_mismatch",
        latest: clone(candidate)
      });
    }
    state.candidates.splice(index, 1);
    state.responses = state.responses.filter((item) => item.candidateId !== candidateId);
    state.versions.candidatesVersion += 1;
    state.versions.candidatesListVersion += 1;
    state.versions.responsesVersion += 1;
  }

  reorderCandidates(projectId, ids, expectedVersion) {
    const state = this.#requireProject(projectId);
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new ValidationError("order must be a non-empty array", ["order"]);
    }
    const versionNumber = Number(expectedVersion);
    if (!Number.isInteger(versionNumber) || versionNumber < 0) {
      throw new ValidationError("version must be a non-negative integer", ["version"]);
    }
    if (versionNumber !== state.versions.candidatesListVersion) {
      throw new ConflictError("Candidate list version mismatch", {
        entity: "candidate_list",
        reason: "version_mismatch",
        latest: {
          order: state.candidates.map((item) => item.candidateId),
          version: state.versions.candidatesListVersion
        }
      });
    }

    const currentIds = new Set(state.candidates.map((item) => item.candidateId));
    if (ids.length !== currentIds.size) {
      throw new ConflictError("Candidate list does not match", {
        entity: "candidate_list",
        reason: "list_mismatch",
        latest: {
          order: state.candidates.map((item) => item.candidateId),
          version: state.versions.candidatesListVersion
        }
      });
    }
    for (const id of ids) {
      if (!currentIds.has(id)) {
        throw new ConflictError("Candidate list does not match", {
          entity: "candidate_list",
          reason: "list_mismatch",
          latest: {
            order: state.candidates.map((item) => item.candidateId),
            version: state.versions.candidatesListVersion
          }
        });
      }
    }

    const lookup = new Map(state.candidates.map((item) => [item.candidateId, item]));
    state.candidates = ids.map((id) => lookup.get(id));
    state.versions.candidatesListVersion += 1;
    return {
      candidates: clone(state.candidates),
      version: state.versions.candidatesListVersion
    };
  }

  createParticipant(projectId, participantInput = {}) {
    const state = this.#requireProject(projectId);
    const sanitized = sanitizeParticipantInput(participantInput, {
      participants: state.participants
    });
    const participantId = sanitizeString(participantInput.participantId) || generateId("part");
    const now = new Date().toISOString();
    const duplicateId = state.participants.find((item) => item.participantId === participantId);
    if (duplicateId) {
      throw new ConflictError("Participant ID already exists", {
        entity: "participant",
        reason: "version_mismatch",
        latest: clone(duplicateId)
      });
    }
    const participant = {
      participantId,
      displayName: sanitized.displayName,
      email: sanitized.email || "",
      status: sanitized.status || "active",
      createdAt: now,
      updatedAt: now,
      version: 1
    };
    state.participants.push(participant);
    state.versions.participantsVersion += 1;
    return {
      participant: clone(participant),
      version: state.versions.participantsVersion
    };
  }

  updateParticipant(projectId, participantId, payload = {}) {
    const state = this.#requireProject(projectId);
    const index = this.#findParticipantIndex(state, participantId);
    const participant = state.participants[index];

    if (!payload || typeof payload !== "object") {
      throw new ValidationError("participant payload is required", ["participant"]);
    }

    const expectedVersion = Number(payload.version);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      throw new ValidationError("version must be a positive integer", ["version"]);
    }
    if (expectedVersion !== participant.version) {
      throw new ConflictError("Participant version mismatch", {
        entity: "participant",
        reason: "version_mismatch",
        latest: clone(participant)
      });
    }

    const sanitized = sanitizeParticipantInput(payload.participant || payload, {
      allowPartial: true,
      participants: state.participants,
      currentId: participant.participantId
    });
    const now = new Date().toISOString();
    const nextParticipant = {
      ...participant,
      ...(Object.prototype.hasOwnProperty.call(sanitized, "displayName")
        ? { displayName: sanitized.displayName }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(sanitized, "email")
        ? { email: sanitized.email || "" }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(sanitized, "status")
        ? { status: sanitized.status || "active" }
        : {}),
      updatedAt: now,
      version: participant.version + 1
    };
    state.participants[index] = nextParticipant;
    state.versions.participantsVersion += 1;
    return {
      participant: clone(nextParticipant),
      version: state.versions.participantsVersion
    };
  }

  removeParticipant(projectId, participantId, payload = {}) {
    const state = this.#requireProject(projectId);
    const index = this.#findParticipantIndex(state, participantId);
    const participant = state.participants[index];
    const expectedVersion = Number(payload?.version);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      throw new ValidationError("version must be a positive integer", ["version"]);
    }
    if (expectedVersion !== participant.version) {
      throw new ConflictError("Participant version mismatch", {
        entity: "participant",
        reason: "version_mismatch",
        latest: clone(participant)
      });
    }
    state.participants.splice(index, 1);
    state.versions.participantsVersion += 1;

    const beforeResponses = state.responses.length;
    state.responses = state.responses.filter((item) => item.participantId !== participant.participantId);
    if (state.responses.length !== beforeResponses) {
      state.versions.responsesVersion += 1;
    }
    return {
      version: state.versions.participantsVersion
    };
  }

  getParticipantResponses(projectId, participantId) {
    const state = this.#requireProject(projectId);
    const index = this.#findParticipantIndex(state, participantId);
    const participant = state.participants[index];
    const candidateLookup = new Map(state.candidates.map((item) => [item.candidateId, item]));

    const responses = state.responses
      .filter((item) => item.participantId === participant.participantId)
      .map((item) => {
        const candidate = candidateLookup.get(item.candidateId);
        return {
          response: clone(item),
          candidate: candidate
            ? {
                candidateId: candidate.candidateId,
                summary: candidate.summary,
                dtstart: candidate.dtstart,
                dtend: candidate.dtend,
                tzid: candidate.tzid,
                status: candidate.status,
                location: candidate.location,
                description: candidate.description
              }
            : null
        };
      });
    const tallies = computeParticipantTallyFor(state.responses, participant.participantId);
    return {
      participant: clone(participant),
      responses,
      tallies
    };
  }

  upsertResponse(projectId, payload = {}) {
    const state = this.#requireProject(projectId);
    const body = payload.response || payload;
    const sanitized = sanitizeResponseInput(body);
    this.#findParticipantIndex(state, sanitized.participantId);
    this.#findCandidateIndex(state, sanitized.candidateId);

    const existingIndex = state.responses.findIndex(
      (item) =>
        item.participantId === sanitized.participantId && item.candidateId === sanitized.candidateId
    );
    const now = new Date().toISOString();
    let created = false;
    let responseRecord;

    if (existingIndex >= 0) {
      const existing = state.responses[existingIndex];
      const expectedVersion = Number(payload.version);
      if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
        throw new ValidationError("version must be a positive integer", ["version"]);
      }
      if (expectedVersion !== existing.version) {
        throw new ConflictError("Response version mismatch", {
          entity: "response",
          reason: "version_mismatch",
          latest: clone(existing)
        });
      }
      responseRecord = {
        ...existing,
        mark: sanitized.mark,
        comment: sanitized.comment,
        updatedAt: now,
        version: existing.version + 1
      };
      state.responses[existingIndex] = responseRecord;
    } else {
      created = true;
      responseRecord = {
        responseId: generateId("resp"),
        participantId: sanitized.participantId,
        candidateId: sanitized.candidateId,
        mark: sanitized.mark,
        comment: sanitized.comment,
        createdAt: now,
        updatedAt: now,
        version: 1
      };
      state.responses.push(responseRecord);
    }
    state.versions.responsesVersion += 1;

    const candidateTally = computeCandidateTallyFor(state.responses, sanitized.candidateId);
    const participantTally = computeParticipantTallyFor(state.responses, sanitized.participantId);

    return {
      response: clone(responseRecord),
      created,
      candidateTally,
      participantTally,
      version: state.versions.responsesVersion
    };
  }

  removeResponse(projectId, payload = {}) {
    const state = this.#requireProject(projectId);
    const body = payload.response || payload;
    const participantId = sanitizeString(body?.participantId);
    const candidateId = sanitizeString(body?.candidateId);
    if (!participantId || !candidateId) {
      throw new ValidationError("participantId and candidateId are required", [
        "participantId",
        "candidateId"
      ]);
    }
    const index = state.responses.findIndex(
      (item) => item.participantId === participantId && item.candidateId === candidateId
    );
    if (index === -1) {
      throw new NotFoundError("Response not found");
    }
    const record = state.responses[index];
    const expectedVersion = Number(body?.version);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      throw new ValidationError("version must be a positive integer", ["version"]);
    }
    if (expectedVersion !== record.version) {
      throw new ConflictError("Response version mismatch", {
        entity: "response",
        reason: "version_mismatch",
        latest: clone(record)
      });
    }
    state.responses.splice(index, 1);
    state.versions.responsesVersion += 1;
    return {
      version: state.versions.responsesVersion
    };
  }

  getResponsesSummary(projectId) {
    const state = this.#requireProject(projectId);
    return computeResponsesSummary(state);
  }

  exportProjectSnapshot(projectId) {
    return this.#serializeProject(projectId);
  }

  exportProjectIcs(projectId) {
    const state = this.#requireProject(projectId);
    return buildIcsFromState(state);
  }

  importProjectSnapshot(projectId, payload = {}) {
    const body = payload.snapshot || payload;
    if (!body || typeof body !== "object") {
      throw new ValidationError("snapshot is required", ["snapshot"]);
    }
    const expectedVersion = Number(payload.version ?? body.version ?? 1);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      throw new ValidationError("version must be a positive integer", ["version"]);
    }
    let state;
    try {
      state = this.#requireProject(projectId);
    } catch (error) {
      if (error instanceof NotFoundError) {
        state = createInitialProjectState(projectId, {});
        this.projects.set(projectId, state);
      } else {
        throw error;
      }
    }

    if (expectedVersion !== state.versions.metaVersion) {
      throw new ConflictError("Project version mismatch", {
        entity: "project",
        reason: "version_mismatch",
        latest: {
          snapshot: this.#serializeProject(projectId),
          version: state.versions.metaVersion
        }
      });
    }

    const metaInput = sanitizeMetaInput(body.project || {});
    const versions = sanitizeVersions(body.versions);

    const candidates = Array.isArray(body.candidates)
      ? body.candidates.map((item) => {
          try {
            const candidateId = sanitizeString(item.candidateId) || generateId("cand");
            const sanitized = sanitizeCandidateInput(item);
            return {
              candidateId,
              summary: sanitized.summary,
              description: sanitized.description,
              location: sanitized.location,
              status: sanitized.status,
              dtstart: sanitized.dtstart,
              dtend: sanitized.dtend,
              tzid: sanitized.tzid,
              uid: sanitizeString(item.uid, { fallback: candidateId }),
              sequence: Number.isInteger(item.sequence) ? item.sequence : 0,
              dtstamp: sanitizeString(item.dtstamp) || new Date().toISOString(),
              createdAt: sanitizeString(item.createdAt) || new Date().toISOString(),
              updatedAt: sanitizeString(item.updatedAt) || new Date().toISOString(),
              version: Number.isInteger(item.version) && item.version > 0 ? item.version : 1
            };
          } catch (error) {
            console.warn("[Scheduly][server] Failed to import candidate", error);
            return null;
          }
        }).filter(Boolean)
      : [];

    const participants = [];
    if (Array.isArray(body.participants)) {
      const takenNames = new Set();
      body.participants.forEach((item) => {
        try {
          const participantId = sanitizeString(item.participantId) || generateId("part");
          const sanitized = sanitizeParticipantInput(item, {
            allowPartial: false,
            participants
          });
          const normalizedName = sanitized.displayName.toLowerCase();
          if (takenNames.has(normalizedName)) {
            throw new ValidationError("duplicate displayName", ["displayName"]);
          }
          takenNames.add(normalizedName);
          participants.push({
            participantId,
            displayName: sanitized.displayName,
            email: sanitized.email || "",
            status: sanitized.status || "active",
            token: sanitizeString(item.token) || generateId("token"),
            createdAt: sanitizeString(item.createdAt) || new Date().toISOString(),
            updatedAt: sanitizeString(item.updatedAt) || new Date().toISOString(),
            version: Number.isInteger(item.version) && item.version > 0 ? item.version : 1
          });
        } catch (error) {
          console.warn("[Scheduly][server] Failed to import participant", error);
        }
      });
    }

    const participantIdSet = new Set(participants.map((p) => p.participantId));
    const candidateIdSet = new Set(candidates.map((c) => c.candidateId));
    const responses = [];
    if (Array.isArray(body.responses)) {
      body.responses.forEach((item) => {
        try {
          const sanitized = sanitizeResponseInput(item);
          if (!participantIdSet.has(sanitized.participantId) || !candidateIdSet.has(sanitized.candidateId)) {
            throw new ValidationError("invalid response reference", ["participantId", "candidateId"]);
          }
          responses.push({
            responseId: sanitizeString(item.responseId) || generateId("resp"),
            participantId: sanitized.participantId,
            candidateId: sanitized.candidateId,
            mark: sanitized.mark,
            comment: sanitized.comment,
            createdAt: sanitizeString(item.createdAt) || new Date().toISOString(),
            updatedAt: sanitizeString(item.updatedAt) || new Date().toISOString(),
            version: Number.isInteger(item.version) && item.version > 0 ? item.version : 1
          });
        } catch (error) {
          console.warn("[Scheduly][server] Failed to import response", error);
        }
      });
    }

    const shareTokens = sanitizeShareTokens(body.shareTokens);

    const nextState = {
      project: {
        ...state.project,
        ...metaInput,
        projectId,
        createdAt: sanitizeString(body.project?.createdAt) || state.project.createdAt,
        updatedAt: new Date().toISOString()
      },
      candidates,
      participants,
      responses,
      shareTokens,
      versions
    };

    this.#removeShareTokensFromIndex(projectId, state.shareTokens);
    this.projects.set(projectId, nextState);
    this.#indexShareTokens(projectId, nextState.shareTokens);
    return this.#serializeProject(projectId);
  }

  rotateShareTokens(projectId, { rotatedBy, version, baseUrl } = {}) {
    const state = this.#requireProject(projectId);
    const expectedVersion = Number(version);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      throw new ValidationError("version must be a positive integer", ["version"]);
    }
    if (expectedVersion !== state.versions.shareTokensVersion) {
      throw new ConflictError("Share tokens version mismatch", {
        entity: "share_tokens",
        reason: "version_mismatch",
        latest: {
          shareTokens: clone(state.shareTokens),
          version: state.versions.shareTokensVersion
        }
      });
    }
    const now = new Date().toISOString();
    const rotatedByValue = sanitizeString(rotatedBy);
    const shareBaseUrl = baseUrl ? trimTrailingSlash(baseUrl) : SHARE_BASE_URL;
    const nextTokens = {
      admin: {
        ...createShareTokenEntry("admin", shareBaseUrl)
      },
      participant: createShareTokenEntry("participant", shareBaseUrl)
    };
    nextTokens.admin.issuedAt = now;
    nextTokens.participant.issuedAt = now;
    if (rotatedByValue) {
      nextTokens.admin.lastGeneratedBy = rotatedByValue;
    }
    const previousTokens = state.shareTokens;
    state.shareTokens = nextTokens;
    state.versions.shareTokensVersion += 1;
    this.#removeShareTokensFromIndex(projectId, previousTokens);
    this.#indexShareTokens(projectId, nextTokens);
    const latest = this.#serializeProject(projectId);
    return {
      shareTokens: latest.shareTokens,
      version: state.versions.shareTokensVersion
    };
  }

  invalidateShareToken(projectId, type, { version } = {}) {
    if (!SHARE_TOKEN_TYPES.includes(type)) {
      throw new ValidationError("invalid share token type", ["tokenType"]);
    }
    const state = this.#requireProject(projectId);
    const expectedVersion = Number(version);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      throw new ValidationError("version must be a positive integer", ["version"]);
    }
    if (expectedVersion !== state.versions.shareTokensVersion) {
      throw new ConflictError("Share tokens version mismatch", {
        entity: "share_tokens",
        reason: "version_mismatch",
        latest: {
          shareTokens: clone(state.shareTokens),
          version: state.versions.shareTokensVersion
        }
      });
    }
    if (!state.shareTokens || !state.shareTokens[type]) {
      throw new NotFoundError("Share token not found");
    }
    const existingEntry = state.shareTokens[type];
    delete state.shareTokens[type];
    state.versions.shareTokensVersion += 1;
    if (existingEntry) {
      this.#removeShareTokensFromIndex(projectId, { [type]: existingEntry });
    }
    const latest = this.#serializeProject(projectId);
    return {
      shareTokens: latest.shareTokens,
      version: state.versions.shareTokensVersion
    };
  }

  #requireProject(projectId) {
    const state = this.projects.get(projectId);
    if (!state) {
      throw new NotFoundError("Project not found");
    }
    return state;
  }

  resolveProjectByShareToken(type, token) {
    if (!SHARE_TOKEN_TYPES.includes(type)) {
      throw new ValidationError("Invalid share token type", ["tokenType"]);
    }
    const normalizedToken = sanitizeString(token);
    if (!normalizedToken) {
      throw new ValidationError("token is required", ["token"]);
    }
    const projectId = this.shareTokenIndex[type].get(normalizedToken);
    if (!projectId) {
      throw new NotFoundError("Share token not found");
    }
    return {
      projectId,
      snapshot: this.#serializeProject(projectId)
    };
  }

  #indexShareTokens(projectId, shareTokens = {}) {
    SHARE_TOKEN_TYPES.forEach((type) => {
      const entry = shareTokens[type];
      if (entry && isNonEmptyString(entry.token) && !isPlaceholderToken(entry.token)) {
        this.shareTokenIndex[type].set(entry.token, projectId);
      }
    });
  }

  #removeShareTokensFromIndex(projectId, shareTokens = null) {
    const state = this.projects.get(projectId);
    const source = shareTokens || (state ? state.shareTokens : null) || {};
    SHARE_TOKEN_TYPES.forEach((type) => {
      const entry = source[type];
      if (!entry || !isNonEmptyString(entry.token) || isPlaceholderToken(entry.token)) return;
      const currentOwner = this.shareTokenIndex[type].get(entry.token);
      if (currentOwner === projectId) {
        this.shareTokenIndex[type].delete(entry.token);
      }
    });
  }

  #serializeProject(projectId) {
    const state = this.#requireProject(projectId);
    return {
      projectId,
      project: clone(state.project),
      candidates: clone(state.candidates),
      participants: clone(state.participants),
      responses: clone(state.responses),
      shareTokens: {
        ...clone(state.shareTokens),
        version: state.versions.shareTokensVersion
      },
      versions: clone(state.versions)
    };
  }

  #findCandidateIndex(state, candidateId) {
    const id = sanitizeString(candidateId);
    if (!id) {
      throw new ValidationError("candidateId is required", ["candidateId"]);
    }
    const index = state.candidates.findIndex((item) => item.candidateId === id);
    if (index === -1) {
      throw new NotFoundError("Candidate not found");
    }
    return index;
  }

  #findParticipantIndex(state, participantId) {
    const id = sanitizeString(participantId);
    if (!id) {
      throw new ValidationError("participantId is required", ["participantId"]);
    }
    const index = state.participants.findIndex((item) => item.participantId === id);
    if (index === -1) {
      throw new NotFoundError("Participant not found");
    }
    return index;
  }
}

module.exports = {
  InMemoryProjectStore
};
