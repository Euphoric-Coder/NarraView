export interface ContentItem {
  id: string;
  title: string;
  description: string;
  genre: string;
  runtime: string;
  year: number;
  progress?: number;
  posterColor: string;
}

export interface ContentCategory {
  id: string;
  title: string;
  items: ContentItem[];
}
