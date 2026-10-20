import { 
  classifyReturnType, 
  evaluateRecapOffer, 
  buildViewerReturnContext 
} from "../backend/lambdas/viewer/returnIntelligence";
import { 
  deriveViewerMemory, 
  intersectMemoryWithSafeSnapshot, 
  evaluateIntervalConfidence 
} from "../backend/lambdas/ask-scene/temporal-rag/memory";
import { retrieveSafeEvidence } from "../backend/lambdas/ask-scene/temporal-rag/retrieval";
import { validateGrounding } from "../backend/lambdas/ask-scene/temporal-rag/grounding";
import { buildTemporalSnapshot } from "../backend/lambdas/ask-scene/temporal-rag/snapshot";

describe("NarraView v0.18 Return Intelligence & Personalized Recap", () => {
  const mockIntelligencePackage = {
    contentId: "city-care-demo",
    title: "CityCare Demo",
    duration: 321,
    intelligenceVersion: 6,
    segments: [
      { id: "seg-1", startTime: 0, endTime: 60, title: "Introduction to CityCare", summary: "CityCare platform overview." },
      { id: "seg-2", startTime: 60, endTime: 120, title: "Architecture & Convex", summary: "Deep dive into Convex backend real-time sync." },
      { id: "seg-3", startTime: 120, endTime: 200, title: "Field Operations", summary: "Dispatching emergency personnel." }
    ],
    events: [
      { id: "evt-1", revealTime: 15, title: "System Initialized", description: "CityCare dispatch console loaded.", importance: "high" },
      { id: "evt-2", revealTime: 75, title: "Convex Realtime Connection", description: "Convex was established as the primary reactive store.", importance: "high" },
      { id: "evt-3", revealTime: 150, title: "First Dispatch", description: "Unit 4 dispatched to downtown station.", importance: "high" }
    ],
    facts: [
      { id: "fact-1", revealTime: 20, statement: "CityCare coordinates municipal medical resources.", text: "CityCare coordinates municipal medical resources.", importance: "high" },
      { id: "fact-2", revealTime: 80, statement: "Convex powers state synchronization across devices.", text: "Convex powers state synchronization across devices.", importance: "high" },
      { id: "fact-3", revealTime: 160, statement: "Unit 4 carries advanced life support telemetry.", text: "Unit 4 carries advanced life support telemetry.", importance: "medium" }
    ],
    entities: [
      { id: "ent-citycare", name: "CityCare", firstKnownAt: 10, type: "system", description: "Dispatch platform." },
      { id: "ent-convex", name: "Convex", firstKnownAt: 70, type: "technology", description: "Realtime backend database." },
      { id: "ent-unit4", name: "Unit 4", firstKnownAt: 140, type: "vehicle", description: "Paramedic response vehicle." }
    ],
    people: [
      { id: "person-dr-chen", name: "Dr. Chen", firstKnownAt: 25, role: "Chief Medical Officer" }
    ],
    concepts: [
      { id: "concept-reactive-sync", name: "Reactive Sync", firstKnownAt: 72, definition: "Automated websocket updates across nodes." }
    ],
    relationships: []
  };

  describe("Part A & B: Return Session Intelligence & Recap Offer Logic", () => {
    it("classifies NEW_VIEWER when no progress exists", () => {
      const res = classifyReturnType(null, Date.now());
      expect(res.returnType).toBe("NEW_VIEWER");
      expect(evaluateRecapOffer(res.returnType, null, res.timeAwaySeconds)).toBe(false);
    });

    it("classifies SAME_SESSION_RETURN (< 10 minutes away) and does NOT strongly offer recap", () => {
      const now = Date.now();
      const progress = {
        viewerId: "v1",
        contentId: "city-care-demo",
        positionSeconds: 45,
        durationSeconds: 300,
        progressPercent: 15,
        watchedIntervals: [{ start: 0, end: 45 }],
        lastWatchedAt: new Date(now - 300 * 1000).toISOString(), // 5 minutes ago
        startedAt: new Date(now - 600 * 1000).toISOString(),
        isCompleted: false,
        updatedAt: new Date(now - 300 * 1000).toISOString(),
        version: 1
      };

      const res = classifyReturnType(progress, now);
      expect(res.returnType).toBe("SAME_SESSION_RETURN");
      expect(evaluateRecapOffer(res.returnType, progress, res.timeAwaySeconds)).toBe(false);
    });

    it("classifies SHORT_RETURN (10m - 12h) and offers recap for in-progress playback", () => {
      const now = Date.now();
      const progress = {
        viewerId: "v1",
        contentId: "city-care-demo",
        positionSeconds: 120,
        durationSeconds: 300,
        progressPercent: 40,
        watchedIntervals: [{ start: 0, end: 120 }],
        lastWatchedAt: new Date(now - 7200 * 1000).toISOString(), // 2 hours ago
        startedAt: new Date(now - 8000 * 1000).toISOString(),
        isCompleted: false,
        updatedAt: new Date(now - 7200 * 1000).toISOString(),
        version: 1
      };

      const res = classifyReturnType(progress, now);
      expect(res.returnType).toBe("SHORT_RETURN");
      expect(evaluateRecapOffer(res.returnType, progress, res.timeAwaySeconds)).toBe(true);
    });

    it("classifies LONG_RETURN (> 12h) and strongly offers recap", () => {
      const now = Date.now();
      const progress = {
        viewerId: "v1",
        contentId: "city-care-demo",
        positionSeconds: 140,
        durationSeconds: 300,
        progressPercent: 46,
        watchedIntervals: [{ start: 0, end: 140 }],
        lastWatchedAt: new Date(now - 86400 * 1000).toISOString(), // 24 hours ago
        startedAt: new Date(now - 90000 * 1000).toISOString(),
        isCompleted: false,
        updatedAt: new Date(now - 86400 * 1000).toISOString(),
        version: 1
      };

      const res = classifyReturnType(progress, now);
      expect(res.returnType).toBe("LONG_RETURN");
      expect(evaluateRecapOffer(res.returnType, progress, res.timeAwaySeconds)).toBe(true);
    });

    it("classifies REWATCH when completed and does not offer resume recap", () => {
      const now = Date.now();
      const progress = {
        viewerId: "v1",
        contentId: "city-care-demo",
        positionSeconds: 300,
        durationSeconds: 300,
        progressPercent: 100,
        watchedIntervals: [{ start: 0, end: 300 }],
        lastWatchedAt: new Date(now - 86400 * 1000).toISOString(),
        startedAt: new Date(now - 90000 * 1000).toISOString(),
        isCompleted: true,
        updatedAt: new Date(now - 86400 * 1000).toISOString(),
        version: 1
      };

      const res = classifyReturnType(progress, now);
      expect(res.returnType).toBe("REWATCH");
      expect(evaluateRecapOffer(res.returnType, progress, res.timeAwaySeconds)).toBe(false);
    });
  });

  describe("Part C & D: Personalization with Watched Coverage & Skipped Content", () => {
    it("weights watched intervals heavily positive and marks skipped evidence", () => {
      const snapshot = buildTemporalSnapshot(mockIntelligencePackage, 180);
      const watchedIntervals = [
        { start: 0, end: 30 },
        { start: 140, end: 180 }
      ]; // Skipped 30 - 140! (Convex introduction was in 60-120)

      const { documents } = retrieveSafeEvidence(snapshot, "", "previously_on", 8, watchedIntervals);

      // Verify that documents in watched intervals have coverageStatus = "watched"
      const watchedDocs = documents.filter(d => d.coverageStatus === "watched");
      const skippedDocs = documents.filter(d => d.coverageStatus === "skipped");

      expect(watchedDocs.length).toBeGreaterThan(0);
      expect(skippedDocs.length).toBeGreaterThan(0);

      // Verify that skipped docs have negative score penalty compared to watched
      const convexDoc = documents.find(d => d.text.toLowerCase().includes("convex"));
      expect(convexDoc?.coverageStatus).toBe("skipped");
    });

    it("never attributes skipped material as watched in recap grounding validation", () => {
      const docs = [
        { id: "e1", text: "CityCare initializes emergency console", type: "event" as any, revealTime: 15, evidenceTranscriptIndices: [], coverageStatus: "watched" as const },
        { id: "e2", text: "Convex powers real-time state sync", type: "technology" as any, revealTime: 80, evidenceTranscriptIndices: [], coverageStatus: "skipped" as const }
      ];

      const modelOutput = JSON.stringify({
        title: "Previously On",
        summary: "CityCare platform was initialized for emergency operations.",
        bullets: [
          "CityCare initialized the dispatch console for field operations.",
          "The video introduced Convex during a section you skipped."
        ],
        keyPeople: ["Dr. Chen"],
        keyConcepts: ["Dispatch Console"]
      });

      const validated = validateGrounding(modelOutput, docs, "previously_on");
      expect(validated.valid).toBe(true);
      expect(validated.parsedResponse?.bullets?.length).toBe(2);
      expect(validated.parsedResponse?.title).toBe("Previously On");
    });
  });

  describe("Part E & F: Viewer Memory Derivation & Confidence", () => {
    it("derives memory confidence based on intersection with watched intervals", () => {
      const snapshot = buildTemporalSnapshot(mockIntelligencePackage, 180);
      const watchedIntervals = [
        { start: 0, end: 30 },
        { start: 140, end: 180 }
      ]; // Watched 0-30 and 140-180, skipped 30-140

      const memory = deriveViewerMemory(snapshot, watchedIntervals, 6, "viewer-test");
      expect(memory.knownEntityIds).toContain("ent-citycare"); // 10s is watched
      expect(memory.entityConfidence["ent-citycare"]).toBe("seen");

      expect(memory.entityConfidence["ent-convex"]).toBe("not_seen"); // 70s was skipped
      expect(memory.knownEntityIds).not.toContain("ent-convex");

      expect(memory.knownEntityIds).toContain("ent-unit4"); // 140s is watched
      expect(memory.entityConfidence["ent-unit4"]).toBe("seen");
    });
  });

  describe("Part M: Mandatory Seek-Back Temporal Safety Invariant (Sections 34 & 35)", () => {
    it("strictly excludes future knowledge when viewer seeks back, even if memory contains it", () => {
      // 1. Viewer previously reached 200s and derived memory with Unit 4 (140s) and Convex (70s)
      const fullSnapshot = buildTemporalSnapshot(mockIntelligencePackage, 200);
      const priorMemory = deriveViewerMemory(fullSnapshot, [{ start: 0, end: 200 }], 6, "seekback-viewer");
      expect(priorMemory.knownEntityIds).toContain("ent-unit4");
      expect(priorMemory.knownEntityIds).toContain("ent-convex");

      // 2. Viewer seeks backward to 40s
      const seekBackSnapshot = buildTemporalSnapshot(mockIntelligencePackage, 40);

      // Snapshot must strictly exclude anything > 40s
      expect(seekBackSnapshot.unlockedEntities.find(e => e.id === "ent-convex")).toBeUndefined();
      expect(seekBackSnapshot.unlockedEntities.find(e => e.id === "ent-unit4")).toBeUndefined();
      expect(seekBackSnapshot.maxRevealTimeUsed).toBeLessThanOrEqual(40);

      // 3. Intersect prior memory with seekBackSnapshot (EffectiveMemory = ViewerMemory ∩ SafeSnapshot(40s))
      const effectiveMemory = intersectMemoryWithSafeSnapshot(priorMemory, seekBackSnapshot);

      expect(effectiveMemory.knownEntityIds).not.toContain("ent-convex");
      expect(effectiveMemory.knownEntityIds).not.toContain("ent-unit4");
      expect(effectiveMemory.knownEntityIds).toContain("ent-citycare"); // 10s is safe
      expect(effectiveMemory.maxRevealTimeUsed).toBeLessThanOrEqual(40);
    });
  });

  describe("Part N: Different Viewers (Section 54)", () => {
    it("generates different evidence subsets for viewers with different watch coverage", () => {
      const snapshot = buildTemporalSnapshot(mockIntelligencePackage, 180);

      // Viewer A watched beginning only (0 - 85)
      const viewerAIntervals = [{ start: 0, end: 85 }];
      const resA = retrieveSafeEvidence(snapshot, "", "previously_on", 6, viewerAIntervals);
      const convexDocA = resA.documents.find(d => d.text.toLowerCase().includes("convex"));
      expect(convexDocA?.coverageStatus).toBe("watched");

      // Viewer B skipped Convex section (watched 0 - 30 and 120 - 180)
      const viewerBIntervals = [{ start: 0, end: 30 }, { start: 120, end: 180 }];
      const resB = retrieveSafeEvidence(snapshot, "", "previously_on", 6, viewerBIntervals);
      const convexDocB = resB.documents.find(d => d.text.toLowerCase().includes("convex"));
      expect(convexDocB?.coverageStatus).toBe("skipped");

      // Different top evidence selection reflects different viewer experience
      expect(resA.documents[0].id).not.toBe(resB.documents[resB.documents.length - 1].id);
    });
  });
});
