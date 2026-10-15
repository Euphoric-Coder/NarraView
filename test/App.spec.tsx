import "react-native";
import { render } from "@testing-library/react-native";
import * as React from "react";

jest.mock("@amazon-devices/react-native-w3cmedia", () => {
  const React = require("react");
  return {
    VideoPlayer: (props: any) => React.createElement("VideoPlayer", props),
    KeplerVideoSurfaceView: (props: any) => React.createElement("KeplerVideoSurfaceView", props),
  };
});

jest.mock("../src/services/contentApi", () => ({
  listContent: jest.fn().mockResolvedValue([]),
  getContent: jest.fn().mockResolvedValue(null),
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
});
