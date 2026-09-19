import { buildContextSnapshot } from './engine';

describe('Scene Context Engine', () => {
  const contentId = 'signal-lost';

  it('handles negative timestamp by clamping to 0', () => {
    const snap = buildContextSnapshot(contentId, -5);
    expect(snap?.timestamp).toBe(0);
    expect(snap?.currentScene?.id).toBe('signal-lost-intro');
  });

  it('handles timestamp beyond duration by clamping to duration', () => {
    const snap = buildContextSnapshot(contentId, 25);
    expect(snap?.timestamp).toBe(24);
    expect(snap?.currentScene?.id).toBe('scene-station-seven');
  });

  it('handles unknown content safely', () => {
    const snap = buildContextSnapshot('unknown', 10);
    expect(snap).toBeNull();
  });

  describe('Temporal Boundaries & Spoilers', () => {
    it('timestamp 0', () => {
      const snap = buildContextSnapshot(contentId, 0);
      expect(snap?.currentScene?.id).toBe('signal-lost-intro');
      expect(snap?.previousScenes.length).toBe(0);
      expect(snap?.knownCharacters.length).toBe(0); // Maya introduced at 6
      expect(snap?.knownEvents.some(e => e.id === 'evt-transmission')).toBe(true);
      expect(JSON.stringify(snap)).not.toContain('Maya');
      expect(JSON.stringify(snap)).not.toContain('Alex');
      expect(JSON.stringify(snap)).not.toContain('Station Seven');
    });

    it('timestamp 2 (during intro)', () => {
      const snap = buildContextSnapshot(contentId, 2);
      expect(snap?.currentScene?.id).toBe('signal-lost-intro');
      expect(JSON.stringify(snap)).toContain('Orbital Research Station Eos');
      expect(JSON.stringify(snap)).not.toContain('Maya');
      expect(JSON.stringify(snap)).not.toContain('Alex');
      expect(JSON.stringify(snap)).not.toContain('Station Seven');
    });

    it('timestamp 5.999 (just before scene 1)', () => {
      const snap = buildContextSnapshot(contentId, 5.999);
      expect(snap?.currentScene?.id).toBe('signal-lost-intro');
      expect(JSON.stringify(snap)).not.toContain('Maya');
    });

    it('timestamp 6 (start of scene 1)', () => {
      const snap = buildContextSnapshot(contentId, 6);
      expect(snap?.currentScene?.id).toBe('scene-warning');
      expect(snap?.previousScenes.length).toBe(1); // intro ended
      expect(JSON.stringify(snap)).toContain('Maya');
      expect(JSON.stringify(snap)).not.toContain('Alex');
    });

    it('timestamp 8 (during scene 1)', () => {
      const snap = buildContextSnapshot(contentId, 8);
      expect(snap?.currentScene?.id).toBe('scene-warning');
      expect(JSON.stringify(snap)).toContain('Maya');
      expect(JSON.stringify(snap)).not.toContain('Alex');
      expect(JSON.stringify(snap)).not.toContain('telemetry');
      expect(JSON.stringify(snap)).not.toContain('Station Seven');
    });

    it('timestamp 11.999', () => {
      const snap = buildContextSnapshot(contentId, 11.999);
      expect(snap?.currentScene?.id).toBe('scene-warning');
      expect(JSON.stringify(snap)).not.toContain('Alex');
    });

    it('timestamp 12 (start of scene 2)', () => {
      const snap = buildContextSnapshot(contentId, 12);
      expect(snap?.currentScene?.id).toBe('scene-telemetry');
      expect(JSON.stringify(snap)).toContain('Alex');
      expect(JSON.stringify(snap)).toContain('telemetry');
      expect(JSON.stringify(snap)).not.toContain('Station Seven');
    });

    it('timestamp 14 (during scene 2)', () => {
      const snap = buildContextSnapshot(contentId, 14);
      expect(snap?.currentScene?.id).toBe('scene-telemetry');
      expect(snap?.knownCharacters.some(c => c.name === 'Alex')).toBe(true);
      expect(snap?.knownEntities.some(e => e.name === 'telemetry records')).toBe(true);
      expect(JSON.stringify(snap)).not.toContain('Station Seven');
    });

    it('timestamp 17.999', () => {
      const snap = buildContextSnapshot(contentId, 17.999);
      expect(JSON.stringify(snap)).not.toContain('Station Seven');
    });

    it('timestamp 18 (start of scene 3)', () => {
      const snap = buildContextSnapshot(contentId, 18);
      expect(snap?.currentScene?.id).toBe('scene-station-seven');
      expect(JSON.stringify(snap)).toContain('Station Seven');
      // team prepares to investigate is at 18.5, shouldn't be here yet
      expect(snap?.knownEvents.some(e => e.id === 'evt-prepare')).toBe(false);
    });

    it('timestamp 21 (during scene 3)', () => {
      const snap = buildContextSnapshot(contentId, 21);
      expect(snap?.currentScene?.id).toBe('scene-station-seven');
      expect(snap?.previousScenes.length).toBe(3); // capped at 3
      expect(JSON.stringify(snap)).toContain('Station Seven');
      expect(snap?.knownEvents.some(e => e.id === 'evt-prepare')).toBe(true);
    });

    it('timestamp 24 (end)', () => {
      const snap = buildContextSnapshot(contentId, 24);
      expect(snap?.currentScene?.id).toBe('scene-station-seven'); // bound exact end to last scene
    });
  });
});
