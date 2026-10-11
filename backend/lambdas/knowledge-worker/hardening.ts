/**
 * NarraView v0.14 Quality Hardening Pass
 * Canonicalization, Deduplication, Significance Filtering,
 * Event vs Fact Classification, and Relationship Referential Integrity.
 */

export interface CanonicalNode {
  id: string;
  name: string;
  type: string;
  aliases?: string[];
  [key: string]: any;
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
  canonicalizationReason?: 'exact_match' | 'case_normalization' | 'alias_match' | 'contextual_merge' | 'admin_override';
  canonicalizationConfidence?: 'high' | 'medium' | 'low';
  asrUncertain?: boolean;
}

export interface CanonicalPerson {
  id: string;
  name: string;
  role: string;
  description: string;
  aliases: string[];
  rawMentions: string[];
  evidenceTranscriptIndices: number[];
  firstKnownAt: number;
  canonicalizationReason?: 'exact_match' | 'case_normalization' | 'alias_match' | 'role_normalization' | 'admin_override';
  canonicalizationConfidence?: 'high' | 'medium' | 'low';
}

export interface CanonicalConcept {
  id: string;
  name: string;
  description: string;
  aliases: string[];
  evidenceTranscriptIndices: number[];
  firstKnownAt: number;
  canonicalizationReason?: string;
}

export interface CanonicalEvent {
  id: string;
  description: string;
  importance: 'high' | 'medium' | 'low';
  evidenceTranscriptIndices: number[];
  revealTime: number;
}

export interface CanonicalFact {
  id: string;
  statement: string;
  evidenceTranscriptIndices: number[];
  revealTime: number;
  origin?: 'direct_fact' | 'reclassified_event' | 'converted_relationship';
}

export interface CanonicalRelationship {
  id: string;
  sourceId: string;
  targetId: string;
  relationshipType: string;
  description?: string;
  evidenceTranscriptIndices: number[];
  firstKnownAt: number;
}

export interface KnowledgeQualitySummary {
  event: 'KNOWLEDGE_QUALITY_SUMMARY';
  contentId: string;
  entities: { raw: number; canonical: number };
  concepts: { raw: number; canonical: number };
  relationships: { raw: number; canonical: number; rejectedDangling: number };
  events: { raw: number; canonical: number; reclassifiedToFacts: number };
  facts: { raw: number; canonical: number };
}

// Default system alias overrides for known ASR variants
export const DEFAULT_ALIAS_OVERRIDES: Record<string, string> = {
  "citicare": "CityCare",
  "cityar": "CityCare",
  "cicar": "CityCare",
  "cer": "CityCare",
  "city care": "CityCare",
  "citycare": "CityCare",
};

// Generic form inputs / superficial UI labels to reject from standalone concepts
export const GENERIC_FORM_FIELD_TERMS = new Set([
  'title', 'description', 'category', 'categories', 'subcategory', 'subcategories',
  'priority', 'location', 'status', 'name', 'id', 'input', 'field', 'form',
  'button', 'checkbox', 'dropdown', 'tab', 'screen', 'view', 'icon', 'values', 'value', 'details'
]);

// Generic metrics or dashboard items wrongly extracted as standalone entities
export const GENERIC_ENTITY_REJECTIONS = new Set([
  'sls status', 'issue trends', 'duplicates', 'officer workload',
  'performance metrics', 'performance coding', 'seller deadlines', 'office assignment'
]);

export function normalizeText(text: string): string {
  if (!text) return '';
  return text.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function generateDeterministicId(type: string, name: string): string {
  const normalized = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${type}-${normalized}`.substring(0, 64);
}

export function cleanIndices(indices: any): number[] {
  if (!Array.isArray(indices)) return [];
  const nums = indices.filter((x): x is number => typeof x === 'number' && x >= 0);
  return Array.from(new Set(nums)).sort((a: number, b: number) => a - b);
}

export function deriveRevealTime(indices: number[], transcriptSegments: any[]): number {
  if (!indices || indices.length === 0) return 0;
  const validIndices = indices.filter(i => typeof i === 'number' && i >= 0 && i < transcriptSegments.length);
  if (validIndices.length === 0) return 0;
  const minIndex = Math.min(...validIndices);
  return transcriptSegments[minIndex]?.startTime || 0;
}

export function unionEvidenceIndices(a: number[] = [], b: number[] = []): number[] {
  const set = new Set([...a, ...b].filter(i => typeof i === 'number' && i >= 0));
  return Array.from(set).sort((x, y) => x - y);
}

export function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

export function stringSimilarity(s1: string, s2: string): number {
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1.0;
  const dist = levenshteinDistance(s1, s2);
  return 1.0 - dist / maxLen;
}

/**
 * Normalizes role names (e.g. "Unit Officer", "unit officer", "responsible unit officer" -> "Unit Officer")
 */
export function canonicalizeRoleName(rawName: string): { canonicalName: string; isRole: boolean } {
  const norm = normalizeText(rawName);
  if (norm === 'unit officer' || norm === 'responsible unit officer') {
    return { canonicalName: 'Unit Officer', isRole: true };
  }
  if (norm === 'field officer') {
    return { canonicalName: 'Field Officer', isRole: true };
  }
  if (norm === 'citizen' || norm === 'citizens') {
    return { canonicalName: 'Citizen', isRole: true };
  }
  return { canonicalName: rawName.trim(), isRole: false };
}

/**
 * Event vs Fact Validator:
 * An EVENT requires an action, state transition, or occurrence.
 * Static system descriptions, statistics, metrics, or rules are FACTS.
 */
export function isEventStatement(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase().trim();

  // Negative rules: indicators of FACTS, NOT events:
  // 1. Statistics, percentages, ratios, metrics
  if (/\b(\d+(?:[–\-]\d+)?%|\d+\s*(?:reports?|days?|meters?|seconds?|minutes?|hours?))\b/i.test(lower)) {
    return false;
  }
  // 2. Modals of capability, permission, bounds
  if (/\b(can\s+submit|may\s+submit|allows\s+up\s+to|reduces\s+.*by|supports\s+up\s+to|each\s+citizen\s+can|each\s+citizen\s+may)\b/i.test(lower)) {
    return false;
  }
  // 3. Static technology/system descriptions
  if (/\b(is\s+built\s+with|uses\s+(?:react|nextjs|next|node|redis|upstash)|platform\s+uses|is\s+a\s+(?:centralized|dedicated)|typically\s+ask|wonder\s+what)\b/i.test(lower)) {
    return false;
  }
  // 4. Pure problem descriptions / thoughts
  if (/^(identification\s+of|development\s+of\s+the\s+.*platform\s+to\s+address)/i.test(lower)) {
    return false;
  }

  // Positive indicators for events: dynamic action verbs, state transitions
  const dynamicActionPattern = /\b(submits?|submitted|submitting|assigns?|assigned|assigning|reassigns?|reassigned|verifies?|verified|verifying|rejects?|rejected|rejecting|reworks?|reworked|uploads?|uploaded|uploading|captures?|captured|capturing|triggers?|triggered|detects?|detected|detecting|closes?|closed|closing|resolves?|resolved|resolving|notifies?|notified|notifying|escalates?|escalated|creates?|created|processes?|processed|reaches?|reached)\b/i;

  return dynamicActionPattern.test(lower);
}

/**
 * Token set Jaccard similarity for statements
 */
export function jaccardSimilarity(textA: string, textB: string): number {
  const tokensA = new Set(normalizeText(textA).split(' ').filter(w => w.length > 2));
  const tokensB = new Set(normalizeText(textB).split(' ').filter(w => w.length > 2));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }
  const union = tokensA.size + tokensB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Step 1 & 2: Canonicalize Entities with alias tracking & conservative merging
 */
export function canonicalizeEntities(
  rawEntities: any[],
  transcriptSegments: any[],
  aliasOverrides: Record<string, string> = {}
): CanonicalEntity[] {
  const overrides = { ...DEFAULT_ALIAS_OVERRIDES, ...aliasOverrides };
  const canonicalMap = new Map<string, CanonicalEntity>();

  for (const ent of rawEntities) {
    if (!ent.name || typeof ent.name !== 'string') continue;
    const rawName = ent.name.trim();
    const norm = normalizeText(rawName);

    // Filter out generic metrics or dashboard entities
    if (GENERIC_ENTITY_REJECTIONS.has(norm)) {
      continue;
    }

    let targetCanonicalName = rawName;
    let reason: CanonicalEntity['canonicalizationReason'] = 'exact_match';
    let confidence: CanonicalEntity['canonicalizationConfidence'] = 'high';
    let isAsr = false;

    // Check admin / system alias overrides
    if (overrides[norm]) {
      targetCanonicalName = overrides[norm];
      reason = 'admin_override';
      confidence = 'high';
      if (norm !== normalizeText(targetCanonicalName)) {
        isAsr = true;
      }
    } else {
      let matchedExisting: CanonicalEntity | null = null;
      for (const existing of canonicalMap.values()) {
        const existingNorm = normalizeText(existing.name);
        if (norm === existingNorm) {
          matchedExisting = existing;
          reason = 'case_normalization';
          break;
        }
        if (
          norm.length >= 3 &&
          existingNorm.length >= 3 &&
          norm[0] === existingNorm[0] &&
          stringSimilarity(norm, existingNorm) >= 0.85
        ) {
          matchedExisting = existing;
          reason = 'alias_match';
          confidence = 'high';
          isAsr = true;
          break;
        }
      }

      if (matchedExisting) {
        targetCanonicalName = matchedExisting.name;
      }
    }

    const canonicalId = generateDeterministicId('entity', targetCanonicalName);
    const indices = cleanIndices(ent.evidenceTranscriptIndices);

    if (!canonicalMap.has(canonicalId)) {
      const canonicalObj: CanonicalEntity = {
        id: canonicalId,
        name: targetCanonicalName,
        entityType: ent.entityType || 'entity',
        description: ent.description || '',
        aliases: rawName !== targetCanonicalName ? [rawName] : [],
        rawMentions: [rawName],
        evidenceTranscriptIndices: indices,
        firstKnownAt: deriveRevealTime(indices, transcriptSegments),
        canonicalizationReason: reason,
        canonicalizationConfidence: confidence,
        asrUncertain: isAsr || undefined
      };
      canonicalMap.set(canonicalId, canonicalObj);
    } else {
      const existing = canonicalMap.get(canonicalId)!;
      if (rawName !== existing.name && !existing.aliases.includes(rawName)) {
        existing.aliases.push(rawName);
      }
      if (!existing.rawMentions.includes(rawName)) {
        existing.rawMentions.push(rawName);
      }
      existing.evidenceTranscriptIndices = unionEvidenceIndices(existing.evidenceTranscriptIndices, indices);
      existing.firstKnownAt = deriveRevealTime(existing.evidenceTranscriptIndices, transcriptSegments);
      if (ent.description && (!existing.description || ent.description.length > existing.description.length)) {
        existing.description = ent.description;
      }
      if (isAsr) existing.asrUncertain = true;
      if (reason !== 'exact_match') existing.canonicalizationReason = reason;
    }
  }

  const result = Array.from(canonicalMap.values());
  result.sort((a, b) => a.firstKnownAt - b.firstKnownAt);
  return result;
}

/**
 * Canonicalize People & Roles
 */
export function canonicalizePeople(
  rawPeople: any[],
  transcriptSegments: any[]
): CanonicalPerson[] {
  const canonicalMap = new Map<string, CanonicalPerson>();

  for (const person of rawPeople) {
    if (!person.name || typeof person.name !== 'string') continue;
    const rawName = person.name.trim();
    const roleResolution = canonicalizeRoleName(rawName);

    const canonicalName = roleResolution.canonicalName;
    const isRole = roleResolution.isRole;
    const canonicalId = generateDeterministicId(isRole ? 'role' : 'person', canonicalName);
    const indices = cleanIndices(person.evidenceTranscriptIndices);

    if (!canonicalMap.has(canonicalId)) {
      const canonicalObj: CanonicalPerson = {
        id: canonicalId,
        name: canonicalName,
        role: isRole ? canonicalName : (person.role || 'Person'),
        description: person.description || '',
        aliases: rawName !== canonicalName ? [rawName] : [],
        rawMentions: [rawName],
        evidenceTranscriptIndices: indices,
        firstKnownAt: deriveRevealTime(indices, transcriptSegments),
        canonicalizationReason: isRole ? 'role_normalization' : 'exact_match',
        canonicalizationConfidence: 'high'
      };
      canonicalMap.set(canonicalId, canonicalObj);
    } else {
      const existing = canonicalMap.get(canonicalId)!;
      if (rawName !== existing.name && !existing.aliases.includes(rawName)) {
        existing.aliases.push(rawName);
      }
      if (!existing.rawMentions.includes(rawName)) {
        existing.rawMentions.push(rawName);
      }
      existing.evidenceTranscriptIndices = unionEvidenceIndices(existing.evidenceTranscriptIndices, indices);
      existing.firstKnownAt = deriveRevealTime(existing.evidenceTranscriptIndices, transcriptSegments);
      if (person.description && (!existing.description || person.description.length > existing.description.length)) {
        existing.description = person.description;
      }
    }
  }

  const result = Array.from(canonicalMap.values());
  result.sort((a, b) => a.firstKnownAt - b.firstKnownAt);
  return result;
}

/**
 * Filter and Canonicalize Concepts:
 * - Rejects generic form inputs (e.g. title, description, priority)
 * - Rejects long multi-word clauses/sentences
 * - Merges clear semantic duplicates
 */
export function filterAndCanonicalizeConcepts(
  rawConcepts: any[],
  transcriptSegments: any[]
): CanonicalConcept[] {
  const canonicalMap = new Map<string, CanonicalConcept>();

  for (const concept of rawConcepts) {
    if (!concept.name || typeof concept.name !== 'string') continue;
    const rawName = concept.name.trim();
    const norm = normalizeText(rawName);

    if (GENERIC_FORM_FIELD_TERMS.has(norm)) {
      continue;
    }

    const wordCount = norm.split(' ').length;
    if (wordCount > 5) {
      continue;
    }

    let targetId = generateDeterministicId('concept', rawName);
    let matchedExisting: CanonicalConcept | null = null;

    for (const existing of canonicalMap.values()) {
      const existingNorm = normalizeText(existing.name);
      if (norm === existingNorm) {
        matchedExisting = existing;
        break;
      }
      if (
        (norm.includes(existingNorm) || existingNorm.includes(norm)) &&
        Math.abs(norm.length - existingNorm.length) <= 12
      ) {
        matchedExisting = existing;
        break;
      }
    }

    const indices = cleanIndices(concept.evidenceTranscriptIndices);

    if (matchedExisting) {
      if (rawName !== matchedExisting.name && !matchedExisting.aliases.includes(rawName)) {
        matchedExisting.aliases.push(rawName);
      }
      matchedExisting.evidenceTranscriptIndices = unionEvidenceIndices(matchedExisting.evidenceTranscriptIndices, indices);
      matchedExisting.firstKnownAt = deriveRevealTime(matchedExisting.evidenceTranscriptIndices, transcriptSegments);
      if (concept.description && (!matchedExisting.description || concept.description.length > matchedExisting.description.length)) {
        matchedExisting.description = concept.description;
      }
    } else {
      const canonicalObj: CanonicalConcept = {
        id: targetId,
        name: rawName,
        description: concept.description || '',
        aliases: [],
        evidenceTranscriptIndices: indices,
        firstKnownAt: deriveRevealTime(indices, transcriptSegments)
      };
      canonicalMap.set(targetId, canonicalObj);
    }
  }

  const result = Array.from(canonicalMap.values());
  result.sort((a, b) => a.firstKnownAt - b.firstKnownAt);
  return result;
}

/**
 * Classify & Validate Events and Facts:
 * Reclassifies static statements, statistics, or metrics from Events to Facts.
 * Deduplicates near-identical atomic facts.
 */
export function classifyAndValidateEventsAndFacts(
  rawEvents: any[],
  rawFacts: any[],
  transcriptSegments: any[]
): {
  events: CanonicalEvent[];
  facts: CanonicalFact[];
  reclassifiedCount: number;
} {
  const events: CanonicalEvent[] = [];
  const factCandidates: CanonicalFact[] = [];
  let reclassifiedCount = 0;

  for (const ev of rawEvents) {
    if (!ev.description || typeof ev.description !== 'string') continue;
    const text = ev.description.trim();
    const indices = cleanIndices(ev.evidenceTranscriptIndices);
    const revealTime = deriveRevealTime(indices, transcriptSegments);

    if (isEventStatement(text)) {
      events.push({
        id: ev.id || `event-${crypto.randomUUID()}`,
        description: text,
        importance: ev.importance || 'medium',
        evidenceTranscriptIndices: indices,
        revealTime
      });
    } else {
      reclassifiedCount++;
      factCandidates.push({
        id: `fact-${crypto.randomUUID()}`,
        statement: text,
        evidenceTranscriptIndices: indices,
        revealTime,
        origin: 'reclassified_event'
      });
    }
  }

  for (const f of rawFacts) {
    if (!f.statement || typeof f.statement !== 'string') continue;
    const text = f.statement.trim();
    const indices = cleanIndices(f.evidenceTranscriptIndices);
    const revealTime = deriveRevealTime(indices, transcriptSegments);

    factCandidates.push({
      id: f.id || `fact-${crypto.randomUUID()}`,
      statement: text,
      evidenceTranscriptIndices: indices,
      revealTime,
      origin: 'direct_fact'
    });
  }

  const deduplicatedFacts: CanonicalFact[] = [];
  for (const candidate of factCandidates) {
    let merged = false;
    for (const existing of deduplicatedFacts) {
      if (
        normalizeText(existing.statement) === normalizeText(candidate.statement) ||
        jaccardSimilarity(existing.statement, candidate.statement) >= 0.75
      ) {
        existing.evidenceTranscriptIndices = unionEvidenceIndices(
          existing.evidenceTranscriptIndices,
          candidate.evidenceTranscriptIndices
        );
        existing.revealTime = deriveRevealTime(existing.evidenceTranscriptIndices, transcriptSegments);
        if (candidate.statement.length > existing.statement.length) {
          existing.statement = candidate.statement;
        }
        merged = true;
        break;
      }
    }
    if (!merged) {
      deduplicatedFacts.push(candidate);
    }
  }

  events.sort((a, b) => a.revealTime - b.revealTime);
  deduplicatedFacts.sort((a, b) => a.revealTime - b.revealTime);

  return {
    events,
    facts: deduplicatedFacts,
    reclassifiedCount
  };
}

/**
 * Validate and Deduplicate Relationships:
 * Enforces REFERENTIAL INTEGRITY:
 * - Every sourceId and targetId MUST resolve to a real canonical node.
 * - Dangling relationships are REJECTED (and converted to facts if valuable).
 * - sourceId !== targetId.
 * - Deduplicates edges by (sourceId, type, targetId).
 */
export function validateAndDeduplicateRelationships(
  rawRelationships: any[],
  canonicalNodes: CanonicalNode[],
  transcriptSegments: any[]
): {
  relationships: CanonicalRelationship[];
  convertedFacts: CanonicalFact[];
  rejectedDanglingCount: number;
} {
  const nodeMap = new Map<string, CanonicalNode>();
  const nameToIdMap = new Map<string, string>();

  for (const node of canonicalNodes) {
    nodeMap.set(node.id, node);
    nameToIdMap.set(normalizeText(node.name), node.id);
    nameToIdMap.set(node.id.toLowerCase(), node.id);
    if (Array.isArray(node.aliases)) {
      for (const alias of node.aliases) {
        nameToIdMap.set(normalizeText(alias), node.id);
      }
    }
  }

  const relMap = new Map<string, CanonicalRelationship>();
  const convertedFacts: CanonicalFact[] = [];
  let rejectedDanglingCount = 0;

  for (const rel of rawRelationships) {
    if (!rel.relationshipType) continue;

    let resolvedSourceId: string | null = null;
    if (rel.sourceId && nodeMap.has(rel.sourceId)) {
      resolvedSourceId = rel.sourceId;
    } else if (rel.sourceName && nameToIdMap.has(normalizeText(rel.sourceName))) {
      resolvedSourceId = nameToIdMap.get(normalizeText(rel.sourceName))!;
    } else if (rel.sourceId && nameToIdMap.has(normalizeText(rel.sourceId))) {
      resolvedSourceId = nameToIdMap.get(normalizeText(rel.sourceId))!;
    }

    let resolvedTargetId: string | null = null;
    if (rel.targetId && nodeMap.has(rel.targetId)) {
      resolvedTargetId = rel.targetId;
    } else if (rel.targetName && nameToIdMap.has(normalizeText(rel.targetName))) {
      resolvedTargetId = nameToIdMap.get(normalizeText(rel.targetName))!;
    } else if (rel.targetId && nameToIdMap.has(normalizeText(rel.targetId))) {
      resolvedTargetId = nameToIdMap.get(normalizeText(rel.targetId))!;
    }

    const indices = cleanIndices(rel.evidenceTranscriptIndices);

    // Referential Integrity Enforcement
    if (!resolvedSourceId || !resolvedTargetId || !nodeMap.has(resolvedSourceId) || !nodeMap.has(resolvedTargetId)) {
      rejectedDanglingCount++;
      if (rel.description && rel.description.length > 15) {
        convertedFacts.push({
          id: `fact-${crypto.randomUUID()}`,
          statement: rel.description,
          evidenceTranscriptIndices: indices,
          revealTime: deriveRevealTime(indices, transcriptSegments),
          origin: 'converted_relationship'
        });
      }
      continue;
    }

    // Reject self loops
    if (resolvedSourceId === resolvedTargetId) {
      continue;
    }

    // Significance filter on trivial relations
    const relTypeNorm = normalizeText(rel.relationshipType);
    if (relTypeNorm === 'can be detected automatically') {
      if (rel.description) {
        convertedFacts.push({
          id: `fact-${crypto.randomUUID()}`,
          statement: rel.description,
          evidenceTranscriptIndices: indices,
          revealTime: deriveRevealTime(indices, transcriptSegments),
          origin: 'converted_relationship'
        });
      }
      continue;
    }

    const edgeKey = `${resolvedSourceId}::${relTypeNorm}::${resolvedTargetId}`;
    if (!relMap.has(edgeKey)) {
      const canonicalRel: CanonicalRelationship = {
        id: rel.id || `rel-${crypto.randomUUID()}`,
        sourceId: resolvedSourceId,
        targetId: resolvedTargetId,
        relationshipType: rel.relationshipType.trim(),
        description: rel.description || '',
        evidenceTranscriptIndices: indices,
        firstKnownAt: deriveRevealTime(indices, transcriptSegments)
      };
      relMap.set(edgeKey, canonicalRel);
    } else {
      const existing = relMap.get(edgeKey)!;
      existing.evidenceTranscriptIndices = unionEvidenceIndices(existing.evidenceTranscriptIndices, indices);
      existing.firstKnownAt = deriveRevealTime(existing.evidenceTranscriptIndices, transcriptSegments);
      if (rel.description && (!existing.description || rel.description.length > existing.description.length)) {
        existing.description = rel.description;
      }
    }
  }

  const result = Array.from(relMap.values());
  result.sort((a, b) => a.firstKnownAt - b.firstKnownAt);

  return {
    relationships: result,
    convertedFacts,
    rejectedDanglingCount
  };
}
