export const typography = {
  hero: {
    fontSize: 96,
    fontWeight: '800' as const,
    lineHeight: 110,
    letterSpacing: -1,
  },
  display: {
    fontSize: 72,
    fontWeight: '700' as const,
    lineHeight: 84,
    letterSpacing: 0,
  },
  tagline: {
    fontSize: 32,
    lineHeight: 44,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
  },
  body: {
    fontSize: 24,
    lineHeight: 32,
    letterSpacing: 0.5,
  },
  metadata: {
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
  }
} as const;
