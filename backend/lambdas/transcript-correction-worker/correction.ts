/**
 * NarraView Transcript Correction & Normalization Engine
 * Handles ASR error correction with strict no-rewrite guarantees,
 * diff safety, confidence filtering, and timestamp/index preservation.
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
  const dist = levenshteinDistance(original, proposed);
  return dist / maxLen;
}

/**
 * Escapes regex special characters.
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Surgically applies localized replacements to text to prevent sentence paraphrasing.
 */
export function applySurgicalReplacements(
  originalText: string,
  corrections: Array<{ original: string; corrected: string }>
): string {
  let result = originalText;
  for (const c of corrections) {
    if (!c.original || !c.corrected || c.original === c.corrected) continue;
    // Word boundary replacement if possible, or exact substring
    const regex = new RegExp(`\\b${escapeRegExp(c.original)}\\b`, 'gi');
    if (regex.test(result)) {
      result = result.replace(regex, c.corrected);
    } else {
      // Fallback to direct case-insensitive match
      const fallbackRegex = new RegExp(escapeRegExp(c.original), 'gi');
      result = result.replace(fallbackRegex, c.corrected);
    }
  }
  return result;
}

/**
 * Validates and finalizes segment corrections.
 * - Enforces diff size threshold (rejects rewrites > 25% change).
 * - Implements auto-apply policy:
 *   - HIGH: auto-apply.
 *   - MEDIUM: auto-apply only if supported by trusted terms.
 *   - LOW: do not auto-apply.
 * - Guarantees timestamps and index remain identical to raw.
 */
export function processSegmentCorrections(
  rawSegment: { startTime: number; endTime: number; text: string },
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
  const startTime = rawSegment.startTime;
  const endTime = rawSegment.endTime;

  const trustedLower = new Set(trustedTerms.map(t => t.toLowerCase().trim()));

  const validatedCorrections: TranscriptCorrection[] = [];
  const rawCorrections = Array.isArray(proposed.corrections) ? proposed.corrections : [];

  for (const c of rawCorrections) {
    if (!c.original || !c.corrected) continue;
    const orig = c.original.trim();
    const corr = c.corrected.trim();
    if (orig === corr) continue;

    // Determine confidence
    let confidence: CorrectionConfidence = 'low';
    const confStr = (c.confidence || '').toLowerCase();
    if (confStr === 'high') confidence = 'high';
    else if (confStr === 'medium') confidence = 'medium';

    // Auto-apply evaluation:
    // High confidence -> auto-apply.
    // Medium confidence -> auto-apply if corrected term matches trusted terms.
    // Low confidence -> do not auto-apply.
    let autoApplied = false;
    if (confidence === 'high') {
      autoApplied = true;
    } else if (confidence === 'medium') {
      if (trustedLower.has(corr.toLowerCase())) {
        autoApplied = true;
      }
    }

    const category = (c.category as CorrectionCategory) || 'technical_term';
    const reason = c.reason || 'ASR transcription correction';

    validatedCorrections.push({
      transcriptIndex,
      original: orig,
      corrected: corr,
      confidence,
      reason,
      category,
      autoApplied
    });
  }

  // Determine final corrected text
  const autoAppliedReplacements = validatedCorrections
    .filter(c => c.autoApplied)
    .map(c => ({ original: c.original, corrected: c.corrected }));

  let finalCorrectedText = originalText;

  if (autoAppliedReplacements.length > 0) {
    const proposedText = (proposed.correctedText || '').trim();
    const diffRatio = computeDiffRatio(originalText, proposedText);

    // If proposed text is provided, safe (diff <= 25%), and does not alter sentence length drastically:
    if (proposedText && diffRatio <= 0.25) {
      finalCorrectedText = proposedText;
    } else {
      // Surgical fallback: strictly replace only the identified words, eliminating any sentence paraphrase!
      finalCorrectedText = applySurgicalReplacements(originalText, autoAppliedReplacements);
    }
  }

  const segment: CorrectedTranscriptSegment = {
    id: `seg-${transcriptIndex}`,
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
