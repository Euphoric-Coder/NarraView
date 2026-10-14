import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { OpenAI } from "openai";
import { getTokenProvider } from '@aws/bedrock-token-generator';
import { parseSegmentationJson, PARSER_VERSION, ParserStats } from "./parser";

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient, { marshallOptions: { removeUndefinedValues: true } });
const s3Client = new S3Client({});
const lambdaClient = new LambdaClient({});

const TABLE_NAME = process.env.TABLE_NAME || '';
const BUCKET_NAME = process.env.BUCKET_NAME || '';
const BEDROCK_MANTLE_BASE_URL = process.env.BEDROCK_MANTLE_BASE_URL || 'https://bedrock-mantle.eu-north-1.api.aws/v1';
const BEDROCK_MANTLE_MODEL = 'openai.gpt-oss-120b';

export interface CanonicalTranscriptSegment {
  transcriptIndex: number;
  startTime: number;
  endTime: number;
  text: string;
}

let provideToken: any = null;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export const handler = async (event: any) => {
  console.log("Segmentation worker event:", JSON.stringify(event));

  const contentId = event.contentId;
  if (!contentId) {
    console.error("No contentId provided to segmentation worker");
    return;
  }

  const requestId = event.requestId || `seg-${Date.now()}`;
  let currentStage = 'INITIALIZATION';
  let rawOutputLength = 0;
  let lastDiagnostics: ParserStats | null = null;

  console.log(JSON.stringify({
    event: "SEGMENTATION_START",
    contentId,
    requestId
  }));

  try {
    currentStage = 'STATUS_UPDATE';
    const check = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { contentId } }));
    const item = check.Item;
    if (!item) throw new Error("Content not found in DynamoDB");

    await updateStatus(item, 'processing');

    currentStage = 'TRANSCRIPT_FETCH';
    const rawKey = `content/${contentId}/transcripts/raw/transcribe.json`;
    const normalizedKey = `content/${contentId}/transcripts/normalized/transcript.json`;
    const correctedKey = `content/${contentId}/transcripts/corrected/transcript.json`;

    let rawTranscribeItemCount = 0;
    try {
      const rawRes = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: rawKey }));
      const rawStr = await rawRes.Body?.transformToString();
      if (rawStr) {
        const rawJson = JSON.parse(rawStr);
        rawTranscribeItemCount = rawJson?.results?.items?.length || 0;
      }
    } catch {}

    let normalizedSegmentCount = 0;
    let normalizedDoc: any = null;
    try {
      const normRes = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: normalizedKey }));
      const normStr = await normRes.Body?.transformToString();
      if (normStr) {
        normalizedDoc = JSON.parse(normStr);
        normalizedSegmentCount = normalizedDoc?.segments?.length || 0;
      }
    } catch {}

    let correctedSegmentCount = 0;
    let correctedDoc: any = null;
    let transcriptKey = normalizedKey;
    try {
      const corrRes = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: correctedKey }));
      const corrStr = await corrRes.Body?.transformToString();
      if (corrStr) {
        correctedDoc = JSON.parse(corrStr);
        correctedSegmentCount = correctedDoc?.segments?.length || 0;
        transcriptKey = correctedKey;
      }
    } catch {}

    let source: 'corrected' | 'normalized' = 'corrected';
    let rawSegmentsList: any[] = [];
    if (correctedSegmentCount > 0) {
      source = 'corrected';
      rawSegmentsList = correctedDoc.segments;
    } else if (normalizedSegmentCount > 0) {
      source = 'normalized';
      rawSegmentsList = normalizedDoc.segments;
      transcriptKey = normalizedKey;
    } else {
      throw new Error(`No transcript found for contentId ${contentId}`);
    }

    const selectedSegmentCount = rawSegmentsList.length;

    // Requirement 5: Log canonical transcript validation
    console.log(JSON.stringify({
      event: "SEGMENTATION_INPUT_CONTRACT_CHECK",
      contentId,
      source,
      rawTranscribeItemCount,
      normalizedSegmentCount,
      correctedSegmentCount,
      selectedSegmentCount
    }));

    // Requirement 4: If normalized transcript exists and corrected is used, verify shape matching
    if (source === 'corrected' && normalizedSegmentCount > 0) {
      if (correctedSegmentCount !== normalizedSegmentCount) {
        throw new Error(`Corrected transcript count (${correctedSegmentCount}) does not match normalized transcript count (${normalizedSegmentCount})`);
      }
      for (let i = 0; i < normalizedSegmentCount; i++) {
        const nSeg = normalizedDoc.segments[i];
        const cSeg = correctedDoc.segments[i];
        const nIdx = typeof nSeg.transcriptIndex === 'number' ? nSeg.transcriptIndex : i;
        const cIdx = typeof cSeg.transcriptIndex === 'number' ? cSeg.transcriptIndex : i;
        if (nIdx !== cIdx) {
          throw new Error(`Transcript index mismatch at position ${i}: normalized=${nIdx}, corrected=${cIdx}`);
        }
        if (Math.abs(nSeg.startTime - cSeg.startTime) > 0.05 || Math.abs(nSeg.endTime - cSeg.endTime) > 0.05) {
          throw new Error(`Timestamp mismatch at index ${i}: normalized=[${nSeg.startTime}-${nSeg.endTime}], corrected=[${cSeg.startTime}-${cSeg.endTime}]`);
        }
      }
    }

    // Requirement 5: Guard against raw pronunciation items being passed to segmentation
    if (rawTranscribeItemCount > 0 && selectedSegmentCount >= rawTranscribeItemCount) {
      throw new Error(`Segmentation input validation failed: selectedSegmentCount (${selectedSegmentCount}) is equal to or exceeds rawTranscribeItemCount (${rawTranscribeItemCount}), indicating raw token items instead of canonical sentence segments.`);
    }

    // Convert to CanonicalTranscriptSegment
    const canonicalSegments: CanonicalTranscriptSegment[] = rawSegmentsList.map((s: any, idx: number) => ({
      transcriptIndex: typeof s.transcriptIndex === 'number' ? s.transcriptIndex : idx,
      startTime: typeof s.startTime === 'number' ? s.startTime : parseFloat(s.startTime || '0'),
      endTime: typeof s.endTime === 'number' ? s.endTime : parseFloat(s.endTime || '0'),
      text: (s.correctedText || s.text || s.originalText || '').trim()
    }));

    if (canonicalSegments.length === 0) {
      throw new Error("Transcript has no canonical segments");
    }

    // Requirement 6: Check Transcript Duration
    const normalizedTranscriptEndSeconds = canonicalSegments[canonicalSegments.length - 1].endTime;
    const mediaDurationSeconds = typeof item.durationSeconds === 'number' ? item.durationSeconds : null;
    const durationDifferenceSeconds = mediaDurationSeconds !== null ? Math.round(Math.abs(normalizedTranscriptEndSeconds - mediaDurationSeconds) * 100) / 100 : null;
    const isReasonable = durationDifferenceSeconds === null || durationDifferenceSeconds <= 600;

    console.log(JSON.stringify({
      event: "TRANSCRIPT_DURATION_CHECK",
      contentId,
      mediaDurationSeconds,
      normalizedTranscriptEndSeconds,
      durationDifferenceSeconds,
      isReasonable,
      timestampUnits: "seconds"
    }));

    if (!isReasonable) {
      console.warn(`WARNING: Transcript duration (${normalizedTranscriptEndSeconds}s) differs significantly from registered mediaDurationSeconds (${mediaDurationSeconds}s). Difference: ${durationDifferenceSeconds}s.`);
    }

    console.log(JSON.stringify({
      event: "TRANSCRIPT_FETCH_SUCCESS",
      contentId,
      transcriptKey,
      transcriptItemCount: canonicalSegments.length,
      transcriptDuration: normalizedTranscriptEndSeconds
    }));

    // Requirement 7: Compact segmentation input format
    const transcriptForLLM = canonicalSegments.map((seg) => {
      return `[${seg.transcriptIndex}] ${seg.startTime.toFixed(2)}-${seg.endTime.toFixed(2)} ${seg.text}`;
    }).join('\n');

    currentStage = 'BEDROCK_INVOKE';

    const systemPrompt = `You are an expert content analyzer for the NarraView platform.
Your job is to detect meaningful temporal boundaries in a video transcript and group the raw transcript chunks into logical, chronological segments.

RULES:
1. Return exactly ONE JSON object.
2. The first character MUST be:
{
3. The final character MUST be:
}
4. Root schema:
{
  "segments": [
    {
      "startIndex": 0,
      "endIndex": 4,
      "title": "Introduction to CityCare",
      "segmentType": "topic",
      "summary": "Overview of the CityCare platform features."
    }
  ]
}
5. Do NOT:
- wrap it in another object
- emit markdown outside or around the JSON
- prepend explanation or prose
- append explanation or prose
- duplicate the opening brace
6. Segments must cover the ENTIRE transcript timeline from index 0 to index ${canonicalSegments.length - 1} without any gaps or overlaps.
7. Use the exact transcript indices. startIndex is inclusive, endIndex is inclusive.
8. Segment titles must be concise, descriptive, and grounded in the transcript.
9. Minimum segment size should be around 10-30 seconds of content, do not over-fragment.
10. The segmentType should be "topic" or "instruction" for tutorials/demos, and "scene" or "chapter" for narrative content.`;

    if (!provideToken) { provideToken = getTokenProvider(); }
    const token = await provideToken();
    const openai = new OpenAI({
      apiKey: token,
      baseURL: BEDROCK_MANTLE_BASE_URL,
      defaultQuery: { project: 'default' }
    });

    console.log(JSON.stringify({
      event: "BEDROCK_REQUEST_START",
      modelId: BEDROCK_MANTLE_MODEL,
      transcriptItemCount: canonicalSegments.length
    }));

    const bedrockStart = Date.now();
    let response;
    try {
      response = await openai.chat.completions.create({
        model: BEDROCK_MANTLE_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Content Type: ${item.contentType || 'tutorial/demo'}\n\nTranscript:\n${transcriptForLLM}` }
        ],
        temperature: 0.1,
        max_tokens: 4000,
        response_format: { type: "json_object" }
      });
    } catch (bedrockErr: any) {
      console.error("Bedrock invocation failed:", bedrockErr);
      throw bedrockErr;
    }

    const durationMs = Date.now() - bedrockStart;
    const choice = response.choices?.[0];
    const finishReason = choice?.finish_reason || (choice as any)?.stop_reason || null;
    const usage = response.usage;
    const inputTokens = usage?.prompt_tokens || null;
    const outputTokens = usage?.completion_tokens || null;
    const maxOutputTokens = 4000;
    const rawOutput = choice?.message?.content || "";
    rawOutputLength = rawOutput.length;

    console.log(JSON.stringify({
      event: "BEDROCK_REQUEST_SUCCESS",
      durationMs,
      responseLength: rawOutputLength
    }));

    // Requirement 9: Detect Model Output Truncation Explicitly
    console.log(JSON.stringify({
      event: "BEDROCK_COMPLETION_METADATA",
      contentId,
      finishReason,
      stopReason: finishReason,
      inputTokens,
      outputTokens,
      maxOutputTokens,
      responseLength: rawOutputLength
    }));

    const isExplicitlyTruncated = finishReason === 'length' || finishReason === 'max_tokens' || finishReason === 'token_limit';
    if (isExplicitlyTruncated) {
      console.error(JSON.stringify({
        event: "BEDROCK_RESPONSE_TRUNCATED",
        contentId,
        finishReason,
        outputTokens,
        maxOutputTokens,
        responseLength: rawOutputLength
      }));
    }

    // Requirement 10: Root-Balance Diagnostics
    const trimmed = rawOutput.trim();
    const firstNonWhitespaceCharacter = trimmed.length > 0 ? trimmed[0] : "";
    const lastNonWhitespaceCharacter = trimmed.length > 0 ? trimmed[trimmed.length - 1] : "";
    let finalBraceDepth = 0;
    let insideStringAtEnd = false;
    let escaped = false;
    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (insideStringAtEnd) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') insideStringAtEnd = false;
        continue;
      }
      if (ch === '"') { insideStringAtEnd = true; continue; }
      if (ch === '{') finalBraceDepth++;
      else if (ch === '}') finalBraceDepth--;
    }
    const hasSegmentsRootPrefix = /^\s*\{\s*["']segments["']\s*:\s*\[/.test(trimmed) || /\{\s*\{\s*["']segments["']/.test(trimmed);

    console.log(JSON.stringify({
      event: "ROOT_JSON_BALANCE_CHECK",
      contentId,
      firstNonWhitespaceCharacter,
      lastNonWhitespaceCharacter,
      finalBraceDepth,
      insideStringAtEnd,
      hasSegmentsRootPrefix,
      isLikelyTruncated: firstNonWhitespaceCharacter === '{' && hasSegmentsRootPrefix && finalBraceDepth > 0
    }));

    currentStage = isExplicitlyTruncated ? 'BEDROCK_RESPONSE_TRUNCATED' : 'BEDROCK_RESPONSE_PARSE';
    console.log(JSON.stringify({
      event: "BEDROCK_RESPONSE_PREVIEW",
      preview: rawOutput.substring(0, 150)
    }));

    // Parse with v4-balanced-candidate-scanner and optional one-time Bedrock repair retry (Requirements 13 & 14)
    const parseResult = await parseSegmentationJson(rawOutput, async () => {
      console.log(JSON.stringify({
        event: "BEDROCK_REPAIR_RETRY_START",
        contentId,
        modelId: BEDROCK_MANTLE_MODEL
      }));
      const repairResponse = await openai.chat.completions.create({
        model: BEDROCK_MANTLE_MODEL,
        messages: [
          {
            role: 'system',
            content: `You are an expert video segmentation system.
Return the complete segmentation as exactly ONE valid JSON object:
{
  "segments": [
    {
      "startIndex": 0,
      "endIndex": 5,
      "title": "Title here",
      "segmentType": "topic",
      "summary": "Summary here"
    }
  ]
}
Requirements:
- Every segment MUST have startIndex (number), endIndex (number), title (string), segmentType (string), and summary (string).
- The segments MUST cover the entire timeline from index 0 to index ${canonicalSegments.length - 1} without any gaps or overlaps.
- Return ONLY the JSON object. No Markdown fences, no prose, no wrapper.
- The first character MUST be { and the last character MUST be }.`
          },
          {
            role: 'user',
            content: `Segments from index 0 to ${canonicalSegments.length - 1}:\n${transcriptForLLM}`
          }
        ],
        temperature: 0.1,
        max_tokens: 4000,
        response_format: { type: "json_object" }
      });

      const repairChoice = repairResponse.choices?.[0];
      const repairOutput = repairChoice?.message?.content || "";
      console.log(JSON.stringify({
        event: "BEDROCK_REPAIR_RETRY_COMPLETION",
        contentId,
        finishReason: repairChoice?.finish_reason,
        responseLength: repairOutput.length
      }));
      return repairOutput;
    });

    const parsed = parseResult.parsed;
    lastDiagnostics = parseResult.stats;

    console.log(JSON.stringify({
      event: "SEGMENT_PARSE_SUCCESS",
      parserVersion: PARSER_VERSION,
      rawSegmentCount: parsed.segments.length,
      acceptedCandidateLength: lastDiagnostics.acceptedCandidateLength
    }));

    currentStage = 'SEGMENT_VALIDATION';
    const validatedSegments = validateAndHealSegments(parsed.segments, canonicalSegments);

    console.log(JSON.stringify({
      event: "SEGMENT_VALIDATION_SUCCESS",
      validatedSegmentCount: validatedSegments.length,
      firstStart: validatedSegments[0]?.startIndex,
      finalEnd: validatedSegments[validatedSegments.length - 1]?.endIndex
    }));

    currentStage = 'S3_WRITE';
    const s3Key = `content/${contentId}/segments/segments.json`;
    const segmentDoc = {
      contentId,
      sourceTranscriptKey: transcriptKey,
      version: "v0.13",
      segments: validatedSegments,
      createdAt: new Date().toISOString()
    };
    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: JSON.stringify(segmentDoc, null, 2),
      ContentType: 'application/json'
    }));

    console.log(JSON.stringify({
      event: "SEGMENTS_S3_WRITE_SUCCESS",
      bucket: BUCKET_NAME,
      key: s3Key,
      segmentCount: validatedSegments.length
    }));

    currentStage = 'STATUS_UPDATE';
    const latestCheck = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { contentId } }));
    const latestItem = latestCheck.Item || item;
    const isPipeline = latestItem.processing?.pipelineStatus === 'processing';

    const updatedProcessing = {
      ...(latestItem.processing || {}),
      sceneDetectionStatus: 'complete',
      sceneDetectionDurationMs: durationMs,
      sceneDetectionCompletedAt: new Date().toISOString(),
      ...(isPipeline ? {
        currentPipelineStage: 'knowledge_extraction',
        metadataExtractionStatus: 'queued',
        knowledgeExtractionStartedAt: new Date().toISOString()
      } : {})
    };

    const updatedItem = {
      ...latestItem,
      processing: updatedProcessing,
      segmentation: {
        status: 'complete',
        segmentCount: validatedSegments.length,
        s3Key,
        durationMs,
        parserVersion: PARSER_VERSION,
        diagnostics: lastDiagnostics,
        completedAt: new Date().toISOString()
      },
      updatedAt: new Date().toISOString()
    };

    await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: updatedItem }));

    console.log(JSON.stringify({
      event: "SEGMENTATION_COMPLETE",
      contentId,
      segmentCount: validatedSegments.length,
      durationMs
    }));

    if (isPipeline && process.env.KNOWLEDGE_WORKER_FUNCTION_NAME) {
      console.log(`Pipeline auto-chaining: advancing to knowledge_extraction for ${contentId}`);
      await lambdaClient.send(new InvokeCommand({
        FunctionName: process.env.KNOWLEDGE_WORKER_FUNCTION_NAME,
        InvocationType: 'Event',
        Payload: Buffer.from(JSON.stringify({ contentId }))
      }));
    }

  } catch (err: any) {
    console.error("Segmentation failed:", JSON.stringify({
      event: "SEGMENTATION_FAILED",
      contentId,
      stage: currentStage,
      error: err.message,
      parserVersion: PARSER_VERSION,
      responseLength: rawOutputLength,
      diagnostics: lastDiagnostics || (err as any).diagnostics || null
    }));

    try {
      const getCheck = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { contentId } }));
      const currentItem = getCheck.Item;
      if (currentItem) {
        const isPipeline = currentItem.processing?.pipelineStatus === 'processing';
        await docClient.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            ...currentItem,
            processing: {
              ...(currentItem.processing || {}),
              sceneDetectionStatus: 'failed',
              ...(isPipeline ? {
                pipelineStatus: 'failed',
                pipelineErrorStage: 'scene_detection'
              } : {})
            },
            segmentation: {
              status: 'failed',
              stage: currentStage,
              error: err.message,
              parserVersion: PARSER_VERSION,
              diagnostics: lastDiagnostics || (err as any).diagnostics || null,
              failedAt: new Date().toISOString()
            },
            updatedAt: new Date().toISOString()
          }
        }));
      }
    } catch (saveErr) {
      console.error("Failed to update status to failed in DynamoDB:", saveErr);
    }

    throw err;
  }
};

async function updateStatus(item: any, status: string) {
  const updated = {
    ...item,
    processing: {
      ...(item.processing || {}),
      sceneDetectionStatus: status,
      sceneDetectionStartedAt: new Date().toISOString(),
      knowledgeExtractionStatus: 'stale',
      intelligenceCompilationStatus: 'stale'
    },
    updatedAt: new Date().toISOString()
  };
  await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: updated }));
}

function validateAndHealSegments(segments: any[], canonicalSegments: CanonicalTranscriptSegment[]) {
  const totalItems = canonicalSegments.length;
  if (!segments || segments.length === 0) {
    return [{
      id: "seg-1",
      startIndex: 0,
      endIndex: Math.max(0, totalItems - 1),
      title: "Full Program",
      startTime: canonicalSegments[0]?.startTime || 0,
      endTime: canonicalSegments[totalItems - 1]?.endTime || 0,
      segmentType: "topic",
      summary: "Overview of complete recording."
    }];
  }

  // Sort chronologically by startIndex
  const sorted = [...segments].sort((a, b) => a.startIndex - b.startIndex);
  const healed: any[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const curr = sorted[i];
    let start = Math.max(0, Math.min(totalItems - 1, curr.startIndex));
    let end = Math.max(start, Math.min(totalItems - 1, curr.endIndex));

    if (i === 0 && start > 0) {
      start = 0;
    }

    if (i > 0) {
      const prevEnd = healed[healed.length - 1].endIndex;
      if (start > prevEnd + 1) {
        healed[healed.length - 1].endIndex = start - 1;
      } else if (start <= prevEnd) {
        start = prevEnd + 1;
        if (start > totalItems - 1) break;
        if (end < start) end = start;
      }
    }

    const startSeg = canonicalSegments[start] || canonicalSegments[0];
    const endSeg = canonicalSegments[end] || canonicalSegments[canonicalSegments.length - 1];

    const segId = curr.segmentId || curr.id || `seg-${Date.now()}-${healed.length}`;
    healed.push({
      segmentId: segId,
      id: segId,
      startIndex: start,
      endIndex: end,
      transcriptStartIndex: start,
      transcriptEndIndex: end,
      title: curr.title || `Segment ${healed.length + 1}`,
      startTime: startSeg?.startTime || 0,
      endTime: endSeg?.endTime || 0,
      segmentType: curr.segmentType || "topic",
      summary: curr.summary || ""
    });
  }

  if (healed.length > 0 && healed[healed.length - 1].endIndex < totalItems - 1) {
    healed[healed.length - 1].endIndex = totalItems - 1;
    healed[healed.length - 1].endTime = canonicalSegments[totalItems - 1]?.endTime || healed[healed.length - 1].endTime;
  }

  return healed;
}
