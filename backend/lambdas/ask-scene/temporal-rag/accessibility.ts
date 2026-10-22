import { 
  ExplanationStyle, 
  Verbosity, 
  ViewerAccessibilityProfile, 
  DEFAULT_ACCESSIBILITY_PROFILE, 
  JargonDefinition, 
  AccessibilityMetadata,
  TemporalSnapshot,
  RetrievalDocument,
  TemporalMode 
} from "./types";

// Curated technical and domain glossary for safe terms
export const SAFE_GLOSSARY: Record<string, string> = {
  "haversine distance": "A formula to calculate the geographic distance between two map coordinates using latitude and longitude.",
  "haversine": "A formula to calculate the geographic distance between two map coordinates using latitude and longitude.",
  "convex": "A reactive backend application platform and database used for real-time state sync.",
  "upstash redis": "A fast serverless in-memory data store used here for rate limiting.",
  "redis": "A fast in-memory key-value data store used here for caching and rate limiting.",
  "rag": "Retrieval-Augmented Generation — an AI method that grounds answers using verified safe facts from content.",
  "retrieval-augmented generation": "An AI method that grounds answers using verified safe facts from content.",
  "feature store": "A centralized data management system for machine learning models to store and serve features.",
  "feast": "An open-source feature store used to serve machine learning features in production.",
  "kafka": "A distributed event streaming platform used for high-throughput real-time data pipelines.",
  "xgboost": "An optimized gradient boosted decision tree machine learning library.",
  "telemetry": "Automated data collection and monitoring of system performance in real time.",
  "drift detection": "Monitoring machine learning models in production to detect changes in input data or accuracy drops.",
  "uo": "Unit Officer — a civic municipal officer who reviews incoming citizen complaints and assigns work orders.",
  "unit officer": "A municipal verification officer who reviews citizen complaints and assigns work orders.",
  "fo": "Field Officer — a civic worker dispatched on-site to inspect or repair municipal infrastructure.",
  "field officer": "A civic worker dispatched on-site to inspect or repair municipal infrastructure.",
  "citizen": "A resident reporting civic issues or tracking resolution status.",
  "admin": "A system administrator overseeing municipal department operations."
};

/**
 * Resolves a complete, safe ViewerAccessibilityProfile from optional/partial inputs.
 */
export function resolveAccessibilityProfile(
  partial?: Partial<ViewerAccessibilityProfile>
): ViewerAccessibilityProfile {
  if (!partial) {
    return {
      viewerId: "anonymous",
      ...DEFAULT_ACCESSIBILITY_PROFILE,
      updatedAt: new Date().toISOString()
    };
  }

  const explanationStyle: ExplanationStyle = 
    partial.explanationStyle === "simple" || partial.explanationStyle === "very_simple" || partial.explanationStyle === "standard"
      ? partial.explanationStyle
      : DEFAULT_ACCESSIBILITY_PROFILE.explanationStyle;

  const verbosity: Verbosity = 
    partial.verbosity === "brief" || partial.verbosity === "detailed" || partial.verbosity === "normal"
      ? partial.verbosity
      : DEFAULT_ACCESSIBILITY_PROFILE.verbosity;

  return {
    viewerId: partial.viewerId || "anonymous",
    explanationStyle,
    verbosity,
    jargonSupport: typeof partial.jargonSupport === "boolean" ? partial.jargonSupport : DEFAULT_ACCESSIBILITY_PROFILE.jargonSupport,
    entityReminders: typeof partial.entityReminders === "boolean" ? partial.entityReminders : DEFAULT_ACCESSIBILITY_PROFILE.entityReminders,
    conceptReminders: typeof partial.conceptReminders === "boolean" ? partial.conceptReminders : DEFAULT_ACCESSIBILITY_PROFILE.conceptReminders,
    stepByStep: typeof partial.stepByStep === "boolean" ? partial.stepByStep : DEFAULT_ACCESSIBILITY_PROFILE.stepByStep,
    reducedCognitiveLoad: typeof partial.reducedCognitiveLoad === "boolean" ? partial.reducedCognitiveLoad : DEFAULT_ACCESSIBILITY_PROFILE.reducedCognitiveLoad,
    autoExplainComplexTerms: typeof partial.autoExplainComplexTerms === "boolean" ? partial.autoExplainComplexTerms : DEFAULT_ACCESSIBILITY_PROFILE.autoExplainComplexTerms,
    updatedAt: partial.updatedAt || new Date().toISOString()
  };
}

/**
 * Detects technical jargon strictly present in SAFE revealed evidence and query.
 * Never detects or reveals terms from future unrevealed content.
 */
export function detectSafeJargon(
  snapshot: TemporalSnapshot,
  query: string = "",
  retrievedDocs: RetrievalDocument[] = []
): JargonDefinition[] {
  const combinedText = (query + " " + retrievedDocs.map(d => d.text).join(" ")).toLowerCase();
  const detected: JargonDefinition[] = [];
  const addedTerms = new Set<string>();

  // Check safe glossary terms
  for (const [term, def] of Object.entries(SAFE_GLOSSARY)) {
    const regex = new RegExp(`\\b${term}\\b`, "i");
    if (regex.test(combinedText) && !addedTerms.has(term)) {
      const hasSafeDoc = retrievedDocs.some(d => d.revealTime <= snapshot.viewerTimestamp + 0.001 && regex.test(d.text));
      const hasConcept = snapshot.unlockedConcepts.some(c => c.firstKnownAt <= snapshot.viewerTimestamp + 0.001 && (regex.test(c.name) || (c.aliases || []).some(a => regex.test(a))));
      const inQuery = regex.test(query);

      if (hasSafeDoc || hasConcept || (inQuery && (hasSafeDoc || hasConcept))) {
        const displayTerm = term.length <= 3 ? term.toUpperCase() : term.charAt(0).toUpperCase() + term.slice(1);
        detected.push({ term: displayTerm, definition: def });
        addedTerms.add(term);
      }
    }
  }

  // Also extract any safe concepts from snapshot unlockedConcepts that appear in query/evidence
  for (const c of snapshot.unlockedConcepts) {
    const cNameLower = c.name.toLowerCase();
    if (!addedTerms.has(cNameLower) && combinedText.includes(cNameLower) && c.description) {
      detected.push({ term: c.name, definition: c.description });
      addedTerms.add(cNameLower);
    }
  }

  return detected.slice(0, 4);
}

/**
 * Builds accessibility guidance instructions to inject into system/user prompts.
 */
export function buildAccessibilityPromptInstructions(
  profile: ViewerAccessibilityProfile,
  mode: TemporalMode,
  query: string = "",
  jargonDefs: JargonDefinition[] = []
): string {
  const sections: string[] = [];

  // 1. Explanation Style
  if (profile.explanationStyle === "simple") {
    sections.push(`EXPLANATION STYLE (SIMPLE):
- Explain concepts using simple, everyday conversational language.
- Replace complex technical phrases with intuitive descriptions (e.g. explain Haversine distance as "checking how close two reports are on the map").
- Do NOT alter numbers, do NOT drop negations, and do NOT change factual meaning.`);
  } else if (profile.explanationStyle === "very_simple") {
    sections.push(`EXPLANATION STYLE (VERY SIMPLE):
- Explain concepts using very plain, simple words and short sentences (e.g. explain Haversine distance as "checking if two complaints happened near the same place").
- Avoid all technical buzzwords.
- Break ideas down so any viewer can grasp them instantly.
- Do NOT alter numbers, do NOT drop negations, and do NOT change factual meaning.`);
  } else {
    sections.push(`EXPLANATION STYLE (STANDARD):
- Use accurate technical terminology and standard professional clarity as established in the content.`);
  }

  // 2. Verbosity & Length Targets
  if (profile.reducedCognitiveLoad || profile.verbosity === "brief") {
    sections.push(`VERBOSITY (BRIEF / REDUCED LOAD):
- Target length: 1-2 concise bullets or sentences (~30-50 words maximum).
- Prioritize the single most important takeaway.`);
  } else if (profile.verbosity === "detailed") {
    sections.push(`VERBOSITY (DETAILED):
- Target length: Thorough explanation (~150-220 words) with helpful context from safe evidence.`);
  } else {
    sections.push(`VERBOSITY (NORMAL):
- Target length: 2-4 sentences or bullets (~60-120 words).`);
  }

  // 3. Reduced Cognitive Load specifics
  if (profile.reducedCognitiveLoad) {
    sections.push(`REDUCED COGNITIVE LOAD:
- Fewer bullets (maximum 2).
- Shorter sentences with one clear idea per bullet.
- No parenthetical tangents or secondary trivia.
- Minimal entity names—only mention essential actors.`);
  }

  // 4. Step-by-Step Option
  if (profile.stepByStep) {
    sections.push(`STEP-BY-STEP EXPLANATION:
- If explaining a process, workflow, or mechanism (such as duplicate detection or issue assignment), format the explanation as ordered sequential steps:
  Step 1: ...
  Step 2: ...
- ONLY include steps established in the safe evidence so far.
- If only steps 1 and 2 are revealed so far, show only those. Never fabricate or extrapolate future steps.`);
  }

  // 5. Jargon Support
  if (profile.jargonSupport && jargonDefs.length > 0) {
    const jargonList = jargonDefs.map(j => `- ${j.term}: ${j.definition}`).join("\n");
    sections.push(`SAFE REVEALED TECHNICAL TERMS:
${jargonList}
If user asks about these terms, provide a term-first definition first, then relate it to the current video context.`);
  }

  // 6. Entity & Concept Reminders
  if (profile.entityReminders || profile.conceptReminders) {
    sections.push(`ENTITY & CONCEPT REMINDER RULES:
- When the viewer asks "Who is this?", "Who is Maya again?", "What is UO?", or "What was Convex again?":
  - If viewer familiarity indicates the viewer WATCHED the introduction, use a reminder tone ("Earlier, you saw...", "Earlier, CityCare introduced...").
  - If the viewer SKIPPED that introduction, frame it neutrally ("This has been introduced as...", "UO means Unit Officer...").
  - NEVER claim the viewer saw something they skipped or that was never shown.`);
  }

  // 7. Inviolable Guardrails
  sections.push(`INVIOLABLE FACTUAL ACCURACY GUARDRAILS:
- Simplification changes wording, NEVER truth or facts.
- PRESERVE NUMBERS EXACTLY: Do not alter quantities, counts, or thresholds (e.g. 15 reports remains 15).
- PRESERVE NEGATIONS EXACTLY: If an action is "not assigned" or "not yet verified", keep the negation.
- NO SPOILERS: Never refer to future events past the viewer playback timestamp.`);

  return sections.join("\n\n");
}

/**
 * Deterministic semantic preservation guardrail.
 * Validates that simplification did not alter numbers or drop critical negations.
 */
export function validateSemanticPreservation(
  evidenceCorpus: string,
  answer: string
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  const lowerAnswer = answer.toLowerCase();
  const lowerEvidence = evidenceCorpus.toLowerCase();

  // 1. Number preservation:
  const answerNumbers = (answer.match(/\b\d+(?:\.\d+)?\b/g) || [])
    .map(n => parseFloat(n))
    .filter(n => !isNaN(n) && n > 0 && n < 10000);

  const allowedNumbers = new Set<number>([1, 2, 3, 4, 5]);

  const evidenceNumbers = new Set(
    (evidenceCorpus.match(/\b\d+(?:\.\d+)?\b/g) || []).map(n => parseFloat(n))
  );

  for (const num of answerNumbers) {
    if (!allowedNumbers.has(num) && !evidenceNumbers.has(num)) {
      violations.push(`NUMBER_PRESERVATION_VIOLATION: Number ${num} in answer not grounded in safe evidence`);
    }
  }

  // 2. Negation preservation:
  const criticalNegations = [
    { negated: "not yet assigned", affirmative: "has been assigned" },
    { negated: "not assigned", affirmative: "is assigned" },
    { negated: "not verified", affirmative: "is verified" },
    { negated: "no duplicate", affirmative: "is a duplicate" },
    { negated: "not established", affirmative: "is established" }
  ];

  for (const pair of criticalNegations) {
    if (lowerEvidence.includes(pair.negated)) {
      if (lowerAnswer.includes(pair.affirmative) && !lowerAnswer.includes("not") && !lowerAnswer.includes("no") && !lowerAnswer.includes("un")) {
        violations.push(`NEGATION_PRESERVATION_VIOLATION: Flipped '${pair.negated}' to '${pair.affirmative}'`);
      }
    }
  }

  return {
    valid: violations.length === 0,
    violations
  };
}
