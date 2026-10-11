import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import OpenAI from "openai";
import { getTokenProvider } from '@aws/bedrock-token-generator';
import {
  processSegmentCorrections,
  CorrectedTranscriptSegment,
  TranscriptCorrection,
  CorrectedTranscriptDocument
} from './correction';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const s3Client = new S3Client({});

const TABLE_NAME = process.env.TABLE_NAME || '';
const BUCKET_NAME = process.env.BUCKET_NAME || '';
const BEDROCK_MANTLE_BASE_URL = process.env.BEDROCK_MANTLE_BASE_URL || 'https://bedrock-mantle.eu-north-1.api.aws/v1';
const BEDROCK_MANTLE_MODEL = process.env.BEDROCK_MANTLE_MODEL || 'openai.gpt-oss-120b';

let provideToken: any = null;

function stripMarkdownFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractBalancedJsonObject(text: string, startIndex: number): string | null {
  if (text[startIndex] !== "{") return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIndex; i < text.length; i++) {
    const ch = text[i];
    if (escaped) { escaped = false; continue; }
    if (inString && ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(startIndex, i + 1);
      if (depth < 0) return null;
    }
  }
  return null;
}

function parseJsonPayload(rawText: string): any {
  const cleaned = stripMarkdownFences(rawText);
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {}

  for (let i = 0; i < cleaned.length; i++) {
    if (cleaned[i] !== "{") continue;
    const candidate = extractBalancedJsonObject(cleaned, i);
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (e) {}
  }

  throw new Error("No valid JSON object found in Bedrock correction response");
}

export const handler = async (event: any, context: any) => {
  const { contentId } = event;
  const requestId = context?.awsRequestId || 'local-request';
  const startTimeMs = Date.now();
  let currentStage = 'UNKNOWN';

  console.log(JSON.stringify({
    event: "TRANSCRIPT_CORRECTION_START",
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
    const normalizedKey = `content/${contentId}/transcripts/normalized/transcript.json`;
    let transcriptStr = '';
    try {
      const getRes = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: normalizedKey }));
      transcriptStr = await getRes.Body?.transformToString() || '';
    } catch (err: any) {
      throw new Error(`Normalized transcript not found at ${normalizedKey}`);
    }

    const transcript = JSON.parse(transcriptStr);
    const rawSegments = transcript.segments || [];
    if (rawSegments.length === 0) {
      throw new Error("Transcript has no segments to correct");
    }

    // Build trusted terms from metadata
    const trustedTerms: string[] = [
      ...(item.trustedTerms || []),
      item.title || '',
      item.knownProduct || ''
    ].filter(Boolean);

    if (!provideToken) { provideToken = getTokenProvider(); }
    const token = await provideToken();
    const openai = new OpenAI({
      apiKey: token,
      baseURL: BEDROCK_MANTLE_BASE_URL,
      defaultQuery: { project: 'default' }
    });

    const systemPrompt = `You are an expert AI speech-to-text transcript correction engine for NarraView.
Your job is to identify and correct obvious speech recognition (ASR) errors in technical/domain terminology.

CRITICAL RULES:
1. STRICT NO-REWRITE: DO NOT summarize, paraphrase, simplify, reorder words, or change sentence structure.
2. PRESERVE MEANING: Only correct misspelled or misrecognized technical terms, platform names, framework names, product names, API/service names, algorithms, or acronyms.
3. CONTEXT GROUNDING: Use surrounding context and provided metadata to decide corrections.
4. CONFIDENCE:
   - "high": Unambiguous ASR mistake in this context (e.g. "Hirson distance formula" -> "Haversine distance formula", "Reddis" -> "Redis", "Citicare" -> "CityCare").
   - "medium": Plausible correction, but slightly ambiguous (e.g. "seller deadlines" vs "SLA deadlines").
   - "low": Uncertain or speculative.
5. If a segment has no ASR errors, keep "correctedText" identical to "originalText" and return "corrections": [].
6. Output MUST be valid JSON only.

OUTPUT FORMAT:
{
  "segments": [
    {
      "transcriptIndex": 0,
      "originalText": "...",
      "correctedText": "...",
      "corrections": [
        {
          "original": "Hirson",
          "corrected": "Haversine",
          "confidence": "high|medium|low",
          "reason": "Context refers to coordinate distance calculation",
          "category": "technical_term|product_name|framework_name|acronym|entity_alias|domain_term|other"
        }
      ]
    }
  ]
}`;

    // Process in batches of 6 segments
    const BATCH_SIZE = 6;
    const finalSegments: CorrectedTranscriptSegment[] = [];
    const allCorrections: TranscriptCorrection[] = [];

    for (let i = 0; i < rawSegments.length; i += BATCH_SIZE) {
      const batch = rawSegments.slice(i, i + BATCH_SIZE);
      const batchIndices = batch.map((_: any, idx: number) => i + idx);

      console.log(JSON.stringify({
        event: "CORRECTION_BATCH_START",
        contentId,
        batchStart: i,
        batchCount: batch.length
      }));

      const batchPromptLines = batch.map((seg: any, relativeIdx: number) => {
        const absIdx = i + relativeIdx;
        return `[${absIdx}] ${seg.text}`;
      }).join('\n');

      const userPrompt = `Content Metadata:
Title: ${item.title || 'Untitled'}
Content Type: ${item.contentType || 'tutorial/demo'}
Trusted Vocabulary Hints: ${trustedTerms.join(', ') || 'None provided'}

Transcript Chunks to Correct:
${batchPromptLines}`;

      console.log(JSON.stringify({
        event: "CORRECTION_MODEL_REQUEST",
        contentId,
        batchStart: i
      }));

      const response = await openai.chat.completions.create({
        model: BEDROCK_MANTLE_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 3000,
        response_format: { type: "json_object" }
      });

      console.log(JSON.stringify({
        event: "CORRECTION_MODEL_RESPONSE",
        contentId,
        batchStart: i
      }));

      const rawResponse = response.choices?.[0]?.message?.content || "";
      const parsed = parseJsonPayload(rawResponse);
      const proposedSegmentsMap = new Map<number, any>();

      if (Array.isArray(parsed.segments)) {
        for (const ps of parsed.segments) {
          if (typeof ps.transcriptIndex === 'number') {
            proposedSegmentsMap.set(ps.transcriptIndex, ps);
          }
        }
      }

      // Validate and process each segment in batch
      for (let relIdx = 0; relIdx < batch.length; relIdx++) {
        const absIdx = i + relIdx;
        const rawSeg = batch[relIdx];
        const proposed = proposedSegmentsMap.get(absIdx) || {
          correctedText: rawSeg.text,
          corrections: []
        };

        const { segment: validatedSeg, validatedCorrections } = processSegmentCorrections(
          rawSeg,
          absIdx,
          proposed,
          trustedTerms
        );

        finalSegments.push(validatedSeg);
        allCorrections.push(...validatedCorrections);

        for (const c of validatedCorrections) {
          if (c.autoApplied) {
            console.log(JSON.stringify({
              event: "CORRECTION_APPLIED",
              transcriptIndex: absIdx,
              original: c.original,
              corrected: c.corrected,
              confidence: c.confidence,
              category: c.category
            }));
          } else {
            console.log(JSON.stringify({
              event: "CORRECTION_SKIPPED",
              transcriptIndex: absIdx,
              original: c.original,
              suggested: c.corrected,
              confidence: c.confidence,
              reason: "Below auto-apply threshold or not in trusted vocabulary"
            }));
          }
        }
      }
    }

    // Counts
    const highCount = allCorrections.filter(c => c.confidence === 'high').length;
    const medCount = allCorrections.filter(c => c.confidence === 'medium').length;
    const lowCount = allCorrections.filter(c => c.confidence === 'low').length;
    const appliedCount = allCorrections.filter(c => c.autoApplied).length;

    console.log(JSON.stringify({
      event: "KNOWLEDGE_QUALITY_SUMMARY",
      contentId,
      segmentsProcessed: finalSegments.length,
      correctionsSuggested: allCorrections.length,
      correctionsApplied: appliedCount,
      highConfidence: highCount,
      mediumConfidence: medCount,
      lowConfidence: lowCount
    }));

    // Build final CorrectedTranscriptDocument
    const correctedDoc: CorrectedTranscriptDocument = {
      contentId,
      language: transcript.language || 'en',
      durationSeconds: transcript.durationSeconds || transcript.duration || undefined,
      segments: finalSegments,
      corrections: allCorrections,
      metadata: {
        source: "amazon-transcribe",
        correctionProvider: "bedrock-mantle",
        correctionModel: BEDROCK_MANTLE_MODEL,
        createdAt: new Date().toISOString(),
        totalCorrections: allCorrections.length,
        appliedCorrections: appliedCount,
        highConfidenceCount: highCount,
        mediumConfidenceCount: medCount,
        lowConfidenceCount: lowCount
      }
    };

    // Save to S3
    currentStage = 'S3_WRITE';
    const correctedS3Key = `content/${contentId}/transcripts/corrected/transcript.json`;
    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: correctedS3Key,
      Body: JSON.stringify(correctedDoc, null, 2),
      ContentType: "application/json"
    }));

    const correctionsS3Key = `content/${contentId}/transcripts/corrected/corrections.json`;
    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: correctionsS3Key,
      Body: JSON.stringify(allCorrections, null, 2),
      ContentType: "application/json"
    }));

    // Update DynamoDB
    currentStage = 'STATUS_UPDATE';
    const updated = {
      ...item,
      processing: {
        ...item.processing,
        transcriptCorrectionStatus: 'complete'
      },
      transcriptCorrection: {
        status: 'complete',
        correctedS3Key,
        correctionsS3Key,
        correctionCount: allCorrections.length,
        appliedCorrectionCount: appliedCount,
        highConfidenceCount: highCount,
        mediumConfidenceCount: medCount,
        lowConfidenceCount: lowCount,
        startedAt: new Date(startTimeMs).toISOString(),
        completedAt: new Date().toISOString()
      },
      updatedAt: new Date().toISOString()
    };
    await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: updated }));

    console.log(JSON.stringify({
      event: "TRANSCRIPT_CORRECTION_COMPLETE",
      contentId,
      durationMs: Date.now() - startTimeMs
    }));

  } catch (err: any) {
    console.log(JSON.stringify({
      event: "TRANSCRIPT_CORRECTION_FAILED",
      contentId,
      stage: currentStage,
      errorName: err.name,
      errorMessage: err.message,
      stack: err.stack
    }));

    try {
      const check = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { contentId } }));
      if (check.Item) {
        const updated = {
          ...check.Item,
          processing: {
            ...check.Item.processing,
            transcriptCorrectionStatus: 'failed'
          },
          transcriptCorrection: {
            ...check.Item.transcriptCorrection,
            status: 'failed',
            error: err.message,
            completedAt: new Date().toISOString()
          },
          updatedAt: new Date().toISOString()
        };
        await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: updated }));
      }
    } catch (e) {
      console.error("Failed to update status in DynamoDB", e);
    }
  }
};

async function updateStatus(item: any, status: string) {
  const updated = {
    ...item,
    processing: {
      ...item.processing,
      transcriptCorrectionStatus: status
    },
    updatedAt: new Date().toISOString()
  };
  await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: updated }));
}
