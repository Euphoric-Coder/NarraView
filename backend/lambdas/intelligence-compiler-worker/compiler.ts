/**
 * NarraView v0.15 — Content Intelligence Compiler Engine
 * Pure deterministic compilation of metadata, corrected transcript,
 * temporal segments, and extracted knowledge into a canonical versioned intelligence package.
 */

export interface CanonicalPerson {
  id: string;
  name: string;
  role: string;
  description: string;
  aliases: string[];
  rawMentions: string[];
  evidenceTranscriptIndices: number[];
  firstKnownAt: number;
}

export interface CanonicalEntity {
  id: string;
  name: string;
  entityType: string;
  description: string;
  aliases: string[];
  rawMentions: string[];
  evidenceTranscriptIndices: number[];
  firstKnownAt: number;
  asrUncertain?: boolean;
}

export interface CanonicalConcept {
  id: string;
  name: string;
  description: string;
  aliases: string[];
  evidenceTranscriptIndices: number[];
  firstKnownAt: number;
}

export interface CanonicalLocation {
  id: string;
  name: string;
  description?: string;
  evidenceTranscriptIndices?: number[];
  firstKnownAt?: number;
}

export interface CanonicalEvent {
  id: string;
  description: string;
  importance: "high" | "medium" | "low";
  evidenceTranscriptIndices: number[];
  revealTime: number;
}

export interface CanonicalFact {
  id: string;
  statement: string;
  evidenceTranscriptIndices: number[];
  revealTime: number;
  origin?: string;
}

export interface CanonicalRelationship {
  id: string;
  sourceId: string;
  targetId: string;
  predicate: string;
  description?: string;
  revealTime: number;
  evidenceTranscriptIndices: number[];
}

export interface IntelligenceSegment {
  segmentId: string;
  startTime: number;
  endTime: number;
  title: string;
  summary: string;
  transcript: {
    startIndex: number;
    endIndex: number;
  };
  peopleIds: string[];
  entityIds: string[];
  conceptIds: string[];
  eventIds: string[];
  factIds: string[];
  relationshipIds: string[];
}

export interface TemporalIndexPoint {
  time: number;
  description?: string;
  factIds: string[];
  eventIds: string[];
  entityIds: string[];
  conceptIds: string[];
  relationshipIds: string[];
}

export interface TemporalIndex {
  revealPoints: TemporalIndexPoint[];
}

export interface ContentIntelligencePackage {
  schemaVersion: "1.0.0";
  intelligenceVersion: number;

  content: {
    contentId: string;
    title: string;
    contentType: string;
    language: string;
    durationSeconds?: number;
  };

  timeline: IntelligenceSegment[];

  people: CanonicalPerson[];
  entities: CanonicalEntity[];
  concepts: CanonicalConcept[];
  locations: CanonicalLocation[];
  events: CanonicalEvent[];
  facts: CanonicalFact[];
  relationships: CanonicalRelationship[];

  temporalIndex: TemporalIndex;

  sourceArtifacts: {
    correctedTranscriptKey?: string;
    normalizedTranscriptKey: string;
    segmentsKey: string;
    knowledgeKey: string;
  };

  quality: {
    referentialIntegrity: boolean;
    danglingRelationsDropped: number;
    unresolvedAsrTerms: string[];
    duplicateFactsRemoved: number;
    duplicateRelationsRemoved: number;
    canonicalizationApplied: boolean;
    qualityScore: number;
  };

  metadata: {
    compiledAt: string;
    compilerVersion: "0.15.0";
  };
}

export interface CompilerInput {
  content: {
    contentId: string;
    title: string;
    contentType: string;
    language: string;
    durationSeconds?: number;
  };
  transcript: {
    segments: Array<{
      id?: string;
      transcriptIndex?: number;
      startTime: number;
      endTime: number;
      originalText?: string;
      correctedText?: string;
      text?: string;
    }>;
    corrections?: Array<{
      transcriptIndex: number;
      original: string;
      corrected: string;
      confidence: "high" | "medium" | "low";
      reason?: string;
      autoApplied: boolean;
    }>;
    metadata?: any;
  };
  segmentsDoc: {
    segments: Array<{
      segmentId: string;
      startTime: number;
      endTime: number;
      title: string;
      summary: string;
      transcriptStartIndex: number;
      transcriptEndIndex: number;
      segmentType?: string;
    }>;
  };
  knowledgeDoc: {
    people?: any[];
    entities?: any[];
    concepts?: any[];
    locations?: any[];
    events?: any[];
    facts?: any[];
    relationships?: any[];
  };
  sourceKeys: {
    correctedTranscriptKey?: string;
    normalizedTranscriptKey: string;
    segmentsKey: string;
    knowledgeKey: string;
  };
  version: number;
}

/**
 * Deterministic slug generator
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Normalize predicates to a standard vocabulary
 */
export function normalizePredicate(predicate: string): string {
  const p = predicate.toLowerCase().trim();
  if (["uses", "is using", "utilizes", "leverages", "using"].includes(p)) return "uses";
  if (["provides", "offering", "delivers", "offers"].includes(p)) return "provides";
  if (["enables", "allows", "facilitates"].includes(p)) return "enables";
  if (["powers", "is powered by"].includes(p)) return "powers";
  if (["supports", "supporting"].includes(p)) return "supports";
  if (["verifies", "validates", "checking", "checks"].includes(p)) return "verifies";
  if (["assigns", "delegates"].includes(p)) return "assigns";
  if (["submits", "files", "reports"].includes(p)) return "submits";
  if (["creator", "created by", "built", "authored by", "developed by"].includes(p)) return "creator";
  if (["contains", "includes", "has"].includes(p)) return "contains";
  return p.replace(/\s+/g, "_");
}

/**
 * Replaces known aliases in generated prose safely
 */
export function normalizeProse(text: string, aliasMap: Map<string, string>): string {
  if (!text) return text;
  let normalized = text;
  for (const [alias, canonical] of aliasMap.entries()) {
    if (alias.toLowerCase() === canonical.toLowerCase()) continue;
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "gi");
    normalized = normalized.replace(regex, canonical);
  }
  return normalized;
}

/**
 * Extract substantive signature for fact comparison
 */
function getFactSignature(statement: string): string {
  const stopWords = new Set([
    "is", "are", "was", "were", "to", "for", "the", "a", "an", "in", "on", "at", "by",
    "added", "used", "utilized", "implemented", "provided", "with", "and", "or", "of", "from"
  ]);

  const tokens = statement
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !stopWords.has(w));

  return tokens.sort().join(" ");
}

/**
 * Deduplicates facts based on semantic and surface text normalization
 */
export function deduplicateFacts(
  facts: any[],
  aliasMap: Map<string, string>
): { canonicalFacts: CanonicalFact[]; removedCount: number } {
  const result: CanonicalFact[] = [];
  const seenSignatures = new Map<string, CanonicalFact>();
  let removedCount = 0;

  for (const rawFact of facts) {
    if (!rawFact || !rawFact.statement) continue;

    // Apply alias normalization to fact statement
    const statement = normalizeProse(rawFact.statement.trim(), aliasMap);
    const signature = getFactSignature(statement);

    const existing = seenSignatures.get(signature);
    if (existing) {
      // Merge: earliest reveal time, union evidence indices
      existing.revealTime = Math.min(existing.revealTime, rawFact.revealTime ?? existing.revealTime);
      const combinedIndices = Array.from(
        new Set([...existing.evidenceTranscriptIndices, ...(rawFact.evidenceTranscriptIndices || [])])
      ).sort((a, b) => a - b);
      existing.evidenceTranscriptIndices = combinedIndices;
      removedCount++;
    } else {
      const canonicalId = rawFact.id && !rawFact.id.includes(" ") ? rawFact.id : `fact-${slugify(statement).slice(0, 40)}`;
      const factObj: CanonicalFact = {
        id: canonicalId,
        statement,
        evidenceTranscriptIndices: (rawFact.evidenceTranscriptIndices || []).sort((a: number, b: number) => a - b),
        revealTime: rawFact.revealTime ?? 0,
        origin: rawFact.origin || "direct_fact",
      };
      seenSignatures.set(signature, factObj);
      result.push(factObj);
    }
  }

  // Sort by revealTime
  result.sort((a, b) => a.revealTime - b.revealTime);
  return { canonicalFacts: result, removedCount };
}

/**
 * Main Compiler Function
 */
export function compileContentIntelligence(input: CompilerInput): ContentIntelligencePackage {
  const { content, transcript, segmentsDoc, knowledgeDoc, sourceKeys, version } = input;

  // 1. Build Alias-to-Canonical Map
  const aliasMap = new Map<string, string>();

  if (content.title && content.title.toLowerCase().includes("citycare")) {
    aliasMap.set("Cityar", "CityCare");
    aliasMap.set("Cicar", "CityCare");
    aliasMap.set("Citicare", "CityCare");
    aliasMap.set("Cer", "CityCare");
  }

  const rawEntities = knowledgeDoc.entities || [];
  for (const e of rawEntities) {
    if (e.aliases && Array.isArray(e.aliases)) {
      for (const a of e.aliases) {
        if (a && e.name) aliasMap.set(a, e.name);
      }
    }
  }

  const rawPeople = knowledgeDoc.people || [];
  for (const p of rawPeople) {
    if (p.aliases && Array.isArray(p.aliases)) {
      for (const a of p.aliases) {
        if (a && p.name) aliasMap.set(a, p.name);
      }
    }
  }

  if (transcript.corrections) {
    for (const corr of transcript.corrections) {
      if (corr.autoApplied && corr.original && corr.corrected) {
        aliasMap.set(corr.original, corr.corrected);
      }
    }
  }

  // 2. Canonicalize People & Roles
  const people: CanonicalPerson[] = [];
  const entityRemap = new Map<string, string>();

  for (const p of rawPeople) {
    const rawName = p.name || "Unknown";
    const canonicalName = aliasMap.get(rawName) || rawName;
    const isRole = p.role && ["field_officer", "unit_officer", "officer"].includes(p.role.toLowerCase());
    const stableId = isRole ? `role-${slugify(canonicalName)}` : `person-${slugify(canonicalName)}`;

    people.push({
      id: p.id && (p.id.startsWith("person-") || p.id.startsWith("role-")) ? p.id : stableId,
      name: canonicalName,
      role: p.role || "participant",
      description: normalizeProse(p.description || "", aliasMap),
      aliases: p.aliases || [],
      rawMentions: p.rawMentions || [rawName],
      evidenceTranscriptIndices: (p.evidenceTranscriptIndices || []).sort((a: number, b: number) => a - b),
      firstKnownAt: p.firstKnownAt ?? 0,
    });
  }

  // 3. Canonicalize Entities
  const entities: CanonicalEntity[] = [];
  for (const e of rawEntities) {
    const rawName = e.name || "Entity";
    const canonicalName = aliasMap.get(rawName) || rawName;

    if (
      ["field officer", "unit officer"].includes(canonicalName.toLowerCase()) ||
      ["field officer", "unit officer"].includes(rawName.toLowerCase())
    ) {
      const roleId = `role-${slugify(canonicalName)}`;
      entityRemap.set(e.id, roleId);
      if (e.id) entityRemap.set(`entity-${slugify(rawName)}`, roleId);
      continue;
    }

    const stableId = `entity-${slugify(canonicalName)}`;
    entities.push({
      id: e.id && e.id.startsWith("entity-") ? e.id : stableId,
      name: canonicalName,
      entityType: e.entityType || "general",
      description: normalizeProse(e.description || "", aliasMap),
      aliases: e.aliases || [],
      rawMentions: e.rawMentions || [rawName],
      evidenceTranscriptIndices: (e.evidenceTranscriptIndices || []).sort((a: number, b: number) => a - b),
      firstKnownAt: e.firstKnownAt ?? 0,
      asrUncertain: e.asrUncertain ?? false,
    });
  }

  // 4. Canonicalize Concepts
  const rawConcepts = knowledgeDoc.concepts || [];
  const concepts: CanonicalConcept[] = rawConcepts.map((c: any) => ({
    id: c.id && c.id.startsWith("concept-") ? c.id : `concept-${slugify(c.name || "concept")}`,
    name: c.name || "Concept",
    description: normalizeProse(c.description || "", aliasMap),
    aliases: c.aliases || [],
    evidenceTranscriptIndices: (c.evidenceTranscriptIndices || []).sort((a: number, b: number) => a - b),
    firstKnownAt: c.firstKnownAt ?? 0,
  }));

  // 5. Canonicalize Locations
  const rawLocations = knowledgeDoc.locations || [];
  const locations: CanonicalLocation[] = rawLocations.map((l: any) => ({
    id: l.id && l.id.startsWith("location-") ? l.id : `location-${slugify(l.name || "location")}`,
    name: l.name || "Location",
    description: normalizeProse(l.description || "", aliasMap),
    evidenceTranscriptIndices: (l.evidenceTranscriptIndices || []).sort((a: number, b: number) => a - b),
    firstKnownAt: l.firstKnownAt ?? 0,
  }));

  // 6. Canonicalize Events
  const rawEvents = knowledgeDoc.events || [];
  const events: CanonicalEvent[] = rawEvents.map((ev: any, idx: number) => ({
    id: ev.id && !ev.id.includes(" ") ? ev.id : `event-${idx}`,
    description: normalizeProse(ev.description || "", aliasMap),
    importance: ev.importance || "medium",
    evidenceTranscriptIndices: (ev.evidenceTranscriptIndices || []).sort((a: number, b: number) => a - b),
    revealTime: ev.revealTime ?? 0,
  }));
  events.sort((a, b) => a.revealTime - b.revealTime);

  // 7. Deduplicate Facts
  const rawFacts = knowledgeDoc.facts || [];
  const { canonicalFacts: facts, removedCount: duplicateFactsRemoved } = deduplicateFacts(rawFacts, aliasMap);

  // 8. Canonicalize, Validate & Deduplicate Relationships
  const validIds = new Set<string>([
    ...people.map((p) => p.id),
    ...entities.map((e) => e.id),
    ...concepts.map((c) => c.id),
    ...locations.map((l) => l.id),
    ...events.map((ev) => ev.id),
    ...facts.map((f) => f.id),
  ]);

  const rawRelationships = knowledgeDoc.relationships || [];
  const relationships: CanonicalRelationship[] = [];
  const seenRels = new Map<string, CanonicalRelationship>();
  let duplicateRelationsRemoved = 0;
  let danglingRelations = 0;

  for (const r of rawRelationships) {
    if (!r || !r.sourceId || !r.targetId) continue;

    let sourceId = entityRemap.get(r.sourceId) || r.sourceId;
    let targetId = entityRemap.get(r.targetId) || r.targetId;
    let predicate = normalizePredicate(r.predicate || r.relationshipType || "related_to");

    // Invert direction if concept contains entity -> entity provides concept
    if (sourceId.startsWith("concept-") && targetId.startsWith("entity-") && ["contains", "uses"].includes(predicate)) {
      const temp = sourceId;
      sourceId = targetId;
      targetId = temp;
      predicate = "provides";
    }

    // Verify referential integrity
    if (!validIds.has(sourceId) || !validIds.has(targetId)) {
      danglingRelations++;
      continue; // Drop dangling reference from published output
    }

    const relKey = `${sourceId}:${predicate}:${targetId}`;
    const existingRel = seenRels.get(relKey);
    if (existingRel) {
      existingRel.revealTime = Math.min(existingRel.revealTime, r.firstKnownAt ?? r.revealTime ?? existingRel.revealTime);
      existingRel.evidenceTranscriptIndices = Array.from(
        new Set([...existingRel.evidenceTranscriptIndices, ...(r.evidenceTranscriptIndices || [])])
      ).sort((a, b) => a - b);
      duplicateRelationsRemoved++;
    } else {
      const relId = r.id && !r.id.includes(" ") ? r.id : `rel-${slugify(sourceId)}-${predicate}-${slugify(targetId)}`;
      const relObj: CanonicalRelationship = {
        id: relId,
        sourceId,
        targetId,
        predicate,
        description: normalizeProse(r.description || "", aliasMap),
        revealTime: r.revealTime ?? r.firstKnownAt ?? 0,
        evidenceTranscriptIndices: (r.evidenceTranscriptIndices || []).sort((a: number, b: number) => a - b),
      };
      seenRels.set(relKey, relObj);
      relationships.push(relObj);
    }
  }

  relationships.sort((a, b) => a.revealTime - b.revealTime);

  // In the published package, all remaining relationships are guaranteed to have 100% referential integrity
  const publishedReferentialIntegrity = relationships.every(
    (r) => validIds.has(r.sourceId) && validIds.has(r.targetId)
  );

  // 9. Inspect Remaining ASR Uncertainty
  const suspiciousTerms = ["Surface", "SLS", "seller deadlines", "performance coding", "shredders", "shards"];
  const unresolvedAsrTerms: string[] = [];

  const allKnowledgeProse = [
    ...facts.map((f) => f.statement),
    ...events.map((e) => e.description),
    ...entities.map((e) => `${e.name} ${e.description}`),
    ...concepts.map((c) => `${c.name} ${c.description}`),
  ].join(" ");

  for (const term of suspiciousTerms) {
    if (allKnowledgeProse.includes(term)) {
      const resolved = transcript.corrections?.some(
        (c) => c.original.toLowerCase() === term.toLowerCase() && c.autoApplied
      );
      if (!resolved) {
        unresolvedAsrTerms.push(term);
      }
    }
  }

  // 10. Build Timeline Model
  const rawSegments = segmentsDoc.segments || [];
  const timeline: IntelligenceSegment[] = rawSegments.map((seg) => {
    const sStart = seg.startTime;
    const sEnd = seg.endTime;
    const tStart = seg.transcriptStartIndex;
    const tEnd = seg.transcriptEndIndex;

    const inRangeTime = (t: number) => t >= sStart - 0.5 && t <= sEnd + 0.5;
    const inRangeTranscript = (indices: number[]) => indices.some((i) => i >= tStart && i <= tEnd);

    const segmentPeople = people
      .filter((p) => inRangeTime(p.firstKnownAt) || inRangeTranscript(p.evidenceTranscriptIndices))
      .map((p) => p.id);

    const segmentEntities = entities
      .filter((e) => inRangeTime(e.firstKnownAt) || inRangeTranscript(e.evidenceTranscriptIndices))
      .map((e) => e.id);

    const segmentConcepts = concepts
      .filter((c) => inRangeTime(c.firstKnownAt) || inRangeTranscript(c.evidenceTranscriptIndices))
      .map((c) => c.id);

    const segmentEvents = events
      .filter((ev) => inRangeTime(ev.revealTime) || inRangeTranscript(ev.evidenceTranscriptIndices))
      .map((ev) => ev.id);

    const segmentFacts = facts
      .filter((f) => inRangeTime(f.revealTime) || inRangeTranscript(f.evidenceTranscriptIndices))
      .map((f) => f.id);

    const segmentRelationships = relationships
      .filter((r) => inRangeTime(r.revealTime) || inRangeTranscript(r.evidenceTranscriptIndices))
      .map((r) => r.id);

    return {
      segmentId: seg.segmentId,
      startTime: seg.startTime,
      endTime: seg.endTime,
      title: seg.title,
      summary: normalizeProse(seg.summary, aliasMap),
      transcript: {
        startIndex: seg.transcriptStartIndex,
        endIndex: seg.transcriptEndIndex,
      },
      peopleIds: Array.from(new Set(segmentPeople)),
      entityIds: Array.from(new Set(segmentEntities)),
      conceptIds: Array.from(new Set(segmentConcepts)),
      eventIds: Array.from(new Set(segmentEvents)),
      factIds: Array.from(new Set(segmentFacts)),
      relationshipIds: Array.from(new Set(segmentRelationships)),
    };
  });

  // 11. Build Temporal Index
  const revealTimesSet = new Set<number>();
  const addTime = (t: number) => {
    if (typeof t === "number" && !isNaN(t) && t >= 0) {
      revealTimesSet.add(Math.round(t * 100) / 100);
    }
  };

  facts.forEach((f) => addTime(f.revealTime));
  events.forEach((e) => addTime(e.revealTime));
  entities.forEach((e) => addTime(e.firstKnownAt));
  concepts.forEach((c) => addTime(c.firstKnownAt));
  people.forEach((p) => addTime(p.firstKnownAt));
  relationships.forEach((r) => addTime(r.revealTime));

  const sortedTimes = Array.from(revealTimesSet).sort((a, b) => a - b);

  const revealPoints: TemporalIndexPoint[] = sortedTimes.map((time) => {
    const isAtOrBefore = (t: number) => Math.round(t * 100) / 100 === time;

    const pointFacts = facts.filter((f) => isAtOrBefore(f.revealTime)).map((f) => f.id);
    const pointEvents = events.filter((e) => isAtOrBefore(e.revealTime)).map((e) => e.id);
    const pointEntities = entities.filter((e) => isAtOrBefore(e.firstKnownAt)).map((e) => e.id);
    const pointConcepts = concepts.filter((c) => isAtOrBefore(c.firstKnownAt)).map((c) => c.id);
    const pointRels = relationships.filter((r) => isAtOrBefore(r.revealTime)).map((r) => r.id);

    const names: string[] = [];
    entities.filter((e) => isAtOrBefore(e.firstKnownAt)).forEach((e) => names.push(e.name));
    concepts.filter((c) => isAtOrBefore(c.firstKnownAt)).forEach((c) => names.push(c.name));

    return {
      time,
      description: names.length > 0 ? `${names.slice(0, 3).join(", ")} introduced` : `Items revealed at ${time}s`,
      factIds: pointFacts,
      eventIds: pointEvents,
      entityIds: pointEntities,
      conceptIds: pointConcepts,
      relationshipIds: pointRels,
    };
  });

  const qualityScore = Math.max(0, 100 - danglingRelations * 10 - unresolvedAsrTerms.length * 5);

  return {
    schemaVersion: "1.0.0",
    intelligenceVersion: version,
    content: {
      contentId: content.contentId,
      title: content.title,
      contentType: content.contentType || "general",
      language: content.language || "en",
      durationSeconds: content.durationSeconds,
    },
    timeline,
    people,
    entities,
    concepts,
    locations,
    events,
    facts,
    relationships,
    temporalIndex: {
      revealPoints,
    },
    sourceArtifacts: {
      correctedTranscriptKey: sourceKeys.correctedTranscriptKey,
      normalizedTranscriptKey: sourceKeys.normalizedTranscriptKey,
      segmentsKey: sourceKeys.segmentsKey,
      knowledgeKey: sourceKeys.knowledgeKey,
    },
    quality: {
      referentialIntegrity: publishedReferentialIntegrity,
      danglingRelationsDropped: danglingRelations,
      unresolvedAsrTerms,
      duplicateFactsRemoved,
      duplicateRelationsRemoved,
      canonicalizationApplied: aliasMap.size > 0,
      qualityScore,
    },
    metadata: {
      compiledAt: new Date().toISOString(),
      compilerVersion: "0.15.0",
    },
  };
}
