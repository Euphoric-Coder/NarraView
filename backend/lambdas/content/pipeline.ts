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

export function normalizeTranscribeLanguageCode(lang?: string | null): string {
  if (!lang) return "en-US";
  const cleaned = lang.trim();
  const lower = cleaned.toLowerCase();
  const map: Record<string, string> = {
    'en': 'en-US',
    'en-us': 'en-US',
    'en-gb': 'en-GB',
    'es': 'es-US',
    'es-es': 'es-ES',
    'es-us': 'es-US',
    'fr': 'fr-FR',
    'fr-ca': 'fr-CA',
    'fr-fr': 'fr-FR',
    'de': 'de-DE',
    'it': 'it-IT',
    'pt': 'pt-BR',
    'pt-br': 'pt-BR',
    'ja': 'ja-JP',
    'ko': 'ko-KR',
    'zh': 'zh-CN',
    'hi': 'hi-IN',
  };
  return map[lower] || cleaned;
}

export function generateUniqueTranscriptionJobName(contentId: string, timestamp: number = Date.now()): string {
  const safeContentId = contentId.replace(/[^0-9a-zA-Z._-]/g, '-');
  return `narraview-${safeContentId}-${timestamp}`;
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
