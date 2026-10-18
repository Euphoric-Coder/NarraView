import { ContentCategory } from '../types/content';

export const mockCategories: ContentCategory[] = [
  {
    id: 'explore',
    title: 'Explore with NarraView',
    items: [
      {
        id: 'origins',
        contentId: 'origins',
        title: 'Origins',
        description:
          'The search for the beginning of time reveals unexpected patterns in the cosmic microwave background.',
        genre: 'Documentary',
        runtime: '45m',
        year: 2024,
        posterColor: '#3A2A1A',
        aiReady: false,
        mediaPlayable: false,
      },
      {
        id: 'deep-blue',
        contentId: 'deep-blue',
        title: 'Deep Blue',
        description:
          'Dive into the deepest trenches of the ocean and discover the alien lifeforms that thrive in the dark.',
        genre: 'Nature',
        runtime: '30m',
        year: 2026,
        posterColor: '#1A3A3A',
        aiReady: false,
        mediaPlayable: false,
      },
      {
        id: 'last-archive',
        contentId: 'last-archive',
        title: 'The Last Archive',
        description:
          "In a post-digital world, one person protects the last physical server containing humanity's history.",
        genre: 'Sci-Fi',
        runtime: '22m',
        year: 2027,
        posterColor: '#3A1A1A',
        aiReady: false,
        mediaPlayable: false,
      },
    ],
  },
  {
    id: 'documentaries',
    title: 'Documentaries',
    items: [
      {
        id: 'inside-cosmos',
        contentId: 'inside-cosmos',
        title: 'Inside the Cosmos',
        description:
          'A visual journey through nebulas, black holes, and the fundamental structures of the universe.',
        genre: 'Science',
        runtime: '50m',
        year: 2023,
        posterColor: '#2A2A2A',
        aiReady: false,
        mediaPlayable: false,
      },
      {
        id: 'planet-beneath',
        contentId: 'planet-beneath',
        title: 'Planet Beneath',
        description:
          'Uncovering the vast underground ecosystems that support life on the surface.',
        genre: 'Nature',
        runtime: '40m',
        year: 2025,
        posterColor: '#1A3A2A',
        aiReady: false,
        mediaPlayable: false,
      },
      {
        id: 'human-code',
        contentId: 'human-code',
        title: 'Human Code',
        description:
          'How DNA mapping is rewriting our understanding of human evolution and migration.',
        genre: 'Science',
        runtime: '45m',
        year: 2026,
        posterColor: '#3A1A2A',
        aiReady: false,
        mediaPlayable: false,
      },
    ],
  },
];
