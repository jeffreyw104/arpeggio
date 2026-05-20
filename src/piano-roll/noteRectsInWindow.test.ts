import { describe, it, expect } from "vitest";
import { noteRectsInWindow } from "./noteRectsInWindow";
import type { Note } from "../model/score";

const n = (midi: number, start: number, duration: number, hand: "left" | "right"): Note => ({
  midi, start, duration, velocity: 0.8, hand,
});

describe("noteRectsInWindow", () => {
  it("places a note's x by its start time within the window", () => {
    const rects = noteRectsInWindow(
      [n(60, 1, 0.5, "right")],
      {
        viewport: { left: 0, top: 0, width: 200, height: 100 },
        timeWindow: { start: 0, end: 2 },
        pitchRange: { lowMidi: 60, highMidi: 60 },
        rightColor: "#4a90d9",
        leftColor: "#e08a3c",
      },
    );
    expect(rects[0].x).toBe(100);
    expect(rects[0].width).toBe(50);
  });

  it("colours notes by hand", () => {
    const rects = noteRectsInWindow(
      [n(60, 0, 1, "right"), n(60, 0, 1, "left")],
      {
        viewport: { left: 0, top: 0, width: 100, height: 100 },
        timeWindow: { start: 0, end: 1 },
        pitchRange: { lowMidi: 60, highMidi: 60 },
        rightColor: "#4a90d9",
        leftColor: "#e08a3c",
      },
    );
    expect(rects[0].color).toBe("#4a90d9");
    expect(rects[1].color).toBe("#e08a3c");
  });

  it("excludes notes outside the time window", () => {
    const rects = noteRectsInWindow(
      [n(60, 3, 0.5, "right")],
      {
        viewport: { left: 0, top: 0, width: 100, height: 100 },
        timeWindow: { start: 0, end: 2 },
        pitchRange: { lowMidi: 60, highMidi: 60 },
        rightColor: "#4a90d9",
        leftColor: "#e08a3c",
      },
    );
    expect(rects).toEqual([]);
  });

  it("includes a note that starts before the window but sounds inside it", () => {
    const rects = noteRectsInWindow(
      [n(60, -0.5, 1, "right")],
      {
        viewport: { left: 0, top: 0, width: 100, height: 100 },
        timeWindow: { start: 0, end: 1 },
        pitchRange: { lowMidi: 60, highMidi: 60 },
        rightColor: "#4a90d9",
        leftColor: "#e08a3c",
      },
    );
    expect(rects).toHaveLength(1);
    expect(rects[0].x).toBeLessThan(0);
  });
});
