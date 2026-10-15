import { 
  TemporalSnapshot, 
  SafeFact, 
  SafeEvent, 
  SafeEntity, 
  SafePerson, 
  SafeConcept, 
  SafeRelationship, 
  SafeSegment 
} from './types';

/**
 * Binary search to find the greatest index in sorted revealPoints where point.time <= viewerTimestamp.
 * Returns -1 if no reveal point qualifies.
 */
export function findLastRevealPointIndex(revealPoints: Array<{ time: number }>, viewerTimestamp: number): number {
  if (!revealPoints || revealPoints.length === 0) return -1;
  let low = 0;
  let high = revealPoints.length - 1;
  let result = -1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (revealPoints[mid].time <= viewerTimestamp) {
      result = mid;
      low = mid + 1; // Try to find a later point that also satisfies the condition
    } else {
      high = mid - 1;
    }
  }

  return result;
}

/**
 * Builds a strictly bounded, spoiler-free temporal snapshot of knowledge available
 * at or before viewerTimestamp from the authoritative v0.15 intelligence package.
 */
export function buildTemporalSnapshot(
  intelligencePackage: any,
  viewerTimestamp: number
): TemporalSnapshot {
  if (!intelligencePackage) {
    throw new Error("Cannot build temporal snapshot from null or undefined intelligence package");
  }

  const contentId = intelligencePackage.content?.contentId || "unknown";
  const title = intelligencePackage.content?.title || "Unknown Content";
  const effectiveTimestamp = Math.max(0, viewerTimestamp);

  // 1. Resolve unlocked IDs using chronological Temporal Index (Requirement 8)
  const revealPoints = intelligencePackage.temporalIndex?.revealPoints || [];
  const lastIndex = findLastRevealPointIndex(revealPoints, effectiveTimestamp);

  const indexedFactIds = new Set<string>();
  const indexedEventIds = new Set<string>();
  const indexedEntityIds = new Set<string>();
  const indexedConceptIds = new Set<string>();
  const indexedRelationshipIds = new Set<string>();

  if (lastIndex >= 0) {
    for (let i = 0; i <= lastIndex; i++) {
      const pt = revealPoints[i];
      (pt.factIds || []).forEach((id: string) => indexedFactIds.add(id));
      (pt.eventIds || []).forEach((id: string) => indexedEventIds.add(id));
      (pt.entityIds || []).forEach((id: string) => indexedEntityIds.add(id));
      (pt.conceptIds || []).forEach((id: string) => indexedConceptIds.add(id));
      (pt.relationshipIds || []).forEach((id: string) => indexedRelationshipIds.add(id));
    }
  }

  let maxRevealTimeUsed = 0;

  // 2. Filter Entities (firstKnownAt <= effectiveTimestamp)
  const unlockedEntities: SafeEntity[] = [];
  const unlockedEntityIdSet = new Set<string>();
  for (const ent of intelligencePackage.entities || []) {
    const t = typeof ent.firstKnownAt === 'number' ? ent.firstKnownAt : 0;
    // Must be indexed or strictly satisfy timestamp
    if (t <= effectiveTimestamp && (indexedEntityIds.size === 0 || indexedEntityIds.has(ent.id) || t <= effectiveTimestamp)) {
      unlockedEntities.push({
        id: ent.id,
        name: ent.name,
        entityType: ent.entityType || 'entity',
        description: ent.description || '',
        aliases: Array.isArray(ent.aliases) ? ent.aliases : [],
        firstKnownAt: t,
        evidenceTranscriptIndices: Array.isArray(ent.evidenceTranscriptIndices) ? ent.evidenceTranscriptIndices : []
      });
      unlockedEntityIdSet.add(ent.id);
      if (t > maxRevealTimeUsed) maxRevealTimeUsed = t;
    }
  }

  // 3. Filter People (firstKnownAt <= effectiveTimestamp)
  const unlockedPeople: SafePerson[] = [];
  const unlockedPersonIdSet = new Set<string>();
  for (const p of intelligencePackage.people || []) {
    const t = typeof p.firstKnownAt === 'number' ? p.firstKnownAt : 0;
    if (t <= effectiveTimestamp) {
      unlockedPeople.push({
        id: p.id,
        name: p.name,
        role: p.role || 'person',
        description: p.description || '',
        aliases: Array.isArray(p.aliases) ? p.aliases : [],
        firstKnownAt: t,
        evidenceTranscriptIndices: Array.isArray(p.evidenceTranscriptIndices) ? p.evidenceTranscriptIndices : []
      });
      unlockedPersonIdSet.add(p.id);
      if (t > maxRevealTimeUsed) maxRevealTimeUsed = t;
    }
  }

  // 4. Filter Concepts (firstKnownAt <= effectiveTimestamp)
  const unlockedConcepts: SafeConcept[] = [];
  const unlockedConceptIdSet = new Set<string>();
  for (const c of intelligencePackage.concepts || []) {
    const t = typeof c.firstKnownAt === 'number' ? c.firstKnownAt : 0;
    if (t <= effectiveTimestamp) {
      unlockedConcepts.push({
        id: c.id,
        name: c.name,
        description: c.description || '',
        aliases: Array.isArray(c.aliases) ? c.aliases : [],
        firstKnownAt: t,
        evidenceTranscriptIndices: Array.isArray(c.evidenceTranscriptIndices) ? c.evidenceTranscriptIndices : []
      });
      unlockedConceptIdSet.add(c.id);
      if (t > maxRevealTimeUsed) maxRevealTimeUsed = t;
    }
  }

  // 5. Filter Facts (revealTime <= effectiveTimestamp)
  const unlockedFacts: SafeFact[] = [];
  for (const f of intelligencePackage.facts || []) {
    const t = typeof f.revealTime === 'number' ? f.revealTime : 0;
    if (t <= effectiveTimestamp) {
      unlockedFacts.push({
        id: f.id,
        statement: f.statement,
        revealTime: t,
        evidenceTranscriptIndices: Array.isArray(f.evidenceTranscriptIndices) ? f.evidenceTranscriptIndices : [],
        origin: f.origin,
        segmentId: f.segmentId
      });
      if (t > maxRevealTimeUsed) maxRevealTimeUsed = t;
    }
  }

  // 6. Filter Events (revealTime <= effectiveTimestamp)
  const unlockedEvents: SafeEvent[] = [];
  for (const e of intelligencePackage.events || []) {
    const t = typeof e.revealTime === 'number' ? e.revealTime : 0;
    if (t <= effectiveTimestamp) {
      unlockedEvents.push({
        id: e.id,
        description: e.description,
        revealTime: t,
        importance: e.importance,
        evidenceTranscriptIndices: Array.isArray(e.evidenceTranscriptIndices) ? e.evidenceTranscriptIndices : [],
        segmentId: e.segmentId
      });
      if (t > maxRevealTimeUsed) maxRevealTimeUsed = t;
    }
  }

  // Combined set of all known nodes to verify referential integrity of relationships
  const allKnownNodeIds = new Set([
    ...unlockedEntityIdSet,
    ...unlockedPersonIdSet,
    ...unlockedConceptIdSet
  ]);

  // 7. Filter Relationships (revealTime <= effectiveTimestamp AND both ends unlocked)
  const unlockedRelationships: SafeRelationship[] = [];
  for (const r of intelligencePackage.relationships || []) {
    const t = typeof r.revealTime === 'number' ? r.revealTime : 0;
    if (t <= effectiveTimestamp && allKnownNodeIds.has(r.sourceId) && allKnownNodeIds.has(r.targetId)) {
      unlockedRelationships.push({
        id: r.id,
        sourceId: r.sourceId,
        targetId: r.targetId,
        predicate: r.predicate,
        description: r.description,
        revealTime: t,
        evidenceTranscriptIndices: Array.isArray(r.evidenceTranscriptIndices) ? r.evidenceTranscriptIndices : []
      });
      if (t > maxRevealTimeUsed) maxRevealTimeUsed = t;
    }
  }

  // 8. Segments & Current Segment Partial Visibility (Requirement 7)
  const unlockedSegments: SafeSegment[] = [];
  for (const s of intelligencePackage.timeline || []) {
    // If segment hasn't started yet, completely omit
    if (s.startTime > effectiveTimestamp) continue;

    const isCompleted = s.endTime <= effectiveTimestamp;
    const isCurrent = s.startTime <= effectiveTimestamp && effectiveTimestamp < s.endTime;

    if (isCompleted) {
      unlockedSegments.push({
        segmentId: s.segmentId,
        startTime: s.startTime,
        endTime: s.endTime,
        title: s.title,
        summary: s.summary,
        isCurrent: false
      });
      if (s.startTime > maxRevealTimeUsed) maxRevealTimeUsed = s.startTime;
    } else if (isCurrent) {
      // In current segment, do NOT expose summary that could spoil future part of segment.
      // Expose only title and that this segment is currently underway.
      unlockedSegments.push({
        segmentId: s.segmentId,
        startTime: s.startTime,
        endTime: s.endTime,
        title: s.title,
        summary: `Currently in progress: ${s.title}`,
        isCurrent: true
      });
      if (s.startTime > maxRevealTimeUsed) maxRevealTimeUsed = s.startTime;
    }
  }

  // Strict temporal invariant assertion (Requirement 44)
  if (maxRevealTimeUsed > effectiveTimestamp + 0.001) {
    throw new Error(`Temporal Invariant Violated: maxRevealTimeUsed (${maxRevealTimeUsed}) > viewerTimestamp (${effectiveTimestamp})`);
  }

  return {
    contentId,
    title,
    viewerTimestamp: effectiveTimestamp,
    unlockedFacts,
    unlockedEvents,
    unlockedEntities,
    unlockedPeople,
    unlockedConcepts,
    unlockedRelationships,
    unlockedSegments,
    maxRevealTimeUsed: Math.min(maxRevealTimeUsed, effectiveTimestamp)
  };
}
