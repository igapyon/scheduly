// Copyright (c) Toshiki Iga. All Rights Reserved.

const projectStore = require("../store/project-store");

const normalizeMark = (mark) => {
  const value = typeof mark === "string" ? mark.trim().toLowerCase() : "";
  if (value === "o" || value === "d" || value === "x") {
    return value;
  }
  return "pending";
};

const buildCandidateTallies = (state) => {
  const result = {};
  const participants = Array.isArray(state.participants) ? state.participants : [];
  const participantCount = participants.length;
  const responses = Array.isArray(state.responses) ? state.responses : [];
  const responsesByCandidate = new Map();

  responses.forEach((response) => {
    if (!response || !response.candidateId) return;
    const normalized = normalizeMark(response.mark);
    if (!responsesByCandidate.has(response.candidateId)) {
      responsesByCandidate.set(response.candidateId, []);
    }
    responsesByCandidate.get(response.candidateId).push({ ...response, mark: normalized });
  });

  (state.candidates || []).forEach((candidate) => {
    if (!candidate || !candidate.id) return;
    const candidateResponses = responsesByCandidate.get(candidate.id) || [];
    const tally = { o: 0, d: 0, x: 0, pending: 0, total: participantCount };
    candidateResponses.forEach((response) => {
      if (response.mark === "o" || response.mark === "d" || response.mark === "x") {
        tally[response.mark] += 1;
      } else {
        tally.pending += 1;
      }
    });
    const responded = candidateResponses.length;
    const pendingCount = participantCount - responded;
    tally.pending += pendingCount > 0 ? pendingCount : 0;
    result[candidate.id] = {
      ...tally,
      updatedAt: new Date().toISOString()
    };
  });

  return result;
};

const buildParticipantTallies = (state) => {
  const result = {};
  const responses = Array.isArray(state.responses) ? state.responses : [];
  const responsesByParticipant = new Map();
  responses.forEach((response) => {
    if (!response || !response.participantId) return;
    const list = responsesByParticipant.get(response.participantId) || [];
    list.push(response);
    responsesByParticipant.set(response.participantId, list);
  });
  (state.participants || []).forEach((participant) => {
    if (!participant || !participant.id) return;
    const participantResponses = responsesByParticipant.get(participant.id) || [];
    result[participant.id] = {
      responded: participantResponses.length,
      updatedAt: new Date().toISOString()
    };
  });
  return result;
};

const recalculate = (projectId, candidateId = null) => {
  const snapshot = projectStore.getProjectStateSnapshot(projectId);
  if (!snapshot) return projectStore.getTallies(projectId);
  const candidateTallies = buildCandidateTallies(snapshot);
  if (candidateId && candidateTallies[candidateId]) {
    const currentTallies = projectStore.getTallies(projectId);
    const nextTallies = {
      ...currentTallies,
      candidates: {
        ...currentTallies.candidates,
        [candidateId]: candidateTallies[candidateId]
      },
      participants: {
        ...currentTallies.participants,
        ...buildParticipantTallies(snapshot)
      }
    };
    projectStore.replaceTallies(projectId, nextTallies);
    return nextTallies;
  }

  const participantTallies = buildParticipantTallies(snapshot);
  const nextTallies = {
    candidates: candidateTallies,
    participants: participantTallies
  };
  projectStore.replaceTallies(projectId, nextTallies);
  return nextTallies;
};

module.exports = {
  recalculate
};
