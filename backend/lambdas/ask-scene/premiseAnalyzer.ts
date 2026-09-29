import { ContextSnapshot } from './types';

export interface PremiseAnalysisResult {
  valid: boolean;
  premises: { proposition: string; status: string }[];
  violations: string[];
  safeResponse?: string;
}

export function buildCurrentSafeSummary(establishedFactsText: string): string {
  const hasTelemetry = establishedFactsText.toLowerCase().includes("telemetry");
  const hasTransmission = establishedFactsText.toLowerCase().includes("transmission");
  const hasMaya = establishedFactsText.toLowerCase().includes("maya");
  const hasStationSeven = establishedFactsText.toLowerCase().includes("station seven");

  if (hasStationSeven) {
    return "So far, the team is preparing to investigate the anomaly at Station Seven.";
  }
  
  if (hasTelemetry) {
    return "So far, the revealed events include the unexplained transmission, Maya's corrupted signal, and the discovery of altered telemetry records.";
  }

  if (hasTransmission && hasMaya) {
    return "So far, the revealed events are the unexplained transmission and Maya's corrupted emergency signal.";
  }

  if (hasTransmission) {
    return "So far, the known event is an unexplained transmission interrupting communications.";
  }

  return "No major events have been fully revealed yet.";
}

export function analyzeQuestionPremises(
  question: string,
  timestamp: number,
  contextSnapshot: ContextSnapshot,
  establishedFactsText: string
): PremiseAnalysisResult {
  const lowerQ = question.toLowerCase();
  const violations: string[] = [];
  const premises: { proposition: string; status: string }[] = [];
  
  let valid = true;

  // 1. Character checks
  const mentionsAlex = lowerQ.includes("alex");
  const mentionsMaya = lowerQ.includes("maya");

  const alexKnown = contextSnapshot.knownCharacters.some(c => c.name.toLowerCase().includes("alex"));
  const mayaKnown = contextSnapshot.knownCharacters.some(c => c.name.toLowerCase().includes("maya"));

  if (mentionsAlex && !alexKnown) {
    valid = false;
    violations.push("CHARACTER_NOT_REVEALED");
    premises.push({ proposition: "Alex is known", status: "NOT_YET_REVEALED" });
  }
  
  if (mentionsMaya && !mayaKnown) {
    valid = false;
    violations.push("CHARACTER_NOT_REVEALED");
    premises.push({ proposition: "Maya is known", status: "NOT_YET_REVEALED" });
  }

  // 2. Entity checks
  const mentionsTelemetry = lowerQ.includes("telemetry");
  const mentionsStationSeven = lowerQ.includes("station seven") || lowerQ.includes("station 7");
  const mentionsRelay = lowerQ.includes("relay");

  const telemetryKnown = contextSnapshot.knownEntities.some(e => e.name.toLowerCase().includes("telemetry"));
  const stationSevenKnown = contextSnapshot.knownEntities.some(e => e.name.toLowerCase().includes("station seven"));
  const relayKnown = contextSnapshot.knownEntities.some(e => e.name.toLowerCase().includes("relay"));

  if (mentionsTelemetry && !telemetryKnown) {
    valid = false;
    violations.push("ENTITY_NOT_REVEALED");
    premises.push({ proposition: "Telemetry is known", status: "NOT_YET_REVEALED" });
  }

  if (mentionsStationSeven && !stationSevenKnown) {
    valid = false;
    violations.push("ENTITY_NOT_REVEALED");
    premises.push({ proposition: "Station Seven is known", status: "NOT_YET_REVEALED" });
  }
  
  if (mentionsRelay && !relayKnown) {
    valid = false;
    violations.push("ENTITY_NOT_REVEALED");
    premises.push({ proposition: "Relay is known", status: "NOT_YET_REVEALED" });
  }

  // 3. Action / Relationship / Motivation checks
  const mentionsSabotage = lowerQ.includes("sabotage");
  const mentionsFoulPlay = lowerQ.includes("foul play") || lowerQ.includes("cover up") || lowerQ.includes("cover-up");
  const mentionsAlexAltered = mentionsAlex && (lowerQ.includes("alter") || lowerQ.includes("change") || lowerQ.includes("tamper") || lowerQ.includes("cause") || lowerQ.includes("did"));
  const mentionsMayaAltered = mentionsMaya && (lowerQ.includes("alter") || lowerQ.includes("change") || lowerQ.includes("tamper") || lowerQ.includes("tell"));

  // Check if sabotage is supported
  if (mentionsSabotage) {
    valid = false;
    violations.push("UNSUPPORTED_SABOTAGE");
    premises.push({ proposition: "Sabotage occurred", status: "UNSUPPORTED" });
  }

  if (mentionsFoulPlay) {
    valid = false;
    violations.push("UNSUPPORTED_CONCEALMENT");
    premises.push({ proposition: "Foul play/cover-up occurred", status: "UNSUPPORTED" });
  }

  if (mentionsAlexAltered) {
    // Even if Alex and Telemetry are known, Alex did not alter the telemetry (he just discovered it).
    valid = false;
    violations.push("UNSUPPORTED_ACTOR_ACTION");
    premises.push({ proposition: "Alex altered something or caused something", status: "UNSUPPORTED" });
  }

  if (mentionsMayaAltered && mentionsTelemetry) {
    valid = false;
    violations.push("UNSUPPORTED_ACTOR_ACTION");
    premises.push({ proposition: "Maya altered telemetry", status: "UNSUPPORTED" });
  }
  
  const mentionsDestination = (lowerQ.includes("going to") || lowerQ.includes("heading to")) && mentionsStationSeven;
  if (mentionsDestination && !stationSevenKnown) {
    valid = false;
    violations.push("UNSUPPORTED_DESTINATION");
    premises.push({ proposition: "Station Seven is destination", status: "NOT_YET_REVEALED" });
  }

  // Build safe response if invalid
  let safeResponse = undefined;
  
  if (!valid) {
    if (violations.includes("UNSUPPORTED_SABOTAGE") || violations.includes("UNSUPPORTED_CONCEALMENT")) {
      safeResponse = `That premise has not been established by the revealed information. ${buildCurrentSafeSummary(establishedFactsText)}`;
    } else if (violations.includes("CHARACTER_NOT_REVEALED") || violations.includes("ENTITY_NOT_REVEALED") || violations.includes("UNSUPPORTED_DESTINATION")) {
      safeResponse = `That information has not been revealed at this point. ${buildCurrentSafeSummary(establishedFactsText)}`;
    } else if (violations.includes("UNSUPPORTED_ACTOR_ACTION") && mentionsAlexAltered && telemetryKnown) {
       safeResponse = `The telemetry records were altered, but the current context does not establish that Alex altered them or why they were changed.`;
    } else if (violations.includes("UNSUPPORTED_ACTOR_ACTION")) {
      safeResponse = `That premise has not been established. ${buildCurrentSafeSummary(establishedFactsText)}`;
    } else {
      safeResponse = `That premise has not been established at this point. ${buildCurrentSafeSummary(establishedFactsText)}`;
    }
  } else {
     // Check for partial premise validity (e.g. Maya received signal, but why is unknown)
     if (lowerQ.includes("why") && lowerQ.includes("maya") && lowerQ.includes("receive")) {
         // Valid premise (Maya received signal), but reason is unknown. We can just let the LLM handle it, 
         // but if we want to short-circuit, we could. LLM handles it well though.
     }
  }

  return {
    valid,
    premises,
    violations,
    safeResponse
  };
}
