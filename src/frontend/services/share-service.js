const projectStore = require("../store/project-store");
const sharedIcalUtils = require("../shared/ical-utils");
const runtimeConfig = require("../shared/runtime-config");
const apiClient = require("./api-client");
const { runOptimisticUpdate } = require("../shared/optimistic-update");
const projectService = require("./project-service");

const { createLogger } = sharedIcalUtils;

const TOKEN_LENGTH = 32;
const BASE62_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const SHARE_TOKEN_TYPES = ["admin", "participant"];
const URL_PREFIX = {
  admin: "a",
  participant: "p"
};
const DEFAULT_BASE_URL = "https://scheduly.app";

const logDebug = createLogger("share-service");
const isApiEnabled = () => runtimeConfig.isProjectDriverApi();

const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;

const trimTrailingSlash = (value) => value.replace(/\/+$/, "");

const cloneEntry = (entry) => {
  if (!entry || typeof entry !== "object") return null;
  const next = { ...entry };
  if (!isNonEmptyString(next.revokedAt)) delete next.revokedAt;
  if (!isNonEmptyString(next.lastGeneratedBy)) delete next.lastGeneratedBy;
  return next;
};

const cloneTokens = (tokens) => {
  const next = {};
  SHARE_TOKEN_TYPES.forEach((type) => {
    const entry = cloneEntry(tokens?.[type]);
    if (entry) {
      next[type] = entry;
    }
  });
  return next;
};

const isPlaceholderToken = (token) => typeof token === "string" && token.startsWith("demo-");

const hasUsableEntry = (entry) => entry && typeof entry === "object" && isNonEmptyString(entry.token) && !isPlaceholderToken(entry.token);

const shareEntriesEqual = (a, b) => {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    a.token === b.token &&
    (a.url || "") === (b.url || "") &&
    (a.issuedAt || "") === (b.issuedAt || "") &&
    (a.revokedAt || "") === (b.revokedAt || "") &&
    (a.lastGeneratedBy || "") === (b.lastGeneratedBy || "")
  );
};

const getWindowOrigin = () => {
  if (typeof window === "undefined" || !window.location) return null;
  return window.location.origin;
};

const sanitizeBaseUrl = (rawBaseUrl) => {
  const fallback = getWindowOrigin() || DEFAULT_BASE_URL;
  if (!isNonEmptyString(rawBaseUrl)) {
    return trimTrailingSlash(fallback);
  }
  try {
    const parsed = new URL(rawBaseUrl, fallback);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return trimTrailingSlash(fallback);
    }
    parsed.hash = "";
    parsed.search = "";
    return trimTrailingSlash(parsed.toString());
  } catch (error) {
    logDebug("fallback baseUrl due to parse error", rawBaseUrl, error);
    return trimTrailingSlash(fallback);
  }
};

const generateBase62Token = (length = TOKEN_LENGTH) => {
  const alphabetLength = BASE62_ALPHABET.length;
  const result = [];
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const values = new Uint32Array(length);
    crypto.getRandomValues(values);
    for (let i = 0; i < length; i += 1) {
      result.push(BASE62_ALPHABET[values[i] % alphabetLength]);
    }
  } else {
    for (let i = 0; i < length; i += 1) {
      const randomIndex = Math.floor(Math.random() * alphabetLength);
      result.push(BASE62_ALPHABET[randomIndex]);
    }
  }
  return result.join("");
};

const buildUrl = (type, token, baseUrl) => {
  if (!isNonEmptyString(token)) return "";
  const prefix = URL_PREFIX[type];
  if (!prefix) throw new Error(`Unknown share token type: ${type}`);
  const normalizedBase = trimTrailingSlash(baseUrl || DEFAULT_BASE_URL);
  return `${normalizedBase}/${prefix}/${token}`;
};

const createShareTokenEntry = (type, baseUrl, lastGeneratedBy) => {
  const token = generateBase62Token();
  const issuedAt = new Date().toISOString();
  const entry = {
    token,
    url: buildUrl(type, token, baseUrl),
    issuedAt
  };
  if (isNonEmptyString(lastGeneratedBy)) {
    entry.lastGeneratedBy = lastGeneratedBy;
  }
  return entry;
};

const applyBaseUrlToEntry = (type, entry, baseUrl) => {
  if (!entry) return null;
  const next = { ...entry };
  next.url = buildUrl(type, next.token, baseUrl);
  return next;
};

const applyBaseUrlToTokens = (tokens, baseUrl) => {
  const next = {};
  SHARE_TOKEN_TYPES.forEach((type) => {
    if (tokens && tokens[type]) {
      next[type] = applyBaseUrlToEntry(type, tokens[type], baseUrl);
    }
  });
  return next;
};

const getShareTokensVersion = (projectId) => {
  const snapshot = projectStore.getProjectStateSnapshot(projectId);
  const version = snapshot?.versions?.shareTokensVersion;
  return Number.isInteger(version) && version >= 0 ? version : 1;
};

const isSameOrigin = (targetUrl) => {
  const currentOrigin = getWindowOrigin();
  if (!currentOrigin) return false;
  try {
    const resolved = new URL(targetUrl);
    return resolved.origin === currentOrigin;
  } catch (error) {
    logDebug("failed to resolve target url for origin check", targetUrl, error);
    return false;
  }
};

const handleNavigation = (adminEntry, options) => {
  if (!options || options.navigateToAdminUrl !== true) {
    return { attempted: false, blocked: false };
  }
  if (!adminEntry || !isNonEmptyString(adminEntry.url)) {
    return { attempted: true, blocked: true, reason: "missing_url" };
  }
  if (!isSameOrigin(adminEntry.url)) {
    return { attempted: true, blocked: true, reason: "cross_origin" };
  }
  if (typeof window === "undefined" || typeof window.location?.assign !== "function") {
    return { attempted: true, blocked: true, reason: "no_window" };
  }
  window.location.assign(adminEntry.url);
  return { attempted: true, blocked: false };
};

const applyApiTokens = (projectId, tokens, version, baseUrl) => {
  const mapped = applyBaseUrlToTokens(tokens, baseUrl);
  const storedTokens = projectStore.updateShareTokens(projectId, mapped);
  if (Number.isInteger(version)) {
    projectStore.updateProjectVersions(projectId, { shareTokensVersion: version });
  } else if (tokens && Number.isInteger(tokens.version)) {
    projectStore.updateProjectVersions(projectId, { shareTokensVersion: tokens.version });
  }
  return storedTokens;
};

const get = (projectId) => {
  const tokens = projectStore.getShareTokens(projectId);
  return cloneTokens(tokens);
};

const localGenerate = (projectId, options = {}) => {
  const baseUrl = sanitizeBaseUrl(options.baseUrl);
  const currentTokens = projectStore.getShareTokens(projectId);
  const nextAdmin = hasUsableEntry(currentTokens.admin)
    ? applyBaseUrlToEntry("admin", currentTokens.admin, baseUrl)
    : createShareTokenEntry("admin", baseUrl, options.lastGeneratedBy);
  const nextParticipant = hasUsableEntry(currentTokens.participant)
    ? applyBaseUrlToEntry("participant", currentTokens.participant, baseUrl)
    : createShareTokenEntry("participant", baseUrl, options.lastGeneratedBy);

  const tokensChanged =
    !shareEntriesEqual(currentTokens.admin, nextAdmin) ||
    !shareEntriesEqual(currentTokens.participant, nextParticipant);

  const storedTokens = tokensChanged
    ? projectStore.updateShareTokens(projectId, { admin: nextAdmin, participant: nextParticipant })
    : currentTokens;

  const navigation = handleNavigation(storedTokens.admin, options);

  return {
    admin: cloneEntry(storedTokens.admin),
    participant: cloneEntry(storedTokens.participant),
    navigation
  };
};

const localRotate = (projectId, options = {}) => {
  const baseUrl = sanitizeBaseUrl(options.baseUrl);
  const adminEntry = createShareTokenEntry("admin", baseUrl, options.lastGeneratedBy);
  const participantEntry = createShareTokenEntry("participant", baseUrl, options.lastGeneratedBy);
  const storedTokens = projectStore.updateShareTokens(projectId, {
    admin: adminEntry,
    participant: participantEntry
  });
  const navigation = handleNavigation(storedTokens.admin, options);
  return {
    admin: cloneEntry(storedTokens.admin),
    participant: cloneEntry(storedTokens.participant),
    navigation
  };
};

const localInvalidate = (projectId, type) => {
  if (!SHARE_TOKEN_TYPES.includes(type)) {
    throw new Error(`Invalid share token type: ${type}`);
  }
  projectStore.updateShareTokens(projectId, (current) => {
    const next = { ...current };
    delete next[type];
    return next;
  });
};

const apiRotate = async (projectId, options = {}) => {
  const baseUrl = sanitizeBaseUrl(options.baseUrl);
  const payload = {
    version: getShareTokensVersion(projectId),
    baseUrl
  };
  if (options.lastGeneratedBy) {
    payload.rotatedBy = options.lastGeneratedBy;
  }
  return runOptimisticUpdate({
    request: () =>
      apiClient.post(`/api/projects/${encodeURIComponent(projectId)}/share/rotate`, payload),
    onSuccess: (response) => {
      const tokens = response?.shareTokens || {};
      const storedTokens = applyApiTokens(projectId, tokens, response?.version, baseUrl);
      const navigation = handleNavigation(storedTokens.admin, options);
      return {
        admin: cloneEntry(storedTokens.admin),
        participant: cloneEntry(storedTokens.participant),
        navigation
      };
    },
    refetch: () => projectService.syncProjectSnapshot(projectId, { force: true, reason: "share_tokens_conflict" }),
    transformError: (error) => {
      if (error && error.status === 409) {
        error.message = "Share tokens version mismatch";
      }
      return error;
    },
    onError: (error) => {
      console.error("[Scheduly] shareService.rotate failed", error);
    }
  });
};

const apiGenerate = async (projectId, options = {}) => {
  const baseUrl = sanitizeBaseUrl(options.baseUrl);
  const currentTokens = projectStore.getShareTokens(projectId);
  const hasAdmin = hasUsableEntry(currentTokens.admin);
  const hasParticipant = hasUsableEntry(currentTokens.participant);
  if (!hasAdmin || !hasParticipant) {
    return apiRotate(projectId, { ...options, baseUrl });
  }
  const mapped = applyBaseUrlToTokens(currentTokens, baseUrl);
  const storedTokens = projectStore.updateShareTokens(projectId, mapped);
  const navigation = handleNavigation(storedTokens.admin, options);
  return {
    admin: cloneEntry(storedTokens.admin),
    participant: cloneEntry(storedTokens.participant),
    navigation
  };
};

const apiInvalidate = async (projectId, type) => {
  if (!SHARE_TOKEN_TYPES.includes(type)) {
    throw new Error(`Invalid share token type: ${type}`);
  }
  return runOptimisticUpdate({
    request: () =>
      apiClient.post(`/api/projects/${encodeURIComponent(projectId)}/share/invalidate`, {
        tokenType: type,
        version: getShareTokensVersion(projectId)
      }),
    onSuccess: () => {
      projectStore.updateShareTokens(projectId, (current) => {
        const next = { ...current };
        delete next[type];
        return next;
      });
      return true;
    },
    refetch: () => projectService.syncProjectSnapshot(projectId, { force: true, reason: "share_tokens_conflict" }),
    transformError: (error) => {
      if (error && error.status === 409) {
        error.message = "Share token invalidation conflict";
      }
      return error;
    },
    onError: (error) => {
      console.error("[Scheduly] shareService.invalidate failed", error);
    }
  });
};

const generate = (projectId, options = {}) =>
  (isApiEnabled() ? apiGenerate(projectId, options) : localGenerate(projectId, options));

const rotate = (projectId, options = {}) =>
  (isApiEnabled() ? apiRotate(projectId, options) : localRotate(projectId, options));

const invalidate = (projectId, type) =>
  (isApiEnabled() ? apiInvalidate(projectId, type) : localInvalidate(projectId, type));

module.exports = {
  get,
  generate,
  rotate,
  invalidate,
  buildUrl,
  isPlaceholderToken
};
