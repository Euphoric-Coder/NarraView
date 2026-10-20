import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { getTokenProvider } from "@aws/bedrock-token-generator";
import OpenAI from "openai";
import { 
  TemporalRagRequest, 
  TemporalRagResponse, 
  TemporalSnapshot, 
  TemporalMode,
  ResumeContext
} from "./types";
import { buildTemporalSnapshot } from "./snapshot";
import { retrieveSafeEvidence } from "./retrieval";
import { validateQuestionPremise } from "./premise";
import { validateGrounding } from "./grounding";
import { 
  deriveViewerMemory, 
  intersectMemoryWithSafeSnapshot, 
  ViewerContentMemory 
} from "./memory";

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
    this.mantleBaseUrl = options.mantleBaseUrl || process.env.BEDROCK_MANTLE_BASE_URL || "https://bedrock-mantle.eu-north-1.api.aws/v1";
    this.mantleModel = options.mantleModel || process.env.BEDROCK_MANTLE_MODEL || "openai.gpt-oss-120b";
    this.aiProvider = options.aiProvider || process.env.AI_PROVIDER || "bedrock-mantle";
    this.runtimeClient = new BedrockRuntimeClient({ region: options.region || process.env.AWS_REGION || "eu-north-1" });
  }

  /**
   * Loads the authoritative intelligence package for the given content item.
   * Leverages safe in-memory cache keyed by contentId and version.
   */
  public async loadIntelligencePackage(contentId: string, expectedVersion?: number, s3KeyOverride?: string): Promise<{ package: any; version: number }> {
    const versionKey = expectedVersion ? `v${expectedVersion}` : "latest";
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
    const viewerTimestamp = typeof request.viewerTimestamp === "number" 
      ? request.viewerTimestamp 
      : (typeof request.timestamp === "number" ? request.timestamp : 0);
    const mode: TemporalMode = request.mode || "ask";

    // Extract watched intervals and resume context (v0.18)
    const resumeContext: ResumeContext | undefined = request.resumeContext;
    const watchedIntervals = resumeContext?.watchedIntervals || request.watchedIntervals || [];
    const returnType = resumeContext?.returnType;
    const timeAwaySeconds = resumeContext?.timeAwaySeconds;

    console.log(JSON.stringify({
      event: "TEMPORAL_RAG_REQUEST",
      requestId,
      contentId,
      viewerTimestamp,
      mode,
      question: request.question ? "[REDACTED_OR_PRESENT]" : undefined,
      returnType,
      hasResumeContext: !!resumeContext,
      watchedIntervalsCount: watchedIntervals.length
    }));

    if (mode === "previously_on" || mode === "recap") {
      console.log("[VIEWER_TELEMETRY] PERSONALIZED_RECAP_REQUEST", {
        requestId,
        viewerId: request.viewerId || "anonymous",
        contentId,
        viewerTimestamp,
        returnType,
        timeAwaySeconds,
        watchedIntervalsCount: watchedIntervals.length
      });
    }

    // 1. Fetch content metadata from DynamoDB
    const contentRecord = await this.docClient.send(new GetCommand({
      TableName: this.tableName,
      Key: { contentId }
    }));

    const contentItem = contentRecord.Item;
    if (!contentItem) {
      return this.buildUnavailableResponse(requestId, contentId, viewerTimestamp, mode, "Content not found");
    }

    // 2. Validate runtime eligibility
    const processing = contentItem.processing || {};
    const isEligible = 
      processing.transcriptionStatus === "complete" &&
      processing.transcriptCorrectionStatus === "complete" &&
      processing.sceneDetectionStatus === "complete" &&
      processing.metadataExtractionStatus === "complete" &&
      processing.intelligenceCompilationStatus === "complete";

    if (!isEligible) {
      return this.buildUnavailableResponse(requestId, contentId, viewerTimestamp, mode, "Pipeline stages not complete");
    }

    // 3. AI Ready enforcement
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

    // Verify referential integrity
    if (intelligencePackage.quality && intelligencePackage.quality.referentialIntegrity === false) {
      return this.buildUnavailableResponse(requestId, contentId, viewerTimestamp, mode, "Referential integrity failed");
    }

    // 5. Build Safe Temporal Snapshot (STRICT SPOILER FILTER: revealTime <= viewerTimestamp)
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

    // 5b. Derive Viewer Content Memory & enforce Seek-Back Invariant
    const rawMemory = deriveViewerMemory(
      snapshot, 
      watchedIntervals, 
      intelligenceVersion, 
      request.viewerId || "anonymous"
    );
    const effectiveMemory = intersectMemoryWithSafeSnapshot(rawMemory, snapshot);

    // 6. Premise Validation
    if (mode === "ask" && request.question) {
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
          mode: "ask",
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

    // 7. Evidence Retrieval strictly from Safe Snapshot with Viewer Coverage Weighting
    const query = request.question || request.topic || "";
    const { documents: retrievedDocs, citations } = retrieveSafeEvidence(
      snapshot, 
      query, 
      mode, 
      mode === "previously_on" || mode === "recap" ? 10 : 8, 
      watchedIntervals
    );

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
      rawModelOutput = await this.invokeModel(
        snapshot, 
        retrievedDocs, 
        mode, 
        request.question, 
        watchedIntervals, 
        resumeContext, 
        effectiveMemory
      );
    } catch (modelErr: any) {
      console.error(JSON.stringify({
        event: "BEDROCK_RUNTIME_ERROR",
        requestId,
        errorMessage: modelErr.message
      }));
      return this.buildSafeFallbackResponse(
        requestId, 
        contentId, 
        viewerTimestamp, 
        mode, 
        citations, 
        snapshot.maxRevealTimeUsed, 
        intelligenceVersion, 
        contentItem.aiReady, 
        startTime,
        resumeContext
      );
    }

    const modelLatencyMs = Date.now() - modelStart;

    // 9. Grounding Validation
    const groundingResult = validateGrounding(rawModelOutput, retrievedDocs, mode);
    console.log(JSON.stringify({
      event: "GROUNDING_VALIDATION_RESULT",
      requestId,
      valid: groundingResult.valid,
      violations: groundingResult.violations
    }));

    let finalAnswer = "";
    let finalRecap = "";
    let finalTitle = "Previously On";
    let finalSummary = "";
    let finalBullets: string[] = [];
    let finalKeyPeople: string[] = [];
    let finalKeyConcepts: string[] = [];
    let finalTakeaway = "";
    let finalQuestion = "";
    let finalOptions: any = undefined;
    let finalCorrectOptionId = "";
    let finalExplanation = "";

    if (!groundingResult.valid) {
      finalAnswer = groundingResult.safeFallback || "Based on what you have seen so far, that has not been established.";
      finalRecap = finalAnswer;
      finalSummary = finalAnswer;
      finalBullets = [finalAnswer];
    } else {
      const p = groundingResult.parsedResponse || {};
      finalAnswer = p.answer || p.text || rawModelOutput;
      finalRecap = p.recap || p.answer || rawModelOutput;
      finalTitle = p.title || "Previously On";
      finalSummary = p.summary || p.recap || finalRecap;
      finalBullets = Array.isArray(p.bullets) && p.bullets.length > 0 ? p.bullets : [finalRecap];
      finalKeyPeople = Array.isArray(p.keyPeople) ? p.keyPeople : [];
      finalKeyConcepts = Array.isArray(p.keyConcepts) ? p.keyConcepts : [];
      finalTakeaway = p.takeaway;
      finalQuestion = p.question;
      finalOptions = p.options;
      finalCorrectOptionId = p.correctOptionId;
      finalExplanation = p.explanation;
    }

    // 10. Temporal Invariant Assertion
    let maxCitationRevealTime = 0;
    for (const c of citations) {
      if (c.revealTime > viewerTimestamp + 0.001) {
        console.error(JSON.stringify({
          event: "TEMPORAL_SAFETY_ASSERTION_FAILED",
          citationId: c.id,
          citationRevealTime: c.revealTime,
          viewerTimestamp
        }));
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

    const isRecapMode = mode === "previously_on" || mode === "recap";
    const personalized = isRecapMode ? Boolean(resumeContext || watchedIntervals.length > 0) : undefined;
    const watchedCoverageUsed = isRecapMode ? (watchedIntervals.length > 0) : undefined;

    if (isRecapMode) {
      console.log("[VIEWER_TELEMETRY] PERSONALIZED_RECAP_RESULT", {
        requestId,
        viewerId: request.viewerId || "anonymous",
        contentId,
        bulletsCount: finalBullets.length,
        maxRevealTimeUsed: maxCitationRevealTime,
        personalized,
        watchedCoverageUsed,
        returnType
      });
    }

    console.log(JSON.stringify({
      event: "TEMPORAL_RAG_COMPLETE",
      requestId,
      mode,
      latencyMs: Date.now() - startTime,
      modelLatencyMs
    }));

    return {
      requestId,
      contentId,
      viewerTimestamp,
      timestamp: viewerTimestamp,
      mode,
      answer: mode === "ask" || mode === "explain_simple" ? finalAnswer : undefined,
      recap: isRecapMode ? finalRecap : undefined,
      title: isRecapMode ? finalTitle : undefined,
      summary: isRecapMode ? finalSummary : undefined,
      bullets: isRecapMode ? finalBullets : undefined,
      keyPeople: isRecapMode && finalKeyPeople.length > 0 ? finalKeyPeople : undefined,
      keyConcepts: isRecapMode && finalKeyConcepts.length > 0 ? finalKeyConcepts : undefined,
      takeaway: mode === "learn" ? finalTakeaway : undefined,
      question: mode === "learn" ? finalQuestion : undefined,
      options: mode === "learn" ? finalOptions : undefined,
      correctOptionId: mode === "learn" ? finalCorrectOptionId : undefined,
      explanation: mode === "learn" ? finalExplanation : undefined,
      citations,
      safety: {
        spoilerSafe: true,
        maxRevealTimeUsed: maxCitationRevealTime,
        groundingPassed: groundingResult.valid,
        premiseValidated: true
      },
      intelligenceVersion,
      aiReady: contentItem.aiReady,
      latencyMs: Date.now() - startTime,
      personalized,
      watchedCoverageUsed,
      returnType
    };
  }

  private async invokeModel(
    snapshot: TemporalSnapshot,
    retrievedDocs: any[],
    mode: TemporalMode,
    userQuestion?: string,
    watchedIntervals?: Array<{ start: number; end: number }>,
    resumeContext?: ResumeContext,
    memory?: ViewerContentMemory
  ): Promise<string> {
    const evidenceText = retrievedDocs
      .map((d, i) => `[E${i + 1}] (${d.type.toUpperCase()}) [COVERAGE: ${d.coverageStatus || "unknown"}] ${d.text}`)
      .join("\n");
    const systemPrompt = this.buildSystemPrompt(snapshot.viewerTimestamp, mode);
    const userPrompt = this.buildUserPrompt(snapshot, evidenceText, mode, userQuestion, watchedIntervals, resumeContext, memory);

    console.log(JSON.stringify({
      event: "BEDROCK_RUNTIME_REQUEST",
      provider: this.aiProvider,
      mode,
      evidenceItemCount: retrievedDocs.length,
      viewerTimestamp: snapshot.viewerTimestamp
    }));

    if (this.aiProvider === "bedrock-mantle") {
      if (!this.tokenProvider) {
        this.tokenProvider = getTokenProvider();
      }
      const token = await this.tokenProvider();
      const client = new OpenAI({
        apiKey: token,
        baseURL: this.mantleBaseUrl,
        defaultQuery: { project: "default" }
      });

      const response = await client.chat.completions.create({
        model: this.mantleModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 1000
      });

      const output = response.choices?.[0]?.message?.content?.trim();
      if (!output) throw new Error("Empty completion from Mantle");
      return output;
    } else {
      const command = new ConverseCommand({
        modelId: "eu.amazon.nova-pro-v1:0",
        system: [{ text: systemPrompt }],
        messages: [{ role: "user", content: [{ text: userPrompt }] }],
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

    if (mode === "learn") {
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

    if (mode === "previously_on" || mode === "recap") {
      return `${base}
You are generating a personalized Previously On recap for a returning viewer.
Return a valid JSON object matching this schema:
{
  "title": "Previously On",
  "summary": "1-2 sentence high-level refresher",
  "bullets": [
    "Concise reminder point 1",
    "Concise reminder point 2"
  ],
  "keyPeople": ["Person Name"],
  "keyConcepts": ["Concept Name"]
}

RECAP PERSONALIZATION AND SKIPPED-CONTENT RULES:
1. Heavily prioritize evidence marked [COVERAGE: watched]. These are events and facts the viewer actually experienced.
2. If evidence is marked [COVERAGE: skipped], do NOT falsely claim the viewer saw or learned it. Do NOT say "You saw...", "You learned...", or "Earlier you discovered...".
3. Avoid mentioning skipped material unless strictly required to understand the current section. If strictly necessary, frame it neutrally: "The video introduced X during a section you skipped."
4. Do NOT summarize the whole video. Remind the viewer only of the minimum necessary context to resume watching.
5. Keep bullets punchy, direct, and TV-friendly.`;
    }

    if (mode === "explain_simple") {
      return `${base}
Explain the requested concept in simple, accessible terms using only the facts and context revealed so far.
If viewer memory indicates the viewer has already seen the concept introduced, you may use a gentle reminder tone ("Earlier, you saw...").
If the viewer skipped that introduction, do NOT say "You saw"—frame it neutrally ("This was introduced as...").`;
    }

    return `${base}
Answer the user's question directly and concisely using only the revealed facts.
If viewer memory indicates the viewer previously watched the introduction to an entity or concept, use a reminder tone ("Earlier, you saw..." or "Earlier, CityCare introduced...").
If the viewer skipped that introduction, do NOT say "You saw"—state neutrally ("This has been introduced as...").`;
  }

  private buildUserPrompt(
    snapshot: TemporalSnapshot, 
    evidenceText: string, 
    mode: TemporalMode, 
    userQuestion?: string, 
    watchedIntervals?: Array<{ start: number; end: number }>,
    resumeContext?: ResumeContext,
    memory?: ViewerContentMemory
  ): string {
    let returnInfo = "";
    if (resumeContext) {
      returnInfo = `\nRETURN CONTEXT:
Return Classification: ${resumeContext.returnType || "UNKNOWN"}
Time Away: ${resumeContext.timeAwaySeconds != null ? resumeContext.timeAwaySeconds + " seconds" : "Not specified"}
Resume Position: ${resumeContext.resumePositionSeconds != null ? resumeContext.resumePositionSeconds + "s" : snapshot.viewerTimestamp + "s"}
`;
    }

    let lengthInstruction = "";
    if (mode === "previously_on" || mode === "recap") {
      if (snapshot.viewerTimestamp < 45) {
        lengthInstruction = "Target length: 1-2 concise bullets.";
      } else if (resumeContext?.returnType === "LONG_RETURN") {
        lengthInstruction = "Target length: 3-5 concise bullets (the viewer has been away for a long time).";
      } else {
        lengthInstruction = "Target length: 2-3 concise bullets.";
      }
    }

    let memoryNotes = "";
    if (memory && (mode === "ask" || mode === "explain_simple")) {
      const seenEntities = memory.knownEntityIds.filter(id => memory.entityConfidence[id] === "seen");
      const skippedEntities = Object.keys(memory.entityConfidence).filter(id => memory.entityConfidence[id] === "not_seen");
      const seenConcepts = memory.knownConceptIds.filter(id => memory.conceptConfidence[id] === "seen");
      const skippedConcepts = Object.keys(memory.conceptConfidence).filter(id => memory.conceptConfidence[id] === "not_seen");

      const notes: string[] = [];
      if (seenEntities.length > 0 || seenConcepts.length > 0) {
        notes.push(`Viewer watched introductions to: ${[...seenEntities, ...seenConcepts].join(", ")}. (Can use "Earlier you saw...").`);
      }
      if (skippedEntities.length > 0 || skippedConcepts.length > 0) {
        notes.push(`Viewer SKIPPED introductions to: ${[...skippedEntities, ...skippedConcepts].join(", ")}. (Do NOT say "You saw"; frame neutrally).`);
      }
      if (notes.length > 0) {
        memoryNotes = `\nVIEWER FAMILIARITY CONTEXT:\n${notes.join("\n")}\n`;
      }
    }

    let msg = `Content Title: ${snapshot.title}
Viewer Playback Timestamp: ${snapshot.viewerTimestamp.toFixed(2)}s
${returnInfo}${memoryNotes}
REVEALED EVIDENCE (KNOWN SO FAR):
${evidenceText || "No evidence has been revealed yet."}
`;

    if (mode === "ask" && userQuestion) {
      msg += `\nViewer Question:\n${userQuestion}`;
    } else if (mode === "explain_simple") {
      msg += `\nTopic to explain simply:\n${userQuestion || "The core concept revealed so far"}`;
    } else if (mode === "previously_on" || mode === "recap") {
      msg += `\nGenerate a personalized Previously On recap. ${lengthInstruction}`;
    } else if (mode === "learn") {
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
      timestamp,
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
    startTime: number,
    resumeContext?: ResumeContext
  ): TemporalRagResponse {
    const text = "That isn't established in what you've seen so far.";
    const isRecap = mode === "previously_on" || mode === "recap";
    return {
      requestId,
      contentId,
      viewerTimestamp: timestamp,
      timestamp,
      mode,
      answer: mode === "ask" || mode === "explain_simple" ? text : undefined,
      recap: isRecap ? text : undefined,
      title: isRecap ? "Previously On" : undefined,
      summary: isRecap ? text : undefined,
      bullets: isRecap ? [text] : undefined,
      citations,
      safety: {
        spoilerSafe: true,
        maxRevealTimeUsed: maxReveal,
        groundingPassed: true,
        premiseValidated: true
      },
      intelligenceVersion: version,
      aiReady,
      latencyMs: Date.now() - startTime,
      personalized: isRecap ? Boolean(resumeContext) : undefined,
      returnType: resumeContext?.returnType
    };
  }
}
