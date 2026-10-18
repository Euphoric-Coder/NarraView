import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { getTokenProvider } from '@aws/bedrock-token-generator';
import OpenAI from 'openai';
import { S3Client } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { buildContextSnapshot } from './engine';
import { 
  buildAskPrompt, 
  buildRecapPrompt, 
  buildExplainSimplePrompt, 
  buildLearnPrompt,
  GROUNDING_RULES_VERSION, 
  PROMPT_BUILDER_VERSION, 
  RETRIEVAL_VERSION 
} from './groundingRules';
import { validateGeneratedResponse } from './groundingChecker';
import { analyzeQuestionPremises } from './premiseAnalyzer';
import { TemporalRagService } from './temporal-rag/service';
import { TemporalRagRequest } from './temporal-rag/types';

interface AskRequest {
  contentId: string;
  timestamp?: number;
  viewerTimestamp?: number;
  question?: string;
  mode?: "ask" | "recap" | "previously_on" | "explain_simple" | "learn";
  scene?: {
    startTime: number;
    endTime: number;
    label: string;
  };
  allowPreActivationTest?: boolean;
  viewerId?: string;
  watchedIntervals?: Array<{ start: number; end: number }>;
}

const REGION = process.env.AWS_REGION || 'eu-north-1';
const TABLE_NAME = process.env.TABLE_NAME || '';
const BUCKET_NAME = process.env.BUCKET_NAME || '';
const VIEWER_TABLE_NAME = process.env.VIEWER_TABLE_NAME || '';
const AI_PROVIDER = process.env.AI_PROVIDER || 'bedrock-mantle';
const BEDROCK_MANTLE_BASE_URL = process.env.BEDROCK_MANTLE_BASE_URL || 'https://bedrock-mantle.eu-north-1.api.aws/v1';
const BEDROCK_MANTLE_MODEL = process.env.BEDROCK_MANTLE_MODEL || 'openai.gpt-oss-120b';
const BEDROCK_RUNTIME_MODEL_ID = 'eu.amazon.nova-pro-v1:0';

const dynamoClient = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({ region: REGION });
const runtimeClient = new BedrockRuntimeClient({ region: REGION });

// Initialize Generic Temporal RAG Service for processed titles (v0.16)
const temporalRagService = new TemporalRagService({
  docClient,
  s3Client,
  tableName: TABLE_NAME,
  bucketName: BUCKET_NAME,
  mantleBaseUrl: BEDROCK_MANTLE_BASE_URL,
  mantleModel: BEDROCK_MANTLE_MODEL,
  aiProvider: AI_PROVIDER,
  region: REGION
});

let provideToken: any = null;

const getFallbackResponse = (body: AskRequest, safeFallbackString: string): any => {
  const mode = body.mode || 'ask';
  const effectiveTimestamp = body.viewerTimestamp ?? body.timestamp ?? 0;
  const base = {
    mode,
    contentId: body.contentId,
    timestamp: effectiveTimestamp,
    viewerTimestamp: effectiveTimestamp,
    spoilerSafe: true,
    source: "fallback-grounding"
  };

  if (mode === 'ask' || mode === 'explain_simple') {
    return { ...base, answer: safeFallbackString };
  } else if (mode === 'recap' || mode === 'previously_on') {
    return { ...base, recap: safeFallbackString };
  } else if (mode === 'learn') {
    return {
      ...base,
      takeaway: safeFallbackString,
      question: "Which event has been revealed so far?",
      options: [
        { id: "a", text: "Communications continued normally" },
        { id: "b", text: safeFallbackString.substring(0, 40) + "..." },
        { id: "c", text: "No unusual event occurred" }
      ],
      correctOptionId: "b",
      explanation: safeFallbackString
    };
  }
};

export const handler = async (event: any): Promise<any> => {
  try {
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Admin-Token',
      'Access-Control-Allow-Methods': 'OPTIONS,POST',
      'Content-Type': 'application/json',
    };

    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 200, headers, body: '' };
    }

    if (!event.body) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing request body' }) };
    }

    const body: AskRequest = JSON.parse(event.body);
    const mode = body.mode || 'ask';
    const effectiveTimestamp = body.viewerTimestamp ?? body.timestamp;

    if (!body.contentId || effectiveTimestamp === undefined || (mode === 'ask' && !body.question)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required fields' })
      };
    }

    // Determine admin caller for Studio Temporal RAG Test tool (Requirements 58, 65)
    const adminToken = process.env.ADMIN_TOKEN || 'narraview-admin-token';
    const isAdmin = event.headers?.['x-admin-token'] === adminToken ||
      event.headers?.['X-Admin-Token'] === adminToken ||
      body.allowPreActivationTest === true;

    // Fetch viewer watch state / intervals if viewerId provided (v0.17)
    let watchedIntervals = body.watchedIntervals;
    if (!watchedIntervals && body.viewerId && VIEWER_TABLE_NAME) {
      try {
        const progRes = await docClient.send(new GetCommand({
          TableName: VIEWER_TABLE_NAME,
          Key: { viewerId: body.viewerId, contentId: body.contentId }
        }));
        if (progRes.Item?.watchedIntervals) {
          watchedIntervals = progRes.Item.watchedIntervals;
        }
      } catch (err) {
        console.warn('[ASK_SCENE] Could not load viewer watch intervals:', err);
      }
    }

    // PROVIDER ABSTRACTION (Requirement 37, 38):
    // If title is Signal Lost, route through handcrafted provider to maintain 100% regression compatibility.
    // For all other processed titles (e.g. CityCare), route through Generic Temporal RAG engine.
    if (body.contentId !== 'signal-lost') {
      const ragRequest: TemporalRagRequest = {
        contentId: body.contentId,
        viewerTimestamp: effectiveTimestamp,
        timestamp: effectiveTimestamp,
        mode: mode as any,
        question: body.question,
        requestId: event.requestContext?.requestId,
        viewerId: body.viewerId,
        watchedIntervals
      };

      const ragResponse = await temporalRagService.processRequest(ragRequest, {
        allowPreActivationTest: isAdmin
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ...ragResponse,
          timestamp: ragResponse.viewerTimestamp,
          confidence: 1.0,
          source: AI_PROVIDER
        })
      };
    }

    // Handcrafted Provider for Signal Lost
    const contextSnapshot = buildContextSnapshot(body.contentId, effectiveTimestamp);
    if (!contextSnapshot) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: `Unknown contentId: ${body.contentId}` })
      };
    }

    const contentTitle = contextSnapshot.title;
    const currentSceneLabel = contextSnapshot.currentScene?.label || 'Unknown';

    let evidenceCounter = 1;
    const evidenceList: { id: string, text: string }[] = [];
    
    contextSnapshot.previousScenes.forEach(s => {
      evidenceList.push({ id: `E${evidenceCounter++}`, text: s.summary });
    });
    
    contextSnapshot.knownEvents.forEach(e => {
      evidenceList.push({ id: `E${evidenceCounter++}`, text: e.description });
    });
    
    const establishedFactsText = evidenceList.map(e => `${e.id}: ${e.text}`).join('\n');

    // Premise check for Signal Lost
    if (mode === 'ask' && body.question) {
      const premiseValidation = analyzeQuestionPremises(body.question, effectiveTimestamp, contextSnapshot, establishedFactsText);
      
      if (!premiseValidation.valid) {
        console.log("[NARRAVIEW_PREMISE_VALIDATION]", JSON.stringify({
          requestId: event.requestContext?.requestId || "local-test",
          timestamp: effectiveTimestamp,
          questionType: "PREMISE_LOADED",
          premiseValid: false,
          violations: premiseValidation.violations,
          shortCircuited: true
        }));
        
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            mode: 'ask',
            answer: premiseValidation.safeResponse || "That premise has not been established.",
            contentId: body.contentId,
            sceneLabel: currentSceneLabel,
            timestamp: effectiveTimestamp,
            viewerTimestamp: effectiveTimestamp,
            spoilerSafe: true,
            confidence: 1.0,
            source: "premise-guard",
            safety: {
              spoilerSafe: true,
              maxRevealTimeUsed: effectiveTimestamp,
              groundingPassed: true,
              premiseValidated: false
            }
          })
        };
      }
    }

    const knownCharactersText = contextSnapshot.knownCharacters.length > 0
      ? contextSnapshot.knownCharacters.map(c => `- ${c.name}`).join('\n')
      : 'None';

    const knownEntitiesText = contextSnapshot.knownEntities.length > 0
      ? contextSnapshot.knownEntities.map(e => `- ${e.name}`).join('\n')
      : 'None';

    console.log(JSON.stringify({
      logType: 'NarraView Context',
      contentId: body.contentId,
      timestamp: effectiveTimestamp,
      mode: mode,
      currentScene: currentSceneLabel,
      revealedSceneCount: contextSnapshot.previousScenes.length,
      knownCharacterCount: contextSnapshot.knownCharacters.length,
      knownEntityCount: contextSnapshot.knownEntities.length,
      knownEventCount: contextSnapshot.knownEvents.length,
      groundingRulesVersion: GROUNDING_RULES_VERSION,
      promptBuilderVersion: PROMPT_BUILDER_VERSION,
      retrievalVersion: RETRIEVAL_VERSION
    }));

    let systemPrompt = '';
    if (mode === 'recap' || mode === 'previously_on') systemPrompt = buildRecapPrompt();
    else if (mode === 'explain_simple') systemPrompt = buildExplainSimplePrompt();
    else if (mode === 'learn') systemPrompt = buildLearnPrompt();
    else systemPrompt = buildAskPrompt();

    let userMessage = `Content:
${contentTitle}
Viewer timestamp:
${effectiveTimestamp} seconds

ESTABLISHED FACTS:
${establishedFactsText}

KNOWN CHARACTERS:
${knownCharactersText}

KNOWN ENTITIES:
${knownEntitiesText}

UNKNOWN / NOT ESTABLISHED:
- Any motives, intent, guilt, or causes not explicitly stated above.
- The source, reason, or actor behind any unusual events, unless explicitly established.
- Whether any events are directly connected, unless explicitly established.
- Whether any actions were malicious, deliberate, or part of a cover-up.`;

    if (mode === 'ask' && body.question) {
      userMessage += `\n\nViewer question:\n${body.question}`;
    }

    let finalResponsePayload: any = {};
    let inferenceLatencyMs = 0;

    try {
      let rawModelOutput = "";
      if (AI_PROVIDER === 'bedrock-mantle') {
        if (!provideToken) { provideToken = getTokenProvider(); }
        const token = await provideToken();
        const client = new OpenAI({
          apiKey: token,
          baseURL: BEDROCK_MANTLE_BASE_URL,
          defaultQuery: { project: 'default' }
        });

        const start = Date.now();
        const response = await client.chat.completions.create({
          model: BEDROCK_MANTLE_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
          ],
          temperature: 0.1,
          max_tokens: 1500,
        });
        inferenceLatencyMs = Date.now() - start;

        const generatedText = response.choices?.[0]?.message?.content;
        if (!generatedText || generatedText.trim() === '') {
          throw new Error('Mantle returned an empty or invalid response block.');
        }
        rawModelOutput = generatedText.trim();
      } else if (AI_PROVIDER === 'bedrock-runtime') {
        const command = new ConverseCommand({
          modelId: BEDROCK_RUNTIME_MODEL_ID,
          system: [{ text: systemPrompt }],
          messages: [{ role: 'user', content: [{ text: userMessage }] }],
          inferenceConfig: { temperature: 0.1, maxTokens: 1500 }
        });

        const start = Date.now();
        const bedrockResponse = await runtimeClient.send(command);
        inferenceLatencyMs = Date.now() - start;

        const generatedText = bedrockResponse.output?.message?.content?.[0]?.text;
        if (!generatedText || generatedText.trim() === '') {
          throw new Error('Bedrock returned an empty or invalid response block.');
        }
        rawModelOutput = generatedText.trim();
      } else {
        throw new Error(`Unknown AI_PROVIDER: ${AI_PROVIDER}`);
      }

      // Grounding Validator Gate
      const validation = validateGeneratedResponse(rawModelOutput, effectiveTimestamp, body.question || '', establishedFactsText);
      
      let learnSafe = true;
      if (mode === 'learn' && validation.valid && validation.parsedResponse) {
         const p = validation.parsedResponse;
         if (!p.takeaway || !p.question || !p.options || p.options.length !== 3 || !p.correctOptionId || !p.explanation) {
            learnSafe = false;
         }
      }

      const baseRes = {
        mode,
        contentId: body.contentId,
        timestamp: effectiveTimestamp,
        viewerTimestamp: effectiveTimestamp,
        spoilerSafe: true,
        source: AI_PROVIDER,
        safety: {
          spoilerSafe: true,
          maxRevealTimeUsed: effectiveTimestamp,
          groundingPassed: validation.valid && learnSafe,
          premiseValidated: true
        }
      };

      if (!validation.valid || !learnSafe) {
        finalResponsePayload = getFallbackResponse(body, validation.safeFallback || "The current context does not establish further details.");
      } else {
        const p = validation.parsedResponse!;
        if (mode === 'ask' || mode === 'explain_simple') {
          finalResponsePayload = { ...baseRes, answer: p.answer || p.recap || "Valid response missing text", sceneLabel: currentSceneLabel, confidence: 1.0 };
        } else if (mode === 'recap' || mode === 'previously_on') {
          finalResponsePayload = { ...baseRes, recap: p.recap || p.answer || "Valid response missing recap" };
        } else if (mode === 'learn') {
          finalResponsePayload = {
            ...baseRes,
            takeaway: p.takeaway,
            question: p.question,
            options: p.options,
            correctOptionId: p.correctOptionId,
            explanation: p.explanation
          };
        }
      }

    } catch (aiError: any) {
      console.error(JSON.stringify({
        provider: AI_PROVIDER,
        contentId: body.contentId,
        timestamp: effectiveTimestamp,
        mode: mode,
        scene: currentSceneLabel,
        success: false,
        fallback: true,
        errorMessage: aiError.message
      }));
      
      finalResponsePayload = getFallbackResponse(body, "An error occurred while generating the response.");
      finalResponsePayload.source = "mock-fallback";
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(finalResponsePayload)
    };
  } catch (error: any) {
    console.error('Error handling request:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ error: String(error) + ' - ' + String(error.stack) })
    };
  }
};
