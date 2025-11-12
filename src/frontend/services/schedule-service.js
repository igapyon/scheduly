// Copyright (c) Toshiki Iga. All Rights Reserved.

const sharedIcalUtils = require("../shared/ical-utils");
const projectStore = require("../store/project-store");
const tallyService = require("./tally-service");
const apiClient = require("./api-client");
const { runOptimisticUpdate } = require("../shared/optimistic-update");
const projectService = require("./project-service");
const { candidateInputSchema, collectZodIssueFields } = require("../../shared/schema");
const { emitMutationEvent } = require("./sync-events");

const {
  DEFAULT_TZID,
  ensureICAL
} = sharedIcalUtils;

const TZID_PATTERN = /^[A-Za-z0-9_\-]+\/[A-Za-z0-9_\-]+$/;
const CUSTOM_TZID_PATTERN = /^X-SCHEDULY-[A-Z0-9_\-]+$/i;

const logDebug = sharedIcalUtils.createLogger("schedule-service");
const syncProjectSnapshot = (projectId, reason) =>
  projectService && typeof projectService.syncProjectSnapshot === "function"
    ? projectService.syncProjectSnapshot(projectId, { force: true, reason })
    : Promise.resolve();

const captureCandidateSnapshot = (projectId) => ({
  candidates: projectStore.getCandidates(projectId),
  responses: projectStore.getResponses(projectId),
  tallies: projectStore.getTallies(projectId),
  icsText: projectStore.getIcsText(projectId)
});

const restoreCandidateSnapshot = (projectId, snapshot) => {
  if (!snapshot) return;
  if (snapshot.candidates) {
    projectStore.replaceCandidates(projectId, snapshot.candidates, snapshot.icsText);
  }
  if (snapshot.responses) {
    projectStore.replaceResponses(projectId, snapshot.responses);
  }
  if (snapshot.tallies) {
    projectStore.replaceTallies(projectId, snapshot.tallies);
  }
};

const mapApiCandidate = (candidate) => {
  if (!candidate || typeof candidate !== "object") return null;
  const id = candidate.candidateId || candidate.id;
  if (!id) return null;
  return {
    id,
    candidateId: candidate.candidateId || id,
    uid: candidate.uid || generateSchedulyUid(),
    summary: candidate.summary || "",
    description: candidate.description || "",
    location: candidate.location || "",
    status: candidate.status || "CONFIRMED",
    dtstart: candidate.dtstart || "",
    dtend: candidate.dtend || "",
    tzid: candidate.tzid || DEFAULT_TZID,
    sequence: Number.isInteger(candidate.sequence) ? candidate.sequence : 0,
    dtstamp: candidate.dtstamp || new Date().toISOString(),
    createdAt: candidate.createdAt || new Date().toISOString(),
    updatedAt: candidate.updatedAt || new Date().toISOString(),
    version: Number.isInteger(candidate.version) ? candidate.version : 1,
    rawICalVevent: candidate.rawICalVevent || null
  };
};

const toCandidateRequestPayload = (candidate) => ({
  candidateId: candidate.candidateId || candidate.id,
  summary: candidate.summary || "",
  dtstart: candidate.dtstart || "",
  dtend: candidate.dtend || "",
  tzid: candidate.tzid || DEFAULT_TZID,
  status: candidate.status || "TENTATIVE",
  location: candidate.location || "",
  description: candidate.description || ""
});

const findCandidateById = (projectId, candidateId) => {
  const candidates = projectStore.getCandidates(projectId);
  return candidates.find((item) => item && item.id === candidateId) || null;
};
const ICAL_LINE_BREAK = "\r\n";
const ICAL_HEADER_LINES = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Scheduly//Mock//JA",
  "CALSCALE:GREGORIAN",
  "METHOD:PUBLISH"
];

const randomUUID = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
};

const generateSchedulyUid = () => `igapyon-scheduly-${randomUUID()}`;

const pad = (n) => String(n).padStart(2, "0");

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

const resolveNextSequence = (candidate) => (typeof candidate.sequence === "number" ? candidate.sequence + 1 : 1);

const escapeICalText = (value) => {
  if (value === undefined || value === null) return "";
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
};

const buildICalEventLines = (candidate, { dtstampLine, sequence }) => {
  const dtstartLine = formatUtcForICal(candidate.dtstart);
  const dtendLine = formatUtcForICal(candidate.dtend);
  const statusValue = (candidate.status ? String(candidate.status) : "CONFIRMED").toUpperCase();
  const tzidValue = (candidate.tzid && candidate.tzid.trim()) ? candidate.tzid.trim() : DEFAULT_TZID;

  const veventLines = [
    "BEGIN:VEVENT",
    "UID:" + (candidate.uid || generateSchedulyUid()),
    "SEQUENCE:" + sequence
  ];

  if (dtstampLine) veventLines.push("DTSTAMP:" + dtstampLine);
  if (dtstartLine) veventLines.push("DTSTART:" + dtstartLine);
  if (dtendLine) veventLines.push("DTEND:" + dtendLine);
  veventLines.push("STATUS:" + (statusValue || "CONFIRMED"));
  veventLines.push("SUMMARY:" + escapeICalText(candidate.summary || ""));
  veventLines.push("LOCATION:" + escapeICalText(candidate.location || ""));
  veventLines.push("DESCRIPTION:" + escapeICalText(candidate.description || ""));
  if (tzidValue) veventLines.push("X-SCHEDULY-TZID:" + escapeICalText(tzidValue));
  veventLines.push("END:VEVENT");
  return veventLines;
};

const joinICalLines = (lines) => lines.filter(Boolean).join(ICAL_LINE_BREAK) + ICAL_LINE_BREAK;

const toInputValue = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const toLocalInputFromICAL = (icalTime) => {
  if (!icalTime) return "";
  return toInputValue(icalTime.toJSDate());
};

const serializeCandidatesToIcs = (candidates) => {
  const dtstampLine = formatUtcForICal(new Date().toISOString());
  const lines = ICAL_HEADER_LINES.slice();
  candidates.forEach((candidate) => {
    const sequence = typeof candidate.sequence === "number" ? candidate.sequence : 0;
    lines.push(...buildICalEventLines(candidate, { dtstampLine, sequence }));
  });
  lines.push("END:VCALENDAR");
  return joinICalLines(lines);
};

const persistCandidates = (projectId, nextCandidates, explicitIcsText) => {
  const icsText = typeof explicitIcsText === "string" ? explicitIcsText : serializeCandidatesToIcs(nextCandidates);
  projectStore.replaceCandidates(projectId, nextCandidates, icsText);
  tallyService.recalculate(projectId);
  return projectStore.getProjectStateSnapshot(projectId);
};

const createBlankCandidate = () => {
  const now = new Date();
  now.setSeconds(0, 0);
  const start = new Date(now.getTime() + 60 * 60 * 1000);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return {
    id: randomUUID(),
    uid: generateSchedulyUid(),
    summary: "",
    dtstart: toInputValue(start),
    dtend: toInputValue(end),
    tzid: DEFAULT_TZID,
    status: "CONFIRMED",
    sequence: 0,
    dtstamp: new Date().toISOString(),
    location: "",
    description: "",
    rawICalVevent: null
  };
};

const createCandidateFromVevent = (vevent) => {
  const ICAL = ensureICAL();
  const event = new ICAL.Event(vevent);
  const uid = event.uid;
  if (!uid) return null;
  const startDate = event.startDate;
  const zone = startDate && startDate.zone ? startDate.zone.tzid : null;
  const schedulyTzid = event.component.getFirstPropertyValue("x-scheduly-tzid");
  let tzid = zone || schedulyTzid || DEFAULT_TZID;
  if (tzid && typeof tzid === "string") {
    const normalized = tzid.trim();
    if (normalized && normalized.toLowerCase() !== "floating") {
      tzid = normalized;
    } else if (schedulyTzid && typeof schedulyTzid === "string" && schedulyTzid.trim()) {
      tzid = schedulyTzid.trim();
    } else {
      tzid = DEFAULT_TZID;
    }
  } else {
    tzid = DEFAULT_TZID;
  }
  const dtstampProp = event.component.getFirstPropertyValue("dtstamp");
  const dtstampIso = dtstampProp ? dtstampProp.toJSDate().toISOString() : new Date().toISOString();
  return {
    id: randomUUID(),
    uid,
    summary: event.summary || "",
    dtstart: toLocalInputFromICAL(event.startDate),
    dtend: toLocalInputFromICAL(event.endDate),
    tzid,
    status: event.status || "CONFIRMED",
    sequence: event.sequence || 0,
    dtstamp: dtstampIso,
    location: event.location || "",
    description: event.description || "",
    rawICalVevent: vevent.toJSON()
  };
};

const localAddCandidate = (projectId, presetCandidate = null) => {
  const existing = projectStore.getCandidates(projectId);
  const candidate = presetCandidate
    ? { ...presetCandidate }
    : createBlankCandidate();
  candidate.sequence = existing.length;
  const nextCandidates = existing.concat(candidate);
  persistCandidates(projectId, nextCandidates);
  return candidate;
};

const localUpdateCandidate = (projectId, candidateId, nextCandidate) => {
  const existing = projectStore.getCandidates(projectId);
  const base = existing.find((c) => c.id === candidateId) || {};
  if (!base) {
    throw new Error("Candidate not found");
  }
  const candidateInput = {
    summary: String((nextCandidate?.summary ?? base.summary) || ""),
    dtstart: String((nextCandidate?.dtstart ?? base.dtstart) || ""),
    dtend: String((nextCandidate?.dtend ?? base.dtend) || ""),
    tzid: String((nextCandidate?.tzid ?? base.tzid) || ""),
    status: String((nextCandidate?.status ?? base.status) || "CONFIRMED"),
    location: String((nextCandidate?.location ?? base.location) || ""),
    description: String((nextCandidate?.description ?? base.description) || "")
  };
  const changedStart =
    nextCandidate && Object.prototype.hasOwnProperty.call(nextCandidate, "dtstart") && nextCandidate.dtstart !== base.dtstart;
  const changedEnd =
    nextCandidate && Object.prototype.hasOwnProperty.call(nextCandidate, "dtend") && nextCandidate.dtend !== base.dtend;
  const validationResult = candidateInputSchema.safeParse(candidateInput);
  if (!validationResult.success) {
    const fields = collectZodIssueFields(validationResult.error.errors);
    const temporalOnly = fields.length > 0 && fields.every((field) => field === "dtstart" || field === "dtend");
    if (temporalOnly && (changedStart || changedEnd)) {
      const nextCandidates = existing.map((candidate) =>
        candidate.id === candidateId ? { ...candidate, ...nextCandidate } : candidate
      );
      persistCandidates(projectId, nextCandidates);
      return;
    }
    const err = new Error(`candidate validation failed: ${fields.join(", ")}`);
    err.code = 422;
    err.fields = fields;
    throw err;
  }
  const payload = validationResult.data;
  const startOk = payload.dtstart && !Number.isNaN(new Date(payload.dtstart).getTime());
  const endOk = payload.dtend && !Number.isNaN(new Date(payload.dtend).getTime());
  if (startOk && endOk && (changedEnd || (changedStart && changedEnd))) {
    const start = new Date(payload.dtstart);
    const end = new Date(payload.dtend);
    if (end <= start) {
      const previewNext = existing.map((candidate) =>
        candidate.id === candidateId ? { ...candidate, ...nextCandidate } : candidate
      );
      persistCandidates(projectId, previewNext);
      const err = new Error("candidate validation failed: dtend must be after dtstart");
      err.code = 422;
      throw err;
    }
  }
  const nextCandidates = existing.map((item) => {
    if (item.id !== candidateId) return item;
    return {
      ...item,
      ...nextCandidate,
      summary: payload.summary,
      dtstart: payload.dtstart,
      dtend: payload.dtend,
      tzid: payload.tzid || DEFAULT_TZID,
      status: payload.status || "TENTATIVE",
      location: payload.location,
      description: payload.description
    };
  });
  persistCandidates(projectId, nextCandidates);
};

const localRemoveCandidate = (projectId, candidateId) => {
  const existing = projectStore.getCandidates(projectId);
  const nextCandidates = existing.filter((candidate) => candidate.id !== candidateId);
  projectStore.removeResponsesByCandidate(projectId, candidateId);
  return persistCandidates(projectId, nextCandidates);
};

const exportAllCandidatesToIcs = (projectId) => {
  const candidates = projectStore.getCandidates(projectId);
  return serializeCandidatesToIcs(candidates);
};

const exportCandidateToIcs = (projectId, candidateId) => {
  const candidates = projectStore.getCandidates(projectId);
  const target = candidates.find((candidate) => candidate.id === candidateId);
  if (!target) {
    throw new Error("Candidate not found");
  }
  const now = new Date();
  const sequence = resolveNextSequence(target);
  const dtstampIso = now.toISOString();
  const dtstampLine = formatUtcForICal(dtstampIso);
  const documentLines = ICAL_HEADER_LINES.slice();
  documentLines.push(...buildICalEventLines(target, { dtstampLine, sequence }));
  documentLines.push("END:VCALENDAR");

  const icsText = joinICalLines(documentLines);
  let updatedRaw = target.rawICalVevent;
  try {
    const ICAL = ensureICAL();
    const parsed = ICAL.parse(icsText);
    const comp = new ICAL.Component(parsed);
    const vevent = comp.getFirstSubcomponent("vevent");
    if (vevent) {
      updatedRaw = vevent.toJSON();
    }
  } catch (parseError) {
    logDebug("Failed to parse generated ICS", parseError);
  }

  const safeName = (target.summary || target.uid || "event").replace(/[\/:*?"<>|]+/g, "_");
  const updatedCandidate = {
    ...target,
    sequence,
    dtstamp: dtstampIso,
    rawICalVevent: updatedRaw
  };
  const nextCandidates = candidates.map((candidate) => (candidate.id === candidateId ? updatedCandidate : candidate));
  persistCandidates(projectId, nextCandidates);

  return {
    icsText,
    filename: `${safeName || "event"}.ics`,
    candidate: updatedCandidate
  };
};

const normalizeCandidateForPersist = (candidate) => {
  if (!candidate || typeof candidate !== "object") return candidate;
  const rawTzid = typeof candidate.tzid === "string" ? candidate.tzid.trim() : "";
  const tzidValue =
    rawTzid && (TZID_PATTERN.test(rawTzid) || CUSTOM_TZID_PATTERN.test(rawTzid)) ? rawTzid : DEFAULT_TZID;
  return {
    ...candidate,
    tzid: tzidValue
  };
};

const replaceCandidatesFromImport = (projectId, importedCandidates, sourceIcsText = null) => {
  const normalized = Array.isArray(importedCandidates)
    ? importedCandidates.map((candidate) => normalizeCandidateForPersist(candidate))
    : importedCandidates;
  persistCandidates(projectId, normalized, sourceIcsText);
};

const apiAddCandidate = async (projectId) => {
  const placeholder = {
    ...createBlankCandidate(),
    candidateId: undefined
  };
  placeholder.candidateId = placeholder.id;
  return runOptimisticUpdate({
    applyLocal: () => {
      const snapshot = captureCandidateSnapshot(projectId);
      localAddCandidate(projectId, placeholder);
      return () => restoreCandidateSnapshot(projectId, snapshot);
    },
    request: () =>
      apiClient.post(`/api/projects/${encodeURIComponent(projectId)}/candidates`, {
        candidate: toCandidateRequestPayload(placeholder)
      }),
    onSuccess: (response) => {
      const mapped = mapApiCandidate(response?.candidate);
      if (!mapped) {
        throw new Error("Failed to create candidate");
      }
      const candidates = projectStore.getCandidates(projectId);
      const next = candidates.map((item) => (item.id === placeholder.id ? mapped : item));
      const exists = next.some((item) => item.id === mapped.id);
      const finalCandidates = exists ? next : next.concat(mapped);
      persistCandidates(projectId, finalCandidates);
      return mapped;
    },
    refetch: () => syncProjectSnapshot(projectId, "candidates_conflict"),
    onConflict: (error) => {
      if (error && error.status === 409) {
        notifyCandidateMutation(projectId, "add", "conflict", error, { candidateId: placeholder.id });
      }
    },
    onError: (error) => {
      notifyCandidateMutation(projectId, "add", "error", error, { candidateId: placeholder.id });
    },
    transformError: (error) => {
      if (error && error.status === 409) {
        error.message = "Candidate creation conflict";
      }
      return error;
    }
  });
};

const apiUpdateCandidate = async (projectId, candidateId, changes = {}) => {
  const existing = findCandidateById(projectId, candidateId);
  if (!existing) {
    throw new Error("Candidate not found");
  }
  let requestPayload = toCandidateRequestPayload({ ...existing, ...changes });
  const expectedVersion = changes?.version ?? existing.version ?? 1;
  return runOptimisticUpdate({
    applyLocal: () => {
      const snapshot = captureCandidateSnapshot(projectId);
      localUpdateCandidate(projectId, candidateId, changes);
      const updated = findCandidateById(projectId, candidateId);
      if (updated) {
        requestPayload = toCandidateRequestPayload(updated);
      }
      return () => restoreCandidateSnapshot(projectId, snapshot);
    },
    request: () =>
      apiClient.put(
        `/api/projects/${encodeURIComponent(projectId)}/candidates/${encodeURIComponent(candidateId)}`,
        {
          version: expectedVersion,
          candidate: requestPayload
        }
      ),
    onSuccess: (response) => {
      const mapped = mapApiCandidate(response?.candidate);
      if (!mapped) {
        throw new Error("Failed to update candidate");
      }
      const candidates = projectStore.getCandidates(projectId);
      const next = candidates.map((item) => (item.id === candidateId ? mapped : item));
      persistCandidates(projectId, next);
      return mapped;
    },
    refetch: () => syncProjectSnapshot(projectId, "candidates_conflict"),
    onConflict: (error) => {
      if (error && error.status === 409) {
        notifyCandidateMutation(projectId, "update", "conflict", error, { candidateId });
      }
    },
    onError: (error) => {
      notifyCandidateMutation(projectId, "update", "error", error, { candidateId });
    },
    transformError: (error) => {
      if (error && error.status === 409) {
        error.message = "Candidate version mismatch";
      }
      return error;
    }
  });
};

const apiRemoveCandidate = async (projectId, candidateId) => {
  const existing = findCandidateById(projectId, candidateId);
  if (!existing) {
    throw new Error("Candidate not found");
  }
  const expectedVersion = existing.version ?? 1;
  return runOptimisticUpdate({
    applyLocal: () => {
      const snapshot = captureCandidateSnapshot(projectId);
      localRemoveCandidate(projectId, candidateId);
      return () => restoreCandidateSnapshot(projectId, snapshot);
    },
    request: () =>
      apiClient.del(
        `/api/projects/${encodeURIComponent(projectId)}/candidates/${encodeURIComponent(candidateId)}`,
        { version: expectedVersion }
      ),
    refetch: () => syncProjectSnapshot(projectId, "candidates_conflict"),
    onConflict: (error) => {
      if (error && error.status === 409) {
        notifyCandidateMutation(projectId, "remove", "conflict", error, { candidateId });
      }
    },
    onError: (error) => {
      notifyCandidateMutation(projectId, "remove", "error", error, { candidateId });
    },
    transformError: (error) => {
      if (error && error.status === 409) {
        error.message = "Candidate removal conflict";
      }
      return error;
    }
  });
};

const addCandidate = (projectId) => apiAddCandidate(projectId);
const updateCandidate = (projectId, candidateId, nextCandidate) =>
  apiUpdateCandidate(projectId, candidateId, nextCandidate);
const removeCandidate = (projectId, candidateId) => apiRemoveCandidate(projectId, candidateId);

module.exports = {
  addCandidate,
  updateCandidate,
  removeCandidate,
  exportAllCandidatesToIcs,
  exportCandidateToIcs,
  createBlankCandidate,
  createCandidateFromVevent,
  replaceCandidatesFromImport
};
const notifyCandidateMutation = (projectId, action, phase, error, meta = {}) => {
  if (!projectId) return;
  emitMutationEvent({
    projectId,
    entity: "candidate",
    action,
    phase,
    error,
    meta
  });
};
