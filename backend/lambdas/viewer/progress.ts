import { ViewerProgress } from './types';

export const COMPLETION_PERCENT_THRESHOLD = 90.0;
export const COMPLETION_REMAINING_SECONDS_THRESHOLD = 30.0;
export const CONTINUE_WATCHING_MIN_POSITION = 5.0;

/**
 * Validates, sanitizes and clamps playback position.
 */
export function validatePosition(pos: any, duration?: number): number {
  if (typeof pos !== 'number' || isNaN(pos) || !isFinite(pos)) {
    return 0;
  }
  const cleanPos = Math.max(0, pos);
  if (typeof duration === 'number' && duration > 0 && isFinite(duration)) {
    return Math.min(cleanPos, duration);
  }
  return cleanPos;
}

/**
 * Derives authoritative progress percent clamped to [0, 100] with 1 decimal precision.
 */
export function calculateProgressPercent(pos: number, duration?: number): number {
  if (!duration || duration <= 0 || isNaN(duration)) {
    return 0;
  }
  const pct = (pos / duration) * 100;
  const clamped = Math.min(100, Math.max(0, pct));
  return Math.round(clamped * 10) / 10;
}

/**
 * Evaluates completion based on:
 * 1. Explicit media end event (isEnded === true)
 * 2. Progress percentage >= 90%
 * 3. Remaining duration <= 30s (when total duration > 30s)
 */
export function evaluateCompletion(
  pos: number,
  duration?: number,
  isEnded?: boolean
): boolean {
  if (isEnded === true) {
    return true;
  }

  if (!duration || duration <= 0) {
    return false;
  }

  const percent = calculateProgressPercent(pos, duration);
  if (percent >= COMPLETION_PERCENT_THRESHOLD) {
    return true;
  }

  if (duration > 30 && (duration - pos) <= COMPLETION_REMAINING_SECONDS_THRESHOLD) {
    return true;
  }

  return false;
}

/**
 * Determines whether a title qualifies for the viewer's Continue Watching rail.
 */
export function isEligibleForContinueWatching(
  progress: ViewerProgress,
  contentItem?: any
): boolean {
  if (!progress || progress.isCompleted) {
    return false;
  }

  if (progress.positionSeconds < CONTINUE_WATCHING_MIN_POSITION) {
    return false;
  }

  if (contentItem) {
    if (contentItem.catalogVisible === false) {
      return false;
    }
    if (contentItem.mediaPlayable === false) {
      return false;
    }
  }

  return true;
}
