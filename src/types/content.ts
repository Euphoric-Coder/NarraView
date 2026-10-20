export type ReturnType = "NEW_VIEWER" | "SAME_SESSION_RETURN" | "SHORT_RETURN" | "LONG_RETURN" | "REWATCH";

export interface WatchedInterval {
  start: number;
  end: number;
}

export interface ViewerReturnContext {
  viewerId: string;
  contentId: string;
  resumePositionSeconds: number;
  lastWatchedAt?: string;
  timeAwaySeconds: number;
  watchedIntervals: WatchedInterval[];
  watchedSeconds: number;
  progressPercent: number;
  returnType: ReturnType;
  previousSessionId?: string;
  currentSessionId?: string;
  shouldOfferRecap: boolean;
}

export interface ContentScene {
  startTime: number;
  endTime: number;
  label: string;
}

export type RuntimeProvider = 'handcrafted' | 'intelligence';

export interface ContentItem {
  id: string;
  contentId: string;
  title: string;
  description: string;
  genre: string;
  contentType?: string;
  runtime: string;
  year: number;
  progress?: number;
  positionSeconds?: number;
  durationSeconds?: number;
  progressPercent?: number;
  lastWatchedAt?: string;
  isCompleted?: boolean;
  watchedIntervals?: Array<{ start: number; end: number }>;
  returnType?: ReturnType;
  timeAwaySeconds?: number;
  shouldOfferRecap?: boolean;
  returnContext?: ViewerReturnContext;
  posterColor: string;
  posterUrl?: string;
  videoSource?: string;
  scenes?: ContentScene[];
  aiReady?: boolean;
  runtimeProvider?: RuntimeProvider;
  mediaPlayable?: boolean;
  catalogVisible?: boolean;
}

export interface ContentCategory {
  id: string;
  title: string;
  items: ContentItem[];
}
