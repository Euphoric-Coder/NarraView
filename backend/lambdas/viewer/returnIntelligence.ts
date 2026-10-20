import { ViewerProgress, WatchedInterval } from './types';

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

/**
 * Authoritative v0.18 Return Classification Thresholds:
 * - same session / very short: < 10 minutes (600 seconds)
 * - short return: 10 minutes – 12 hours (600s – 43200s)
 * - long return: > 12 hours (>= 43200 seconds)
 */
export const THRESHOLDS = {
  SAME_SESSION_MAX_SECONDS: 600, // 10 minutes
  SHORT_RETURN_MAX_SECONDS: 43200 // 12 hours
};

/**
 * Calculates total unique watched seconds from discontinuous intervals.
 */
export function calculateWatchedSeconds(intervals: WatchedInterval[]): number {
  if (!intervals || intervals.length === 0) return 0;
  // Intervals are stored merged and sorted
  return intervals.reduce((acc, curr) => acc + Math.max(0, curr.end - curr.start), 0);
}

/**
 * Classifies a returning viewer session based on progress history and elapsed time away.
 */
export function classifyReturnType(
  progress?: ViewerProgress,
  nowMs: number = Date.now()
): { returnType: ReturnType; timeAwaySeconds: number; watchedSeconds: number } {
  if (!progress || (progress.positionSeconds === 0 && (!progress.watchedIntervals || progress.watchedIntervals.length === 0))) {
    return { returnType: 'NEW_VIEWER', timeAwaySeconds: 0, watchedSeconds: 0 };
  }

  const watchedSeconds = calculateWatchedSeconds(progress.watchedIntervals || []);

  if (progress.isCompleted) {
    const timeAway = progress.completedAt || progress.lastWatchedAt
      ? Math.max(0, Math.floor((nowMs - new Date(progress.completedAt || progress.lastWatchedAt).getTime()) / 1000))
      : 0;
    return { returnType: 'REWATCH', timeAwaySeconds: timeAway, watchedSeconds };
  }

  const lastWatchedMs = progress.lastWatchedAt ? new Date(progress.lastWatchedAt).getTime() : nowMs;
  const timeAwaySeconds = Math.max(0, Math.floor((nowMs - lastWatchedMs) / 1000));

  if (timeAwaySeconds < THRESHOLDS.SAME_SESSION_MAX_SECONDS) {
    return { returnType: 'SAME_SESSION_RETURN', timeAwaySeconds, watchedSeconds };
  }

  if (timeAwaySeconds < THRESHOLDS.SHORT_RETURN_MAX_SECONDS) {
    return { returnType: 'SHORT_RETURN', timeAwaySeconds, watchedSeconds };
  }

  return { returnType: 'LONG_RETURN', timeAwaySeconds, watchedSeconds };
}

/**
 * Deterministically evaluates whether Previously On recap should be offered.
 * Rule:
 * - NEW_VIEWER: never offer recap
 * - SAME_SESSION_RETURN: do not offer recap (< 10 min away)
 * - SHORT_RETURN (10m - 12h): offer recap if viewer has watched >= 30s or progress >= 5%
 * - LONG_RETURN (> 12h): strongly offer recap if viewer has watched >= 20s or progress >= 3%
 * - REWATCH: offer recap if resuming mid-video (> 10s and not starting over)
 */
export function evaluateRecapOffer(
  returnType: ReturnType,
  progress?: ViewerProgress,
  timeAwaySeconds: number = 0
): boolean {
  if (!progress || returnType === 'NEW_VIEWER' || returnType === 'SAME_SESSION_RETURN') {
    return false;
  }

  const position = progress.positionSeconds || 0;
  const percent = progress.progressPercent || 0;
  const watchedSec = calculateWatchedSeconds(progress.watchedIntervals || []);

  if (returnType === 'REWATCH') {
    return position > 10 && !progress.isCompleted;
  }

  if (returnType === 'SHORT_RETURN') {
    return watchedSec >= 30 || percent >= 5 || position >= 30;
  }

  if (returnType === 'LONG_RETURN') {
    return watchedSec >= 20 || percent >= 3 || position >= 20;
  }

  return false;
}

/**
 * Builds the complete ViewerReturnContext for a playback session or progress query.
 */
export function buildViewerReturnContext(
  viewerId: string,
  contentId: string,
  progress?: ViewerProgress,
  currentSessionId?: string,
  nowMs: number = Date.now()
): ViewerReturnContext {
  const { returnType, timeAwaySeconds, watchedSeconds } = classifyReturnType(progress, nowMs);
  const shouldOfferRecap = evaluateRecapOffer(returnType, progress, timeAwaySeconds);

  const context: ViewerReturnContext = {
    viewerId,
    contentId,
    resumePositionSeconds: progress && !progress.isCompleted ? progress.positionSeconds : 0,
    lastWatchedAt: progress?.lastWatchedAt,
    timeAwaySeconds,
    watchedIntervals: progress?.watchedIntervals || [],
    watchedSeconds,
    progressPercent: progress?.progressPercent || 0,
    returnType,
    previousSessionId: progress?.lastSessionId,
    currentSessionId,
    shouldOfferRecap
  };

  console.log('[VIEWER_TELEMETRY] RETURN_SESSION_DETECTED', {
    viewerId,
    contentId,
    returnType,
    timeAwaySeconds,
    shouldOfferRecap,
    resumePositionSeconds: context.resumePositionSeconds
  });

  return context;
}
