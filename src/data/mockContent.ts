import { ContentCategory } from '../types/content';

export const mockCategories: ContentCategory[] = [
  {
    id: 'continue-watching',
    title: 'Continue Watching',
    items: [
      {
        id: 'signal-lost',
        contentId: 'signal-lost',
        videoSource:
          'https://narraview-media-sagnik.s3.eu-north-1.amazonaws.com/videos/signal_lost_demo.mp4',
        durationSeconds: 24,
        title: 'Signal Lost',
        description:
          'A research team investigates unexplained communications failures at an orbital station.',
        genre: 'Sci-Fi',
        contentType: 'film',
        runtime: '00:24',
        year: 2026,
        progress: 0.42,
        aiReady: true,
        runtimeProvider: 'handcrafted',
        mediaPlayable: true,
        scenes: [
          {
            startTime: 0,
            endTime: 6,
            label: 'SIGNAL LOST - Orbital Research Station Eos',
          },
          {startTime: 6, endTime: 12, label: 'SCENE 01 — The Warning'},
          {startTime: 12, endTime: 18, label: 'SCENE 02 — Telemetry Failure'},
          {startTime: 18, endTime: 24, label: 'SCENE 03 — Station Seven'},
        ],
        posterColor: '#1A2A3A',
      },
      {
        id: 'beyond-horizon',
        contentId: 'beyond-horizon',
        title: 'Beyond the Horizon',
        description:
          'An exploration vessel reaches the edge of the mapped galaxy, only to find something staring back.',
        genre: 'Adventure',
        runtime: '12m',
        year: 2025,
        progress: 0.75,
        posterColor: '#2A1A3A',
        aiReady: false,
        mediaPlayable: false,
      },
    ],
  },
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
