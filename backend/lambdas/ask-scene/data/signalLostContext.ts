import { ContentContext } from '../types';

export const signalLostContext: ContentContext = {
  contentId: 'signal-lost',
  title: 'Signal Lost',
  duration: 24,
  description: 'A research team investigates unexplained communications failures at an orbital station.',
  scenes: [
    {
      id: 'signal-lost-intro',
      startTime: 0,
      endTime: 6,
      label: 'SIGNAL LOST - Orbital Research Station Eos',
      summary: 'An unexplained transmission interrupts communications at Orbital Research Station Eos.',
      location: 'Orbital Research Station Eos',
      events: [
        {
          id: 'evt-transmission',
          timestamp: 0,
          description: 'unexplained transmission interrupts communications'
        }
      ]
    },
    {
      id: 'scene-warning',
      startTime: 6,
      endTime: 12,
      label: 'SCENE 01 — The Warning',
      summary: 'Dr. Maya Chen receives a corrupted emergency signal from an inactive relay.',
      characters: [
        { id: 'char-maya', name: 'Dr. Maya Chen', firstKnownAt: 6 }
      ],
      entities: [
        { id: 'ent-relay', name: 'inactive relay', type: 'object', firstKnownAt: 6 },
        { id: 'ent-signal', name: 'corrupted emergency signal', type: 'phenomenon', firstKnownAt: 6 }
      ],
      events: [
        {
          id: 'evt-maya-signal',
          timestamp: 6,
          description: 'Maya receives corrupted emergency signal'
        }
      ]
    },
    {
      id: 'scene-telemetry',
      startTime: 12,
      endTime: 18,
      label: 'SCENE 02 — Telemetry Failure',
      summary: 'Alex discovers that several telemetry records were altered shortly before the blackout.',
      characters: [
        { id: 'char-alex', name: 'Alex', firstKnownAt: 12 }
      ],
      entities: [
        { id: 'ent-telemetry', name: 'telemetry records', type: 'data', firstKnownAt: 12 },
        { id: 'ent-blackout', name: 'blackout', type: 'event', firstKnownAt: 12 }
      ],
      events: [
        {
          id: 'evt-altered-records',
          timestamp: 12,
          description: 'altered telemetry records discovered'
        }
      ]
    },
    {
      id: 'scene-station-seven',
      startTime: 18,
      endTime: 24,
      label: 'SCENE 03 — Station Seven',
      summary: 'The team traces the anomaly to Station Seven and prepares to investigate.',
      entities: [
        { id: 'ent-station-seven', name: 'Station Seven', type: 'location', firstKnownAt: 18 },
        { id: 'ent-anomaly', name: 'anomaly', type: 'phenomenon', firstKnownAt: 18 }
      ],
      events: [
        {
          id: 'evt-trace-anomaly',
          timestamp: 18,
          description: 'anomaly traced to Station Seven'
        },
        {
          id: 'evt-prepare',
          timestamp: 18.5,
          description: 'team prepares to investigate'
        }
      ]
    }
  ]
};
