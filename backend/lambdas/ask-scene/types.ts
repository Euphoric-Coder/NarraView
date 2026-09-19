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
