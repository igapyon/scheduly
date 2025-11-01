// Minimal validation helpers (later replaceable by zod)

const isNonEmptyString = (v) => typeof v === "string" && v.trim().length > 0;

const createEnumValidator = (allowed) => (v) => typeof v === "string" && allowed.has(v.trim().toLowerCase());

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

module.exports = {
  isNonEmptyString,
  createEnumValidator,
  maxLength,
  validate,
  buildResponseRules
};

