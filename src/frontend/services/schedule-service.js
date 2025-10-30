// Copyright (c) Toshiki Iga. All Rights Reserved.

const sharedIcalUtils = require("../shared/ical-utils");
const projectStore = require("../store/project-store");
const tallyService = require("./tally-service");

const {
  DEFAULT_TZID,
  ensureICAL
} = sharedIcalUtils;

const logDebug = sharedIcalUtils.createLogger("schedule-service");

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

const addCandidate = (projectId) => {
  const existing = projectStore.getCandidates(projectId);
  const candidate = createBlankCandidate();
  candidate.sequence = existing.length;
  const nextCandidates = existing.concat(candidate);
  persistCandidates(projectId, nextCandidates);
  return candidate;
};

const updateCandidate = (projectId, candidateId, nextCandidate) => {
  const existing = projectStore.getCandidates(projectId);
  const nextCandidates = existing.map((candidate) => (candidate.id === candidateId ? { ...candidate, ...nextCandidate } : candidate));
  persistCandidates(projectId, nextCandidates);
};

const removeCandidate = (projectId, candidateId) => {
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

const replaceCandidatesFromImport = (projectId, importedCandidates, sourceIcsText = null) => {
  persistCandidates(projectId, importedCandidates, sourceIcsText);
};

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
