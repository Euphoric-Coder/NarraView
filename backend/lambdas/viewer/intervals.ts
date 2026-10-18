import { WatchedInterval } from './types';

/**
 * Merges a new watched interval into an existing list of non-overlapping,
 * sorted intervals. Overlapping and adjacent intervals within tolerance are merged.
 */
export function mergeIntervals(
  existing: WatchedInterval[] = [],
  newInterval?: WatchedInterval | null,
  tolerance: number = 2.0
): WatchedInterval[] {
  if (!newInterval) {
    return normalizeIntervals(existing, tolerance);
  }

  const start = typeof newInterval.start === 'number' ? newInterval.start : NaN;
  const end = typeof newInterval.end === 'number' ? newInterval.end : NaN;

  if (isNaN(start) || isNaN(end) || end <= start) {
    return normalizeIntervals(existing, tolerance);
  }

  const validNew: WatchedInterval = {
    start: Math.max(0, Math.round(start * 10) / 10),
    end: Math.max(0, Math.round(end * 10) / 10)
  };

  if (validNew.end <= validNew.start) {
    return normalizeIntervals(existing, tolerance);
  }

  return normalizeIntervals([...existing, validNew], tolerance);
}

/**
 * Merges a list of new intervals into an existing list.
 */
export function mergeMultipleIntervals(
  existing: WatchedInterval[] = [],
  newIntervals: WatchedInterval[] = [],
  tolerance: number = 2.0
): WatchedInterval[] {
  let result = normalizeIntervals(existing, tolerance);
  for (const interval of newIntervals) {
    result = mergeIntervals(result, interval, tolerance);
  }
  return result;
}

/**
 * Normalizes, sorts and merges overlapping / adjacent intervals.
 */
export function normalizeIntervals(
  intervals: WatchedInterval[] = [],
  tolerance: number = 2.0
): WatchedInterval[] {
  if (!Array.isArray(intervals) || intervals.length === 0) {
    return [];
  }

  // Filter valid intervals
  const valid = intervals
    .filter(i => i && typeof i.start === 'number' && typeof i.end === 'number' && !isNaN(i.start) && !isNaN(i.end) && i.end > i.start)
    .map(i => ({
      start: Math.max(0, Math.round(i.start * 10) / 10),
      end: Math.max(0, Math.round(i.end * 10) / 10)
    }))
    .filter(i => i.end > i.start);

  if (valid.length === 0) {
    return [];
  }

  // Sort by start ascending
  valid.sort((a, b) => a.start - b.start);

  const merged: WatchedInterval[] = [];
  for (const current of valid) {
    if (merged.length === 0) {
      merged.push({ ...current });
      continue;
    }

    const prev = merged[merged.length - 1];
    // Check overlap or within tolerance
    if (current.start <= prev.end + tolerance) {
      prev.end = Math.max(prev.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}

/**
 * Returns true if a specific point in time falls inside any watched interval.
 */
export function isPointInIntervals(intervals: WatchedInterval[], point: number): boolean {
  if (!Array.isArray(intervals) || intervals.length === 0) return false;
  return intervals.some(interval => point >= interval.start && point <= interval.end);
}

/**
 * Calculates total seconds covered by watched intervals.
 */
export function calculateWatchedSeconds(intervals: WatchedInterval[]): number {
  if (!Array.isArray(intervals) || intervals.length === 0) return 0;
  const merged = normalizeIntervals(intervals);
  const total = merged.reduce((acc, curr) => acc + (curr.end - curr.start), 0);
  return Math.round(total * 10) / 10;
}

/**
 * Determines whether a given segment [start, end] is covered by watched intervals.
 * Returns overlap percentage (0.0 - 1.0).
 */
export function getIntervalOverlapPercent(
  intervals: WatchedInterval[],
  segStart: number,
  segEnd: number
): number {
  if (segEnd <= segStart) return 0;
  const segDuration = segEnd - segStart;
  let watchedTimeInSeg = 0;

  for (const interval of intervals) {
    const overlapStart = Math.max(segStart, interval.start);
    const overlapEnd = Math.min(segEnd, interval.end);
    if (overlapEnd > overlapStart) {
      watchedTimeInSeg += (overlapEnd - overlapStart);
    }
  }

  return Math.min(1.0, watchedTimeInSeg / segDuration);
}
