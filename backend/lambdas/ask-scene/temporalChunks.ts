import { TemporalChunk } from "./types";

export const ALL_CHUNKS: TemporalChunk[] = [
  // 0-6 seconds
  {
    id: "chunk_0_scene",
    contentId: "signal-lost",
    sceneId: "scene-01",
    startTime: 0,
    endTime: 6,
    revealTime: 0,
    type: "scene_summary",
    text: "An unexplained transmission interrupts communications at Orbital Research Station Eos.",
    keywords: ["transmission", "communications", "orbital", "research", "station", "eos"],
    importance: "high",
    entityIds: ["eos"]
  },
  {
    id: "chunk_0_event_1",
    contentId: "signal-lost",
    sceneId: "scene-01",
    startTime: 0,
    endTime: 6,
    revealTime: 0,
    type: "event",
    text: "An unexplained transmission interrupts communications.",
    keywords: ["transmission", "communications", "interrupts"],
    importance: "medium"
  },
  {
    id: "chunk_0_entity_1",
    contentId: "signal-lost",
    sceneId: "scene-01",
    startTime: 0,
    endTime: 6,
    revealTime: 0,
    type: "entity",
    text: "Orbital Research Station Eos is the primary location.",
    keywords: ["orbital", "research", "station", "eos"],
    importance: "low"
  },

  // 6-12 seconds
  {
    id: "chunk_6_scene",
    contentId: "signal-lost",
    sceneId: "scene-02",
    startTime: 6,
    endTime: 12,
    revealTime: 6,
    type: "scene_summary",
    text: "Dr. Maya Chen receives a corrupted emergency signal from an inactive relay.",
    keywords: ["maya", "chen", "corrupted", "emergency", "signal", "inactive", "relay"],
    importance: "high",
    characterIds: ["maya"],
    entityIds: ["relay", "signal"]
  },
  {
    id: "chunk_6_event_1",
    contentId: "signal-lost",
    sceneId: "scene-02",
    startTime: 6,
    endTime: 12,
    revealTime: 6,
    type: "event",
    text: "Maya receives a corrupted emergency signal.",
    keywords: ["maya", "receives", "corrupted", "emergency", "signal"],
    importance: "high"
  },
  {
    id: "chunk_6_char_1",
    contentId: "signal-lost",
    sceneId: "scene-02",
    startTime: 6,
    endTime: 12,
    revealTime: 6,
    type: "character",
    text: "Dr. Maya Chen is a researcher.",
    keywords: ["maya", "chen", "doctor", "researcher"],
    importance: "medium"
  },
  {
    id: "chunk_6_ent_1",
    contentId: "signal-lost",
    sceneId: "scene-02",
    startTime: 6,
    endTime: 12,
    revealTime: 6,
    type: "entity",
    text: "An inactive relay sent the signal.",
    keywords: ["inactive", "relay", "sent", "signal"],
    importance: "medium"
  },
  {
    id: "chunk_6_ent_2",
    contentId: "signal-lost",
    sceneId: "scene-02",
    startTime: 6,
    endTime: 12,
    revealTime: 6,
    type: "entity",
    text: "A corrupted emergency signal was received.",
    keywords: ["corrupted", "emergency", "signal"],
    importance: "low"
  },

  // 12-18 seconds
  {
    id: "chunk_12_scene",
    contentId: "signal-lost",
    sceneId: "scene-03",
    startTime: 12,
    endTime: 18,
    revealTime: 12,
    type: "scene_summary",
    text: "Alex discovers that several telemetry records were altered shortly before the blackout.",
    keywords: ["alex", "discovers", "telemetry", "records", "altered", "blackout"],
    importance: "high",
    characterIds: ["alex"],
    entityIds: ["telemetry", "blackout"]
  },
  {
    id: "chunk_12_event_1",
    contentId: "signal-lost",
    sceneId: "scene-03",
    startTime: 12,
    endTime: 18,
    revealTime: 12,
    type: "event",
    text: "Altered telemetry records are discovered.",
    keywords: ["altered", "telemetry", "records", "discovered"],
    importance: "high"
  },
  {
    id: "chunk_12_char_1",
    contentId: "signal-lost",
    sceneId: "scene-03",
    startTime: 12,
    endTime: 18,
    revealTime: 12,
    type: "character",
    text: "Alex is a team member.",
    keywords: ["alex", "team", "member"],
    importance: "medium"
  },
  {
    id: "chunk_12_ent_1",
    contentId: "signal-lost",
    sceneId: "scene-03",
    startTime: 12,
    endTime: 18,
    revealTime: 12,
    type: "entity",
    text: "Telemetry records were altered.",
    keywords: ["telemetry", "records", "altered"],
    importance: "high"
  },
  {
    id: "chunk_12_ent_2",
    contentId: "signal-lost",
    sceneId: "scene-03",
    startTime: 12,
    endTime: 18,
    revealTime: 12,
    type: "entity",
    text: "A blackout occurred recently.",
    keywords: ["blackout", "occurred", "recently"],
    importance: "medium"
  },

  // 18-24 seconds
  {
    id: "chunk_18_scene",
    contentId: "signal-lost",
    sceneId: "scene-04",
    startTime: 18,
    endTime: 24,
    revealTime: 18,
    type: "scene_summary",
    text: "The team traces the anomaly to Station Seven and prepares to investigate.",
    keywords: ["team", "traces", "anomaly", "station", "seven", "prepares", "investigate"],
    importance: "high",
    entityIds: ["station-seven", "anomaly"]
  },
  {
    id: "chunk_18_event_1",
    contentId: "signal-lost",
    sceneId: "scene-04",
    startTime: 18,
    endTime: 24,
    revealTime: 18,
    type: "event",
    text: "The anomaly is traced to Station Seven.",
    keywords: ["anomaly", "traced", "station", "seven"],
    importance: "high"
  },
  {
    id: "chunk_18_event_2",
    contentId: "signal-lost",
    sceneId: "scene-04",
    startTime: 18,
    endTime: 24,
    revealTime: 18,
    type: "event",
    text: "The team prepares to investigate.",
    keywords: ["team", "prepares", "investigate"],
    importance: "medium"
  },
  {
    id: "chunk_18_ent_1",
    contentId: "signal-lost",
    sceneId: "scene-04",
    startTime: 18,
    endTime: 24,
    revealTime: 18,
    type: "entity",
    text: "Station Seven is the source of the anomaly.",
    keywords: ["station", "seven", "source", "anomaly"],
    importance: "high"
  },
  {
    id: "chunk_18_ent_2",
    contentId: "signal-lost",
    sceneId: "scene-04",
    startTime: 18,
    endTime: 24,
    revealTime: 18,
    type: "entity",
    text: "An anomaly was traced.",
    keywords: ["anomaly", "traced"],
    importance: "medium"
  }
];
