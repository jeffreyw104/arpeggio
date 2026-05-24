import { describe, it, expect } from "vitest";
import { beatGridLines } from "./beatGrid";
import type { Measure, TimeSignature } from "../model/score";

const measures: Measure[] = [
  { index: 0, start: 0, end: 2, numerator: 4, denominator: 4 },
  { index: 1, start: 2, end: 4, numerator: 4, denominator: 4 },
];
const SIGS_44: TimeSignature[] = [{ start: 0, numerator: 4, denominator: 4 }];

describe("beatGridLines", () => {
  it("places the beat at the current time on the hit line", () => {
    const lines = beatGridLines(measures, SIGS_44, 0, {
      hitLineY: 400,
      pixelsPerSecond: 100,
    });
    const atZero = lines.find((l) => Math.abs(l.y - 400) < 1e-6);
    expect(atZero).toBeDefined();
  });

  it("marks measure downbeats distinctly from ordinary beats", () => {
    const lines = beatGridLines(measures, SIGS_44, 0, {
      hitLineY: 400,
      pixelsPerSecond: 100,
    });
    const downbeat = lines.find((l) => Math.abs(l.y - 400) < 1e-6);
    expect(downbeat!.downbeat).toBe(true);
    const ordinary = lines.find((l) => Math.abs(l.y - 350) < 1e-6);
    expect(ordinary!.downbeat).toBe(false);
  });

  it("only returns lines within the falldown area", () => {
    const lines = beatGridLines(measures, SIGS_44, 0, {
      hitLineY: 400,
      pixelsPerSecond: 100,
    });
    for (const l of lines) {
      expect(l.y).toBeGreaterThanOrEqual(0);
      expect(l.y).toBeLessThanOrEqual(400);
    }
  });

  it("uses the active segment's beat density per measure", () => {
    // Measure 0: 4/4 (4 beats over [0,2] -> every 0.5 s).
    // Measure 1: 2/4 (2 beats over [2,4] -> every 1 s).
    const ms: Measure[] = [
      { index: 0, start: 0, end: 2, numerator: 4, denominator: 4 },
      { index: 1, start: 2, end: 4, numerator: 2, denominator: 4 },
    ];
    const sigs: TimeSignature[] = [
      { start: 0, numerator: 4, denominator: 4 },
      { start: 2, numerator: 2, denominator: 4 },
    ];
    // hitLineY=1000, pps=100 -> visible window covers t in [0, 10]
    const lines = beatGridLines(ms, sigs, 0, {
      hitLineY: 1000,
      pixelsPerSecond: 100,
    });
    // Expect beats at: 0, 0.5, 1, 1.5 (4/4) + 2, 3 (2/4) = 6 lines.
    expect(lines.length).toBe(6);
    // The beat at t=3 is mid-measure for 2/4, so not a downbeat.
    const atT3 = lines.find((l) => Math.abs(l.y - (1000 - 3 * 100)) < 1e-6);
    expect(atT3!.downbeat).toBe(false);
  });
});
