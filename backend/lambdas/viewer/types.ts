export interface WatchedInterval {
  start: number;
  end: number;
}

export interface ViewerProgress {
  viewerId: string;
  contentId: string;
  positionSeconds: number;
  durationSeconds: number;
  progressPercent: number;
  watchedIntervals: WatchedInterval[];
  lastWatchedAt: string;
  startedAt: string;
  completedAt?: string;
  isCompleted: boolean;
  lastSessionId?: string;
  updatedAt: string;
  version: number;
}

export interface PlaybackSessionResponse {
  sessionId: string;
  contentId: string;
  resumePositionSeconds: number;
  previousProgress?: ViewerProgress;
  isCompleted: boolean;
  createdAt: string;
}

export interface ProgressUpdateRequest {
  sessionId?: string;
  positionSeconds: number;
  durationSeconds?: number;
  watchedInterval?: WatchedInterval;
  watchedIntervals?: WatchedInterval[];
  isEnded?: boolean;
  clientUpdatedAt?: string;
}

export interface ContinueWatchingItem {
  id: string;
  contentId: string;
  title: string;
  description?: string;
  posterUrl?: string;
  runtime?: string;
  genre?: string;
  contentType?: string;
  positionSeconds: number;
  durationSeconds: number;
  progressPercent: number;
  lastWatchedAt: string;
  isCompleted: boolean;
  mediaPlayable: boolean;
  catalogVisible: boolean;
  aiReady: boolean;
  runtimeProvider?: string;
  videoSource?: string;
}

export interface ViewerHistoryItem extends ContinueWatchingItem {
  startedAt: string;
  completedAt?: string;
  watchedIntervals: WatchedInterval[];
}
