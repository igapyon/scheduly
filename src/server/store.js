const crypto = require("crypto");
const {
  NotFoundError,
  ValidationError,
  ConflictError
} = require("./errors");

const DEFAULT_TZID = "Asia/Tokyo";
const VALID_CANDIDATE_STATUS = new Set(["CONFIRMED", "TENTATIVE", "CANCELLED"]);
const PARTICIPANT_STATUS = new Set(["active", "archived"]);
const VALID_RESPONSE_MARKS = new Set(["o", "d", "x"]);
const SHARE_TOKEN_TYPES = ["admin", "participant"];

const TZID_PATTERN = /^[A-Za-z0-9_\-]+\/[A-Za-z0-9_\-]+$/;
const CUSTOM_TZID_PATTERN = /^X-SCHEDULY-[A-Z0-9_\-]+$/i;

const generateId = (prefix) => {
  const random =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : crypto.randomBytes(16).toString("hex");
  return prefix ? `${prefix}_${random}` : random;
};

const sanitizeString = (input, { fallback = "" } = {}) => {
  if (typeof input !== "string") return fallback;
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : fallback;
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
  const name = sanitizeString(meta.name);
  const description = sanitizeString(meta.description);
  const defaultTzid = sanitizeString(meta.defaultTzid, { fallback: DEFAULT_TZID });

  const errors = [];
  if (!name) {
    errors.push("name");
  } else if (name.length > 120) {
    errors.push("name");
  }
  if (description && description.length > 2000) {
    errors.push("description");
  }
  if (!defaultTzid) {
    errors.push("defaultTzid");
  }
  if (errors.length) {
    throw new ValidationError("Project meta validation failed", errors);
  }

  return {
    name,
    description,
    defaultTzid
  };
};

const sanitizeCandidateInput = (input = {}, { allowPartial = false } = {}) => {
  if (!input || typeof input !== "object") {
    throw new ValidationError("candidate payload is required", ["candidate"]);
  }

  const errors = [];
  const summary = sanitizeString(input.summary);
  const description = sanitizeString(input.description);
  const location = sanitizeString(input.location);
  const statusValue = sanitizeString(input.status, { fallback: "TENTATIVE" }).toUpperCase();
  const tzidValue = sanitizeString(input.tzid, { fallback: DEFAULT_TZID });
  const dtstartValue = sanitizeString(input.dtstart);
  const dtendValue = sanitizeString(input.dtend);

  if (!allowPartial || summary || summary === "") {
    if (!summary) {
      errors.push("summary");
    } else if (summary.length > 120) {
      errors.push("summary");
    }
  }

  if (description && description.length > 2000) {
    errors.push("description");
  }

  if (location && location.length > 120) {
    errors.push("location");
  }

  if (!allowPartial || input.status !== undefined) {
    if (!VALID_CANDIDATE_STATUS.has(statusValue)) {
      errors.push("status");
    }
  }

  if (!allowPartial || input.tzid !== undefined) {
    if (
      !tzidValue ||
      (!TZID_PATTERN.test(tzidValue) && !CUSTOM_TZID_PATTERN.test(tzidValue))
    ) {
      errors.push("tzid");
    }
  }

  if (!allowPartial || input.dtstart !== undefined) {
    if (!isValidDateTime(dtstartValue)) {
      errors.push("dtstart");
    }
  }

  if (!allowPartial || input.dtend !== undefined) {
    if (!isValidDateTime(dtendValue)) {
      errors.push("dtend");
    }
  }

  if (
    (!allowPartial || (input.dtstart !== undefined && input.dtend !== undefined)) &&
    isValidDateTime(dtstartValue) &&
    isValidDateTime(dtendValue)
  ) {
    if (Date.parse(dtendValue) <= Date.parse(dtstartValue)) {
      errors.push("dtstart");
      errors.push("dtend");
    }
  }

  if (errors.length) {
    throw new ValidationError("Candidate validation failed", Array.from(new Set(errors)));
  }

  return {
    summary,
    description,
    location,
    status: statusValue || "TENTATIVE",
    tzid: tzidValue,
    dtstart: dtstartValue,
    dtend: dtendValue
  };
};

const sanitizeParticipantInput = (
  input = {},
  { allowPartial = false, participants = [], currentId = null } = {}
) => {
  if (!input || typeof input !== "object") {
    throw new ValidationError("participant payload is required", ["participant"]);
  }

  const errors = [];
  const hasDisplayName = Object.prototype.hasOwnProperty.call(input, "displayName");
  const hasEmail = Object.prototype.hasOwnProperty.call(input, "email");
  const hasStatus = Object.prototype.hasOwnProperty.call(input, "status");

  const displayName = hasDisplayName ? sanitizeString(input.displayName) : undefined;
  const email = hasEmail ? sanitizeString(input.email) : undefined;
  const statusValue = hasStatus
    ? sanitizeString(input.status, { fallback: "active" }).toLowerCase()
    : "active";

  if (!allowPartial || hasDisplayName) {
    if (!displayName) {
      errors.push("displayName");
    } else if (displayName.length > 80) {
      errors.push("displayName");
    } else {
      const normalized = displayName.toLowerCase();
      const conflict = participants.some(
        (entry) =>
          entry &&
          entry.participantId !== currentId &&
          typeof entry.displayName === "string" &&
          entry.displayName.toLowerCase() === normalized
      );
      if (conflict) {
        errors.push("displayName");
      }
    }
  }

  if (!allowPartial || hasStatus) {
    if (statusValue && !PARTICIPANT_STATUS.has(statusValue)) {
      errors.push("status");
    }
  }

  if (errors.length) {
    throw new ValidationError("Participant validation failed", Array.from(new Set(errors)));
  }

  const result = {};
  if (!allowPartial || hasDisplayName) {
    result.displayName = displayName;
  }
  if (!allowPartial || hasEmail) {
    result.email = email || "";
  }
  if (!allowPartial || hasStatus) {
    result.status = statusValue || "active";
  }
  return result;
};

const sanitizeResponseInput = (input = {}) => {
  if (!input || typeof input !== "object") {
    throw new ValidationError("response payload is required", ["response"]);
  }
  const errors = [];
  const participantId = sanitizeString(input.participantId);
  const candidateId = sanitizeString(input.candidateId);
  const markValue = sanitizeString(input.mark).toLowerCase();
  const comment = typeof input.comment === "string" ? input.comment : "";

  if (!participantId) {
    errors.push("participantId");
  }
  if (!candidateId) {
    errors.push("candidateId");
  }
  if (!VALID_RESPONSE_MARKS.has(markValue)) {
    errors.push("mark");
  }
  if (comment && comment.length > 500) {
    errors.push("comment");
  }

  if (errors.length) {
    throw new ValidationError("Response validation failed", Array.from(new Set(errors)));
  }

  return {
    participantId,
    candidateId,
    mark: markValue,
    comment
  };
};

const createShareTokenEntry = (type) => {
  const issuedAt = new Date().toISOString();
  const token = generateId(`scheduly-${type}`);
  return {
    token,
    issuedAt
  };
};

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
    admin: createShareTokenEntry("admin"),
    participant: createShareTokenEntry("participant")
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

class InMemoryProjectStore {
  constructor() {
    this.projects = new Map();
  }

  createProject(metaInput = {}) {
    const sanitizedMeta = sanitizeMetaInput(metaInput);
    const projectId = generateId("proj");
    const state = createInitialProjectState(projectId, sanitizedMeta);
    this.projects.set(projectId, state);
    return this.#serializeProject(projectId);
  }

  getSnapshot(projectId) {
    let state = this.projects.get(projectId);
    if (!state) {
      state = createInitialProjectState(projectId, {});
      this.projects.set(projectId, state);
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
      participant: clone(participant)
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
      participant: clone(nextParticipant)
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
      participantTally
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
  }

  getResponsesSummary(projectId) {
    const state = this.#requireProject(projectId);
    return computeResponsesSummary(state);
  }

  rotateShareTokens(projectId, { rotatedBy, version } = {}) {
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
    const nextTokens = {
      admin: {
        ...createShareTokenEntry("admin")
      },
      participant: createShareTokenEntry("participant")
    };
    nextTokens.admin.issuedAt = now;
    nextTokens.participant.issuedAt = now;
    if (rotatedByValue) {
      nextTokens.admin.lastGeneratedBy = rotatedByValue;
    }
    state.shareTokens = nextTokens;
    state.versions.shareTokensVersion += 1;
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
    delete state.shareTokens[type];
    state.versions.shareTokensVersion += 1;
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
