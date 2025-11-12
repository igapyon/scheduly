// Copyright (c) Toshiki Iga. All Rights Reserved.

const projectStore = require("../store/project-store");
const sharedIcalUtils = require("../shared/ical-utils");
const { formatDateTimeRangeLabel } = require("../shared/date-utils");

const { DEFAULT_TZID } = sharedIcalUtils;

const normalizeMark = (mark) => {
  const value = typeof mark === "string" ? mark.trim().toLowerCase() : "";
  if (value === "o" || value === "d" || value === "x") return value;
  return "pending";
};

const formatTimestampForDisplay = (isoString) => {
  if (!isoString) return "—";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
};

const buildParticipantLookup = (participants) => {
  const map = new Map();
  (participants || []).forEach((participant, index) => {
    if (!participant || !participant.id) return;
    map.set(participant.id, { participant, index });
  });
  return map;
};

const groupResponsesByCandidate = (responses) => {
  const map = new Map();
  (responses || []).forEach((response) => {
    if (!response || !response.candidateId || !response.participantId) return;
    let participantMap = map.get(response.candidateId);
    if (!participantMap) {
      participantMap = new Map();
      map.set(response.candidateId, participantMap);
    }
    participantMap.set(response.participantId, response);
  });
  return map;
};

const groupResponsesByParticipant = (responses) => {
  const map = new Map();
  (responses || []).forEach((response) => {
    if (!response || !response.participantId) return;
    let participantMap = map.get(response.participantId);
    if (!participantMap) {
      participantMap = new Map();
      map.set(response.participantId, participantMap);
    }
    participantMap.set(response.candidateId, response);
  });
  return map;
};

const scheduleViewFromState = (state, tallies) => {
  const participants = Array.isArray(state.participants) ? state.participants : [];
  const participantLookup = buildParticipantLookup(participants);
  const responsesByCandidate = groupResponsesByCandidate(state.responses || []);

  const summaries = (state.candidates || []).map((candidate) => {
    const rangeLabel = formatDateTimeRangeLabel(candidate.dtstart, candidate.dtend, candidate.tzid || DEFAULT_TZID);
    const counts = { o: 0, d: 0, x: 0, pending: 0 };
    const detailed = [];
    const respondedIds = new Set();
    const participantResponseMap = responsesByCandidate.get(candidate.id) || new Map();
    let respondedCount = 0;
    const tallyEntry = tallies.candidates?.[candidate.id];
    if (tallyEntry && typeof tallyEntry === "object") {
      counts.o = tallyEntry.o ?? counts.o;
      counts.d = tallyEntry.d ?? counts.d;
      counts.x = tallyEntry.x ?? counts.x;
      counts.pending = tallyEntry.pending ?? counts.pending;
    }
    participantResponseMap.forEach((response) => {
      respondedCount += 1;
      const mark = normalizeMark(response.mark);
      if (!tallyEntry || typeof tallyEntry !== "object") {
        if (mark === "o" || mark === "d" || mark === "x") {
          counts[mark] += 1;
        } else {
          counts.pending += 1;
        }
      }
      const participantEntry = participantLookup.get(response.participantId);
      const participant = participantEntry?.participant;
      const rawComment = typeof response.comment === "string" ? response.comment : "";
      const trimmedComment = rawComment.trim();
      const hasComment = trimmedComment.length > 0;
      detailed.push({
        participantId: response.participantId,
        participantToken: participant?.token ? String(participant.token) : "",
        name: participant?.displayName || "参加者",
        order: participantEntry?.index ?? Number.MAX_SAFE_INTEGER,
        mark,
        comment: hasComment ? `コメント: ${trimmedComment}` : "コメント: 入力なし",
        commentRaw: rawComment,
        hasComment,
        updatedAt: response.updatedAt || ""
      });
      respondedIds.add(response.participantId);
    });

    if (!tallyEntry || typeof tallyEntry !== "object") {
      const unmatchedCount = Math.max(0, participants.length - respondedCount);
      if (unmatchedCount > 0) {
        counts.pending += unmatchedCount;
      }
    }

    participants.forEach((participant, index) => {
      if (!participant || respondedIds.has(participant.id)) return;
      detailed.push({
        participantId: participant.id,
        participantToken: participant.token ? String(participant.token) : "",
        name: participant.displayName || "参加者",
        order: index,
        mark: "pending",
        comment: "コメント: 入力なし",
        commentRaw: "",
        hasComment: false,
        updatedAt: ""
      });
    });

    detailed.sort((a, b) => {
      if (a.order === b.order) return (a.name || "").localeCompare(b.name || "", "ja");
      return a.order - b.order;
    });

    return {
      id: candidate.id,
      uid: candidate.uid,
      summary: candidate.summary || "タイトル未設定",
      label: candidate.summary || "タイトル未設定",
      rangeLabel,
      dtstart: candidate.dtstart,
      dtend: candidate.dtend,
      location: candidate.location || "",
      description: candidate.description || "",
      status: candidate.status || "TENTATIVE",
      tzid: candidate.tzid || DEFAULT_TZID,
      counts,
      responses: detailed
    };
  });

  summaries.sort((a, b) => {
    const aTime = a.dtstart ? new Date(a.dtstart).getTime() : Number.POSITIVE_INFINITY;
    const bTime = b.dtstart ? new Date(b.dtstart).getTime() : Number.POSITIVE_INFINITY;
    if (aTime === bTime) {
      return (a.summary || "").localeCompare(b.summary || "", "ja");
    }
    return aTime - bTime;
  });

  return summaries;
};

const participantViewFromState = (state) => {
  const rawParticipants = Array.isArray(state.participants) ? state.participants : [];
  const participants = [];
  const seenIds = new Set();
  rawParticipants.forEach((participant) => {
    if (!participant || typeof participant !== "object") return;
    if (!participant.id) {
      participants.push(participant);
      return;
    }
    if (seenIds.has(participant.id)) return;
    seenIds.add(participant.id);
    participants.push(participant);
  });
  const candidates = Array.isArray(state.candidates) ? state.candidates : [];
  const responsesByParticipant = groupResponsesByParticipant(state.responses || []);

  return participants.map((participant) => {
    const candidateMap = responsesByParticipant.get(participant.id) || new Map();
    const responsesForParticipant = candidates.map((candidate) => {
      const response = candidateMap.get(candidate.id);
      const mark = normalizeMark(response?.mark);
      const rawComment = typeof response?.comment === "string" ? response.comment : "";
      const trimmedComment = rawComment.trim();
      const hasComment = trimmedComment.length > 0;
      return {
        scheduleId: candidate.id,
        datetime: formatDateTimeRangeLabel(candidate.dtstart, candidate.dtend, candidate.tzid || DEFAULT_TZID),
        mark,
        hasComment,
        comment: hasComment ? `コメント: ${trimmedComment}` : "コメント: 入力なし",
        commentRaw: rawComment,
        dtstart: candidate.dtstart,
        dtend: candidate.dtend,
        tzid: candidate.tzid || DEFAULT_TZID,
        summary: candidate.summary || candidate.label || "タイトル未設定",
        location: candidate.location || "",
        description: candidate.description || "",
        status: candidate.status || "TENTATIVE",
        updatedAt: response?.updatedAt || ""
      };
    });
    const commentCount = responsesForParticipant.reduce((acc, item) => (item.hasComment ? acc + 1 : acc), 0);
    const commentHighlights =
      commentCount > 0 ? [`(${commentCount}件のコメントあり)`] : ["(コメントなし)"];
    return {
      id: participant.id,
      token: typeof participant.token === "string" ? participant.token : "",
      name: participant.displayName || "参加者",
      email: participant.email || "",
      comment: participant.comment || "",
      responses: responsesForParticipant,
      commentCount,
      commentHighlights,
      lastUpdated: formatTimestampForDisplay(participant.updatedAt)
    };
  });
};

const buildScheduleView = (projectId, options = {}) => {
  const state = options.state || projectStore.getProjectStateSnapshot(projectId);
  const tallies = options.tallies || projectStore.getTallies(projectId);
  return scheduleViewFromState(state, tallies);
};

const buildParticipantView = (projectId, options = {}) => {
  const state = options.state || projectStore.getProjectStateSnapshot(projectId);
  return participantViewFromState(state);
};

module.exports = {
  buildScheduleView,
  buildParticipantView
};
