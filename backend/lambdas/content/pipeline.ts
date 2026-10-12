export type PipelineStage =
  | 'transcription'
  | 'transcript_correction'
  | 'scene_detection'
  | 'knowledge_extraction'
  | 'intelligence_compilation';

export const PIPELINE_STAGES: readonly PipelineStage[] = [
  'transcription',
  'transcript_correction',
  'scene_detection',
  'knowledge_extraction',
  'intelligence_compilation',
] as const;

export function getNextPipelineStage(stage: PipelineStage): PipelineStage | null {
  const idx = PIPELINE_STAGES.indexOf(stage);
  if (idx >= 0 && idx < PIPELINE_STAGES.length - 1) {
    return PIPELINE_STAGES[idx + 1];
  }
  return null;
}

export function getStatusKeyForStage(stage: PipelineStage): string {
  switch (stage) {
    case 'transcription':
      return 'transcriptionStatus';
    case 'transcript_correction':
      return 'transcriptCorrectionStatus';
    case 'scene_detection':
      return 'sceneDetectionStatus';
    case 'knowledge_extraction':
      return 'metadataExtractionStatus';
    case 'intelligence_compilation':
      return 'intelligenceCompilationStatus';
  }
}

export function computeInvalidatedProcessing(currentProcessing: any, rerunStage: PipelineStage): Record<string, any> {
  const updated = { ...(currentProcessing || {}) };
  const idx = PIPELINE_STAGES.indexOf(rerunStage);
  if (idx === -1) return updated;

  // Mark all downstream stages as 'stale' if they were complete or already stale
  for (let i = idx + 1; i < PIPELINE_STAGES.length; i++) {
    const stage = PIPELINE_STAGES[i];
    const statusKey = getStatusKeyForStage(stage);
    const currentStatus = updated[statusKey];
    if (currentStatus === 'complete' || currentStatus === 'stale') {
      updated[statusKey] = 'stale';
    }
  }
  return updated;
}
