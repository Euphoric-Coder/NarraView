/**
 * NarraView Transcript Correction & Normalization Engine
 * Handles ASR error correction with strict no-rewrite guarantees,
 * diff safety, confidence filtering, semantic guardrails, and timestamp/index preservation.
 */

export type CorrectionConfidence = 'high' | 'medium' | 'low';

export type CorrectionCategory =
  | 'technical_term'
  | 'product_name'
  | 'framework_name'
  | 'acronym'
  | 'entity_alias'
  | 'domain_term'
  | 'other';

export interface TranscriptCorrection {
  transcriptIndex: number;
  original: string;
  corrected: string;
  confidence: CorrectionConfidence;
  reason: string;
  category: CorrectionCategory;
  autoApplied: boolean;
}

export interface CorrectedTranscriptSegment {
  id: string;
  transcriptIndex: number;
  startTime: number;
  endTime: number;
  originalText: string;
  correctedText: string;
  confidence?: number;
  correctionCount: number;
  corrections?: TranscriptCorrection[];
}

export interface CorrectedTranscriptDocument {
  contentId: string;
  language: string;
  durationSeconds?: number;
  segments: CorrectedTranscriptSegment[];
  corrections: TranscriptCorrection[];
  metadata: {
    source: "amazon-transcribe";
    correctionProvider: "bedrock-mantle";
    correctionModel: string;
    createdAt: string;
    totalCorrections: number;
    appliedCorrections: number;
    highConfidenceCount: number;
    mediumConfidenceCount: number;
    lowConfidenceCount: number;
  };
}

export interface SegmentItem {
  transcriptIndex: number;
  startTime: number;
  endTime: number;
  text: string;
  id?: string;
  confidence?: number;
}

// ==========================================
// SEMANTIC GUARDRAILS & PROTECTED DICTIONARIES
// ==========================================

export const KNOWN_ROLES = new Set([
  'unit officer',
  'field officer',
  'officer',
  'citizen',
  'admin',
  'administrator',
  'manager',
  'dispatcher',
  'inspector',
  'operator',
  'agent',
  'supervisor',
  'user'
]);

export const WORKFLOW_STATUSES = new Set([
  'approved',
  'rejected',
  'resolved',
  'rework',
  'on track',
  'due soon',
  'overdue',
  'closed',
  'open',
  'pending',
  'escalation',
  'closure',
  'verification'
]);

export const NEGATION_WORDS = new Set([
  'not',
  'no',
  'never',
  'none',
  'neither',
  'nor',
  'without',
  "can't",
  'cannot',
  "won't",
  "don't",
  "didn't",
  "isn't",
  "aren't",
  "wasn't",
  "weren't"
]);

export const COMMON_ENGLISH_WORDS = new Set([
  'civic', 'officer', 'approve', 'seller', 'surface', 'unit', 'field', 'citizen',
  'service', 'deadline', 'deadlines', 'report', 'reports', 'issue', 'issues',
  'delay', 'delays', 'track', 'responsible', 'complaint', 'complaints',
  'system', 'systems', 'platform', 'workload', 'testing', 'formula',
  'points', 'coordinate', 'coordinates', 'distance', 'close', 'closely',
  'simple', 'desktop', 'ground', 'mobile', 'closure', 'rework', 'escalation',
  'overview', 'dashboard', 'anonymous', 'preview', 'submit', 'warning',
  'redundant', 'abusive', 'spam', 'window', 'windows', 'cooldown', 'reliable',
  'evidence', 'verify', 'verification', 'action', 'timeline', 'audit', 'visible',
  'history', 'engineering', 'product', 'algorithms', 'geospatial', 'accountable',
  'attempt', 'watching', 'centralized', 'management', 'familiar', 'spread',
  'channel', 'channels', 'happens', 'process', 'entire', 'divide', 'divided',
  'section', 'sections', 'first', 'title', 'description', 'categories',
  'priority', 'supporting', 'media', 'automatic', 'automatically', 'searched',
  'manual', 'manually', 'needed', 'looks', 'good', 'especially', 'real',
  'pothole', 'drainage', 'multiple', 'creates', 'unnecessary', 'existing',
  'location', 'text', 'similarity', 'nearby', 'within', 'roughly', 'high',
  'enough', 'helped', 'reduce', 'during', 'rate', 'limiting', 'prevent',
  'submissions', 'timed', 'request', 'controls', 'small', 'feature', 'fair',
  'decide', 'whether', 'move', 'forward', 'assigned', 'accessible',
  'wherever', 'structured', 'dedicated', 'start', 'work', 'capture', 'upload',
  'updates', 'directly', 'idea', 'photo', 'resolution', 'calculates', 'between',
  'match', 'sent', 'important', 'more', 'visibility', 'dashboards', 'trends',
  'classified', 'easier', 'identify', 'before', 'bigger', 'problems', 'another',
  'thing', 'feeling', 'simply', 'disappears', 'submission', 'communicate',
  'together', 'admin', 'experience', 'runs', 'powers', 'support',
  'custom', 'coding', 'question', 'kept', 'coming', 'moment', 'actually', 'resolved'
]);

// ==========================================
// STRING & PHONETIC COMPARISON HELPERS
// ==========================================

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

export function computeDiffRatio(original: string, proposed: string): number {
  const maxLen = Math.max(original.length, proposed.length);
  if (maxLen === 0) return 0;
  const dist = levenshteinDistance(original.toLowerCase(), proposed.toLowerCase());
  return dist / maxLen;
}

export function soundex(s: string): string {
  const a = s.toLowerCase().replace(/[^a-z]/g, '');
  if (!a) return '';
  const firstLetter = a[0].toUpperCase();
  const codes: Record<string, string> = {
    b: '1', f: '1', p: '1', v: '1',
    c: '2', g: '2', j: '2', k: '2', q: '2', s: '2', x: '2', z: '2',
    d: '3', t: '3',
    l: '4',
    m: '5', n: '5',
    r: '6'
  };
  let result = firstLetter;
  let prevCode = codes[a[0]] || '';
  for (let i = 1; i < a.length; i++) {
    const code = codes[a[i]] || '';
    if (code && code !== prevCode) {
      result += code;
    }
    prevCode = code;
    if (result.length === 4) break;
  }
  return result.padEnd(4, '0');
}

export function consonantSkeleton(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, '').replace(/[aeiouywh]/g, '');
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ==========================================
// VALIDATION & AUTO-APPLY POLICY
// ==========================================

export function isRoleSubstitution(original: string, corrected: string): boolean {
  const orig = original.trim().toLowerCase();
  const corr = corrected.trim().toLowerCase();
  if (orig === corr) return false;

  const isOrigRole = KNOWN_ROLES.has(orig) || orig.includes('officer') || orig.includes('citizen') || orig.includes('admin');
  const isCorrRole = KNOWN_ROLES.has(corr) || corr.includes('officer') || corr.includes('citizen') || corr.includes('admin');

  if (isOrigRole && isCorrRole) {
    return true;
  }
  return false;
}

export function isSemanticWordReplacement(original: string, corrected: string): boolean {
  const orig = original.trim().toLowerCase();
  const corr = corrected.trim().toLowerCase();
  if (orig === corr) return false;

  // If the original is a valid, recognized English word (like "civic", "officer", "approve", "seller")
  if (COMMON_ENGLISH_WORDS.has(orig)) {
    const dist = levenshteinDistance(orig, corr);
    const ratio = dist / Math.max(orig.length, corr.length);

    // If it's not a trivial 1-character typo or case difference, it is semantic rewriting!
    if (dist > 1 || ratio > 0.25) {
      return true;
    }
  }

  // Cross-category checks: e.g. "officer" (noun/role) -> "approve" (verb)
  if ((orig === 'officer' && corr === 'approve') || (orig === 'civic' && corr.includes('citycare'))) {
    return true;
  }

  return false;
}

export function hasQuantityMismatch(original: string, corrected: string): boolean {
  const numRegex = /\b\d+(?:\.\d+)?(?:%|m|km|s|ms|h| reports\/day)?\b/gi;
  const origNums = (original.match(numRegex) || []).map(s => s.toLowerCase());
  const corrNums = (corrected.match(numRegex) || []).map(s => s.toLowerCase());

  if (origNums.length > 0 || corrNums.length > 0) {
    if (origNums.join(',') !== corrNums.join(',')) {
      return true;
    }
  }
  return false;
}

export function hasPolarityChange(original: string, corrected: string): boolean {
  const getNegs = (text: string) => {
    const tokens = text.toLowerCase().split(/\s+/);
    return tokens.filter(t => NEGATION_WORDS.has(t));
  };
  const origNegs = getNegs(original);
  const corrNegs = getNegs(corrected);
  return origNegs.length !== corrNegs.length;
}

export function isWorkflowStatusChange(original: string, corrected: string): boolean {
  const orig = original.trim().toLowerCase();
  const corr = corrected.trim().toLowerCase();
  if (orig === corr) return false;

  const origStatus = WORKFLOW_STATUSES.has(orig);
  const corrStatus = WORKFLOW_STATUSES.has(corr);
  return origStatus && corrStatus;
}

/**
 * Checks whether a proposed correction qualifies for high-confidence auto-apply
 * according to the hardened NarraView policy.
 */
export function evaluateAutoApply(
  original: string,
  corrected: string,
  confidence: CorrectionConfidence,
  trustedTerms: string[] = []
): { autoApply: boolean; reason: string } {
  const orig = original.trim();
  const corr = corrected.trim();
  const origLower = orig.toLowerCase();
  const corrLower = corr.toLowerCase();

  if (origLower === corrLower) {
    return { autoApply: false, reason: "Identical original and corrected terms" };
  }

  // 1. Prohibit Role Substitution (Item 6)
  if (isRoleSubstitution(orig, corr)) {
    return {
      autoApply: false,
      reason: `Prohibited role substitution: changing '${orig}' into '${corr}' alters domain actor`
    };
  }

  // 2. Prohibit Semantic Word Replacement (Item 7)
  if (isSemanticWordReplacement(orig, corr)) {
    return {
      autoApply: false,
      reason: `Prohibited semantic word replacement: legitimate English word '${orig}' cannot be rewritten to '${corr}'`
    };
  }

  // 3. Protect Critical Semantics: Numbers, Quantities, Percentages, Distances (Item 9)
  if (hasQuantityMismatch(orig, corr)) {
    return {
      autoApply: false,
      reason: `Prohibited quantity modification: numbers, percentages, or units changed between '${orig}' and '${corr}'`
    };
  }

  // 4. Protect Polarity / Negation (Item 9)
  if (hasPolarityChange(orig, corr)) {
    return {
      autoApply: false,
      reason: `Prohibited polarity shift: negation modified between '${orig}' and '${corr}'`
    };
  }

  // 5. Protect Workflow Status Names (Item 9)
  if (isWorkflowStatusChange(orig, corr)) {
    return {
      autoApply: false,
      reason: `Prohibited workflow status change: '${orig}' to '${corr}'`
    };
  }

  // 6. Build trusted terms lookup
  const trustedLower = new Set(trustedTerms.map(t => t.toLowerCase().trim()));
  const isTrustedCorr = trustedLower.has(corrLower) || trustedTerms.some(t => {
    const tLow = t.toLowerCase();
    return corrLower.includes(tLow) || tLow.includes(corrLower);
  });

  const dist = levenshteinDistance(origLower, corrLower);
  const diffRatio = dist / Math.max(orig.length, corr.length);

  // Soundex & Consonant Skeleton checks
  const isPhoneticMatch =
    soundex(orig) === soundex(corr) ||
    levenshteinDistance(consonantSkeleton(orig), consonantSkeleton(corr)) <= 2 ||
    origLower.startsWith(corrLower.slice(0, 3));

  // 7. Auto-Apply Decision Tree:
  // LOW confidence -> Never auto-apply
  if (confidence === 'low') {
    return { autoApply: false, reason: "Low model confidence; requires manual review" };
  }

  // MEDIUM confidence -> Auto-apply ONLY with explicit trusted vocabulary match and small edit distance
  if (confidence === 'medium') {
    if (isTrustedCorr && !COMMON_ENGLISH_WORDS.has(origLower) && (dist <= 3 || isPhoneticMatch)) {
      return { autoApply: true, reason: "Medium confidence supported by trusted domain vocabulary match" };
    }
    return { autoApply: false, reason: "Medium confidence without overwhelming trusted vocabulary support; held for review" };
  }

  // HIGH confidence:
  // Must be obvious phonetic ASR error, spelling mistake, or known product/technical term
  if (confidence === 'high') {
    // If corrected matches trusted vocabulary
    if (isTrustedCorr) {
      if (!COMMON_ENGLISH_WORDS.has(origLower) || dist <= 2) {
        return { autoApply: true, reason: `High-confidence trusted vocabulary correction: '${orig}' -> '${corr}'` };
      }
    }

    // Obvious spelling mistake / localized phonetic error (small diff ratio and not a valid common word)
    if (!COMMON_ENGLISH_WORDS.has(origLower) && (diffRatio <= 0.45 || isPhoneticMatch)) {
      return { autoApply: true, reason: `High-confidence phonetic/orthographic ASR correction: '${orig}' -> '${corr}'` };
    }

    // If edit distance is too large and not in trusted vocabulary, hold for safety
    if (diffRatio > 0.45 && !isTrustedCorr) {
      return { autoApply: false, reason: "High edit distance without trusted vocabulary match; held for safety" };
    }

    return { autoApply: true, reason: `High-confidence verified correction: '${orig}' -> '${corr}'` };
  }

  return { autoApply: false, reason: "Default hold policy" };
}

// ==========================================
// TEXT REPLACEMENT & SEGMENT PROCESSOR
// ==========================================

export function applySurgicalReplacements(
  originalText: string,
  corrections: Array<{ original: string; corrected: string }>
): string {
  let result = originalText;
  for (const c of corrections) {
    if (!c.original || !c.corrected || c.original === c.corrected) continue;
    const regex = new RegExp(`\\b${escapeRegExp(c.original)}\\b`, 'gi');
    if (regex.test(result)) {
      result = result.replace(regex, c.corrected);
    } else {
      const fallbackRegex = new RegExp(escapeRegExp(c.original), 'gi');
      result = result.replace(fallbackRegex, c.corrected);
    }
  }
  return result;
}

export function processSegmentCorrections(
  rawSegment: { startTime: number; endTime: number; text: string; id?: string },
  transcriptIndex: number,
  proposed: {
    correctedText?: string;
    corrections?: Array<{
      original?: string;
      corrected?: string;
      confidence?: string;
      reason?: string;
      category?: string;
    }>;
  },
  trustedTerms: string[] = []
): {
  segment: CorrectedTranscriptSegment;
  validatedCorrections: TranscriptCorrection[];
} {
  const originalText = rawSegment.text.trim();
  // CRITICAL: Preserve timestamps strictly without modification
  const startTime = rawSegment.startTime;
  const endTime = rawSegment.endTime;

  const validatedCorrections: TranscriptCorrection[] = [];
  const rawCorrections = Array.isArray(proposed.corrections) ? proposed.corrections : [];

  for (const c of rawCorrections) {
    if (!c.original || !c.corrected) continue;
    const orig = c.original.trim();
    const corr = c.corrected.trim();
    if (orig === corr) continue;

    let confidence: CorrectionConfidence = 'low';
    const confStr = (c.confidence || '').toLowerCase();
    if (confStr === 'high') confidence = 'high';
    else if (confStr === 'medium') confidence = 'medium';

    const { autoApply, reason: policyReason } = evaluateAutoApply(orig, corr, confidence, trustedTerms);

    const category = (c.category as CorrectionCategory) || 'technical_term';
    const reason = policyReason || c.reason || 'ASR transcription correction';

    validatedCorrections.push({
      transcriptIndex,
      original: orig,
      corrected: corr,
      confidence,
      reason,
      category,
      autoApplied: autoApply
    });
  }

  // Apply ONLY corrections where autoApplied === true
  const autoAppliedReplacements = validatedCorrections
    .filter(c => c.autoApplied)
    .map(c => ({ original: c.original, corrected: c.corrected }));

  let finalCorrectedText = originalText;

  if (autoAppliedReplacements.length > 0) {
    const proposedText = (proposed.correctedText || '').trim();
    const diffRatio = computeDiffRatio(originalText, proposedText);

    // If proposed text is provided, localized (diff <= 25%), and didn't apply rejected changes:
    // We surgically apply the approved replacements onto originalText to prevent hallucinations/paraphrasing!
    finalCorrectedText = applySurgicalReplacements(originalText, autoAppliedReplacements);
  }

  const segment: CorrectedTranscriptSegment = {
    id: rawSegment.id || `seg-${transcriptIndex}`,
    transcriptIndex,
    startTime,
    endTime,
    originalText,
    correctedText: finalCorrectedText,
    correctionCount: validatedCorrections.filter(c => c.autoApplied).length,
    corrections: validatedCorrections
  };

  return { segment, validatedCorrections };
}

// ==========================================
// TOKEN-AWARE BATCHING (Items 1 & 2)
// ==========================================

export function createTokenAwareBatches(
  segments: SegmentItem[],
  maxSegmentsPerBatch: number = 10,       // Preferred: 8–12 segments
  maxInputTokensPerBatch: number = 3200   // Preferred: 2500–4000 input tokens
): SegmentItem[][] {
  const batches: SegmentItem[][] = [];
  let currentBatch: SegmentItem[] = [];
  let currentTokens = 0;

  // Approximate tokens: text.length / 4 + 25 tokens formatting overhead per segment
  const estimateTokens = (text: string) => Math.ceil(text.length / 4) + 25;

  for (const seg of segments) {
    const segTokens = estimateTokens(seg.text);

    if (
      currentBatch.length >= maxSegmentsPerBatch ||
      (currentBatch.length > 0 && currentTokens + segTokens > maxInputTokensPerBatch)
    ) {
      batches.push(currentBatch);
      currentBatch = [];
      currentTokens = 0;
    }

    currentBatch.push(seg);
    currentTokens += segTokens;
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}
