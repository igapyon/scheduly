const crypto = require("crypto");
const {
  NotFoundError,
  ValidationError,
  ConflictError
} = require("./errors");

const DEFAULT_TZID = "Asia/Tokyo";
const VALID_CANDIDATE_STATUS = new Set(["CONFIRMED", "TENTATIVE", "CANCELLED"]);

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
    const state = this.projects.get(projectId);
    if (!state) {
      throw new NotFoundError("Project not found");
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

  rotateShareTokens(projectId, { rotatedBy } = {}) {
    const state = this.#requireProject(projectId);
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
}

module.exports = {
  InMemoryProjectStore
};
const isValidDateTime = (value) => {
  if (typeof value !== "string" || !value.trim()) return false;
  const parsed = Date.parse(value);
  return !Number.isNaN(parsed);
};
