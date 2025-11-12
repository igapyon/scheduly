const { z } = require("zod");

const DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z)?$/i;

const preprocessString = (schema, { defaultValue = "" } = {}) =>
  z.preprocess(
    (value) => {
      if (value === undefined || value === null) return defaultValue;
      return String(value);
    },
    schema
  );

const datetimeInputSchema = preprocessString(
  z
    .string()
    .trim()
    .refine(
      (value) => value.length === 0 || DATETIME_PATTERN.test(value) || !Number.isNaN(new Date(value).getTime()),
      { message: "Invalid datetime format" }
    ),
  { defaultValue: "" }
);

const summarySchema = z.string().trim().max(120);
const descriptionSchema = preprocessString(z.string().max(2000), { defaultValue: "" }).transform((value) => value.trim());
const locationSchema = preprocessString(z.string().max(120), { defaultValue: "" }).transform((value) => value.trim());

const candidateInputSchema = z.object({
  summary: summarySchema,
  dtstart: datetimeInputSchema,
  dtend: datetimeInputSchema,
  tzid: preprocessString(z.string().trim().min(1).max(120), { defaultValue: "" }),
  status: z.enum(["CONFIRMED", "TENTATIVE", "CANCELLED"]).default("TENTATIVE").transform((value) => value.toUpperCase()),
  location: locationSchema,
  description: descriptionSchema
});

const emailSchema = z
  .string()
  .trim()
  .max(120)
  .refine((value) => value.length === 0 || /.+@.+\..+/.test(value), { message: "Invalid email address" });

const participantInputSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  email: preprocessString(emailSchema, { defaultValue: "" }),
  comment: preprocessString(z.string().max(500), { defaultValue: "" })
});

const responseInputSchema = z.object({
  participantId: z.string().trim().min(1),
  candidateId: z.string().trim().min(1),
  mark: z.enum(["o", "d", "x", "pending"]).transform((value) => value.toLowerCase()),
  comment: preprocessString(z.string().max(500), { defaultValue: "" })
});

const projectMetaSchema = z.object({
  name: z.string().trim().max(120),
  description: preprocessString(z.string().max(2000), { defaultValue: "" }),
  defaultTzid: z.string().trim().min(1).max(120)
});

const collectZodIssueFields = (issues) => {
  if (!issues || typeof issues[Symbol.iterator] !== "function") return [];
  const set = new Set();
  for (const issue of issues) {
    const path = Array.isArray(issue.path) && issue.path.length ? issue.path[0] : "unknown";
    set.add(path);
  }
  return Array.from(set);
};

module.exports = {
  candidateInputSchema,
  participantInputSchema,
  responseInputSchema,
  projectMetaSchema,
  collectZodIssueFields
};
