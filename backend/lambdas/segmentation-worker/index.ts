import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import OpenAI from "openai";
import { getTokenProvider } from '@aws/bedrock-token-generator';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const s3Client = new S3Client({});

const TABLE_NAME = process.env.TABLE_NAME || '';
const BUCKET_NAME = process.env.BUCKET_NAME || '';
const BEDROCK_MANTLE_BASE_URL = process.env.BEDROCK_MANTLE_BASE_URL || 'https://bedrock-mantle.eu-north-1.api.aws/v1';
const BEDROCK_MANTLE_MODEL = process.env.BEDROCK_MANTLE_MODEL || 'openai.gpt-oss-120b';

let provideToken: any = null;

interface ContentSegment {
  segmentId: string;
  startTime: number;
  endTime: number;
  title: string;
  summary?: string;
  transcriptStartIndex: number;
  transcriptEndIndex: number;
  segmentType: "scene" | "topic" | "chapter" | "instruction" | "other";
}

function stripMarkdownFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractBalancedJsonObject(
  text: string,
  startIndex: number
): string | null {
  if (text[startIndex] !== "{") {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIndex; i < text.length; i++) {
    const ch = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (inString && ch === "\\") {
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;

      if (depth === 0) {
        return text.slice(startIndex, i + 1);
      }

      if (depth < 0) {
        return null;
      }
    }
  }

  return null;
}

function parseSegmentationJson(rawText: string) {
  const cleaned = stripMarkdownFences(rawText);

  console.log({
    event: "BEDROCK_RAW_PREFIX",
    value: JSON.stringify(rawText.slice(0, 200))
  });

  console.log({
    event: "BEDROCK_CLEANED_PREFIX",
    value: JSON.stringify(cleaned.slice(0, 200))
  });

  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && Array.isArray(parsed.segments)) {
      return parsed;
    }
  } catch {}

  for (let i = 0; i < cleaned.length; i++) {
    if (cleaned[i] !== "{") {
      continue;
    }

    const candidate = extractBalancedJsonObject(cleaned, i);
    if (!candidate) {
      continue;
    }

    try {
      const parsed = JSON.parse(candidate);
      if (parsed && Array.isArray(parsed.segments)) {
        console.log({
          event: "JSON_RECOVERY_SUCCESS",
          candidateStartIndex: i,
          candidateLength: candidate.length,
          segmentCount: parsed.segments.length
        });
        return parsed;
      }
    } catch (error) {
      console.log({
        event: "JSON_CANDIDATE_FAILED",
        startIndex: i,
        candidateLength: candidate.length,
        parseError: error instanceof Error ? error.message : String(error)
      });
    }
  }

  throw new Error("No valid segmentation JSON object found in Bedrock response");
}

export const handler = async (event: any, context: any) => {
  const { contentId } = event;
  const requestId = context?.awsRequestId || 'local-request';
  const startTimeMs = Date.now();
  let currentStage = 'UNKNOWN';

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
    const transcriptKey = `content/${contentId}/transcripts/normalized/transcript.json`;
    
    console.log(JSON.stringify({
      event: "EXPECTED_TRANSCRIPT_KEY",
      contentId,
      expectedKey: transcriptKey
    }));

    console.log(JSON.stringify({
      event: "TRANSCRIPT_FETCH_START",
      bucket: BUCKET_NAME,
      key: transcriptKey
    }));

    let transcriptStr = '';
    try {
      const getRes = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: transcriptKey }));
      transcriptStr = await getRes.Body?.transformToString() || '';
    } catch (err: any) {
      if (err.name === 'NoSuchKey') {
        throw new Error(`Normalized transcript not found for contentId ${contentId} at key ${transcriptKey}`);
      }
      throw err;
    }

    currentStage = 'TRANSCRIPT_PARSE';
    if (!transcriptStr) throw new Error("Transcript file is empty");
    
    const transcript = JSON.parse(transcriptStr);
    const segments = transcript.segments || [];
    
    const isValidSchema = Array.isArray(segments) && segments.length > 0 && 
                          segments.every((s: any) => typeof s.startTime === 'number' && typeof s.text === 'string');

    console.log(JSON.stringify({
      event: "TRANSCRIPT_SCHEMA_CHECK",
      contentId,
      isArray: Array.isArray(segments),
      itemCount: segments.length,
      isValidSchema
    }));

    if (!isValidSchema) {
      throw new Error(`Transcript schema is invalid. Expected array of {startTime, endTime, text}, got: ${JSON.stringify(segments[0] || 'empty')}`);
    }

    const durationSeconds = segments[segments.length - 1].endTime;

    console.log(JSON.stringify({
      event: "TRANSCRIPT_FETCH_SUCCESS",
      contentId,
      transcriptKey,
      transcriptByteLength: transcriptStr.length,
      transcriptItemCount: segments.length,
      transcriptDuration: durationSeconds
    }));

    const transcriptForLLM = segments.map((seg: any, idx: number) => {
      return `[${idx}] ${formatTime(seg.startTime)} - ${formatTime(seg.endTime)}: ${seg.text}`;
    }).join('\n');

    if (transcriptForLLM.length > 300000) {
      console.warn("WARNING: Prompt payload is extremely large, might hit context limits.");
    }

    currentStage = 'BEDROCK_INVOKE';
    const systemPrompt = `You are an expert content analyzer for the NarraView platform.
Your job is to detect meaningful temporal boundaries in a video transcript and group the raw transcript chunks into logical, chronological segments.

RULES:
1. Output MUST be valid JSON only. No markdown formatting outside of the JSON block.
2. Segments must cover the ENTIRE transcript timeline from index 0 to index ${segments.length - 1} without any gaps or overlaps.
3. Use the exact transcript indices. startIndex is inclusive, endIndex is inclusive.
4. Segment titles must be concise, descriptive, and grounded in the transcript.
5. Minimum segment size should be around 10-30 seconds of content, do not over-fragment.
6. The segmentType should be "topic" or "instruction" for tutorials/demos, and "scene" or "chapter" for narrative content.

OUTPUT FORMAT:
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
}`;

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
      transcriptItemCount: segments.length
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
    const rawOutput = response.choices?.[0]?.message?.content || "";

    console.log(JSON.stringify({
      event: "BEDROCK_REQUEST_SUCCESS",
      durationMs,
      responseLength: rawOutput.length
    }));

    currentStage = 'BEDROCK_RESPONSE_PARSE';
    console.log(JSON.stringify({
      event: "BEDROCK_RESPONSE_PREVIEW",
      preview: rawOutput.substring(0, 150)
    }));

    console.log({
      event: "JSON_PARSER_VERSION",
      version: "v3-candidate-balanced-json-recovery"
    });

    const parsed = parseSegmentationJson(rawOutput);

    if (!parsed || !parsed.segments || !Array.isArray(parsed.segments) || parsed.segments.length === 0) {
      throw new Error("Invalid schema: parsed output missing valid 'segments' array");
    }

    console.log({
      event: "SEGMENT_PARSE_SUCCESS",
      rawSegmentCount: parsed.segments.length
    });

    currentStage = 'SEGMENT_VALIDATION';
    const detectedSegments: ContentSegment[] = [];
    let expectedIndex = 0;

    for (let i = 0; i < parsed.segments.length; i++) {
      const seg = parsed.segments[i];
      if (seg.startIndex === undefined || seg.endIndex === undefined) {
        throw new Error(`Missing indices in segment ${i}`);
      }
      
      let sIdx = Number(seg.startIndex);
      let eIdx = Number(seg.endIndex);

      if (!Number.isInteger(sIdx) || !Number.isInteger(eIdx) || sIdx < 0 || eIdx < sIdx || eIdx >= segments.length) {
         throw new Error(`Invalid indices in segment ${i}: ${sIdx} to ${eIdx}`);
      }

      currentStage = 'SEGMENT_HEALING';
      if (sIdx !== expectedIndex) {
        console.warn(`Repairing gap/overlap at segment ${i}: expected start ${expectedIndex}, got ${sIdx}`);
        sIdx = expectedIndex;
      }
      
      if (eIdx < sIdx) eIdx = sIdx;
      if (i === parsed.segments.length - 1 && eIdx < segments.length - 1) {
        console.warn(`Repairing end boundary: setting last segment endIndex to ${segments.length - 1}`);
        eIdx = segments.length - 1;
      }
      if (eIdx >= segments.length) eIdx = segments.length - 1;

      const firstSeg = segments[sIdx];
      const lastSeg = segments[eIdx];

      detectedSegments.push({
        segmentId: `seg-${Date.now()}-${i}`,
        startTime: firstSeg.startTime,
        endTime: lastSeg.endTime,
        title: seg.title || `Segment ${i + 1}`,
        summary: seg.summary || "",
        transcriptStartIndex: sIdx,
        transcriptEndIndex: eIdx,
        segmentType: seg.segmentType || "other"
      });

      expectedIndex = eIdx + 1;
    }

    console.log(JSON.stringify({
      event: "SEGMENT_VALIDATION_SUCCESS",
      validatedSegmentCount: detectedSegments.length,
      firstStart: detectedSegments[0]?.transcriptStartIndex,
      finalEnd: detectedSegments[detectedSegments.length - 1]?.transcriptEndIndex
    }));

    currentStage = 'S3_WRITE';
    const segmentDoc = {
      contentId,
      sourceTranscriptKey: transcriptKey,
      version: "v0.13",
      segments: detectedSegments,
      metadata: {
        provider: BEDROCK_MANTLE_MODEL,
        createdAt: new Date().toISOString()
      }
    };

    const segmentsKey = `content/${contentId}/segments/segments.json`;
    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: segmentsKey,
      Body: JSON.stringify(segmentDoc, null, 2),
      ContentType: "application/json"
    }));

    console.log({
      event: "SEGMENTS_S3_WRITE_SUCCESS",
      bucket: BUCKET_NAME,
      key: segmentsKey,
      segmentCount: detectedSegments.length
    });

    currentStage = 'STATUS_UPDATE';
    await updateStatus(item, 'complete');
    
    console.log({
      event: "SEGMENTATION_COMPLETE",
      contentId,
      segmentCount: detectedSegments.length,
      durationMs: Date.now() - startTimeMs
    });

  } catch (err: any) {
    console.log(JSON.stringify({
      event: "SEGMENTATION_FAILED",
      contentId,
      stage: currentStage,
      errorName: err.name,
      errorMessage: err.message,
      stack: err.stack
    }));

    try {
      const check = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { contentId } }));
      if (check.Item) await updateStatus(check.Item, 'failed');
    } catch (e) {
      console.error("Failed to update status to failed in DynamoDB", e);
    }
  }
};

async function updateStatus(item: any, status: string) {
  const updated = {
    ...item,
    processing: {
      ...item.processing,
      sceneDetectionStatus: status
    },
    updatedAt: new Date().toISOString()
  };
  await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: updated }));
}

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
