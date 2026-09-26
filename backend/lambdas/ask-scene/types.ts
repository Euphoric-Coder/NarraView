export interface TimelineEvent {
  id: string;
  timestamp: number;
  description: string;
  importance?: "low" | "medium" | "high";
}

export interface CharacterContext {
  id: string;
  name: string;
  description?: string;
  firstKnownAt: number;
}

export interface EntityContext {
  id: string;
  name: string;
  type: string;
  description?: string;
  firstKnownAt: number;
}

export interface ConceptContext {
  id: string;
  name: string;
  description: string;
  firstKnownAt: number;
}

export interface SceneContext {
  id: string;
  startTime: number;
  endTime: number;
  label: string;
  summary: string;
  transcript?: string;
  characters?: CharacterContext[];
  entities?: EntityContext[];
  concepts?: ConceptContext[];
  events?: TimelineEvent[];
  location?: string;
  keywords?: string[];
}

export interface ContentContext {
  contentId: string;
  title: string;
  duration: number;
  description?: string;
  scenes: SceneContext[];
}

export interface ContextSnapshot {
  contentId: string;
  title: string;
  timestamp: number;

  currentScene: SceneContext | null;

  previousScenes: {
    id: string;
    label: string;
    summary: string;
  }[];

  knownCharacters: CharacterContext[];
  knownEntities: EntityContext[];
  knownConcepts: ConceptContext[];
  knownEvents: TimelineEvent[];
}

export interface TemporalChunk {
  id: string;
  contentId: string;
  sceneId?: string;
  startTime: number;
  endTime: number;
  revealTime: number;
  type: "scene_summary" | "event" | "transcript" | "character" | "entity" | "concept";
  text: string;
  keywords?: string[];
  importance?: "low" | "medium" | "high";
  characterIds?: string[];
  entityIds?: string[];
  source?: string;
}

export interface RetrievedChunk extends TemporalChunk {
  score: number;
}

export interface RetrievalResult {
  timestamp: number;
  query: string;
  eligibleChunkCount: number;
  futureExcludedCount: number;
  retrievedChunks: RetrievedChunk[];
  compactedText: string;
  retrievalLatencyMs: number;
}
