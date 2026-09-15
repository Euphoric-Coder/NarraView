import { ContentScene } from '../types/content';

export function getCurrentScene(
  scenes: ContentScene[] | undefined,
  currentTime: number
): ContentScene | undefined {
  if (!scenes || scenes.length === 0) {
    return undefined;
  }

  // Find the scene where currentTime falls within [startTime, endTime)
  let foundScene = scenes.find(
    (scene) => currentTime >= scene.startTime && currentTime < scene.endTime
  );

  // Boundary condition: if currentTime is exactly or slightly past the last scene's endTime,
  // we can resolve to the last scene (helpful for exact boundaries like 24.03s vs 24.00s)
  if (!foundScene && currentTime > 0) {
    const lastScene = scenes[scenes.length - 1];
    if (currentTime >= lastScene.endTime) {
      foundScene = lastScene;
    }
  }

  return foundScene;
}
