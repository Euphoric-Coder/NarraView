import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import OpenAI from "openai";
import { getTokenProvider } from '@aws/bedrock-token-generator';
import {
  processSegmentCorrections,
  createTokenAwareBatches,
  SegmentItem,
  CorrectedTranscriptSegment,
  TranscriptCorrection,
  CorrectedTranscriptDocument
} from './correction';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const s3Client = new S3Client({});
const lambdaClient = new LambdaClient({});

const TABLE_NAME = process.env.TABLE_NAME || '';
const BUCKET_NAME = process.env.BUCKET_NAME || '';
const BEDROCK_MANTLE_BASE_URL = process.env.BEDROCK_MANTLE_BASE_URL || 'https://bedrock-mantle.eu-north-1.api.aws/v1';
const BEDROCK_MANTLE_MODEL = process.env.BEDROCK_MANTLE_MODEL || 'openai.gpt-oss-120b';
const SEGMENTATION_WORKER_FUNCTION_NAME = process.env.SEGMENTATION_WORKER_FUNCTION_NAME || '';

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
  const transcriptCorrectionStartedAt = new Date(startTimeMs).toISOString();
  let currentStage = 'UNKNOWN';

  console.log(JSON.stringify({
    event: "TRANSCRIPT_CORRECTION_START",
    contentId,
    requestId,
    transcriptCorrectionStartedAt
  }));

  try {
    currentStage = 'STATUS_UPDATE';
    const check = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { contentId } }));
    const item = check.Item;
    if (!item) throw new Error("Content not found in DynamoDB");

    await updateStatus(item, 'processing', transcriptCorrectionStartedAt);

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

    // Build authoritative segment items preserving timestamps and indices
    const segmentsWithIndex: SegmentItem[] = rawSegments.map((seg: any, idx: number) => ({
      transcriptIndex: typeof seg.transcriptIndex === 'number' ? seg.transcriptIndex : idx,
      startTime: seg.startTime,
      endTime: seg.endTime,
      text: seg.text,
      id: seg.id || `seg-${typeof seg.transcriptIndex === 'number' ? seg.transcriptIndex : idx}`,
      confidence: seg.confidence
    }));

    // Configurable per-content trusted vocabulary (Item 10)
    const trustedTerms: string[] = [
      ...(item.trustedTerms || []),
      ...(item.metadata?.trustedVocabulary || []),
      ...(item.contentMetadata?.trustedTerms || []),
      item.title || '',
      item.knownProduct || ''
    ].filter(Boolean);

    // Dynamic token-aware batching: 8-12 segments or 2500-4000 input tokens per request (Item 2)
    const batches = createTokenAwareBatches(segmentsWithIndex, 10, 3200);
    const correctionBatchCount = batches.length;

    console.log(JSON.stringify({
      event: "CORRECTION_BATCHING_PLAN",
      contentId,
      totalSegments: segmentsWithIndex.length,
      correctionBatchCount,
      averageBatchSegments: Math.round((segmentsWithIndex.length / correctionBatchCount) * 10) / 10
    }));

    if (!provideToken) { provideToken = getTokenProvider(); }
    const token = await provideToken();

    const openai = new OpenAI({
      baseURL: BEDROCK_MANTLE_BASE_URL,
      apiKey: token
    });

    const systemPrompt = `You are an expert audio transcription correction and speech-to-text post-processing assistant for NarraView.
You are given sequential normalized transcript segments with their authoritative transcript indices and optional trusted domain vocabulary.

Your goals:
1. Identify high-confidence phonetic transcription errors (homophones, garbled proper nouns, misspelled APIs, framework names, acronyms).
2. Fix ONLY clear mistakes (e.g. Ciccare/CiCare -> CityCare, Havistrand/Hirson -> Haversine, Reddis -> Redis).
3. STRICT POLICY CONSTRAINTS:
   - NEVER substitute domain roles (e.g. do NOT change "unit officer" to "field officer" or vice versa).
   - NEVER replace ordinary valid English words with product names (e.g. do NOT change "civic" to "CityCare", or "officer" to "approve").
   - NEVER modify numbers, percentages, distances, or units (e.g. keep "15 reports/day", "300 m", "40 to 60%" intact).
   - NEVER change polarity or negations (e.g. keep "not", "never", "no").
   - NEVER rewrite grammatical style or rephrase sentences.
4. Output strict JSON with the following format:
{
  "segments": [
    {
      "transcriptIndex": 0,
      "correctedText": "The segment text with only surgical corrections applied",
      "corrections": [
        {
          "original": "Ciccare",
          "corrected": "CityCare",
          "confidence": "high|medium|low",
          "reason": "Phonetic misspelling of trusted product CityCare",
          "category": "product_name|technical_term|framework_name|acronym|entity_alias|domain_term|other"
        }
      ]
    }
  ]
}`;

    const finalSegments: CorrectedTranscriptSegment[] = [];
    const allCorrections: TranscriptCorrection[] = [];
    let totalModelLatencyMs = 0;
    let totalInputTokens = 0;
    let modelRequestCount = 0;

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx];

      // Timeout safeguard: gracefully finish before Lambda hard timeout
      if (context?.getRemainingTimeInMillis && context.getRemainingTimeInMillis() < 25000) {
        console.warn(`Lambda remaining time is under 25s (${context.getRemainingTimeInMillis()}ms). Gracefully stopping batch processing at batch ${batchIdx + 1} of ${correctionBatchCount}.`);
        for (let remIdx = batchIdx; remIdx < batches.length; remIdx++) {
          for (const remainingSeg of batches[remIdx]) {
            finalSegments.push({
              id: remainingSeg.id || `seg-${remainingSeg.transcriptIndex}`,
              transcriptIndex: remainingSeg.transcriptIndex,
              startTime: remainingSeg.startTime,
              endTime: remainingSeg.endTime,
              originalText: remainingSeg.text,
              correctedText: remainingSeg.text,
              correctionCount: 0,
              corrections: []
            });
          }
        }
        break;
      }

      console.log(JSON.stringify({
        event: "CORRECTION_BATCH_START",
        contentId,
        batchIndex: batchIdx + 1,
        totalBatches: correctionBatchCount,
        batchCount: batch.length,
        startIndex: batch[0].transcriptIndex,
        endIndex: batch[batch.length - 1].transcriptIndex
      }));

      // Update DynamoDB batch progress so Studio UI can safely display: Batch X / Y (Item 13)
      try {
        const latestCheck = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { contentId } }));
        if (latestCheck.Item) {
          await docClient.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: {
              ...latestCheck.Item,
              processing: {
                ...(latestCheck.Item.processing || {}),
                transcriptCorrectionStatus: 'processing',
                batchProgress: {
                  stage: 'transcript_correction',
                  current: batchIdx + 1,
                  total: correctionBatchCount
                }
              },
              updatedAt: new Date().toISOString()
            }
          }));
        }
      } catch (e) {
        console.warn("Could not update batchProgress in DynamoDB", e);
      }

      const batchPromptLines = batch.map((seg) => {
        return `Segment [${seg.transcriptIndex}]: "${seg.text}"`;
      }).join('\n');

      const userPrompt = `Content Metadata:
Title: ${item.title || 'Untitled'}
Content Type: ${item.contentType || 'tutorial/demo'}
Trusted Vocabulary Hints: ${trustedTerms.join(', ') || 'None provided'}

Transcript Segments to Correct:
${batchPromptLines}`;

      // Rough token tracking for instrumentation (Item 11)
      const estimatedPromptTokens = Math.ceil((systemPrompt.length + userPrompt.length) / 4);
      totalInputTokens += estimatedPromptTokens;

      const modelCallStart = Date.now();
      modelRequestCount++;

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

      const modelLatency = Date.now() - modelCallStart;
      totalModelLatencyMs += modelLatency;

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

      // Process each segment in the batch
      for (const seg of batch) {
        const proposed = proposedSegmentsMap.get(seg.transcriptIndex) || {
          correctedText: seg.text,
          corrections: []
        };

        const { segment: validatedSeg, validatedCorrections } = processSegmentCorrections(
          seg,
          seg.transcriptIndex,
          proposed,
          trustedTerms
        );

        finalSegments.push(validatedSeg);
        allCorrections.push(...validatedCorrections);

        for (const c of validatedCorrections) {
          if (c.autoApplied) {
            console.log(JSON.stringify({
              event: "CORRECTION_APPLIED",
              transcriptIndex: seg.transcriptIndex,
              original: c.original,
              corrected: c.corrected,
              confidence: c.confidence,
              category: c.category
            }));
          } else {
            console.log(JSON.stringify({
              event: "CORRECTION_SKIPPED",
              transcriptIndex: seg.transcriptIndex,
              original: c.original,
              suggested: c.corrected,
              confidence: c.confidence,
              reason: c.reason
            }));
          }
        }
      }
    }

    // Instrumentation metrics (Item 11 & 12)
    const completionTimeMs = Date.now();
    const totalCorrectionDurationMs = completionTimeMs - startTimeMs;
    const transcriptCorrectionCompletedAt = new Date(completionTimeMs).toISOString();

    const highCount = allCorrections.filter(c => c.confidence === 'high').length;
    const medCount = allCorrections.filter(c => c.confidence === 'medium').length;
    const lowCount = allCorrections.filter(c => c.confidence === 'low').length;
    const appliedCount = allCorrections.filter(c => c.autoApplied).length;
    const rejectedCount = allCorrections.length - appliedCount;

    const averageBatchSegments = Math.round((segmentsWithIndex.length / correctionBatchCount) * 10) / 10;
    const averageInputTokens = Math.round(totalInputTokens / modelRequestCount);
    const averageModelLatencyMs = Math.round(totalModelLatencyMs / modelRequestCount);

    console.log(JSON.stringify({
      event: "TRANSCRIPT_CORRECTION_METRICS",
      contentId,
      correctionBatchCount,
      modelRequestCount,
      averageBatchSegments,
      averageInputTokens,
      averageModelLatencyMs,
      totalCorrectionDurationMs,
      transcriptCorrectionStartedAt,
      transcriptCorrectionCompletedAt,
      segmentsProcessed: finalSegments.length,
      correctionsSuggested: allCorrections.length,
      correctionsApplied: appliedCount,
      correctionsRejected: rejectedCount,
      highConfidenceCount: highCount,
      mediumConfidenceCount: medCount,
      lowConfidenceCount: lowCount
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
        createdAt: transcriptCorrectionCompletedAt,
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

    // Check pipeline status and update DynamoDB
    currentStage = 'STATUS_UPDATE';
    const currentCheck = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { contentId } }));
    const latestItem = currentCheck.Item || item;
    const isPipeline = latestItem.processing?.pipelineStatus === 'processing';

    const updatedProcessing = {
      ...latestItem.processing,
      transcriptCorrectionStatus: 'complete',
      transcriptCorrectionStartedAt,
      transcriptCorrectionCompletedAt,
      transcriptCorrectionDurationMs: totalCorrectionDurationMs,
      batchProgress: null, // Clear batch progress when complete
      ...(isPipeline ? {
        currentPipelineStage: 'scene_detection',
        sceneDetectionStatus: 'queued',
        sceneDetectionStartedAt: new Date().toISOString()
      } : {})
    };

    const updated = {
      ...latestItem,
      processing: updatedProcessing,
      transcriptCorrection: {
        status: 'complete',
        correctedS3Key,
        correctionsS3Key,
        correctionCount: allCorrections.length,
        appliedCorrectionCount: appliedCount,
        rejectedCorrectionCount: rejectedCount,
        highConfidenceCount: highCount,
        mediumConfidenceCount: medCount,
        lowConfidenceCount: lowCount,
        startedAt: transcriptCorrectionStartedAt,
        completedAt: transcriptCorrectionCompletedAt,
        // Pipeline timing & metrics (Items 11 & 12)
        transcriptCorrectionStartedAt,
        transcriptCorrectionCompletedAt,
        transcriptCorrectionDurationMs: totalCorrectionDurationMs,
        correctionBatchCount,
        modelRequestCount,
        averageBatchSegments,
        averageInputTokens,
        averageModelLatencyMs,
        totalCorrectionDurationMs
      },
      updatedAt: transcriptCorrectionCompletedAt
    };
    await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: updated }));

    console.log(JSON.stringify({
      event: "TRANSCRIPT_CORRECTION_COMPLETE",
      contentId,
      totalCorrectionDurationMs
    }));

    // Auto-chain to segmentation if pipeline reprocess is running
    if (isPipeline && SEGMENTATION_WORKER_FUNCTION_NAME) {
      console.log(`Pipeline auto-chaining: advancing to scene_detection for ${contentId}`);
      await lambdaClient.send(new InvokeCommand({
        FunctionName: SEGMENTATION_WORKER_FUNCTION_NAME,
        InvocationType: 'Event',
        Payload: Buffer.from(JSON.stringify({ contentId }))
      }));
    }

  } catch (err: any) {
    const errorTimeMs = Date.now();
    const durationMs = errorTimeMs - startTimeMs;
    console.log(JSON.stringify({
      event: "TRANSCRIPT_CORRECTION_FAILED",
      contentId,
      stage: currentStage,
      errorName: err.name,
      errorMessage: err.message,
      stack: err.stack,
      durationMs
    }));

    try {
      const check = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { contentId } }));
      if (check.Item) {
        const isPipeline = check.Item.processing?.pipelineStatus === 'processing';
        const updated = {
          ...check.Item,
          processing: {
            ...check.Item.processing,
            transcriptCorrectionStatus: 'failed',
            transcriptCorrectionDurationMs: durationMs,
            batchProgress: null,
            ...(isPipeline ? {
              pipelineStatus: 'failed',
              pipelineErrorStage: 'transcript_correction',
            } : {})
          },
          transcriptCorrection: {
            ...check.Item.transcriptCorrection,
            status: 'failed',
            error: err.message,
            completedAt: new Date().toISOString(),
            transcriptCorrectionDurationMs: durationMs
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

async function updateStatus(item: any, status: string, startedAt: string) {
  const updated = {
    ...item,
    processing: {
      ...item.processing,
      transcriptCorrectionStatus: status,
      transcriptCorrectionStartedAt: startedAt
    },
    transcriptCorrection: {
      ...(item.transcriptCorrection || {}),
      status,
      startedAt
    },
    updatedAt: new Date().toISOString()
  };
  await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: updated }));
}
