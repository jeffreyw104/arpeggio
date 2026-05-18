import { describe, it, expect } from "vitest";
import { beatGridLines } from "./beatGrid";
import type { Measure } from "../model/score";

// Two 4/4 measures spanning [0,2] and [2,4]: each beat 0.5 s.
const measures: Measure[] = [
  { index: 0, start: 0, end: 2, numerator: 4, denominator: 4 },
  { index: 1, start: 2, end: 4, numerator: 4, denominator: 4 },
];
const NUM = 4;

describe("beatGridLines", () => {
  it("places the beat at the current time on the hit line", () => {
    const lines = beatGridLines(measures, NUM, 0, {
      hitLineY: 400,
      pixelsPerSecond: 100,
    });
    const atZero = lines.find((l) => Math.abs(l.y - 400) < 1e-6);
    expect(atZero).toBeDefined();
  });

  it("marks measure downbeats distinctly from ordinary beats", () => {
    const lines = beatGridLines(measures, NUM, 0, {
      hitLineY: 400,
      pixelsPerSecond: 100,
    });
    const downbeat = lines.find((l) => Math.abs(l.y - 400) < 1e-6);
    expect(downbeat!.downbeat).toBe(true);
    // beat at t=0.5 -> y = 400 - 0.5*100 = 350, not a downbeat
    const ordinary = lines.find((l) => Math.abs(l.y - 350) < 1e-6);
    expect(ordinary!.downbeat).toBe(false);
  });

  it("only returns lines within the falldown area", () => {
    const lines = beatGridLines(measures, NUM, 0, {
      hitLineY: 400,
      pixelsPerSecond: 100,
    });
    for (const l of lines) {
      expect(l.y).toBeGreaterThanOrEqual(0);
      expect(l.y).toBeLessThanOrEqual(400);
    }
  });
});
