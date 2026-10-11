import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import OpenAI from "openai";
import { getTokenProvider } from '@aws/bedrock-token-generator';
import {
  canonicalizeEntities,
  canonicalizePeople,
  filterAndCanonicalizeConcepts,
  classifyAndValidateEventsAndFacts,
  validateAndDeduplicateRelationships,
  generateDeterministicId
} from './hardening';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const s3Client = new S3Client({});

const TABLE_NAME = process.env.TABLE_NAME || '';
const BUCKET_NAME = process.env.BUCKET_NAME || '';
const BEDROCK_MANTLE_BASE_URL = process.env.BEDROCK_MANTLE_BASE_URL || 'https://bedrock-mantle.eu-north-1.api.aws/v1';
const BEDROCK_MANTLE_MODEL = process.env.BEDROCK_MANTLE_MODEL || 'openai.gpt-oss-120b';

let provideToken: any = null;

function stripMarkdownFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractBalancedJsonObject(text: string, startIndex: number): string | null {
  if (text[startIndex] !== "{") return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIndex; i < text.length; i++) {
    const ch = text[i];
    if (escaped) { escaped = false; continue; }
    if (inString && ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(startIndex, i + 1);
      if (depth < 0) return null;
    }
  }
  return null;
}

function parseKnowledgeJson(rawText: string) {
  const cleaned = stripMarkdownFences(rawText);
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {}

  for (let i = 0; i < cleaned.length; i++) {
    if (cleaned[i] !== "{") continue;
    const candidate = extractBalancedJsonObject(cleaned, i);
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (e) {}
  }

  throw new Error("No valid JSON object found in Bedrock response");
}

export const handler = async (event: any, context: any) => {
  const { contentId } = event;
  const requestId = context?.awsRequestId || 'local-request';
  const startTimeMs = Date.now();
  let currentStage = 'UNKNOWN';

  console.log(JSON.stringify({
    event: "KNOWLEDGE_JOB_START",
    contentId,
    requestId
  }));

  try {
    currentStage = 'STATUS_UPDATE';
    const check = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { contentId } }));
    const item = check.Item;
    if (!item) throw new Error("Content not found in DynamoDB");

    await updateStatus(item, 'processing');

    currentStage = 'TRANSCRIPT_FETCH';
    const correctedKey = `content/${contentId}/transcripts/corrected/transcript.json`;
    const normalizedKey = `content/${contentId}/transcripts/normalized/transcript.json`;
    let transcriptKey = normalizedKey;
    let transcriptStr = '';
    try {
      const getRes = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: correctedKey }));
      transcriptStr = await getRes.Body?.transformToString() || '';
      transcriptKey = correctedKey;
    } catch {
      try {
        const getRes = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: normalizedKey }));
        transcriptStr = await getRes.Body?.transformToString() || '';
        transcriptKey = normalizedKey;
      } catch (err: any) {
        throw new Error(`Transcript not found at ${normalizedKey}`);
      }
    }
    const transcript = JSON.parse(transcriptStr);
    const transcriptSegments = transcript.segments || [];

    currentStage = 'SEGMENTS_FETCH';
    const segmentsKey = `content/${contentId}/segments/segments.json`;
    let segmentsStr = '';
    try {
      const getRes = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: segmentsKey }));
      segmentsStr = await getRes.Body?.transformToString() || '';
    } catch (err: any) {
      throw new Error(`Temporal segments not found at ${segmentsKey}`);
    }
    const segmentsData = JSON.parse(segmentsStr);
    const temporalSegments = segmentsData.segments || [];

    console.log(JSON.stringify({
      event: "SEGMENT_FETCH_START",
      contentId,
      segmentCount: temporalSegments.length
    }));

    if (!provideToken) { provideToken = getTokenProvider(); }
    const token = await provideToken();
    const openai = new OpenAI({
      apiKey: token,
      baseURL: BEDROCK_MANTLE_BASE_URL,
      defaultQuery: { project: 'default' }
    });

    const systemPrompt = `You are an expert AI knowledge extractor for NarraView.
Extract high-signal, structured metadata, facts, events, and relationships from the provided transcript segment.

STRICT QUALITY RULES:
1. GROUNDING: ONLY use information explicitly present in the provided transcript segment. DO NOT infer unstated details or use outside world knowledge.
2. EVIDENCE: You MUST extract the exact transcript indices where evidence is found into 'evidenceTranscriptIndices'.
3. ENTITIES: Retain entities ONLY when they represent meaningful products, systems, organizations, roles, user interfaces, services, or major features.
   - DO NOT convert generic nouns, form inputs, or metrics (e.g. "issue trends", "duplicates", "officer workload", "performance metrics") into entities.
4. CONCEPTS: Retain high-signal domain concepts (e.g. civic issue reporting, rate limiting, duplicate detection, SLA tracking, audit trail).
   - DO NOT convert generic form field names or UI labels (e.g. "title", "description", "category", "subcategories", "priority", "location", "status", "name") into standalone concepts.
   - DO NOT extract full sentences or clauses as concepts.
5. EVENTS VS FACTS:
   - EVENT: An occurrence where something happens, changes state, or progresses through a workflow (e.g. "Citizen submits report", "Unit officer assigns issue to field officer", "Resolution is rejected for rework").
   - FACT: A statement about system properties, statistics, metrics, constraints, or rules (e.g. "CityCare reduces redundant reports by 40-60%", "Each citizen can submit up to 15 reports per day", "The web platform uses React Native").
   - DO NOT classify statistics or static descriptions as events.
6. RELATIONSHIPS:
   - Must connect real canonical entities, people, or concepts identified in this segment.
   - Both 'sourceName' and 'targetName' must match extracted entity, person, or concept names.
   - DO NOT invent dangling phrases or long sentences as source or target names.
7. BUDGET & RESTRAINT:
   - Quality is far more important than quantity. Prefer fewer, high-quality items over low-value noun phrases.
   - If there are no relevant items for an array, leave it empty [].
   - Target budgets per segment: people (0-3), entities (0-5), concepts (0-6), events (0-4), facts (1-6), relationships (0-5).

OUTPUT FORMAT:
{
  "summary": "1-3 sentences summarizing the segment grounded in the transcript.",
  "people": [
    { "name": "...", "role": "...", "description": "...", "evidenceTranscriptIndices": [1, 2] }
  ],
  "entities": [
    { "name": "...", "entityType": "system|organization|product|feature|interface|service|other", "description": "...", "evidenceTranscriptIndices": [4] }
  ],
  "locations": [
    { "name": "...", "description": "...", "evidenceTranscriptIndices": [10] }
  ],
  "concepts": [
    { "name": "...", "description": "...", "evidenceTranscriptIndices": [3, 4] }
  ],
  "events": [
    { "description": "...", "importance": "high|medium|low", "evidenceTranscriptIndices": [7, 8] }
  ],
  "facts": [
    { "statement": "...", "evidenceTranscriptIndices": [5] }
  ],
  "relationships": [
    { "sourceName": "...", "targetName": "...", "relationshipType": "...", "description": "...", "evidenceTranscriptIndices": [7] }
  ]
}`;

    const rawSegmentExtractions: any[] = [];
    const allRawEntities: any[] = [];
    const allRawPeople: any[] = [];
    const allRawConcepts: any[] = [];
    const allRawLocations: any[] = [];
    const allRawEvents: any[] = [];
    const allRawFacts: any[] = [];
    const allRawRelationships: any[] = [];

    // 1. EXTRACT PER-SEGMENT KNOWLEDGE
    for (const segment of temporalSegments) {
      currentStage = `SEGMENT_EXTRACTION_${segment.segmentId}`;
      console.log(JSON.stringify({
        event: "SEGMENT_EXTRACTION_START",
        segmentId: segment.segmentId
      }));

      const startIdx = segment.transcriptStartIndex;
      const endIdx = segment.transcriptEndIndex;
      
      const segmentTranscript = transcriptSegments.slice(startIdx, endIdx + 1).map((seg: any, relativeIdx: number) => {
        const absoluteIdx = startIdx + relativeIdx;
        const text = seg.correctedText || seg.originalText || seg.text || '';
        return `[${absoluteIdx}] ${text}`;
      }).join('\n');

      console.log(JSON.stringify({
        event: "BEDROCK_REQUEST_START",
        segmentId: segment.segmentId,
        transcriptRows: endIdx - startIdx + 1
      }));

      const response = await openai.chat.completions.create({
        model: BEDROCK_MANTLE_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Content Type: ${item.contentType || 'tutorial/demo'}\nSegment Title: ${segment.title}\n\nTranscript:\n${segmentTranscript}` }
        ],
        temperature: 0.1,
        max_tokens: 4000,
        response_format: { type: "json_object" }
      });

      console.log(JSON.stringify({
        event: "BEDROCK_REQUEST_SUCCESS",
        segmentId: segment.segmentId
      }));

      currentStage = `VALIDATION_START_${segment.segmentId}`;
      const rawOutput = response.choices?.[0]?.message?.content || "";
      let parsed;
      try {
        parsed = parseKnowledgeJson(rawOutput);
      } catch (err: any) {
        throw new Error(`Failed to parse LLM JSON for segment ${segment.segmentId}: ${err.message}`);
      }

      const validateEvidence = (indices: any[]) => {
        if (!Array.isArray(indices)) return [];
        return indices.filter(i => typeof i === 'number' && i >= startIdx && i <= endIdx);
      };

      const segEntities = (parsed.entities || []).map((e: any) => ({
        ...e,
        evidenceTranscriptIndices: validateEvidence(e.evidenceTranscriptIndices)
      })).filter((e: any) => e.evidenceTranscriptIndices.length > 0 && e.name);

      const segPeople = (parsed.people || []).map((p: any) => ({
        ...p,
        evidenceTranscriptIndices: validateEvidence(p.evidenceTranscriptIndices)
      })).filter((p: any) => p.evidenceTranscriptIndices.length > 0 && p.name);

      const segConcepts = (parsed.concepts || []).map((c: any) => ({
        ...c,
        evidenceTranscriptIndices: validateEvidence(c.evidenceTranscriptIndices)
      })).filter((c: any) => c.evidenceTranscriptIndices.length > 0 && c.name);

      const segLocations = (parsed.locations || []).map((l: any) => ({
        ...l,
        evidenceTranscriptIndices: validateEvidence(l.evidenceTranscriptIndices)
      })).filter((l: any) => l.evidenceTranscriptIndices.length > 0 && l.name);

      const segEvents = (parsed.events || []).map((ev: any) => ({
        ...ev,
        evidenceTranscriptIndices: validateEvidence(ev.evidenceTranscriptIndices)
      })).filter((ev: any) => ev.evidenceTranscriptIndices.length > 0 && ev.description);

      const segFacts = (parsed.facts || []).map((f: any) => ({
        ...f,
        evidenceTranscriptIndices: validateEvidence(f.evidenceTranscriptIndices)
      })).filter((f: any) => f.evidenceTranscriptIndices.length > 0 && f.statement);

      const segRels = (parsed.relationships || []).map((r: any) => ({
        ...r,
        evidenceTranscriptIndices: validateEvidence(r.evidenceTranscriptIndices)
      })).filter((r: any) => r.evidenceTranscriptIndices.length > 0 && r.relationshipType);

      allRawEntities.push(...segEntities);
      allRawPeople.push(...segPeople);
      allRawConcepts.push(...segConcepts);
      allRawLocations.push(...segLocations);
      allRawEvents.push(...segEvents);
      allRawFacts.push(...segFacts);
      allRawRelationships.push(...segRels);

      rawSegmentExtractions.push({
        segment,
        summary: parsed.summary || ""
      });

      console.log(JSON.stringify({
        event: "VALIDATION_SUCCESS",
        segmentId: segment.segmentId
      }));
    }

    // ========================================================================
    // POST-EXTRACTION QUALITY HARDENING & CANONICALIZATION PASS
    // ========================================================================
    const rawCounts = {
      entities: allRawEntities.length,
      people: allRawPeople.length,
      concepts: allRawConcepts.length,
      events: allRawEvents.length,
      facts: allRawFacts.length,
      relationships: allRawRelationships.length
    };

    console.log(JSON.stringify({
      event: "CANONICALIZATION_START",
      contentId,
      rawCounts
    }));

    // Step A: Canonicalize Entities & Roles
    const aliasOverrides = item.aliasOverrides || {};
    const canonicalEntities = canonicalizeEntities(allRawEntities, transcriptSegments, aliasOverrides);
    const canonicalPeople = canonicalizePeople(allRawPeople, transcriptSegments);

    console.log(JSON.stringify({
      event: "CANONICALIZATION_COMPLETE",
      contentId,
      canonicalEntityCount: canonicalEntities.length,
      canonicalPeopleCount: canonicalPeople.length
    }));

    // Step B: Significance Filtering (Concepts)
    console.log(JSON.stringify({
      event: "SIGNIFICANCE_FILTER_START",
      contentId
    }));

    const canonicalConcepts = filterAndCanonicalizeConcepts(allRawConcepts, transcriptSegments);

    // Step C: Event vs Fact Validation & Reclassification
    const {
      events: canonicalEvents,
      facts: initialFacts,
      reclassifiedCount
    } = classifyAndValidateEventsAndFacts(allRawEvents, allRawFacts, transcriptSegments);

    console.log(JSON.stringify({
      event: "SIGNIFICANCE_FILTER_COMPLETE",
      contentId,
      reclassifiedEventsToFacts: reclassifiedCount,
      canonicalConceptsCount: canonicalConcepts.length
    }));

    // Step D: Relationship Referential Integrity & Pruning
    console.log(JSON.stringify({
      event: "RELATIONSHIP_VALIDATION_START",
      contentId
    }));

    const canonicalNodes: any[] = [
      ...canonicalEntities.map(e => ({ id: e.id, name: e.name, type: 'entity', aliases: e.aliases })),
      ...canonicalPeople.map(p => ({ id: p.id, name: p.name, type: 'person', aliases: p.aliases })),
      ...canonicalConcepts.map(c => ({ id: c.id, name: c.name, type: 'concept', aliases: c.aliases })),
      ...allRawLocations.map(l => ({ id: generateDeterministicId('location', l.name), name: l.name, type: 'location' }))
    ];

    const {
      relationships: canonicalRelationships,
      convertedFacts: relConvertedFacts,
      rejectedDanglingCount
    } = validateAndDeduplicateRelationships(allRawRelationships, canonicalNodes, transcriptSegments);

    const finalFacts = [...initialFacts, ...relConvertedFacts].sort((a, b) => a.revealTime - b.revealTime);

    console.log(JSON.stringify({
      event: "RELATIONSHIP_VALIDATION_COMPLETE",
      contentId,
      canonicalRelationshipCount: canonicalRelationships.length,
      rejectedDanglingCount
    }));

    // Structured logging: Quality Summary
    const qualitySummary = {
      event: "KNOWLEDGE_QUALITY_SUMMARY",
      contentId,
      entities: { raw: rawCounts.entities, canonical: canonicalEntities.length },
      concepts: { raw: rawCounts.concepts, canonical: canonicalConcepts.length },
      people: { raw: rawCounts.people, canonical: canonicalPeople.length },
      relationships: { raw: rawCounts.relationships, canonical: canonicalRelationships.length, rejectedDangling: rejectedDanglingCount },
      events: { raw: rawCounts.events, canonical: canonicalEvents.length, reclassifiedToFacts: reclassifiedCount },
      facts: { raw: rawCounts.facts, canonical: finalFacts.length }
    };
    console.log(JSON.stringify(qualitySummary));

    // ========================================================================
    // PERSISTENCE (S3 & DynamoDB)
    // ========================================================================
    currentStage = 'S3_WRITE_START';

    const segmentKnowledgeList: any[] = [];
    for (const extraction of rawSegmentExtractions) {
      const seg = extraction.segment;
      const sStart = seg.transcriptStartIndex;
      const sEnd = seg.transcriptEndIndex;

      const filterBySegmentEvidence = (items: any[]) => {
        return items.filter(item => 
          Array.isArray(item.evidenceTranscriptIndices) &&
          item.evidenceTranscriptIndices.some((idx: number) => idx >= sStart && idx <= sEnd)
        );
      };

      const segData = {
        segmentId: seg.segmentId,
        startTime: seg.startTime,
        endTime: seg.endTime,
        title: seg.title,
        summary: extraction.summary,
        people: filterBySegmentEvidence(canonicalPeople),
        entities: filterBySegmentEvidence(canonicalEntities),
        locations: filterBySegmentEvidence(allRawLocations),
        concepts: filterBySegmentEvidence(canonicalConcepts),
        events: filterBySegmentEvidence(canonicalEvents),
        facts: filterBySegmentEvidence(finalFacts),
        relationships: filterBySegmentEvidence(canonicalRelationships),
        metadata: {
          provider: BEDROCK_MANTLE_MODEL,
          extractedAt: new Date().toISOString()
        }
      };

      segmentKnowledgeList.push(segData);

      const segKey = `content/${contentId}/knowledge/segments/${seg.segmentId}.json`;
      await s3Client.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: segKey,
        Body: JSON.stringify(segData, null, 2),
        ContentType: "application/json"
      }));
    }

    const aggregateKnowledge = {
      contentId,
      segmentKnowledge: segmentKnowledgeList,
      people: canonicalPeople,
      entities: canonicalEntities,
      locations: allRawLocations,
      concepts: canonicalConcepts,
      events: canonicalEvents,
      facts: finalFacts,
      relationships: canonicalRelationships,
      metadata: {
        sourceTranscriptKey: transcriptKey,
        sourceSegmentsKey: segmentsKey,
        model: BEDROCK_MANTLE_MODEL,
        generatedAt: new Date().toISOString(),
        qualitySummary
      }
    };

    const globalKey = `content/${contentId}/knowledge/knowledge.json`;
    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: globalKey,
      Body: JSON.stringify(aggregateKnowledge, null, 2),
      ContentType: "application/json"
    }));

    currentStage = 'STATUS_UPDATE';
    const updated = {
      ...item,
      processing: {
        ...item.processing,
        metadataExtractionStatus: 'complete'
      },
      knowledge: {
        status: 'complete',
        knowledgeS3Key: globalKey,
        segmentKnowledgePrefix: `content/${contentId}/knowledge/segments/`,
        peopleCount: canonicalPeople.length,
        entityCount: canonicalEntities.length,
        conceptCount: canonicalConcepts.length,
        eventCount: canonicalEvents.length,
        factCount: finalFacts.length,
        relationshipCount: canonicalRelationships.length,
        startedAt: new Date(startTimeMs).toISOString(),
        completedAt: new Date().toISOString(),
        qualityMetrics: qualitySummary
      },
      updatedAt: new Date().toISOString()
    };
    await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: updated }));

    console.log(JSON.stringify({
      event: "KNOWLEDGE_JOB_COMPLETE",
      contentId,
      durationMs: Date.now() - startTimeMs
    }));

  } catch (err: any) {
    console.log(JSON.stringify({
      event: "KNOWLEDGE_JOB_FAILED",
      contentId,
      stage: currentStage,
      errorName: err.name,
      errorMessage: err.message,
      stack: err.stack
    }));

    try {
      const check = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { contentId } }));
      if (check.Item) {
        const updated = {
          ...check.Item,
          processing: {
            ...check.Item.processing,
            metadataExtractionStatus: 'failed'
          },
          knowledge: {
            ...check.Item.knowledge,
            status: 'failed',
            error: err.message,
            completedAt: new Date().toISOString(),
          },
          updatedAt: new Date().toISOString()
        };
        await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: updated }));
      }
    } catch (e) {
      console.error("Failed to update status to failed in DynamoDB", e);
    }
  }
};

async function updateStatus(item: any, status: string) {
  const updated = {
    ...item,
    processing: {
      ...item.processing,
      metadataExtractionStatus: status
    },
    updatedAt: new Date().toISOString()
  };
  await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: updated }));
}
