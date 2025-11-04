const crypto = require("crypto");
const {
  NotFoundError,
  ValidationError,
  ConflictError
} = require("./errors");

const DEFAULT_TZID = "Asia/Tokyo";

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
  return {
    name: sanitizeString(meta.name),
    description: sanitizeString(meta.description),
    defaultTzid: sanitizeString(meta.defaultTzid, { fallback: DEFAULT_TZID })
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
    const projectId = generateId("proj");
    const state = createInitialProjectState(projectId, metaInput);
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
}

module.exports = {
  InMemoryProjectStore
};
