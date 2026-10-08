export interface ContentScene {
  startTime: number;
  endTime: number;
  label: string;
}

export interface ContentItem {
  id: string;
  title: string;
  description: string;
  genre: string;
  runtime: string;
  year: number;
  progress?: number;
  posterColor: string;
  posterUrl?: string;
  videoSource?: string;
  durationSeconds?: number;
  scenes?: ContentScene[];
  aiReady?: boolean;
  mediaPlayable?: boolean;
}

export interface ContentCategory {
  id: string;
  title: string;
  items: ContentItem[];
}
