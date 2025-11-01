// Minimal validation helpers (later replaceable by zod)

const isNonEmptyString = (v) => typeof v === "string" && v.trim().length > 0;

const createEnumValidator = (allowed) => {
  const lower = new Set();
  if (allowed && typeof allowed.forEach === "function") {
    allowed.forEach((x) => lower.add(String(x).toLowerCase()));
  }
  return (v) => typeof v === "string" && lower.has(v.trim().toLowerCase());
};

const maxLength = (n) => (v) => typeof v === "string" && v.length <= n;

const validate = (data, rules) => {
  const errors = [];
  for (const key in rules) {
    const validators = Array.isArray(rules[key]) ? rules[key] : [rules[key]];
    const value = data[key];
    for (const fn of validators) {
      if (!fn(value)) {
        errors.push(key);
        break;
      }
    }
  }
  return { ok: errors.length === 0, errors };
};

// Specific schemas
const buildResponseRules = (opts = {}) => {
  const { allowedMarks = new Set(["o", "d", "x", "pending"]), maxComment = 500 } = opts;
  return {
    participantId: isNonEmptyString,
    candidateId: isNonEmptyString,
    mark: createEnumValidator(allowedMarks),
    comment: maxLength(maxComment)
  };
};

const isIsoLikeDateTime = (v) => {
  if (typeof v !== "string" || !v) return false;
  // Accepts YYYY-MM-DDTHH:MM (local input) or ISO strings
  return /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?/.test(v) || !Number.isNaN(new Date(v).getTime());
};

const allowEmpty = (validator) => (v) => {
  if (v === undefined || v === null) return true;
  if (typeof v === "string" && v.length === 0) return true;
  return validator(v);
};

const buildCandidateRules = (opts = {}) => {
  const { maxSummary = 120, maxLocation = 120, maxDescription = 2000, allowedStatus = new Set(["CONFIRMED","TENTATIVE","CANCELLED"]) } = opts;
  return {
    summary: [maxLength(maxSummary)],
    dtstart: allowEmpty(isIsoLikeDateTime),
    dtend: allowEmpty(isIsoLikeDateTime),
    tzid: (v) => (typeof v !== "string" || v.length === 0) || isNonEmptyString(v),
    status: createEnumValidator(allowedStatus),
    location: [maxLength(maxLocation)],
    description: [maxLength(maxDescription)]
  };
};

const buildParticipantRules = (opts = {}) => {
  const { maxName = 80, maxEmail = 120, maxComment = 500 } = opts;
  const emailOk = (v) => (typeof v !== "string" || v.length === 0) || /.+@.+\..+/.test(v);
  return {
    displayName: [isNonEmptyString, maxLength(maxName)],
    email: [maxLength(maxEmail), emailOk],
    comment: [maxLength(maxComment)]
  };
};

module.exports = {
  isNonEmptyString,
  createEnumValidator,
  maxLength,
  validate,
  buildResponseRules
  , buildCandidateRules
  , buildParticipantRules
};
