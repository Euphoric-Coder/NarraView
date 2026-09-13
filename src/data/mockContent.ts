import { ContentCategory } from '../types/content';

export const mockCategories: ContentCategory[] = [
  {
    id: 'continue-watching',
    title: 'Continue Watching',
    items: [
      {
        id: 'signal-lost',
        title: 'Signal Lost',
        description: 'A research team investigates unexplained communications failures at an orbital station.',
        genre: 'Sci-Fi',
        runtime: '9 min',
        year: 2026,
        progress: 0.42,
        posterColor: '#1A2A3A'
      },
      {
        id: 'beyond-horizon',
        title: 'Beyond the Horizon',
        description: 'An exploration vessel reaches the edge of the mapped galaxy, only to find something staring back.',
        genre: 'Adventure',
        runtime: '12 min',
        year: 2025,
        progress: 0.75,
        posterColor: '#2A1A3A'
      }
    ]
  },
  {
    id: 'explore',
    title: 'Explore with NarraView',
    items: [
      {
        id: 'origins',
        title: 'Origins',
        description: 'The search for the beginning of time reveals unexpected patterns in the cosmic microwave background.',
        genre: 'Documentary',
        runtime: '45 min',
        year: 2024,
        posterColor: '#3A2A1A'
      },
      {
        id: 'deep-blue',
        title: 'Deep Blue',
        description: 'Dive into the deepest trenches of the ocean and discover the alien lifeforms that thrive in the dark.',
        genre: 'Nature',
        runtime: '30 min',
        year: 2026,
        posterColor: '#1A3A3A'
      },
      {
        id: 'last-archive',
        title: 'The Last Archive',
        description: 'In a post-digital world, one person protects the last physical server containing humanity\'s history.',
        genre: 'Sci-Fi',
        runtime: '22 min',
        year: 2027,
        posterColor: '#3A1A1A'
      }
    ]
  },
  {
    id: 'documentaries',
    title: 'Documentaries',
    items: [
      {
        id: 'inside-cosmos',
        title: 'Inside the Cosmos',
        description: 'A visual journey through nebulas, black holes, and the fundamental structures of the universe.',
        genre: 'Science',
        runtime: '50 min',
        year: 2023,
        posterColor: '#2A2A2A'
      },
      {
        id: 'planet-beneath',
        title: 'Planet Beneath',
        description: 'Uncovering the vast underground ecosystems that support life on the surface.',
        genre: 'Nature',
        runtime: '40 min',
        year: 2025,
        posterColor: '#1A3A2A'
      },
      {
        id: 'human-code',
        title: 'Human Code',
        description: 'How DNA mapping is rewriting our understanding of human evolution and migration.',
        genre: 'Science',
        runtime: '45 min',
        year: 2026,
        posterColor: '#3A1A2A'
      }
    ]
  }
];
