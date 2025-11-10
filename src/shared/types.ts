export type ShareTokenType = "admin" | "participant";

export interface ShareTokenEntry {
  token: string;
  url: string;
  issuedAt: string;
  revokedAt?: string;
  lastGeneratedBy?: string;
}

export interface ShareTokens {
  admin?: ShareTokenEntry;
  participant?: ShareTokenEntry;
  version?: number;
}

export interface VersionState {
  metaVersion: number;
  candidatesVersion: number;
  candidatesListVersion: number;
  participantsVersion: number;
  responsesVersion: number;
  shareTokensVersion: number;
}

export interface ProjectMeta {
  projectId: string;
  name: string;
  description: string;
  defaultTzid: string;
  createdAt: string;
  updatedAt: string;
  demoSeedOptOut?: boolean;
}

export type CandidateStatus = "CONFIRMED" | "TENTATIVE" | "CANCELLED";

export interface ScheduleCandidate {
  candidateId?: string;
  id?: string;
  uid?: string;
  summary: string;
  description: string;
  location: string;
  status: CandidateStatus;
  dtstart: string;
  dtend: string;
  tzid: string;
  sequence: number;
  dtstamp: string;
  createdAt?: string;
  updatedAt?: string;
  version?: number;
}

export interface Participant {
  participantId?: string;
  id?: string;
  displayName: string;
  email: string;
  status: "active" | "archived";
  token?: string;
  comment?: string;
  createdAt?: string;
  updatedAt?: string;
  version?: number;
}

export type ResponseMark = "o" | "d" | "x" | "pending";

export interface ParticipantResponse {
  responseId?: string;
  id?: string;
  participantId: string;
  candidateId: string;
  mark: ResponseMark;
  comment: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface CandidateTally {
  o: number;
  d: number;
  x: number;
  total: number;
}

export interface ResponsesSummary {
  candidates: Array<{ candidateId: string; tally: CandidateTally }>;
  participants: Array<{ participantId: string; tally: CandidateTally }>;
}

export interface ProjectSnapshot {
  project: ProjectMeta;
  candidates: ScheduleCandidate[];
  participants: Participant[];
  responses: ParticipantResponse[];
  shareTokens: ShareTokens;
  versions: VersionState;
}

export interface ApiErrorResponse {
  code: number;
  message: string;
  fields?: string[];
  conflict?: unknown;
  meta?: unknown;
}

export type Versioned<T> = T & { version: number };
