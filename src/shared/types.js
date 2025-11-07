/**
 * @typedef {"admin" | "participant"} ShareTokenType
 */

/**
 * @typedef {Object} ShareTokenEntry
 * @property {string} token
 * @property {string} url
 * @property {string} issuedAt
 * @property {string} [revokedAt]
 * @property {string} [lastGeneratedBy]
 */

/**
 * @typedef {Object} ShareTokens
 * @property {ShareTokenEntry} [admin]
 * @property {ShareTokenEntry} [participant]
 * @property {number} [version]
 */

/**
 * @typedef {Object} VersionState
 * @property {number} metaVersion
 * @property {number} candidatesVersion
 * @property {number} candidatesListVersion
 * @property {number} participantsVersion
 * @property {number} responsesVersion
 * @property {number} shareTokensVersion
 */

/**
 * @typedef {Object} ProjectMeta
 * @property {string} projectId
 * @property {string} name
 * @property {string} description
 * @property {string} defaultTzid
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {boolean} [demoSeedOptOut]
 */

/**
 * @typedef {"CONFIRMED" | "TENTATIVE" | "CANCELLED"} CandidateStatus
 */

/**
 * @typedef {Object} ScheduleCandidate
 * @property {string} candidateId
 * @property {string} [uid]
 * @property {string} summary
 * @property {string} description
 * @property {string} location
 * @property {CandidateStatus} status
 * @property {string} dtstart
 * @property {string} dtend
 * @property {string} tzid
 * @property {number} sequence
 * @property {string} dtstamp
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {number} version
 */

/**
 * @typedef {Object} Participant
 * @property {string} participantId
 * @property {string} displayName
 * @property {string} email
 * @property {"active" | "archived"} status
 * @property {string} token
 * @property {string} [comment]
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {number} version
 */

/**
 * @typedef {"o" | "d" | "x"} ResponseMark
 */

/**
 * @typedef {Object} ParticipantResponse
 * @property {string} responseId
 * @property {string} participantId
 * @property {string} candidateId
 * @property {ResponseMark} mark
 * @property {string} comment
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {number} version
 */

/**
 * @typedef {Object} CandidateTally
 * @property {number} o
 * @property {number} d
 * @property {number} x
 * @property {number} total
 */

/**
 * @typedef {Object} ResponsesSummary
 * @property {Array<{candidateId: string, tally: CandidateTally}>} candidates
 * @property {Array<{participantId: string, tallies: CandidateTally}>} participants
 */

/**
 * @typedef {Object} ProjectSnapshot
 * @property {ProjectMeta} project
 * @property {ScheduleCandidate[]} candidates
 * @property {Participant[]} participants
 * @property {ParticipantResponse[]} responses
 * @property {ShareTokens} shareTokens
 * @property {VersionState} versions
 */

/**
 * @typedef {Object} ApiErrorResponse
 * @property {number} code
 * @property {string} message
 * @property {string[]} [fields]
 * @property {unknown} [conflict]
 * @property {unknown} [meta]
 */

module.exports = {};
