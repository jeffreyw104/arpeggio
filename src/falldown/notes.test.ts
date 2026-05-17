import { describe, it, expect } from "vitest";
import { noteRects, activeKeys, type FalldownConfig } from "./notes";
import { keyLayout } from "./piano";
import type { Note } from "../model/score";

const layout = keyLayout({ low: 60, high: 72 }, 800);

const config: FalldownConfig = {
  hitLineY: 400,
  pixelsPerSecond: 100,
  rightColor: "#4a90d9",
  leftColor: "#e08a3c",
};

const notes: Note[] = [
  { midi: 60, start: 1, duration: 0.5, velocity: 0.7, hand: "right" },
  { midi: 64, start: 5, duration: 1, velocity: 0.7, hand: "left" },
];

describe("noteRects", () => {
  it("places a note's onset edge at the hit line when time == start", () => {
    const rects = noteRects(notes, layout, 1, config);
    const r = rects.find((x) => x.midi === 60);
    expect(r).toBeDefined();
    expect(r!.bottom).toBeCloseTo(400, 6); // onset edge at the hit line
    expect(r!.height).toBeCloseTo(50, 6); // 0.5 s * 100 px/s
  });

  it("places a future note above the hit line", () => {
    const rects = noteRects(notes, layout, 0, config); // note 60 starts in 1 s
    const r = rects.find((x) => x.midi === 60)!;
    expect(r.bottom).toBeCloseTo(300, 6); // 400 - 1*100
  });

  it("omits notes far off-screen", () => {
    // note 64 starts at t=5; at time 0 it is 500 px above the hit line.
    const rects = noteRects(notes, layout, 0, config);
    expect(rects.find((x) => x.midi === 64)).toBeUndefined();
  });

  it("colors notes by hand", () => {
    const rects = noteRects(notes, layout, 1, config);
    expect(rects.find((x) => x.midi === 60)!.color).toBe("#4a90d9");
  });
});

describe("activeKeys", () => {
  it("returns midis of notes sounding at the given time", () => {
    expect(activeKeys(notes, 1.2)).toEqual(new Set([60])); // 60: [1,1.5)
    expect(activeKeys(notes, 5.5)).toEqual(new Set([64])); // 64: [5,6)
    expect(activeKeys(notes, 3)).toEqual(new Set());
  });
});
