export interface WatchedInterval {
  start: number;
  end: number;
}

export type ReturnType = 'NEW_VIEWER' | 'SAME_SESSION_RETURN' | 'SHORT_RETURN' | 'LONG_RETURN' | 'REWATCH';

export interface ViewerReturnContext {
  viewerId: string;
  contentId: string;
  resumePositionSeconds: number;
  lastWatchedAt?: string;
  timeAwaySeconds: number;
  watchedIntervals: WatchedInterval[];
  watchedSeconds: number;
  progressPercent: number;
  returnType: ReturnType;
  previousSessionId?: string;
  currentSessionId?: string;
  shouldOfferRecap: boolean;
}

export interface ViewerProgress {
  viewerId: string;
  contentId: string;
  positionSeconds: number;
  durationSeconds: number;
  progressPercent: number;
  watchedIntervals: WatchedInterval[];
  lastWatchedAt: string;
  startedAt: string;
  completedAt?: string;
  isCompleted: boolean;
  lastSessionId?: string;
  updatedAt: string;
  version: number;
  // v0.18 return context attributes
  returnType?: ReturnType;
  timeAwaySeconds?: number;
  shouldOfferRecap?: boolean;
}

export interface PlaybackSessionResponse {
  sessionId: string;
  contentId: string;
  resumePositionSeconds: number;
  previousProgress?: ViewerProgress;
  isCompleted: boolean;
  createdAt: string;
  // v0.18 return session intelligence
  returnType: ReturnType;
  timeAwaySeconds: number;
  shouldOfferRecap: boolean;
  returnContext?: ViewerReturnContext;
}

export interface ProgressUpdateRequest {
  sessionId?: string;
  positionSeconds: number;
  durationSeconds?: number;
  watchedInterval?: WatchedInterval;
  watchedIntervals?: WatchedInterval[];
  isEnded?: boolean;
  clientUpdatedAt?: string;
}

export interface ContinueWatchingItem {
  id: string;
  contentId: string;
  title: string;
  description?: string;
  posterUrl?: string;
  runtime?: string;
  genre?: string;
  contentType?: string;
  positionSeconds: number;
  durationSeconds: number;
  progressPercent: number;
  lastWatchedAt: string;
  isCompleted: boolean;
  mediaPlayable: boolean;
  catalogVisible: boolean;
  aiReady: boolean;
  runtimeProvider?: string;
  videoSource?: string;
  // v0.18
  returnType?: ReturnType;
  timeAwaySeconds?: number;
  shouldOfferRecap?: boolean;
}

export interface ViewerHistoryItem extends ContinueWatchingItem {
  startedAt: string;
  completedAt?: string;
  watchedIntervals: WatchedInterval[];
}

export interface ViewerContentMemory {
  viewerId: string;
  contentId: string;
  knownEntityIds: string[];
  knownConceptIds: string[];
  knownEventIds: string[];
  knownFactIds: string[];
  entityConfidence: Record<string, 'seen' | 'partially_seen' | 'not_seen' | 'unknown'>;
  conceptConfidence: Record<string, 'seen' | 'partially_seen' | 'not_seen' | 'unknown'>;
  lastComputedAt: string;
  intelligenceVersion: number;
  viewerTimestamp: number;
}

// ============================================================================
// v0.19 ACCESSIBILITY INTELLIGENCE & ADAPTIVE EXPLANATION
// ============================================================================

export type ExplanationStyle = "standard" | "simple" | "very_simple";
export type Verbosity = "brief" | "normal" | "detailed";

export interface ViewerAccessibilityProfile {
  viewerId: string;
  explanationStyle: ExplanationStyle;
  verbosity: Verbosity;
  jargonSupport: boolean;
  entityReminders: boolean;
  conceptReminders: boolean;
  stepByStep: boolean;
  reducedCognitiveLoad: boolean;
  autoExplainComplexTerms: boolean;
  updatedAt: string;
}

export const DEFAULT_ACCESSIBILITY_PROFILE: Omit<ViewerAccessibilityProfile, "viewerId" | "updatedAt"> = {
  explanationStyle: "standard",
  verbosity: "normal",
  jargonSupport: true,
  entityReminders: true,
  conceptReminders: true,
  stepByStep: false,
  reducedCognitiveLoad: false,
  autoExplainComplexTerms: false,
};

export const ALLOWED_EXPLANATION_STYLES: ExplanationStyle[] = ["standard", "simple", "very_simple"];
export const ALLOWED_VERBOSITIES: Verbosity[] = ["brief", "normal", "detailed"];
