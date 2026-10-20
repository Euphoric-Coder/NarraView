import { TemporalSnapshot } from './types';

export type MemoryConfidence = 'seen' | 'partially_seen' | 'not_seen' | 'unknown';

export interface WatchedInterval {
  start: number;
  end: number;
}

export interface ViewerContentMemory {
  viewerId: string;
  contentId: string;
  knownEntityIds: string[];
  knownConceptIds: string[];
  knownEventIds: string[];
  knownFactIds: string[];
  entityConfidence: Record<string, MemoryConfidence>;
  conceptConfidence: Record<string, MemoryConfidence>;
  lastComputedAt: string;
  intelligenceVersion: number;
  viewerTimestamp: number;
  maxRevealTimeUsed: number;
}

/**
 * Checks whether a given timestamp intersects with any watched interval.
 * Returns:
 * - 'seen': strictly within [start - 0.5s, end + 0.5s]
 * - 'partially_seen': within 2.0s of an interval boundary
 * - 'not_seen': outside watched intervals
 */
export function evaluateIntervalConfidence(
  timestamp: number,
  intervals: WatchedInterval[]
): MemoryConfidence {
  if (!intervals || intervals.length === 0) {
    return 'not_seen';
  }

  for (const interval of intervals) {
    if (timestamp >= (interval.start - 0.5) && timestamp <= (interval.end + 0.5)) {
      return 'seen';
    }
    // Boundary proximity
    if (
      (timestamp >= (interval.start - 2.0) && timestamp < (interval.start - 0.5)) ||
      (timestamp > (interval.end + 0.5) && timestamp <= (interval.end + 2.0))
    ) {
      return 'partially_seen';
    }
  }

  return 'not_seen';
}

/**
 * Derives viewer memory deterministically from the safe temporal snapshot and watched intervals.
 * Absolute rule: Snapshot is ALREADY temporally filtered (revealTime <= viewerTimestamp).
 */
export function deriveViewerMemory(
  snapshot: TemporalSnapshot,
  watchedIntervals: WatchedInterval[] = [],
  version: number = 1,
  viewerId: string = 'anonymous'
): ViewerContentMemory {
  const entityConfidence: Record<string, MemoryConfidence> = {};
  const conceptConfidence: Record<string, MemoryConfidence> = {};
  const knownEntityIds: string[] = [];
  const knownConceptIds: string[] = [];
  const knownEventIds: string[] = [];
  const knownFactIds: string[] = [];

  let maxRevealTime = 0;

  // 1. Entities
  for (const entity of snapshot.unlockedEntities) {
    const conf = evaluateIntervalConfidence(entity.firstKnownAt, watchedIntervals);
    entityConfidence[entity.id] = conf;
    if (conf === 'seen' || conf === 'partially_seen') {
      knownEntityIds.push(entity.id);
      if (entity.firstKnownAt > maxRevealTime) maxRevealTime = entity.firstKnownAt;
    }
  }

  // 2. Concepts
  for (const concept of snapshot.unlockedConcepts) {
    const conf = evaluateIntervalConfidence(concept.firstKnownAt, watchedIntervals);
    conceptConfidence[concept.id] = conf;
    if (conf === 'seen' || conf === 'partially_seen') {
      knownConceptIds.push(concept.id);
      if (concept.firstKnownAt > maxRevealTime) maxRevealTime = concept.firstKnownAt;
    }
  }

  // 3. Events
  for (const event of snapshot.unlockedEvents) {
    const conf = evaluateIntervalConfidence(event.revealTime, watchedIntervals);
    if (conf === 'seen' || conf === 'partially_seen') {
      knownEventIds.push(event.id);
      if (event.revealTime > maxRevealTime) maxRevealTime = event.revealTime;
    }
  }

  // 4. Facts
  for (const fact of snapshot.unlockedFacts) {
    const conf = evaluateIntervalConfidence(fact.revealTime, watchedIntervals);
    if (conf === 'seen' || conf === 'partially_seen') {
      knownFactIds.push(fact.id);
      if (fact.revealTime > maxRevealTime) maxRevealTime = fact.revealTime;
    }
  }

  const memory: ViewerContentMemory = {
    viewerId,
    contentId: snapshot.contentId,
    knownEntityIds,
    knownConceptIds,
    knownEventIds,
    knownFactIds,
    entityConfidence,
    conceptConfidence,
    lastComputedAt: new Date().toISOString(),
    intelligenceVersion: version,
    viewerTimestamp: snapshot.viewerTimestamp,
    maxRevealTimeUsed: maxRevealTime
  };

  console.log('[VIEWER_TELEMETRY] VIEWER_MEMORY_DERIVED', {
    viewerId,
    contentId: snapshot.contentId,
    knownEntities: knownEntityIds.length,
    knownConcepts: knownConceptIds.length,
    knownEvents: knownEventIds.length,
    viewerTimestamp: snapshot.viewerTimestamp,
    version
  });

  return memory;
}

/**
 * Intersects an existing or cached ViewerMemory with the current safe snapshot.
 * MANDATORY SEEK-BACK SAFETY (Part M, Sections 34 & 35):
 * EffectiveMemory = ViewerMemory ∩ SafeSnapshot(currentTimestamp)
 * If currentTimestamp < memory.viewerTimestamp, any item with revealTime > currentTimestamp is strictly purged.
 */
export function intersectMemoryWithSafeSnapshot(
  memory: ViewerContentMemory,
  currentSafeSnapshot: TemporalSnapshot
): ViewerContentMemory {
  const currentTimestamp = currentSafeSnapshot.viewerTimestamp;
  const safeEntityMap = new Map(currentSafeSnapshot.unlockedEntities.map(e => [e.id, e]));
  const safeConceptMap = new Map(currentSafeSnapshot.unlockedConcepts.map(c => [c.id, c]));
  const safeEventMap = new Map(currentSafeSnapshot.unlockedEvents.map(e => [e.id, e]));
  const safeFactMap = new Map(currentSafeSnapshot.unlockedFacts.map(f => [f.id, f]));

  const effectiveEntityIds = memory.knownEntityIds.filter(id => safeEntityMap.has(id));
  const effectiveConceptIds = memory.knownConceptIds.filter(id => safeConceptMap.has(id));
  const effectiveEventIds = memory.knownEventIds.filter(id => safeEventMap.has(id));
  const effectiveFactIds = memory.knownFactIds.filter(id => safeFactMap.has(id));

  const filteredEntityConfidence: Record<string, MemoryConfidence> = {};
  for (const id of Object.keys(memory.entityConfidence)) {
    if (safeEntityMap.has(id)) {
      filteredEntityConfidence[id] = memory.entityConfidence[id];
    }
  }

  const filteredConceptConfidence: Record<string, MemoryConfidence> = {};
  for (const id of Object.keys(memory.conceptConfidence)) {
    if (safeConceptMap.has(id)) {
      filteredConceptConfidence[id] = memory.conceptConfidence[id];
    }
  }

  // Calculate max reveal time among effective items
  let effectiveMaxReveal = 0;
  for (const id of effectiveEntityIds) {
    const e = safeEntityMap.get(id);
    if (e && e.firstKnownAt > effectiveMaxReveal) effectiveMaxReveal = e.firstKnownAt;
  }
  for (const id of effectiveConceptIds) {
    const c = safeConceptMap.get(id);
    if (c && c.firstKnownAt > effectiveMaxReveal) effectiveMaxReveal = c.firstKnownAt;
  }
  for (const id of effectiveEventIds) {
    const ev = safeEventMap.get(id);
    if (ev && ev.revealTime > effectiveMaxReveal) effectiveMaxReveal = ev.revealTime;
  }
  for (const id of effectiveFactIds) {
    const f = safeFactMap.get(id);
    if (f && f.revealTime > effectiveMaxReveal) effectiveMaxReveal = f.revealTime;
  }

  // Invariant verification: effectiveMaxReveal MUST NOT exceed currentTimestamp
  if (effectiveMaxReveal > currentTimestamp + 0.001) {
    throw new Error(`Temporal Invariant Violated: effectiveMaxReveal (${effectiveMaxReveal}) > currentTimestamp (${currentTimestamp})`);
  }

  console.log('[VIEWER_TELEMETRY] MEMORY_TEMPORAL_INTERSECTION', {
    viewerId: memory.viewerId,
    contentId: memory.contentId,
    currentTimestamp,
    priorKnownCount: memory.knownEntityIds.length + memory.knownConceptIds.length,
    effectiveCount: effectiveEntityIds.length + effectiveConceptIds.length,
    effectiveMaxReveal
  });

  return {
    viewerId: memory.viewerId,
    contentId: memory.contentId,
    knownEntityIds: effectiveEntityIds,
    knownConceptIds: effectiveConceptIds,
    knownEventIds: effectiveEventIds,
    knownFactIds: effectiveFactIds,
    entityConfidence: filteredEntityConfidence,
    conceptConfidence: filteredConceptConfidence,
    lastComputedAt: new Date().toISOString(),
    intelligenceVersion: memory.intelligenceVersion,
    viewerTimestamp: currentTimestamp,
    maxRevealTimeUsed: effectiveMaxReveal
  };
}
