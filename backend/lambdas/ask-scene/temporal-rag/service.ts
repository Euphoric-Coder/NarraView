import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { getTokenProvider } from '@aws/bedrock-token-generator';
import OpenAI from 'openai';
import { 
  TemporalRagRequest, 
  TemporalRagResponse, 
  TemporalSnapshot, 
  TemporalMode 
} from './types';
import { buildTemporalSnapshot } from './snapshot';
import { retrieveSafeEvidence } from './retrieval';
import { validateQuestionPremise } from './premise';
import { validateGrounding } from './grounding';

interface CachedPackage {
  package: any;
  version: number;
  cachedAt: number;
}

// In-memory package cache keyed by `${contentId}:v${version}` (Requirement 3)
const packageCache = new Map<string, CachedPackage>();

export class TemporalRagService {
  private docClient: DynamoDBDocumentClient;
  private s3Client: S3Client;
  private tableName: string;
  private bucketName: string;
  private mantleBaseUrl: string;
  private mantleModel: string;
  private aiProvider: string;
  private runtimeClient: BedrockRuntimeClient;
  private tokenProvider: any = null;

  constructor(options: {
    docClient: DynamoDBDocumentClient;
    s3Client: S3Client;
    tableName: string;
    bucketName: string;
    mantleBaseUrl?: string;
    mantleModel?: string;
    aiProvider?: string;
    region?: string;
  }) {
    this.docClient = options.docClient;
    this.s3Client = options.s3Client;
    this.tableName = options.tableName;
    this.bucketName = options.bucketName;
    this.mantleBaseUrl = options.mantleBaseUrl || process.env.BEDROCK_MANTLE_BASE_URL || 'https://bedrock-mantle.eu-north-1.api.aws/v1';
    this.mantleModel = options.mantleModel || process.env.BEDROCK_MANTLE_MODEL || 'openai.gpt-oss-120b';
    this.aiProvider = options.aiProvider || process.env.AI_PROVIDER || 'bedrock-mantle';
    this.runtimeClient = new BedrockRuntimeClient({ region: options.region || process.env.AWS_REGION || 'eu-north-1' });
  }

  /**
   * Loads the authoritative intelligence package for the given content item.
   * Leverages safe in-memory cache keyed by contentId and version.
   */
  public async loadIntelligencePackage(contentId: string, expectedVersion?: number, s3KeyOverride?: string): Promise<{ package: any; version: number }> {
    const versionKey = expectedVersion ? `v${expectedVersion}` : 'latest';
    const cacheKey = `${contentId}:${versionKey}`;

    const cached = packageCache.get(cacheKey);
    if (cached && (Date.now() - cached.cachedAt < 5 * 60 * 1000)) {
      console.log(JSON.stringify({
        event: "INTELLIGENCE_LOAD_SUCCESS",
        contentId,
        version: cached.version,
        source: "memory-cache"
      }));
      return { package: cached.package, version: cached.version };
    }

    const s3Key = s3KeyOverride || `content/${contentId}/intelligence/latest.json`;
    const res = await this.s3Client.send(new GetObjectCommand({
      Bucket: this.bucketName,
      Key: s3Key
    }));

    const rawStr = await res.Body?.transformToString();
    if (!rawStr) {
      throw new Error(`Empty intelligence artifact at ${s3Key}`);
    }

    const pkg = JSON.parse(rawStr);
    const ver = pkg.intelligenceVersion || expectedVersion || 1;

    // Cache the loaded package
    packageCache.set(`${contentId}:v${ver}`, { package: pkg, version: ver, cachedAt: Date.now() });
    packageCache.set(`${contentId}:latest`, { package: pkg, version: ver, cachedAt: Date.now() });

    console.log(JSON.stringify({
      event: "INTELLIGENCE_LOAD_SUCCESS",
      contentId,
      s3Key,
      version: ver,
      source: "s3"
    }));

    return { package: pkg, version: ver };
  }

  /**
   * Primary Temporal RAG runtime execution pipeline.
   */
  public async processRequest(
    request: TemporalRagRequest,
    options: { allowPreActivationTest?: boolean } = {}
  ): Promise<TemporalRagResponse> {
    const startTime = Date.now();
    const requestId = request.requestId || `rag-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const contentId = request.contentId;
    const viewerTimestamp = typeof request.viewerTimestamp === 'number' 
      ? request.viewerTimestamp 
      : (typeof request.timestamp === 'number' ? request.timestamp : 0);
    const mode: TemporalMode = request.mode || 'ask';

    console.log(JSON.stringify({
      event: "TEMPORAL_RAG_REQUEST",
      requestId,
      contentId,
      viewerTimestamp,
      mode,
      question: request.question ? "[REDACTED_OR_PRESENT]" : undefined
    }));

    // 1. Fetch content metadata from DynamoDB
    const contentRecord = await this.docClient.send(new GetCommand({
      TableName: this.tableName,
      Key: { contentId }
    }));

    const contentItem = contentRecord.Item;
    if (!contentItem) {
      return this.buildUnavailableResponse(requestId, contentId, viewerTimestamp, mode, "Content not found");
    }

    // 2. Validate runtime eligibility (Requirement 32)
    const processing = contentItem.processing || {};
    const isEligible = 
      processing.transcriptionStatus === 'complete' &&
      processing.transcriptCorrectionStatus === 'complete' &&
      processing.sceneDetectionStatus === 'complete' &&
      processing.metadataExtractionStatus === 'complete' &&
      processing.intelligenceCompilationStatus === 'complete';

    if (!isEligible) {
      return this.buildUnavailableResponse(requestId, contentId, viewerTimestamp, mode, "Pipeline stages not complete");
    }

    // 3. AI Ready enforcement (Requirements 33, 34, 65)
    // If not aiReady and pre-activation admin test is not explicitly permitted: fail safe
    if (!contentItem.aiReady && !options.allowPreActivationTest) {
      console.log(JSON.stringify({
        event: "TEMPORAL_RAG_UNAVAILABLE",
        contentId,
        reason: "Content AI not activated (aiReady is false)"
      }));
      return {
        requestId,
        contentId,
        viewerTimestamp,
        mode,
        answer: "NarraView intelligence isn't available for this title right now.",
        recap: "NarraView intelligence isn't available for this title right now.",
        citations: [],
        safety: {
          spoilerSafe: true,
          maxRevealTimeUsed: 0,
          groundingPassed: true,
          premiseValidated: true
        },
        intelligenceVersion: contentItem.intelligence?.latestVersion || 0,
        aiReady: false,
        latencyMs: Date.now() - startTime
      };
    }

    // 4. Load Authoritative Intelligence Package
    const latestVersion = contentItem.intelligence?.latestVersion;
    const latestS3Key = contentItem.intelligence?.latestS3Key;
    const { package: intelligencePackage, version: intelligenceVersion } = 
      await this.loadIntelligencePackage(contentId, latestVersion, latestS3Key);

    // Verify referential integrity (Requirement 32, 45)
    if (intelligencePackage.quality && intelligencePackage.quality.referentialIntegrity === false) {
      return this.buildUnavailableResponse(requestId, contentId, viewerTimestamp, mode, "Referential integrity failed");
    }

    // 5. Build Safe Temporal Snapshot (Requirements 4, 5, 6, 7, 8)
    const snapshot: TemporalSnapshot = buildTemporalSnapshot(intelligencePackage, viewerTimestamp);

    console.log(JSON.stringify({
      event: "TEMPORAL_SNAPSHOT_BUILT",
      requestId,
      contentId,
      viewerTimestamp,
      unlockedFactsCount: snapshot.unlockedFacts.length,
      unlockedEventsCount: snapshot.unlockedEvents.length,
      unlockedEntitiesCount: snapshot.unlockedEntities.length,
      unlockedPeopleCount: snapshot.unlockedPeople.length,
      unlockedConceptsCount: snapshot.unlockedConcepts.length,
      unlockedRelationshipsCount: snapshot.unlockedRelationships.length,
      unlockedSegmentsCount: snapshot.unlockedSegments.length,
      maxRevealTimeUsed: snapshot.maxRevealTimeUsed
    }));

    // 6. Premise Validation (Requirements 17, 18, 19)
    if (mode === 'ask' && request.question) {
      const premiseCheck = validateQuestionPremise(request.question, snapshot, intelligencePackage);
      console.log(JSON.stringify({
        event: "PREMISE_VALIDATION_RESULT",
        requestId,
        valid: premiseCheck.valid,
        reason: premiseCheck.reason
      }));

      if (!premiseCheck.valid) {
        return {
          requestId,
          contentId,
          viewerTimestamp,
          mode: 'ask',
          answer: premiseCheck.safeResponse || "That premise has not been established.",
          citations: [],
          safety: {
            spoilerSafe: true,
            maxRevealTimeUsed: snapshot.maxRevealTimeUsed,
            groundingPassed: true,
            premiseValidated: false
          },
          intelligenceVersion,
          aiReady: contentItem.aiReady,
          latencyMs: Date.now() - startTime
        };
      }
    }

    // 7. Evidence Retrieval strictly from Safe Snapshot (Requirements 9, 10, 11, 12, 13)
    const query = request.question || request.topic || '';
    const { documents: retrievedDocs, citations } = retrieveSafeEvidence(snapshot, query, mode, 8);

    console.log(JSON.stringify({
      event: "TEMPORAL_RETRIEVAL_COMPLETE",
      requestId,
      retrievedCount: retrievedDocs.length,
      citationsCount: citations.length,
      mode
    }));

    // 8. Construct Prompt and Call Model
    const modelStart = Date.now();
    let rawModelOutput = "";

    try {
      rawModelOutput = await this.invokeModel(snapshot, retrievedDocs, mode, request.question);
    } catch (modelErr: any) {
      console.error(JSON.stringify({
        event: "BEDROCK_RUNTIME_ERROR",
        requestId,
        errorMessage: modelErr.message
      }));
      // Fail closed with safe fallback
      return this.buildSafeFallbackResponse(requestId, contentId, viewerTimestamp, mode, citations, snapshot.maxRevealTimeUsed, intelligenceVersion, contentItem.aiReady, startTime);
    }

    const modelLatencyMs = Date.now() - modelStart;

    // 9. Grounding Validation (Requirements 20, 21, 22)
    const groundingResult = validateGrounding(rawModelOutput, retrievedDocs, mode);
    console.log(JSON.stringify({
      event: "GROUNDING_VALIDATION_RESULT",
      requestId,
      valid: groundingResult.valid,
      violations: groundingResult.violations
    }));

    let finalAnswer = "";
    let finalRecap = "";
    let finalTakeaway = "";
    let finalQuestion = "";
    let finalOptions: any = undefined;
    let finalCorrectOptionId = "";
    let finalExplanation = "";

    if (!groundingResult.valid) {
      finalAnswer = groundingResult.safeFallback || "Based on what you've seen so far, that hasn't been established.";
      finalRecap = finalAnswer;
    } else {
      const p = groundingResult.parsedResponse || {};
      finalAnswer = p.answer || p.text || rawModelOutput;
      finalRecap = p.recap || p.answer || rawModelOutput;
      finalTakeaway = p.takeaway;
      finalQuestion = p.question;
      finalOptions = p.options;
      finalCorrectOptionId = p.correctOptionId;
      finalExplanation = p.explanation;
    }

    // 10. Temporal Invariant Assertion (Requirements 24, 44)
    let maxCitationRevealTime = 0;
    for (const c of citations) {
      if (c.revealTime > viewerTimestamp + 0.001) {
        console.error(JSON.stringify({
          event: "TEMPORAL_SAFETY_ASSERTION_FAILED",
          citationId: c.id,
          citationRevealTime: c.revealTime,
          viewerTimestamp
        }));
        // Fail closed
        return this.buildUnavailableResponse(requestId, contentId, viewerTimestamp, mode, "Safety assertion failed");
      }
      if (c.revealTime > maxCitationRevealTime) {
        maxCitationRevealTime = c.revealTime;
      }
    }

    console.log(JSON.stringify({
      event: "TEMPORAL_SAFETY_ASSERTION",
      requestId,
      maxRevealTimeUsed: maxCitationRevealTime,
      viewerTimestamp,
      assertionPassed: maxCitationRevealTime <= viewerTimestamp + 0.001
    }));

    console.log(JSON.stringify({
      event: "TEMPORAL_RAG_COMPLETE",
      requestId,
      contentId,
      mode,
      viewerTimestamp,
      totalLatencyMs: Date.now() - startTime,
      modelLatencyMs,
      intelligenceVersion,
      spoilerSafe: true
    }));

    return {
      requestId,
      contentId,
      viewerTimestamp,
      mode,
      answer: mode === 'ask' || mode === 'explain_simple' ? finalAnswer : undefined,
      recap: mode === 'previously_on' || mode === 'recap' ? finalRecap : undefined,
      takeaway: mode === 'learn' ? finalTakeaway : undefined,
      question: mode === 'learn' ? finalQuestion : undefined,
      options: mode === 'learn' ? finalOptions : undefined,
      correctOptionId: mode === 'learn' ? finalCorrectOptionId : undefined,
      explanation: mode === 'learn' ? finalExplanation : undefined,
      citations,
      safety: {
        spoilerSafe: true,
        maxRevealTimeUsed: maxCitationRevealTime,
        groundingPassed: groundingResult.valid,
        premiseValidated: true
      },
      intelligenceVersion,
      aiReady: contentItem.aiReady,
      latencyMs: Date.now() - startTime
    };
  }

  private async invokeModel(
    snapshot: TemporalSnapshot,
    retrievedDocs: any[],
    mode: TemporalMode,
    userQuestion?: string
  ): Promise<string> {
    const evidenceText = retrievedDocs.map((d, i) => `[E${i + 1}] (${d.type.toUpperCase()}) ${d.text}`).join('\n');
    const systemPrompt = this.buildSystemPrompt(snapshot.viewerTimestamp, mode);
    const userPrompt = this.buildUserPrompt(snapshot, evidenceText, mode, userQuestion);

    console.log(JSON.stringify({
      event: "BEDROCK_RUNTIME_REQUEST",
      provider: this.aiProvider,
      mode,
      evidenceItemCount: retrievedDocs.length,
      viewerTimestamp: snapshot.viewerTimestamp
    }));

    if (this.aiProvider === 'bedrock-mantle') {
      if (!this.tokenProvider) {
        this.tokenProvider = getTokenProvider();
      }
      const token = await this.tokenProvider();
      const client = new OpenAI({
        apiKey: token,
        baseURL: this.mantleBaseUrl,
        defaultQuery: { project: 'default' }
      });

      const response = await client.chat.completions.create({
        model: this.mantleModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 1000
      });

      const output = response.choices?.[0]?.message?.content?.trim();
      if (!output) throw new Error("Empty completion from Mantle");
      return output;
    } else {
      const command = new ConverseCommand({
        modelId: 'eu.amazon.nova-pro-v1:0',
        system: [{ text: systemPrompt }],
        messages: [{ role: 'user', content: [{ text: userPrompt }] }],
        inferenceConfig: { temperature: 0.1, maxTokens: 1000 }
      });
      const res = await this.runtimeClient.send(command);
      const text = res.output?.message?.content?.[0]?.text?.trim();
      if (!text) throw new Error("Empty response from Bedrock");
      return text;
    }
  }

  private buildSystemPrompt(viewerTimestamp: number, mode: TemporalMode): string {
    const base = `You are NarraView, the spoiler-safe streaming intelligence assistant.
You must answer ONLY using the supplied SAFE VIEWER CONTEXT.
The viewer has watched only up to: ${viewerTimestamp.toFixed(2)} seconds.

ABSOLUTE SPOILER SAFETY RULES:
1. Never reveal, mention, or hint at anything that happens AFTER ${viewerTimestamp.toFixed(2)} seconds.
2. Never reveal later outcomes, unintroduced characters, future relationships, or future technologies.
3. If an answer or connection is not established in the SAFE VIEWER CONTEXT, state naturally:
   "That isn't established in what you've seen so far."
4. Never say "You will find out later" or "As the story progresses" because hints themselves spoil.
5. Do NOT use external or world knowledge about this content. The context provided is the sole truth.`;

    if (mode === 'learn') {
      return `${base}
You are generating a Quick Check quiz for Learn Mode.
Return valid JSON matching this schema:
{
  "takeaway": "One concise sentence summarizing the main concept revealed so far.",
  "question": "A multiple-choice question testing understanding of revealed concepts.",
  "options": [
    {"id": "a", "text": "Option A"},
    {"id": "b", "text": "Option B"},
    {"id": "c", "text": "Option C"}
  ],
  "correctOptionId": "a",
  "explanation": "Why the correct option is true based on revealed material."
}`;
    }

    if (mode === 'previously_on' || mode === 'recap') {
      return `${base}
Provide a concise, engaging recap of key events and facts revealed so far.
Do not exceed 3-4 sentences. Do not mention future developments.`;
    }

    if (mode === 'explain_simple') {
      return `${base}
Explain the requested concept in simple, accessible terms using only the facts and context revealed so far.
Do not use advanced concepts or terminology introduced later in the content.`;
    }

    return `${base}
Answer the user's question directly and concisely using only the revealed facts.`;
  }

  private buildUserPrompt(snapshot: TemporalSnapshot, evidenceText: string, mode: TemporalMode, userQuestion?: string): string {
    let msg = `Content Title: ${snapshot.title}
Viewer Current Playback Timestamp: ${snapshot.viewerTimestamp.toFixed(2)}s

REVEALED EVIDENCE (KNOWN SO FAR):
${evidenceText || "No evidence has been revealed yet."}
`;

    if (mode === 'ask' && userQuestion) {
      msg += `\nViewer Question:\n${userQuestion}`;
    } else if (mode === 'explain_simple') {
      msg += `\nTopic to explain simply:\n${userQuestion || "The core concept revealed so far"}`;
    } else if (mode === 'previously_on' || mode === 'recap') {
      msg += `\nGenerate a brief recap of what has occurred up to this timestamp.`;
    } else if (mode === 'learn') {
      msg += `\nGenerate a Learn Mode takeaway and 3-option quiz based on the revealed evidence.`;
    }

    return msg;
  }

  private buildUnavailableResponse(requestId: string, contentId: string, timestamp: number, mode: TemporalMode, reason: string): TemporalRagResponse {
    console.log(JSON.stringify({
      event: "TEMPORAL_RAG_UNAVAILABLE",
      requestId,
      contentId,
      reason
    }));
    return {
      requestId,
      contentId,
      viewerTimestamp: timestamp,
      mode,
      answer: "NarraView intelligence isn't available for this title right now.",
      recap: "NarraView intelligence isn't available for this title right now.",
      citations: [],
      safety: {
        spoilerSafe: true,
        maxRevealTimeUsed: 0,
        groundingPassed: true,
        premiseValidated: true
      },
      intelligenceVersion: 0,
      aiReady: false
    };
  }

  private buildSafeFallbackResponse(
    requestId: string,
    contentId: string,
    timestamp: number,
    mode: TemporalMode,
    citations: any[],
    maxReveal: number,
    version: number,
    aiReady: boolean,
    startTime: number
  ): TemporalRagResponse {
    const text = "That isn't established in what you've seen so far.";
    return {
      requestId,
      contentId,
      viewerTimestamp: timestamp,
      mode,
      answer: mode === 'ask' || mode === 'explain_simple' ? text : undefined,
      recap: mode === 'previously_on' || mode === 'recap' ? text : undefined,
      citations,
      safety: {
        spoilerSafe: true,
        maxRevealTimeUsed: maxReveal,
        groundingPassed: true,
        premiseValidated: true
      },
      intelligenceVersion: version,
      aiReady,
      latencyMs: Date.now() - startTime
    };
  }
}
