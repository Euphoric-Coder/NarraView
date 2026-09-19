import { 
  ContentContext, 
  SceneContext, 
  ContextSnapshot, 
  CharacterContext, 
  EntityContext, 
  ConceptContext, 
  TimelineEvent 
} from './types';
import { signalLostContext } from './data/signalLostContext';

// Simple content repository mock
export function getContentContext(contentId: string): ContentContext | null {
  if (contentId === 'signal-lost') {
    return signalLostContext;
  }
  return null;
}

export function buildContextSnapshot(contentId: string, timestamp: number, maxPreviousScenes: number = 3): ContextSnapshot | null {
  const content = getContentContext(contentId);
  if (!content) return null;

  // Handle boundary conditions
  let effectiveTimestamp = timestamp;
  if (effectiveTimestamp < 0) effectiveTimestamp = 0;
  if (effectiveTimestamp > content.duration) effectiveTimestamp = content.duration;

  // 1. Resolve current scene
  let currentScene: SceneContext | null = null;
  for (const scene of content.scenes) {
    // A scene is active if startTime <= timestamp < endTime
    // Exception: If this is the last scene, we might include the exact endTime boundary
    const isLastScene = scene === content.scenes[content.scenes.length - 1];
    
    if (effectiveTimestamp >= scene.startTime && effectiveTimestamp < scene.endTime) {
      currentScene = scene;
      break;
    }
    if (isLastScene && effectiveTimestamp === scene.endTime) {
      currentScene = scene;
      break;
    }
  }

  // 2. Collect previous scenes
  const allPreviousScenes = content.scenes.filter(scene => scene.endTime <= effectiveTimestamp);
  
  // Apply relevance heuristic: take the most recent MAX_PREVIOUS_SCENES
  const relevantPreviousScenes = allPreviousScenes
    .slice(Math.max(0, allPreviousScenes.length - maxPreviousScenes))
    .map(s => ({
      id: s.id,
      label: s.label,
      summary: s.summary
    }));

  // 3. Filter known characters, entities, concepts, and events based STRICTLY on timestamp
  const knownCharactersMap = new Map<string, CharacterContext>();
  const knownEntitiesMap = new Map<string, EntityContext>();
  const knownConceptsMap = new Map<string, ConceptContext>();
  const knownEventsMap = new Map<string, TimelineEvent>();

  for (const scene of content.scenes) {
    // If the scene hasn't even started, nothing inside is known
    if (scene.startTime > effectiveTimestamp) continue;

    if (scene.characters) {
      for (const char of scene.characters) {
        if (char.firstKnownAt <= effectiveTimestamp) {
          knownCharactersMap.set(char.id, char);
        }
      }
    }

    if (scene.entities) {
      for (const ent of scene.entities) {
        if (ent.firstKnownAt <= effectiveTimestamp) {
          knownEntitiesMap.set(ent.id, ent);
        }
      }
    }

    if (scene.concepts) {
      for (const con of scene.concepts) {
        if (con.firstKnownAt <= effectiveTimestamp) {
          knownConceptsMap.set(con.id, con);
        }
      }
    }

    if (scene.events) {
      for (const evt of scene.events) {
        if (evt.timestamp <= effectiveTimestamp) {
          knownEventsMap.set(evt.id, evt);
        }
      }
    }
  }

  return {
    contentId: content.contentId,
    title: content.title,
    timestamp: effectiveTimestamp,
    currentScene,
    previousScenes: relevantPreviousScenes,
    knownCharacters: Array.from(knownCharactersMap.values()),
    knownEntities: Array.from(knownEntitiesMap.values()),
    knownConcepts: Array.from(knownConceptsMap.values()),
    knownEvents: Array.from(knownEventsMap.values())
  };
}
