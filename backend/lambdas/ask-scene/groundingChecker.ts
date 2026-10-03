
export interface Claim {
  text: string;
  evidenceIds: string[];
  type: "fact" | "bounded_interpretation" | "uncertainty";
}

export interface StructuredResponse {
  answer?: string;
  recap?: string;
  takeaway?: string;
  question?: string;
  options?: { id: string; text: string }[];
  correctOptionId?: string;
  explanation?: string;
  claims: Claim[];
  unknownsReferenced?: string[];
}

export interface GroundingValidationResult {
  valid: boolean;
  violations: string[];
  safeFallback?: string;
  parsedResponse?: StructuredResponse;
}

export const classifyQuestion = (question: string): string => {
  const lowerQ = question.toLowerCase();
  if (lowerQ.startsWith("who") || lowerQ.includes("same person")) return "WHO";
  if (lowerQ.includes("connected") || lowerQ.includes("connection")) return "CONNECTION";
  if (lowerQ.includes("cause") || lowerQ.includes("trigger") || lowerQ.includes("result in") || lowerQ.includes("led to") || lowerQ.includes("responsible")) return "CAUSE";
  if ((lowerQ.includes("why") && lowerQ.includes("someone")) || lowerQ.includes("hide") || lowerQ.includes("hiding") || lowerQ.includes("motive") || lowerQ.includes("deliberately")) return "MOTIVE";
  if (lowerQ.includes("sabotage")) return "SABOTAGE";
  if (lowerQ.includes("foul play") || lowerQ.includes("cover-up") || lowerQ.includes("conceal")) return "FOUL_PLAY";
  if (lowerQ.startsWith("why") || lowerQ.includes("suspicious") || lowerQ.includes("important") || lowerQ.includes("matter") || lowerQ.includes("significant") || lowerQ.includes("imply") || lowerQ.includes("mean")) return "SIGNIFICANCE";
  if (lowerQ.includes("what happened") || lowerQ.includes("what is") || lowerQ.includes("what unusual things")) return "FACTUAL";
  return "OTHER";
};

export const getSafeFallback = (questionType: string, timestamp: number, establishedFacts: string = ""): string => {
  const hasTelemetry = establishedFacts.toLowerCase().includes("telemetry");
  const hasTransmission = establishedFacts.toLowerCase().includes("transmission");
  
  switch (questionType) {
    case "SIGNIFICANCE":
      if (hasTelemetry && hasTransmission) {
        return "The telemetry records were altered shortly before the blackout. This follows the earlier unexplained transmission and Maya's corrupted signal, but the current context does not yet reveal who altered the records, why, or whether the events are directly connected.";
      }
      if (hasTransmission) {
        return "The unexplained transmission interrupting communications at Orbital Research Station Eos is unusual. The current information does not yet reveal its source or significance.";
      }
      return "The revealed facts are unusual, but the current context does not establish their full significance or connection.";
    case "WHO":
      if (hasTelemetry) return "The current context does not reveal who altered the telemetry records.";
      return "The current context does not reveal the identities of those involved.";
    case "CAUSE":
      if (hasTelemetry) return "The current context does not establish that the altered telemetry caused the blackout.";
      return "The current context does not establish the exact cause of these events.";
    case "MOTIVE":
      if (hasTelemetry) return "The reason the telemetry records were altered has not yet been revealed.";
      return "The motives behind these events have not yet been revealed.";
    case "SABOTAGE":
    case "FOUL_PLAY":
      return "The revealed information does not establish sabotage, foul play, or a cover-up.";
    case "FACTUAL":
      if (hasTelemetry) return "Several telemetry records were altered shortly before the blackout.";
      if (hasTransmission) return "An unexplained transmission interrupted communications.";
      return "There are no clear factual conclusions established yet.";
    case "CONNECTION":
      return "The revealed information does not yet establish whether the events are directly connected.";
    default:
      return "The current context does not establish further details.";
  }
};

export const validateGeneratedResponse = (
  modelResponse: string,
  timestamp: number,
  question: string,
  establishedFacts: string = ""
): GroundingValidationResult => {
  let structured: StructuredResponse;
  
  try {
    const jsonStart = modelResponse.indexOf("{");
    const jsonEnd = modelResponse.lastIndexOf("}") + 1;
    if (jsonStart === -1 || jsonEnd === 0) throw new Error("No JSON found");
    const jsonString = modelResponse.substring(jsonStart, jsonEnd);
    structured = JSON.parse(jsonString) as StructuredResponse;
    if (!structured.claims) {
      throw new Error("Missing claims field");
    }
  } catch (err) {
    return {
      valid: false,
      violations: ["INVALID_JSON", "MALFORMED_RESPONSE"],
      safeFallback: getSafeFallback(classifyQuestion(question), timestamp, establishedFacts)
    };
  }

  const violations: string[] = [];
  const textToValidate = [
    structured.answer,
    structured.recap,
    structured.takeaway,
    structured.question,
    ...(structured.options ? structured.options.map(o => o.text) : []),
    structured.explanation
  ].filter(Boolean).join(" ").toLowerCase();

  // 1. Validate Evidence References
  for (const claim of structured.claims) {
    if (claim.type !== "uncertainty" && (!claim.evidenceIds || claim.evidenceIds.length === 0)) {
      violations.push(`MISSING_EVIDENCE_REFERENCE: "${claim.text}"`);
    }
  }

  // 2. Build Explicit Story State for timestamp ~14
  const storyState = {
    telemetryAltered: timestamp >= 14 ? true : false,
    telemetryAlteredBeforeBlackout: timestamp >= 14 ? true : false,

    telemetryAlterationActor: null,
    telemetryAlterationMotive: null,
    telemetryAlterationIntentional: null,
    telemetryAlterationMalicious: null,

    concealmentKnown: null,
    coverUpKnown: null,
    sabotageKnown: null,

    telemetryCausedBlackout: null,
    telemetryRelatedToBlackout: null
  };

  // 3. HARD CLAIM CATEGORIES against story state
  // Check Actor
  if (storyState.telemetryAlterationActor === null) {
    const actorTerms = ["someone changed", "someone tampered", "they altered", "someone altered", "same person"];
    for (const term of actorTerms) {
      if (textToValidate.includes(term)) violations.push(`UNSUPPORTED_ACTOR (${term})`);
    }
  }

  // Check Intent
  if (storyState.telemetryAlterationIntentional === null) {
    const intentTerms = ["tampered", "tamper", "deliberately changed", "intentionally altered", "deliberate", "intentional"];
    for (const term of intentTerms) {
      if (textToValidate.includes(term)) violations.push(`UNSUPPORTED_INTENT (${term})`);
    }
  }

  // Check Motive
  if (storyState.telemetryAlterationMotive === null) {
    const motiveTerms = ["to hide", "to conceal", "to cover up", "to mislead", "hiding"];
    for (const term of motiveTerms) {
      if (textToValidate.includes(term)) violations.push(`UNSUPPORTED_MOTIVE (${term})`);
    }
  }

  // Check Coverup
  if (storyState.coverUpKnown === null) {
    const coverupTerms = ["cover-up", "cover up"];
    for (const term of coverupTerms) {
      if (textToValidate.includes(term)) violations.push(`UNSUPPORTED_COVERUP (${term})`);
    }
  }

  // Check Sabotage
  if (storyState.sabotageKnown === null) {
    const sabotageTerms = ["sabotage", "foul play"];
    for (const term of sabotageTerms) {
      if (textToValidate.includes(term)) violations.push(`UNSUPPORTED_SABOTAGE (${term})`);
    }
  }

  // Check Causality
  if (storyState.telemetryCausedBlackout === null) {
    const causalityTerms = ["caused the blackout", "triggered the outage", "led to the blackout", "caused the outage", "resulted in"];
    for (const term of causalityTerms) {
      if (textToValidate.includes(term)) violations.push(`UNSUPPORTED_CAUSALITY (${term})`);
    }
  }


  // Check Connection
  if (storyState.telemetryRelatedToBlackout === null) {
    const connectionTerms = ["are connected", "is connected", "connection", "linked"];
    for (const term of connectionTerms) {
      if (textToValidate.includes(term)) violations.push(`UNSUPPORTED_CONNECTION (${term})`);
    }
  }

  // External knowledge bounds
  const externalKnowledgeTerms = ["trustworthy log", "red flag", "standard procedure", "typically", "technical glitch"];
  for (const term of externalKnowledgeTerms) {
    if (textToValidate.includes(term)) violations.push(`UNSUPPORTED_EXTERNAL_KNOWLEDGE (${term})`);
  }

  if (violations.length > 0) {
    return {
      valid: false,
      violations,
      safeFallback: getSafeFallback(classifyQuestion(question), timestamp, establishedFacts),
      parsedResponse: structured
    };
  }

  return { valid: true, violations: [], parsedResponse: structured };
};
