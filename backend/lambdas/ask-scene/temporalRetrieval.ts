import { TemporalChunk, RetrievedChunk, RetrievalResult } from "./types";
import { ALL_CHUNKS } from "./temporalChunks";

const RECENCY_SCALE = 60; // seconds
const IMPORTANCE_WEIGHTS = { high: 0.25, medium: 0.15, low: 0.05 };
const CURRENT_SCENE_BOOST = 0.3;
const TOP_K = 5;
const MAX_RETRIEVED_CONTEXT_CHARS = 3500;

function normalizeText(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(t => t.length > 2);
}

function calculateLexicalOverlap(queryTokens: string[], chunkTokens: string[]): number {
  if (queryTokens.length === 0 || chunkTokens.length === 0) return 0;
  const intersection = queryTokens.filter(t => chunkTokens.includes(t));
  return intersection.length / queryTokens.length;
}

function scoreChunk(
  chunk: TemporalChunk,
  timestamp: number,
  queryTokens: string[],
  currentSceneId?: string
): number {
  let score = 0;

  // 1. Lexical Overlap
  const chunkTokens = normalizeText(chunk.text);
  const lexicalScore = calculateLexicalOverlap(queryTokens, chunkTokens);
  score += lexicalScore * 0.5;

  // 2. Recency Weighting
  const ageSeconds = Math.max(0, timestamp - chunk.revealTime);
  const recencyScore = 1 / (1 + ageSeconds / RECENCY_SCALE);
  score += recencyScore * 0.2;

  // 3. Importance Weighting
  const importanceScore = chunk.importance ? IMPORTANCE_WEIGHTS[chunk.importance] : 0;
  score += importanceScore;

  // 4. Current Scene Boost
  if (currentSceneId && chunk.sceneId === currentSceneId) {
    score += CURRENT_SCENE_BOOST;
  }

  // 5. Keyword Boost
  if (chunk.keywords) {
    const keywordOverlap = calculateLexicalOverlap(queryTokens, chunk.keywords);
    score += keywordOverlap * 0.3;
  }

  return score;
}

function deduplicateChunks(chunks: RetrievedChunk[]): RetrievedChunk[] {
  const seenTexts = new Set<string>();
  const uniqueChunks: RetrievedChunk[] = [];

  for (const chunk of chunks) {
    const norm = chunk.text.trim().toLowerCase();
    if (!seenTexts.has(norm)) {
      seenTexts.add(norm);
      uniqueChunks.push(chunk);
    }
  }

  return uniqueChunks;
}

function compactRetrievedContext(chunks: RetrievedChunk[]): string {
  let compactedText = "";
  let currentLength = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunkText = `${i + 1}. ${chunks[i].text}\n`;
    if (currentLength + chunkText.length > MAX_RETRIEVED_CONTEXT_CHARS) {
      break;
    }
    compactedText += chunkText;
    currentLength += chunkText.length;
  }

  return compactedText.trim();
}

export function retrieveTemporalContext(
  contentId: string,
  timestamp: number,
  question: string,
  currentSceneId?: string
): RetrievalResult {
  const startTime = Date.now();
  
  // Hard Temporal Filter
  const eligibleChunks = ALL_CHUNKS.filter(c => c.contentId === contentId && c.revealTime <= timestamp);
  const futureExcludedCount = ALL_CHUNKS.length - eligibleChunks.length;

  const queryTokens = normalizeText(question);

  // Score all eligible chunks
  const scoredChunks: RetrievedChunk[] = eligibleChunks.map(chunk => ({
    ...chunk,
    score: scoreChunk(chunk, timestamp, queryTokens, currentSceneId)
  }));

  // Sort by score descending
  scoredChunks.sort((a, b) => b.score - a.score);

  // Current Scene Guarantee
  let currentSceneSummary = scoredChunks.find(c => c.sceneId === currentSceneId && c.type === "scene_summary");
  
  // Take Top K
  let topChunks = scoredChunks.slice(0, TOP_K);

  // Deduplicate
  let deduplicatedChunks = deduplicateChunks(topChunks);

  // Ensure current scene summary is in the final list if it was eligible
  if (currentSceneSummary && !deduplicatedChunks.some(c => c.id === currentSceneSummary!.id)) {
      if (deduplicatedChunks.length >= TOP_K) {
          deduplicatedChunks[deduplicatedChunks.length - 1] = currentSceneSummary;
      } else {
          deduplicatedChunks.push(currentSceneSummary);
      }
      deduplicatedChunks.sort((a, b) => b.score - a.score);
  }

  const compactedText = compactRetrievedContext(deduplicatedChunks);
  const retrievalLatencyMs = Date.now() - startTime;

  return {
    timestamp,
    query: question,
    eligibleChunkCount: eligibleChunks.length,
    futureExcludedCount,
    retrievedChunks: deduplicatedChunks,
    compactedText,
    retrievalLatencyMs
  };
}
