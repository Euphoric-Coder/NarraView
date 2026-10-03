import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { getTokenProvider } from '@aws/bedrock-token-generator';
import OpenAI from 'openai';
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

interface AskRequest {
  contentId: string;
  timestamp: number;
  question?: string;
  mode?: "ask" | "recap" | "explain_simple" | "learn";
  scene?: {
    startTime: number;
    endTime: number;
    label: string;
  };
}

const REGION = process.env.AWS_REGION || 'eu-north-1';
const AI_PROVIDER = process.env.AI_PROVIDER || 'bedrock-mantle';
const BEDROCK_MANTLE_BASE_URL = process.env.BEDROCK_MANTLE_BASE_URL || 'https://bedrock-mantle.eu-north-1.api.aws/v1';
const BEDROCK_MANTLE_MODEL = process.env.BEDROCK_MANTLE_MODEL || 'openai.gpt-oss-120b';

const BEDROCK_RUNTIME_MODEL_ID = 'eu.amazon.nova-pro-v1:0';
const runtimeClient = new BedrockRuntimeClient({ region: REGION });

let provideToken: any = null;

const getFallbackResponse = (body: AskRequest, safeFallbackString: string): any => {
  const mode = body.mode || 'ask';
  const base = {
    mode,
    contentId: body.contentId,
    timestamp: body.timestamp,
    spoilerSafe: true,
    source: "fallback-grounding"
  };

  if (mode === 'ask' || mode === 'explain_simple') {
    return { ...base, answer: safeFallbackString };
  } else if (mode === 'recap') {
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
      'Access-Control-Allow-Headers': 'Content-Type',
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

    if (!body.contentId || body.timestamp === undefined || (mode === 'ask' && !body.question)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required fields' })
      };
    }

    // Step 1: Use Scene Context Engine to build bounded spoiler-free context
    const contextSnapshot = buildContextSnapshot(body.contentId, body.timestamp);
    
    // Safety check - if we have no snapshot, we fall back cleanly
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

    // Step 1.5: Analyze Question Premises (Only for Ask mode)
    if (mode === 'ask' && body.question) {
      const premiseValidation = analyzeQuestionPremises(body.question, body.timestamp, contextSnapshot, establishedFactsText);
      
      if (!premiseValidation.valid) {
        console.log("[NARRAVIEW_PREMISE_VALIDATION]", JSON.stringify({
          requestId: event.requestContext?.requestId || "local-test",
          timestamp: body.timestamp,
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
            timestamp: body.timestamp,
            spoilerSafe: true,
            confidence: 1.0,
            source: "premise-guard"
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
      timestamp: body.timestamp,
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
    if (mode === 'recap') systemPrompt = buildRecapPrompt();
    else if (mode === 'explain_simple') systemPrompt = buildExplainSimplePrompt();
    else if (mode === 'learn') systemPrompt = buildLearnPrompt();
    else systemPrompt = buildAskPrompt();

    let userMessage = `Content:
${contentTitle}
Viewer timestamp:
${body.timestamp} seconds

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

        console.log("MANTLE RAW RESPONSE:", JSON.stringify(response));
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

      // MANDATORY GROUNDING VALIDATOR GATE
      const validation = validateGeneratedResponse(rawModelOutput, body.timestamp, body.question || '', establishedFactsText);
      
      // Learn Mode strict validation:
      let learnSafe = true;
      if (mode === 'learn' && validation.valid && validation.parsedResponse) {
         const p = validation.parsedResponse;
         if (!p.takeaway || !p.question || !p.options || p.options.length !== 3 || !p.correctOptionId || !p.explanation) {
            learnSafe = false;
         }
      }

      console.log("[NARRAVIEW_PIPELINE]", JSON.stringify({
        requestId: event.requestContext?.requestId || "local-test",
        timestamp: body.timestamp,
        mode: mode,
        groundingVersion: "v0.10-hard-gate-final",
        validatorExecuted: true,
        validatorPassed: validation.valid && learnSafe,
        fallbackUsed: !(validation.valid && learnSafe),
        violations: validation.violations,
        rawModelOutput: rawModelOutput
      }));

      const baseRes = {
        mode,
        contentId: body.contentId,
        timestamp: body.timestamp,
        spoilerSafe: true,
        source: AI_PROVIDER
      };

      if (!validation.valid || !learnSafe) {
        finalResponsePayload = getFallbackResponse(body, validation.safeFallback || "The current context does not establish further details.");
      } else {
        const p = validation.parsedResponse!;
        if (mode === 'ask' || mode === 'explain_simple') {
          finalResponsePayload = { ...baseRes, answer: p.answer || p.recap || "Valid response missing text", sceneLabel: currentSceneLabel, confidence: 1.0 };
        } else if (mode === 'recap') {
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

      console.log(JSON.stringify({
        provider: AI_PROVIDER,
        contentId: body.contentId,
        timestamp: body.timestamp,
        mode: mode,
        scene: currentSceneLabel,
        inferenceLatencyMs,
        success: true,
        fallback: false
      }));

    } catch (aiError: any) {
      console.error(JSON.stringify({
        provider: AI_PROVIDER,
        contentId: body.contentId,
        timestamp: body.timestamp,
        mode: mode,
        scene: currentSceneLabel,
        success: false,
        fallback: true,
        errorName: aiError.name,
        errorMessage: aiError.message
      }));
      
      const fallbackEnabled = process.env.ENABLE_BEDROCK_FALLBACK === 'true';
      if (fallbackEnabled) {
        finalResponsePayload = getFallbackResponse(body, "An error occurred but fallback is enabled.");
        finalResponsePayload.source = "mock-fallback";
      } else {
        throw aiError;
      }
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
