export type TemporalMode = 'ask' | 'previously_on' | 'recap' | 'explain_simple' | 'learn';

export interface SafeFact {
  id: string;
  statement: string;
  revealTime: number;
  evidenceTranscriptIndices: number[];
  origin?: string;
  segmentId?: string;
}

export interface SafeEvent {
  id: string;
  description: string;
  revealTime: number;
  importance?: string;
  evidenceTranscriptIndices: number[];
  segmentId?: string;
}

export interface SafeEntity {
  id: string;
  name: string;
  entityType: string;
  description: string;
  aliases: string[];
  firstKnownAt: number;
  evidenceTranscriptIndices: number[];
}

export interface SafePerson {
  id: string;
  name: string;
  role: string;
  description: string;
  aliases: string[];
  firstKnownAt: number;
  evidenceTranscriptIndices: number[];
}

export interface SafeConcept {
  id: string;
  name: string;
  description: string;
  aliases: string[];
  firstKnownAt: number;
  evidenceTranscriptIndices: number[];
}

export interface SafeRelationship {
  id: string;
  sourceId: string;
  targetId: string;
  predicate: string;
  description?: string;
  revealTime: number;
  evidenceTranscriptIndices: number[];
}

export interface SafeSegment {
  segmentId: string;
  startTime: number;
  endTime: number;
  title: string;
  summary: string;
  isCurrent: boolean;
}

export interface TemporalSnapshot {
  contentId: string;
  title: string;
  viewerTimestamp: number;
  unlockedFacts: SafeFact[];
  unlockedEvents: SafeEvent[];
  unlockedEntities: SafeEntity[];
  unlockedPeople: SafePerson[];
  unlockedConcepts: SafeConcept[];
  unlockedRelationships: SafeRelationship[];
  unlockedSegments: SafeSegment[];
  maxRevealTimeUsed: number;
}

export interface Citation {
  type: 'fact' | 'event' | 'entity' | 'person' | 'concept' | 'relationship' | 'segment';
  id: string;
  segmentId?: string;
  revealTime: number;
  evidenceTranscriptIndices?: number[];
  textSnippet?: string;
}

export interface RetrievalDocument {
  id: string;
  type: Citation['type'];
  text: string;
  revealTime: number;
  segmentId?: string;
  evidenceTranscriptIndices: number[];
  aliases?: string[];
  relevanceScore?: number;
}

export interface PremiseCheckResult {
  valid: boolean;
  reason?: string;
  safeResponse?: string;
}

export interface GroundingCheckResult {
  valid: boolean;
  violations: string[];
  safeFallback?: string;
  parsedResponse?: any;
}

export interface TemporalRagRequest {
  contentId: string;
  viewerTimestamp: number;
  timestamp?: number; // backwards compatibility alias
  mode?: TemporalMode;
  question?: string;
  requestId?: string;
  topic?: string;
  viewerId?: string;
  watchedIntervals?: Array<{ start: number; end: number }>;
}

export interface TemporalRagResponse {
  requestId: string;
  contentId: string;
  viewerTimestamp: number;
  mode: TemporalMode;
  answer?: string;
  recap?: string;
  takeaway?: string;
  question?: string;
  options?: { id: string; text: string }[];
  correctOptionId?: string;
  explanation?: string;
  citations: Citation[];
  safety: {
    spoilerSafe: boolean;
    maxRevealTimeUsed: number;
    groundingPassed: boolean;
    premiseValidated: boolean;
  };
  intelligenceVersion: number;
  aiReady?: boolean;
  latencyMs?: number;
}
