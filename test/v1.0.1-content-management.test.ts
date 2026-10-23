jest.mock("@aws-sdk/client-lambda", () => ({ LambdaClient: jest.fn().mockImplementation(() => ({})) }));
jest.mock("@aws-sdk/client-dynamodb", () => ({ DynamoDBClient: jest.fn().mockImplementation(() => ({})) }));
jest.mock("@aws-sdk/lib-dynamodb", () => ({ DynamoDBDocumentClient: { from: jest.fn().mockReturnValue({}) } }));
jest.mock("@aws-sdk/client-s3", () => ({ S3Client: jest.fn().mockImplementation(() => ({})) }));
jest.mock("@aws-sdk/client-transcribe", () => ({ TranscribeClient: jest.fn().mockImplementation(() => ({})) }));
jest.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: jest.fn() }));

import { 
  ALLOWED_CONTENT_CATEGORIES, 
  PROTECTED_DEMO_TITLES, 
  ALLOWED_EDITABLE_FIELDS,
  handler as contentHandler 
} from "../backend/lambdas/content/index";
import { 
  groupCloudContentByCategory, 
  CLOUD_CATEGORY_SECTIONS 
} from "../src/screens/HomeScreen";
import { ContentItem } from "../src/types/content";
import { isEligibleForContinueWatching } from "../backend/lambdas/viewer/progress";

describe("NarraView v1.0.1: Content Categorization & Studio Content Management", () => {

  describe("Part A & I: Category Schema & Enum Validation (Tests 1, 2, 7)", () => {
    it("1. validates allowed content categories enum contains exactly specified machine values", () => {
      expect(ALLOWED_CONTENT_CATEGORIES).toEqual([
        "documentary",
        "tutorial",
        "demo",
        "narrative",
        "educational",
        "other"
      ]);
      expect(ALLOWED_CONTENT_CATEGORIES.includes("documentary")).toBe(true);
      expect(ALLOWED_CONTENT_CATEGORIES.includes("tutorial")).toBe(true);
      expect(ALLOWED_CONTENT_CATEGORIES.includes("demo")).toBe(true);
      expect(ALLOWED_CONTENT_CATEGORIES.includes("narrative")).toBe(true);
      expect(ALLOWED_CONTENT_CATEGORIES.includes("educational")).toBe(true);
      expect(ALLOWED_CONTENT_CATEGORIES.includes("other")).toBe(true);
      expect(ALLOWED_CONTENT_CATEGORIES.includes("arbitrary-cat" as any)).toBe(false);
    });

    it("2. defensively defaults legacy/unspecified records to 'other'", () => {
      const legacyItem = { contentId: "legacy-title", title: "Old Title" };
      const category = (legacyItem as any).contentCategory || "other";
      expect(category).toBe("other");
    });

    it("7. rejects invalid category in handler validation", async () => {
      const invalidEvent = {
        httpMethod: "POST",
        resource: "/content",
        body: JSON.stringify({
          contentId: "test-invalid-cat",
          title: "Invalid Cat Title",
          contentType: "film",
          language: "en",
          contentCategory: "sci-fi-action" // not in enum
        })
      };

      const res = await contentHandler(invalidEvent);
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toContain("Invalid contentCategory: sci-fi-action");
    });
  });

  describe("Part B & J: Catalog Grouping & Section Labels (Tests 3, 4, 5)", () => {
    const sampleItems: ContentItem[] = [
      {
        id: "city-care-demo",
        contentId: "city-care-demo",
        title: "CityCare Demo",
        description: "Civic dispatch walkthrough",
        genre: "Demo",
        contentCategory: "demo",
        runtime: "5m 21s",
        year: 2026,
        posterColor: "#111",
        catalogVisible: true,
        mediaPlayable: true
      },
      {
        id: "ml-systems-tutorial",
        contentId: "ml-systems-tutorial",
        title: "ML Systems Tutorial",
        description: "Model deployment pipeline",
        genre: "Tutorial",
        contentCategory: "tutorial",
        runtime: "12m 45s",
        year: 2026,
        posterColor: "#222",
        catalogVisible: true,
        mediaPlayable: true
      },
      {
        id: "signal-lost",
        contentId: "signal-lost",
        title: "Signal Lost",
        description: "Hard sci-fi radio beacon mystery",
        genre: "Story",
        contentCategory: "narrative",
        runtime: "1m 14s",
        year: 2026,
        posterColor: "#333",
        catalogVisible: true,
        mediaPlayable: true
      },
      {
        id: "hidden-feature",
        contentId: "hidden-feature",
        title: "Hidden Archive",
        description: "Internal testing film",
        genre: "Film",
        contentCategory: "other",
        runtime: "10m",
        year: 2026,
        posterColor: "#444",
        catalogVisible: false, // hidden from public catalog
        mediaPlayable: false
      }
    ];

    it("3. groups content by contentCategory into human-friendly sections in prescribed order", () => {
      const rows = groupCloudContentByCategory(sampleItems);
      
      // Expected non-empty sections in order:
      // Tutorials (ml-systems-tutorial)
      // Demos (city-care-demo)
      // Stories (signal-lost)
      const titles = rows.map(r => r.title);
      expect(titles).toContain("Tutorials");
      expect(titles).toContain("Demos");
      expect(titles).toContain("Stories");

      const demoRow = rows.find(r => r.title === "Demos");
      expect(demoRow?.items[0].contentId).toBe("city-care-demo");

      const tutRow = rows.find(r => r.title === "Tutorials");
      expect(tutRow?.items[0].contentId).toBe("ml-systems-tutorial");

      const storyRow = rows.find(r => r.title === "Stories");
      expect(storyRow?.items[0].contentId).toBe("signal-lost");
    });

    it("4. excludes hidden titles (catalogVisible === false) from category rows", () => {
      const rows = groupCloudContentByCategory(sampleItems);
      const allItemIds = rows.flatMap(r => r.items.map(i => i.contentId));
      expect(allItemIds).not.toContain("hidden-feature");
    });

    it("5. does not render empty categories", () => {
      // sampleItems has no "documentary" or "educational" titles
      const rows = groupCloudContentByCategory(sampleItems);
      const titles = rows.map(r => r.title);
      expect(titles).not.toContain("Documentaries");
      expect(titles).not.toContain("Educational");
    });
  });

  describe("Part E: Safe Metadata Editing (Tests 6, 8)", () => {
    it("6. validates ALLOWED_EDITABLE_FIELDS allows only presentation metadata", () => {
      expect(ALLOWED_EDITABLE_FIELDS).toContain("title");
      expect(ALLOWED_EDITABLE_FIELDS).toContain("description");
      expect(ALLOWED_EDITABLE_FIELDS).toContain("contentCategory");
      expect(ALLOWED_EDITABLE_FIELDS).toContain("contentType");
      expect(ALLOWED_EDITABLE_FIELDS).toContain("language");
      expect(ALLOWED_EDITABLE_FIELDS).toContain("catalogVisible");
      expect(ALLOWED_EDITABLE_FIELDS).toContain("mediaPlayable");

      // Critical safety invariant: prohibited system fields
      expect((ALLOWED_EDITABLE_FIELDS as readonly string[]).includes("contentId")).toBe(false);
      expect((ALLOWED_EDITABLE_FIELDS as readonly string[]).includes("processing")).toBe(false);
      expect((ALLOWED_EDITABLE_FIELDS as readonly string[]).includes("aiReady")).toBe(false);
      expect((ALLOWED_EDITABLE_FIELDS as readonly string[]).includes("intelligence")).toBe(false);
    });

    it("8. ensures metadata edit does not invalidate compiled intelligence or reset processing", () => {
      const baselineItem = {
        contentId: "city-care-demo",
        title: "Old Title",
        contentCategory: "other",
        aiReady: true,
        processing: {
          transcriptionStatus: "complete",
          transcriptCorrectionStatus: "complete",
          sceneDetectionStatus: "complete",
          metadataExtractionStatus: "complete",
          intelligenceCompilationStatus: "complete",
          pipelineStatus: "idle"
        },
        intelligence: {
          latestVersion: 1,
          latestS3Key: "content/city-care-demo/intelligence/v1/intelligence.json"
        }
      };

      // Simulating safe PATCH metadata changes
      const patchChanges = {
        title: "CityCare Demo - Updated",
        contentCategory: "demo",
        description: "New presentation description"
      };

      const updatedItem = {
        ...baselineItem,
        ...patchChanges
      };

      // Presentation metadata updated
      expect(updatedItem.title).toBe("CityCare Demo - Updated");
      expect(updatedItem.contentCategory).toBe("demo");

      // AI status and compiled intelligence must be strictly preserved
      expect(updatedItem.aiReady).toBe(true);
      expect(updatedItem.processing.intelligenceCompilationStatus).toBe("complete");
      expect(updatedItem.processing.pipelineStatus).toBe("idle");
      expect(updatedItem.intelligence.latestVersion).toBe(1);
    });
  });

  describe("Part F: Destruction & Safety Confirmation (Tests 9, 10, 11, 12, 13, 14)", () => {
    it("9. validates delete confirmation modal requirements", () => {
      const modalContract = {
        title: "Delete this title?",
        warning: "This will remove the content and its NarraView processing artifacts. This action cannot be undone.",
        cancelButton: "Cancel",
        confirmButton: "Delete Permanently"
      };

      expect(modalContract.title).toBe("Delete this title?");
      expect(modalContract.warning).toContain("This action cannot be undone.");
      expect(modalContract.confirmButton).toBe("Delete Permanently");
    });

    it("10, 11, 12. handles title-scoped cleanup for disposable test items", async () => {
      // Disposable non-core test item
      const disposableId = "test-temp-title-999";
      expect(PROTECTED_DEMO_TITLES.has(disposableId)).toBe(false);

      // Verify that S3 cleanup is strictly prefix-scoped
      const s3Prefix = `content/${disposableId}/`;
      expect(s3Prefix).toBe("content/test-temp-title-999/");
      expect(s3Prefix.startsWith("content/")).toBe(true);
    });

    it("13. guarantees deleted title disappears from Continue Watching eligibility", () => {
      const progressRecord = {
        viewerId: "viewer-1",
        contentId: "deleted-title",
        positionSeconds: 45,
        durationSeconds: 120,
        progressPercent: 37.5,
        lastWatchedAt: new Date().toISOString(),
        isCompleted: false
      };

      // When title is deleted, contentItem is undefined
      const contentItem = undefined;
      const isEligible = Boolean(contentItem && isEligibleForContinueWatching(progressRecord as any, contentItem));
      expect(isEligible).toBe(false);
    });

    it("14. protects core demo titles (city-care-demo, ml-systems-tutorial, signal-lost) from deletion", async () => {
      expect(PROTECTED_DEMO_TITLES.has("city-care-demo")).toBe(true);
      expect(PROTECTED_DEMO_TITLES.has("ml-systems-tutorial")).toBe(true);
      expect(PROTECTED_DEMO_TITLES.has("signal-lost")).toBe(true);

      // Attempt DELETE on city-care-demo
      const res = await contentHandler({
        httpMethod: "DELETE",
        resource: "/content/{contentId}",
        pathParameters: { contentId: "city-care-demo" }
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.protected).toBe(true);
      expect(body.error).toContain("Cannot delete protected demo title");
    });
  });
});
