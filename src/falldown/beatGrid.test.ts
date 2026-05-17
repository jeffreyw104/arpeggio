import { describe, it, expect } from "vitest";
import { beatGridLines } from "./beatGrid";
import type { Score } from "../model/score";

const score = {
  source: "midi",
  notes: [],
  measures: [
    { index: 0, start: 0, end: 2, numerator: 4, denominator: 4 },
    { index: 1, start: 2, end: 4, numerator: 4, denominator: 4 },
  ],
  pedalEvents: [],
  timeSignatures: [{ start: 0, numerator: 4, denominator: 4 }],
  tempoMap: [{ start: 0, bpm: 120 }],
  durationSeconds: 4,
  musicXml: "",
  qualityWarning: null,
} satisfies Score;

describe("beatGridLines", () => {
  it("places the beat at the current time on the hit line", () => {
    const lines = beatGridLines(score, 0, { hitLineY: 400, pixelsPerSecond: 100 });
    const atZero = lines.find((l) => Math.abs(l.y - 400) < 1e-6);
    expect(atZero).toBeDefined();
  });

  it("marks measure downbeats distinctly from ordinary beats", () => {
    const lines = beatGridLines(score, 0, { hitLineY: 400, pixelsPerSecond: 100 });
    const downbeat = lines.find((l) => Math.abs(l.y - 400) < 1e-6);
    expect(downbeat!.downbeat).toBe(true);
    // beat at t=0.5 -> y = 400 - 0.5*100 = 350, not a downbeat
    const ordinary = lines.find((l) => Math.abs(l.y - 350) < 1e-6);
    expect(ordinary!.downbeat).toBe(false);
  });

  it("only returns lines within the falldown area", () => {
    const lines = beatGridLines(score, 0, { hitLineY: 400, pixelsPerSecond: 100 });
    for (const l of lines) {
      expect(l.y).toBeGreaterThanOrEqual(0);
      expect(l.y).toBeLessThanOrEqual(400);
    }
  });
});
