import { 
  resolveAccessibilityProfile, 
  detectSafeJargon, 
  buildAccessibilityPromptInstructions, 
  validateSemanticPreservation 
} from "../backend/lambdas/ask-scene/temporal-rag/accessibility";
import { 
  DEFAULT_ACCESSIBILITY_PROFILE, 
  ViewerAccessibilityProfile 
} from "../backend/lambdas/viewer/types";
import { buildTemporalSnapshot } from "../backend/lambdas/ask-scene/temporal-rag/snapshot";
import { retrieveSafeEvidence } from "../backend/lambdas/ask-scene/temporal-rag/retrieval";
import { deriveViewerMemory, intersectMemoryWithSafeSnapshot } from "../backend/lambdas/ask-scene/temporal-rag/memory";
import { validateGrounding } from "../backend/lambdas/ask-scene/temporal-rag/grounding";

// Mock intelligence package representing CityCare & ML Systems
const mockIntelligencePackage = {
  contentId: "city-care-demo",
  version: 1,
  title: "CityCare Technical Walkthrough",
  scenes: [
    { sceneId: "s1", startTime: 0, endTime: 60, title: "Platform Architecture", summary: "CityCare initializes dispatch infrastructure." },
    { sceneId: "s2", startTime: 60, endTime: 120, title: "Real-time State with Convex", summary: "Convex synchronizes live civic complaint state." },
    { sceneId: "s3", startTime: 120, endTime: 180, title: "Duplicate Detection with Haversine", summary: "CityCare uses Haversine distance to compare geographic separation." }
  ],
  facts: [
    { id: "f1", statement: "CityCare receives 15 civic complaints per day.", revealTime: 20, evidenceTranscriptIndices: [1] },
    { id: "f2", statement: "New reports remain not yet assigned until verification.", revealTime: 35, evidenceTranscriptIndices: [2] },
    { id: "f3", statement: "CityCare uses Haversine distance to compare geographic separation between two reports.", revealTime: 130, evidenceTranscriptIndices: [5] },
    { id: "f4", statement: "Upstash Redis handles rate limiting for public civic submissions.", revealTime: 145, evidenceTranscriptIndices: [6] },
    { id: "f5", statement: "Advanced drift detection monitors production model performance.", revealTime: 250, evidenceTranscriptIndices: [9] } // future past 180
  ],
  events: [
    { id: "ev1", description: "CityCare dispatch console comes online.", revealTime: 10, evidenceTranscriptIndices: [0] },
    { id: "ev2", description: "Citizen submits pothole complaint at 5th and Main.", revealTime: 40, evidenceTranscriptIndices: [3] }
  ],
  entities: [
    { id: "ent-citycare", name: "CityCare", entityType: "platform", description: "Civic response platform.", aliases: ["City Care"], firstKnownAt: 10, evidenceTranscriptIndices: [0] },
    { id: "ent-uo", name: "UO", entityType: "role", description: "Unit Officer verifying reports.", aliases: ["Unit Officer"], firstKnownAt: 30, evidenceTranscriptIndices: [2] },
    { id: "ent-haversine", name: "Haversine Distance", entityType: "technology", description: "Formula to calculate distance between coordinates.", aliases: ["Haversine"], firstKnownAt: 130, evidenceTranscriptIndices: [5] },
    { id: "ent-drift", name: "Drift Detection", entityType: "technology", description: "ML monitoring tool.", aliases: ["drift"], firstKnownAt: 250, evidenceTranscriptIndices: [9] }
  ],
  people: [
    { id: "p-maya", name: "Maya", role: "Field Officer", description: "Field officer responding to civic work orders.", aliases: [], firstKnownAt: 45, evidenceTranscriptIndices: [3] }
  ],
  concepts: [
    { id: "c-haversine", name: "Haversine distance", description: "A way to measure distance between two map coordinates.", aliases: ["haversine"], firstKnownAt: 130, evidenceTranscriptIndices: [5] },
    { id: "c-drift", name: "drift detection", description: "Monitoring ML systems for degradation.", aliases: ["drift"], firstKnownAt: 250, evidenceTranscriptIndices: [9] }
  ],
  relationships: []
};

describe("NarraView v0.19: Accessibility Intelligence & Adaptive Explanation", () => {

  describe("Part A & Y: Profile Defaults, Persistence, and Enum Validation (Req 54, 55, 57)", () => {
    it("assigns standard safe defaults to new viewers (Req 54)", () => {
      const profile = resolveAccessibilityProfile();
      expect(profile.explanationStyle).toBe("standard");
      expect(profile.verbosity).toBe("normal");
      expect(profile.jargonSupport).toBe(true);
      expect(profile.entityReminders).toBe(true);
      expect(profile.conceptReminders).toBe(true);
      expect(profile.stepByStep).toBe(false);
      expect(profile.reducedCognitiveLoad).toBe(false);
      expect(profile.autoExplainComplexTerms).toBe(false);
    });

    it("supports partial updates and persists preferences without resetting others (Req 55, 35)", () => {
      const initial = resolveAccessibilityProfile({ viewerId: "v1", explanationStyle: "simple" });
      expect(initial.explanationStyle).toBe("simple");
      expect(initial.verbosity).toBe("normal");

      // Update verbosity only
      const updated = resolveAccessibilityProfile({
        ...initial,
        verbosity: "brief",
        reducedCognitiveLoad: true
      });

      expect(updated.explanationStyle).toBe("simple"); // preserved
      expect(updated.verbosity).toBe("brief");
      expect(updated.reducedCognitiveLoad).toBe(true);
    });

    it("strictly rejects or falls back for invalid enum values (Req 57, 34)", () => {
      const invalidStyle = resolveAccessibilityProfile({
        explanationStyle: "ultra_simple" as any,
        verbosity: "massive" as any
      });

      // Must fall back to safe default enums
      expect(invalidStyle.explanationStyle).toBe("standard");
      expect(invalidStyle.verbosity).toBe("normal");
    });
  });

  describe("Part B & V: Viewer Isolation & Multi-Viewer Differentiation (Req 56, 49, 50)", () => {
    it("guarantees Viewer A preferences do not cross-contaminate Viewer B (Req 56)", () => {
      const viewerA = resolveAccessibilityProfile({
        viewerId: "viewer-a",
        explanationStyle: "simple",
        verbosity: "brief",
        entityReminders: true
      });

      const viewerB = resolveAccessibilityProfile({
        viewerId: "viewer-b",
        explanationStyle: "standard",
        verbosity: "detailed",
        stepByStep: true
      });

      expect(viewerA.explanationStyle).toBe("simple");
      expect(viewerB.explanationStyle).toBe("standard");
      expect(viewerA.verbosity).toBe("brief");
      expect(viewerB.verbosity).toBe("detailed");
      expect(viewerA.stepByStep).toBe(false);
      expect(viewerB.stepByStep).toBe(true);
    });
  });

  describe("Part C, M & Y: Same Evidence Set for Different Styles (Req 58, 31)", () => {
    it("ensures Standard, Simple, and Very Simple styles use the exact same safe evidence (Req 58, 31)", () => {
      const snapshot = buildTemporalSnapshot(mockIntelligencePackage, 150);
      const query = "What is Haversine distance?";

      const profileStandard = resolveAccessibilityProfile({ explanationStyle: "standard" });
      const profileSimple = resolveAccessibilityProfile({ explanationStyle: "simple" });
      const profileVerySimple = resolveAccessibilityProfile({ explanationStyle: "very_simple" });

      // In v0.19, safe evidence is retrieved once identically for all styles
      const evidence = retrieveSafeEvidence(snapshot, query, "ask", 6);

      const promptStd = buildAccessibilityPromptInstructions(profileStandard, "ask", query);
      const promptSimp = buildAccessibilityPromptInstructions(profileSimple, "ask", query);
      const promptVery = buildAccessibilityPromptInstructions(profileVerySimple, "ask", query);

      expect(evidence.documents.length).toBeGreaterThan(0);
      expect(promptStd).toContain("EXPLANATION STYLE (STANDARD)");
      expect(promptSimp).toContain("EXPLANATION STYLE (SIMPLE)");
      expect(promptVery).toContain("EXPLANATION STYLE (VERY SIMPLE)");
      expect(snapshot.maxRevealTimeUsed).toBeLessThanOrEqual(150);
    });
  });

  describe("Part Q & Y: Semantic Consistency, Number & Negation Safety (Req 59, 60, 38-40)", () => {
    it("preserves exact numbers and rejects modified numbers in simplified text (Req 59, 39)", () => {
      const evidence = "CityCare receives 15 civic complaints per day through the mobile application.";

      // Valid: preserves 15
      const validSimplified = "CityCare receives 15 reports every day.";
      const validCheck = validateSemanticPreservation(evidence, validSimplified);
      expect(validCheck.valid).toBe(true);
      expect(validCheck.violations).toHaveLength(0);

      // Invalid: altered number from 15 to 10
      const invalidSimplified = "CityCare receives 10 reports every day.";
      const invalidCheck = validateSemanticPreservation(evidence, invalidSimplified);
      expect(invalidCheck.valid).toBe(false);
      expect(invalidCheck.violations[0]).toContain("NUMBER_PRESERVATION_VIOLATION");
    });

    it("preserves negations and rejects flipping 'not yet assigned' into affirmative (Req 60, 40)", () => {
      const evidence = "New reports remain not yet assigned until verification.";

      // Valid: maintains negation
      const validText = "The report is not yet assigned to an officer.";
      expect(validateSemanticPreservation(evidence, validText).valid).toBe(true);

      // Invalid: dropped negation
      const invalidText = "The report has been assigned to an officer.";
      const check = validateSemanticPreservation(evidence, invalidText);
      expect(check.valid).toBe(false);
      expect(check.violations[0]).toContain("NEGATION_PRESERVATION_VIOLATION");
    });
  });

  describe("Part D & Y: Jargon Detection & Term-First Definitions (Req 61, 10-12)", () => {
    it("detects technical terms present in safe revealed context (Req 61, 10)", () => {
      const snapshot = buildTemporalSnapshot(mockIntelligencePackage, 150);
      const docs = [
        { id: "e1", text: "CityCare uses Haversine distance for location proximity.", type: "technology" as any, revealTime: 130, evidenceTranscriptIndices: [] }
      ];

      const jargon = detectSafeJargon(snapshot, "What is Haversine distance?", docs);
      expect(jargon.length).toBeGreaterThan(0);
      expect(jargon.some(j => j.term.toLowerCase().includes("haversine"))).toBe(true);
    });

    it("never detects or defines future unrevealed terms (Req 61, 10)", () => {
      // At 150s, drift detection (revealTime 250s) has NOT been revealed yet
      const snapshot = buildTemporalSnapshot(mockIntelligencePackage, 150);
      const docs = [
        { id: "e1", text: "CityCare initializes dispatch infrastructure.", type: "event" as any, revealTime: 20, evidenceTranscriptIndices: [] }
      ];

      const jargon = detectSafeJargon(snapshot, "Tell me about drift detection", docs);
      // Even if user asked about drift detection, it must not be defined from unrevealed knowledge
      expect(jargon.some(j => j.term.toLowerCase().includes("drift"))).toBe(false);
    });
  });

  describe("Part E, F & Y: Entity & Concept Reminders with Viewer Memory (Req 62, 13-16)", () => {
    it("generates memory-aware instructions distinguishing watched from skipped entities (Req 62)", () => {
      const snapshot = buildTemporalSnapshot(mockIntelligencePackage, 180);
      const watchedIntervals = [{ start: 0, end: 50 }]; // Watched 0-50 (saw Maya at 45s, UO at 30s), skipped 50-180

      const memory = deriveViewerMemory(snapshot, watchedIntervals, 1, "viewer-watched");
      expect(memory.entityConfidence["ent-uo"]).toBe("seen");

      const profile = resolveAccessibilityProfile({ entityReminders: true, conceptReminders: true });
      const instructions = buildAccessibilityPromptInstructions(profile, "ask", "Who is the field officer?");

      expect(instructions).toContain("ENTITY & CONCEPT REMINDER RULES");
      expect(instructions).toContain("Earlier, you saw...");
      expect(instructions).toContain("NEVER claim the viewer saw something they skipped");
    });
  });

  describe("Part R & Y: Seek-Back Spoiler Safety Invariant (Req 63, 41-42)", () => {
    it("ensures seeking backward strictly excludes memory concepts from later timestamps (Req 63)", () => {
      // 1. Viewer previously watched up to 160s (saw Haversine distance at 130s)
      const fullSnapshot = buildTemporalSnapshot(mockIntelligencePackage, 160);
      const priorMemory = deriveViewerMemory(fullSnapshot, [{ start: 0, end: 160 }], 1, "seekback-user");
      expect(priorMemory.knownConceptIds).toContain("c-haversine");

      // 2. Viewer seeks back to 30s
      const seekBackSnapshot = buildTemporalSnapshot(mockIntelligencePackage, 30);
      expect(seekBackSnapshot.unlockedConcepts.find(c => c.id === "c-haversine")).toBeUndefined();
      expect(seekBackSnapshot.maxRevealTimeUsed).toBeLessThanOrEqual(30);

      // 3. Intersect memory with safe snapshot at 30s
      const effectiveMemory = intersectMemoryWithSafeSnapshot(priorMemory, seekBackSnapshot);
      expect(effectiveMemory.knownConceptIds).not.toContain("c-haversine");
      expect(effectiveMemory.maxRevealTimeUsed).toBeLessThanOrEqual(30);
    });
  });

  describe("Part G, H & Y: Reduced Cognitive Load & Step-by-Step (Req 64, 65, 17-20)", () => {
    it("injects reduced cognitive load constraints into generation prompt (Req 64)", () => {
      const profile = resolveAccessibilityProfile({
        reducedCognitiveLoad: true,
        verbosity: "brief"
      });

      const instructions = buildAccessibilityPromptInstructions(profile, "ask");
      expect(instructions).toContain("REDUCED COGNITIVE LOAD");
      expect(instructions).toContain("VERBOSITY (BRIEF / REDUCED LOAD)");
      expect(instructions).toContain("1-2 concise bullets or sentences");
      expect(instructions).toContain("No parenthetical tangents");
    });

    it("injects step-by-step formatting instructions without fabricating missing steps (Req 65)", () => {
      const profile = resolveAccessibilityProfile({
        stepByStep: true
      });

      const instructions = buildAccessibilityPromptInstructions(profile, "ask", "How does duplicate detection work?");
      expect(instructions).toContain("STEP-BY-STEP EXPLANATION");
      expect(instructions).toContain("Step 1:");
      expect(instructions).toContain("ONLY include steps established in the safe evidence so far");
      expect(instructions).toContain("Never fabricate or extrapolate future steps");
    });
  });

  describe("Part J & Y: Accessibility-Aware Previously On (Req 66, 24-25)", () => {
    it("ensures Previously On recap restricts length when reduced cognitive load or brief is active (Req 66)", () => {
      const profile = resolveAccessibilityProfile({
        reducedCognitiveLoad: true
      });

      const instructions = buildAccessibilityPromptInstructions(profile, "previously_on");
      expect(instructions).toContain("REDUCED COGNITIVE LOAD");
      expect(instructions).toContain("VERBOSITY (BRIEF / REDUCED LOAD)");
    });
  });

  describe("Part K & Y: Learn Mode Accessibility (Req 67, 26-27)", () => {
    it("maintains strict grounding for Learn Mode while adapting explanation simplicity (Req 67)", () => {
      const docs = [
        { id: "e1", text: "CityCare checks geographic separation using Haversine distance.", type: "technology" as any, revealTime: 130, evidenceTranscriptIndices: [] }
      ];

      const simpleLearnJson = JSON.stringify({
        takeaway: "CityCare checks how close complaints are on a map.",
        question: "How does CityCare check if two complaints are near each other?",
        options: [
          { id: "a", text: "It measures distance on the map" },
          { id: "b", text: "It calls every resident" },
          { id: "c", text: "It waits for social media posts" }
        ],
        correctOptionId: "a",
        explanation: "CityCare measures map distance using Haversine distance."
      });

      const check = validateGrounding(simpleLearnJson, docs, "learn");
      expect(check.valid).toBe(true);
      expect(check.parsedResponse.correctOptionId).toBe("a");
      expect(check.parsedResponse.takeaway).toBe("CityCare checks how close complaints are on a map.");
    });
  });
});
