import { GroundingCheckResult, RetrievalDocument, TemporalMode } from "./types";
import { validateSemanticPreservation } from "./accessibility";

/**
 * Validates proposition-level grounding of model output against retrieved safe evidence.
 */
export function validateGrounding(
  rawOutput: string,
  retrievedDocs: RetrievalDocument[],
  mode: TemporalMode = "ask"
): GroundingCheckResult {
  if (!rawOutput || rawOutput.trim() === "") {
    return {
      valid: false,
      violations: ["EMPTY_MODEL_OUTPUT"],
      safeFallback: "The current context does not establish further details."
    };
  }

  const trimmed = rawOutput.trim();

  // Combine all safe evidence into lowercase corpus
  const evidenceCorpus = retrievedDocs.map(d => d.text.toLowerCase()).join(" \n ");

  // Parse JSON if structured output was returned
  let parsed: any = null;
  // Handle markdown code fences (```json ... ```)
  let jsonString = trimmed;
  if (jsonString.startsWith("```json")) {
    jsonString = jsonString.replace(/^```json\s*/, "").replace(/\s*```$/, "").trim();
  } else if (jsonString.startsWith("```")) {
    jsonString = jsonString.replace(/^```\s*/, "").replace(/\s*```$/, "").trim();
  }

  if (jsonString.startsWith("{") && jsonString.endsWith("}")) {
    try {
      parsed = JSON.parse(jsonString);
    } catch {
      // Not strict JSON, continue as text
    }
  }

  if (mode === "learn") {
    if (!parsed || typeof parsed !== "object") {
      return {
        valid: false,
        violations: ["INVALID_LEARN_JSON"],
        safeFallback: "Based on what you have seen so far, key concepts have been introduced.",
        parsedResponse: {
          takeaway: "Based on what you have seen so far, key concepts have been introduced.",
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
        violations: ["MALFORMED_LEARN_SCHEMA"],
        safeFallback: "Key concepts have been introduced up to this point."
      };
    }

    return {
      valid: true,
      violations: [],
      parsedResponse: parsed
    };
  }

  if (mode === "previously_on" || mode === "recap") {
    let title = "Previously On";
    let summary = "";
    let bullets: string[] = [];
    let keyPeople: string[] = [];
    let keyConcepts: string[] = [];

    if (parsed && typeof parsed === "object") {
      title = parsed.title || title;
      summary = parsed.summary || parsed.recap || parsed.answer || "";
      if (Array.isArray(parsed.bullets)) {
        bullets = parsed.bullets.filter((b: any) => typeof b === "string" && b.trim().length > 0);
      }
      if (Array.isArray(parsed.keyPeople)) {
        keyPeople = parsed.keyPeople.filter((p: any) => typeof p === "string" && p.trim().length > 0);
      }
      if (Array.isArray(parsed.keyConcepts)) {
        keyConcepts = parsed.keyConcepts.filter((c: any) => typeof c === "string" && c.trim().length > 0);
      }
    }

    // Fallback parsing if bullets not extracted from JSON
    if (bullets.length === 0) {
      const lines = trimmed.split("\n").map(l => l.trim()).filter(Boolean);
      const bulletLines = lines.filter(l => l.startsWith("-") || l.startsWith("•") || /^\d+[.)]/.test(l));
      if (bulletLines.length > 0) {
        bullets = bulletLines.map(l => l.replace(/^[-•\d.)]+\s*/, "").trim());
        summary = lines.find(l => !l.startsWith("-") && !l.startsWith("•") && !/^\d+[.)]/.test(l)) || bullets.join(" ");
      } else {
        const sentences = trimmed.split(/(?<=[.?!])\s+/).filter(s => s.trim().length > 5);
        bullets = sentences.slice(0, 4);
        summary = trimmed;
      }
    }

    if (!summary) {
      summary = bullets.join(" ");
    }

    // Extract key people or concepts from retrieved safe docs if empty
    if (keyPeople.length === 0) {
      const people = retrievedDocs
        .filter(d => d.type === "person" || (d.type as any) === "character")
        .map(d => (d as any).entityId || d.text.split(" - ")[0])
        .filter(Boolean);
      keyPeople = Array.from(new Set(people)).slice(0, 4);
    }

    if (keyConcepts.length === 0) {
      const concepts = retrievedDocs
        .filter(d => d.type === "concept")
        .map(d => (d as any).entityId || d.text.split(" - ")[0])
        .filter(Boolean);
      keyConcepts = Array.from(new Set(concepts)).slice(0, 4);
    }

    return {
      valid: true,
      violations: [],
      parsedResponse: {
        title,
        summary,
        recap: summary,
        answer: summary,
        bullets,
        keyPeople,
        keyConcepts
      }
    };
  }

  // Text content to validate for ask / explain_simple
  const textToCheck = parsed?.answer || parsed?.recap || parsed?.text || trimmed;

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

  if (retrievedDocs.length === 0) {
    return {
      valid: false,
      violations: ["NO_EVIDENCE_FOR_FACTUAL_CLAIM"],
      safeFallback: "That isn't established in what you have seen so far."
    };
  }

  // v0.19 Semantic Consistency & Preservation Guardrails (Req 38-40)
  const semanticCheck = validateSemanticPreservation(evidenceCorpus, textToCheck);
  console.log('[VIEWER_TELEMETRY] ACCESSIBILITY_GROUNDING_VALIDATED', {
    valid: semanticCheck.valid,
    violations: semanticCheck.violations,
    mode
  });

  if (!semanticCheck.valid) {
    return {
      valid: false,
      violations: semanticCheck.violations,
      safeFallback: "The current context does not establish further details."
    };
  }

  return {
    valid: true,
    violations: [],
    parsedResponse: { answer: textToCheck, recap: textToCheck }
  };
}
