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
  posterColor: string;
  posterUrl?: string;
  videoSource?: string;
  durationSeconds?: number;
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
