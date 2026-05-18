import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MidiTabContent } from "./MidiTab";

describe("MidiTabContent", () => {
  it("renders the falldown canvas", () => {
    render(
      <MidiTabContent
        falldown={<canvas data-testid="falldown-canvas" />}
        readingLane={<div data-testid="reading-lane" />}
      />,
    );
    expect(screen.getByTestId("falldown-canvas")).toBeInTheDocument();
  });

  it("renders the reading lane", () => {
    render(
      <MidiTabContent
        falldown={<canvas data-testid="falldown-canvas" />}
        readingLane={<div data-testid="reading-lane" />}
      />,
    );
    expect(screen.getByTestId("reading-lane")).toBeInTheDocument();
  });

  it("wraps the falldown canvas in the midi-tab-falldown panel", () => {
    render(
      <MidiTabContent
        falldown={<canvas data-testid="falldown-canvas" />}
        readingLane={<div />}
      />,
    );
    const panel = document.querySelector(".midi-tab-falldown");
    expect(panel).toBeInTheDocument();
    expect(panel?.querySelector("canvas")).toBeInTheDocument();
  });
});
