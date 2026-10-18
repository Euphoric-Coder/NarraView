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
