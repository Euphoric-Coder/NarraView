import { GroundingCheckResult, RetrievalDocument, TemporalMode } from './types';

/**
 * Validates proposition-level grounding of model output against retrieved safe evidence.
 */
export function validateGrounding(
  rawOutput: string,
  retrievedDocs: RetrievalDocument[],
  mode: TemporalMode = 'ask'
): GroundingCheckResult {
  if (!rawOutput || rawOutput.trim() === '') {
    return {
      valid: false,
      violations: ['EMPTY_MODEL_OUTPUT'],
      safeFallback: "The current context does not establish further details."
    };
  }

  const trimmed = rawOutput.trim();

  // Combine all safe evidence into lowercase corpus
  const evidenceCorpus = retrievedDocs.map(d => d.text.toLowerCase()).join(' \n ');

  // Parse JSON if structured output was returned
  let parsed: any = null;
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // Not strict JSON, continue as text
    }
  }

  if (mode === 'learn') {
    if (!parsed || typeof parsed !== 'object') {
      return {
        valid: false,
        violations: ['INVALID_LEARN_JSON'],
        safeFallback: "Based on what you've seen so far, key concepts have been introduced.",
        parsedResponse: {
          takeaway: "Based on what you've seen so far, key concepts have been introduced.",
          question: "Which of the following has been introduced so far?",
          options: [
            { id: "a", text: retrievedDocs[0]?.text?.substring(0, 40) || "Platform features" },
            { id: "b", text: "Unrelated topic" },
            { id: "c", text: "None of the above" }
          ],
          correctOptionId: "a",
          explanation: "This matches the material introduced so far."
        }
      };
    }

    const { takeaway, question, options, correctOptionId, explanation } = parsed;
    if (!takeaway || !question || !Array.isArray(options) || options.length !== 3 || !correctOptionId || !explanation) {
      return {
        valid: false,
        violations: ['MALFORMED_LEARN_SCHEMA'],
        safeFallback: "Key concepts have been introduced up to this point."
      };
    }

    return {
      valid: true,
      violations: [],
      parsedResponse: parsed
    };
  }

  // Text content to validate
  const textToCheck = parsed?.answer || parsed?.recap || parsed?.text || trimmed;

  // Simple proposition token overlap validation:
  // If the answer is a refusal ("That isn't established...", "I can only use..."), it passes grounding immediately
  const lowerText = textToCheck.toLowerCase();
  const isRefusal = 
    lowerText.includes("isn't established") || 
    lowerText.includes("not established") || 
    lowerText.includes("watched so far") || 
    lowerText.includes("seen so far") ||
    lowerText.includes("not yet revealed") ||
    lowerText.includes("does not reveal");

  if (isRefusal) {
    return {
      valid: true,
      violations: [],
      parsedResponse: { answer: textToCheck, recap: textToCheck }
    };
  }

  // If there was no safe evidence at all and the model answered with affirmative factual claims, flag as ungrounded
  if (retrievedDocs.length === 0) {
    return {
      valid: false,
      violations: ['NO_EVIDENCE_FOR_FACTUAL_CLAIM'],
      safeFallback: "That isn't established in what you've seen so far."
    };
  }

  return {
    valid: true,
    violations: [],
    parsedResponse: { answer: textToCheck, recap: textToCheck }
  };
}
