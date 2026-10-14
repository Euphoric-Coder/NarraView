/**
 * NarraView Segmentation Parser - v4-balanced-candidate-scanner
 * Robust JSON extraction with multi-candidate structural balance scanning,
 * string-safe escape handling, schema validation, and one-time repair retry.
 */

export const PARSER_VERSION = "v4-balanced-candidate-scanner";

export interface ParserStats {
  parserVersion: string;
  responseLength: number;
  candidateCount: number;
  parseableCandidateCount: number;
  schemaValidCandidateCount: number;
  repairRetryAttempted: boolean;
  acceptedStartIndex?: number;
  acceptedEndIndex?: number;
  acceptedCandidateLength?: number;
}

export function stripMarkdownFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

/**
 * Extracts a balanced JSON object starting at startIndex.
 * String-safe: correctly handles quotes, escaped quotes (\"), and escaped backslashes (\\).
 * Braces inside strings do not alter braceDepth.
 * Does NOT invent missing closing braces on truncated input.
 */
export function extractBalancedCandidate(
  text: string,
  startIndex: number
): { candidate: string; endIndex: number } | null {
  if (text[startIndex] !== "{") {
    return null;
  }

  let depth = 0;
  let insideString = false;
  let escaped = false;

  for (let i = startIndex; i < text.length; i++) {
    const ch = text[i];

    if (insideString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        insideString = false;
      }
      continue;
    }

    if (ch === '"') {
      insideString = true;
      continue;
    }

    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return {
          candidate: text.slice(startIndex, i + 1),
          endIndex: i
        };
      }
      if (depth < 0) {
        return null;
      }
    }
  }

  return null;
}

/**
 * Validates that parsed JSON satisfies the v0.13 segmentation schema.
 * Must contain non-empty segments array with valid index bounds and title.
 */
export function validateSegmentationSchema(candidate: any): { valid: boolean; reason?: string } {
  if (!candidate || typeof candidate !== "object") {
    return { valid: false, reason: "Candidate is not a JSON object" };
  }

  if (!("segments" in candidate) || !Array.isArray(candidate.segments)) {
    return { valid: false, reason: "Missing 'segments' array" };
  }

  if (candidate.segments.length === 0) {
    return { valid: false, reason: "'segments' array is empty" };
  }

  for (let i = 0; i < candidate.segments.length; i++) {
    const seg = candidate.segments[i];
    if (!seg || typeof seg !== "object") {
      return { valid: false, reason: `Segment at index ${i} is not an object` };
    }

    const sIdx = seg.startIndex !== undefined ? seg.startIndex : seg.transcriptStartIndex;
    const eIdx = seg.endIndex !== undefined ? seg.endIndex : seg.transcriptEndIndex;

    if (sIdx === undefined || eIdx === undefined) {
      return { valid: false, reason: `Segment at index ${i} missing startIndex/endIndex` };
    }

    const startNum = Number(sIdx);
    const endNum = Number(eIdx);

    if (!Number.isInteger(startNum) || !Number.isInteger(endNum) || startNum < 0 || endNum < startNum) {
      return { valid: false, reason: `Segment at index ${i} has invalid indices: ${sIdx} to ${eIdx}` };
    }

    if (!seg.title || typeof seg.title !== "string" || seg.title.trim().length === 0) {
      return { valid: false, reason: `Segment at index ${i} missing non-empty title` };
    }
  }

  return { valid: true };
}

/**
 * Scans every opening brace in text, extracting balanced candidates,
 * attempting JSON.parse, and checking the segmentation schema.
 */
export function scanBalancedCandidates(
  text: string,
  stats: ParserStats
): { parsed: any; candidate: string; startIndex: number; endIndex: number } | null {
  console.log(JSON.stringify({
    event: "JSON_CANDIDATE_SCAN_START",
    version: PARSER_VERSION,
    textLength: text.length
  }));

  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "{") {
      continue;
    }

    const extraction = extractBalancedCandidate(text, i);
    if (!extraction) {
      continue;
    }

    stats.candidateCount++;
    console.log(JSON.stringify({
      event: "JSON_CANDIDATE_FOUND",
      candidateStartIndex: i,
      candidateEndIndex: extraction.endIndex
    }));

    let parsedCandidate: any;
    try {
      parsedCandidate = JSON.parse(extraction.candidate);
      stats.parseableCandidateCount++;
    } catch (err: any) {
      console.log(JSON.stringify({
        event: "JSON_CANDIDATE_PARSE_FAILED",
        candidateStartIndex: i,
        candidateEndIndex: extraction.endIndex,
        error: err.message
      }));
      continue;
    }

    const schemaCheck = validateSegmentationSchema(parsedCandidate);
    if (!schemaCheck.valid) {
      console.log(JSON.stringify({
        event: "JSON_CANDIDATE_SCHEMA_REJECTED",
        candidateStartIndex: i,
        candidateEndIndex: extraction.endIndex,
        reason: schemaCheck.reason
      }));
      continue;
    }

    stats.schemaValidCandidateCount++;
    stats.acceptedStartIndex = i;
    stats.acceptedEndIndex = extraction.endIndex;
    stats.acceptedCandidateLength = extraction.candidate.length;

    console.log(JSON.stringify({
      event: "JSON_CANDIDATE_ACCEPTED",
      candidateStartIndex: i,
      candidateEndIndex: extraction.endIndex,
      candidateLength: extraction.candidate.length,
      segmentCount: parsedCandidate.segments.length
    }));

    return {
      parsed: parsedCandidate,
      candidate: extraction.candidate,
      startIndex: i,
      endIndex: extraction.endIndex
    };
  }

  return null;
}

/**
 * Main parseSegmentationJson entry point:
 * Order:
 * A. direct JSON.parse(rawResponse)
 * B. markdown JSON extraction (strip fences)
 * C. structural balanced-object candidate scanning
 * D. exactly one optional Bedrock repair retry
 * E. structured failure diagnostics
 */
export async function parseSegmentationJson(
  rawText: string,
  repairRetryFn?: () => Promise<string>
): Promise<{ parsed: any; stats: ParserStats }> {
  console.log(JSON.stringify({
    event: "JSON_PARSER_VERSION",
    version: PARSER_VERSION
  }));

  const stats: ParserStats = {
    parserVersion: PARSER_VERSION,
    responseLength: rawText.length,
    candidateCount: 0,
    parseableCandidateCount: 0,
    schemaValidCandidateCount: 0,
    repairRetryAttempted: false
  };

  // Step A: Direct JSON.parse
  try {
    const directParsed = JSON.parse(rawText.trim());
    if (validateSegmentationSchema(directParsed).valid) {
      stats.candidateCount = 1;
      stats.parseableCandidateCount = 1;
      stats.schemaValidCandidateCount = 1;
      stats.acceptedCandidateLength = rawText.trim().length;
      console.log(JSON.stringify({
        event: "JSON_CANDIDATE_ACCEPTED",
        stage: "DIRECT_PARSE",
        segmentCount: directParsed.segments.length
      }));
      return { parsed: directParsed, stats };
    }
  } catch {}

  // Step B: Markdown JSON extraction
  const cleaned = stripMarkdownFences(rawText);
  if (cleaned !== rawText.trim()) {
    try {
      const markdownParsed = JSON.parse(cleaned);
      if (validateSegmentationSchema(markdownParsed).valid) {
        stats.candidateCount++;
        stats.parseableCandidateCount++;
        stats.schemaValidCandidateCount++;
        stats.acceptedCandidateLength = cleaned.length;
        console.log(JSON.stringify({
          event: "JSON_CANDIDATE_ACCEPTED",
          stage: "MARKDOWN_FENCE_PARSE",
          segmentCount: markdownParsed.segments.length
        }));
        return { parsed: markdownParsed, stats };
      }
    } catch {}
  }

  // Step C: Structural balanced-object candidate scanning
  const candidateResult = scanBalancedCandidates(cleaned, stats);
  if (candidateResult) {
    return { parsed: candidateResult.parsed, stats };
  }

  // Also check rawText if cleaned didn't find it (in case fences corrupted structure)
  if (cleaned !== rawText) {
    const rawCandidateResult = scanBalancedCandidates(rawText, stats);
    if (rawCandidateResult) {
      return { parsed: rawCandidateResult.parsed, stats };
    }
  }

  // Step D: Exactly one optional Bedrock repair retry (Requirement 12)
  if (repairRetryFn) {
    stats.repairRetryAttempted = true;
    console.log(JSON.stringify({
      event: "JSON_REPAIR_RETRY_TRIGGERED",
      version: PARSER_VERSION,
      statsSoFar: stats
    }));

    try {
      const repairRawText = await repairRetryFn();
      if (repairRawText && repairRawText.trim().length > 0) {
        // Attempt Direct, Markdown, and Candidate scan on repaired response
        try {
          const directRepair = JSON.parse(repairRawText.trim());
          if (validateSegmentationSchema(directRepair).valid) {
            stats.schemaValidCandidateCount++;
            return { parsed: directRepair, stats };
          }
        } catch {}

        const cleanedRepair = stripMarkdownFences(repairRawText);
        try {
          const markdownRepair = JSON.parse(cleanedRepair);
          if (validateSegmentationSchema(markdownRepair).valid) {
            stats.schemaValidCandidateCount++;
            return { parsed: markdownRepair, stats };
          }
        } catch {}

        const repairScanResult = scanBalancedCandidates(cleanedRepair, stats);
        if (repairScanResult) {
          return { parsed: repairScanResult.parsed, stats };
        }
      }
    } catch (repairErr: any) {
      console.warn("Bedrock repair retry failed to complete:", repairErr.message);
    }
  }

  // Step E: Structured failure diagnostics (Requirement 15)
  const failureError = new Error("No valid segmentation JSON object found in Bedrock response");
  (failureError as any).diagnostics = stats;
  console.log(JSON.stringify({
    event: "SEGMENTATION_PARSER_EXHAUSTED",
    diagnostics: stats
  }));

  throw failureError;
}
