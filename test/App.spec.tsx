import "react-native";
import { render, fireEvent } from "@testing-library/react-native";
import * as React from "react";

jest.mock("@amazon-devices/react-native-w3cmedia", () => {
  const React = require("react");
  return {
    VideoPlayer: (props: any) => React.createElement("VideoPlayer", props),
    KeplerVideoSurfaceView: (props: any) => React.createElement("KeplerVideoSurfaceView", props),
  };
});

jest.mock("../src/services/contentApi", () => ({
  listContentWithRetry: jest.fn().mockResolvedValue([
    {
      contentId: 'city-care-demo',
      title: 'CityCare Demo',
      description: 'CityCare description',
      durationSeconds: 321,
      catalogVisible: true,
      mediaPlayable: true,
      aiReady: true
    }
  ]),
  listContent: jest.fn().mockResolvedValue([
    {
      contentId: 'city-care-demo',
      title: 'CityCare Demo',
      description: 'CityCare description',
      durationSeconds: 321,
      catalogVisible: true,
      mediaPlayable: true,
      aiReady: true
    }
  ]),
  getContent: jest.fn().mockResolvedValue({
    contentId: 'city-care-demo',
    title: 'CityCare Demo',
    description: 'CityCare description',
    durationSeconds: 321,
    catalogVisible: true,
    mediaPlayable: true,
    aiReady: true
  }),
}));

jest.mock("../src/services/viewerProgressApi", () => ({
  getContinueWatching: jest.fn().mockResolvedValue([]),
  getProgress: jest.fn().mockResolvedValue({ notStarted: true }),
  updateProgress: jest.fn().mockResolvedValue({}),
  startPlaybackSession: jest.fn().mockResolvedValue({ sessionId: 'sess_test', resumePositionSeconds: 0 }),
  resetProgress: jest.fn().mockResolvedValue({}),
}));

jest.mock("../src/services/viewerIdentity", () => ({
  getViewerId: jest.fn().mockResolvedValue('test-viewer-mock'),
  setViewerIdOverride: jest.fn(),
  clearCachedViewerId: jest.fn(),
}));

import { App } from "../src/App";

describe("App", () => {
  it("renders the NarraView home screen", () => {
    const screen = render(<App />);
    expect(screen.getByText("NarraView")).toBeTruthy();
    expect(screen.getByText("Understand what you watch.")).toBeTruthy();
    expect(screen.getByText("AI-native contextual viewing for Fire TV.")).toBeTruthy();
    expect(screen.getByText("Explore Collection")).toBeTruthy();
  });

  it("navigates to details when a content card is pressed without errors", () => {
    const screen = render(<App />);
    const cardTitle = screen.getByText("Origins");
    expect(cardTitle).toBeTruthy();
    fireEvent.press(cardTitle);
    expect(screen.getByText("Watch Now")).toBeTruthy();
  });
});
