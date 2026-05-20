import { describe, it, expect } from "vitest";
import { autoFitRange, FULL_88 } from "./keyRange";
import type { Score } from "../model/score";

function scoreWith(midis: number[]): Score {
  return {
    source: "midi",
    notes: midis.map((m) => ({
      midi: m,
      start: 0,
      duration: 1,
      velocity: 0.7,
      hand: "right",
    })),
    measures: [{ index: 0, start: 0, end: 2, numerator: 4, denominator: 4 }],
    pedalEvents: [],
    timeSignatures: [{ start: 0, numerator: 4, denominator: 4 }],
    tempoMap: [{ start: 0, bpm: 120 }],
    sections: [],
    durationSeconds: 2,
    musicXml: "",
    qualityWarning: null,
  };
}

describe("autoFitRange", () => {
  it("spans the lowest and highest notes used", () => {
    const r = autoFitRange(scoreWith([60, 64, 67]));
    expect(r.low).toBeLessThanOrEqual(60);
    expect(r.high).toBeGreaterThanOrEqual(67);
  });

  it("pads the bounds out to white keys", () => {
    // 61 = C#4 (black), 66 = F#4 (black): range must widen to white keys.
    const r = autoFitRange(scoreWith([61, 66]));
    expect(isBlackPitch(r.low)).toBe(false);
    expect(isBlackPitch(r.high)).toBe(false);
    expect(r.low).toBeLessThanOrEqual(61);
    expect(r.high).toBeGreaterThanOrEqual(66);
  });

  it("falls back to a sensible middle range for an empty score", () => {
    const r = autoFitRange(scoreWith([]));
    expect(r.high).toBeGreaterThan(r.low);
  });
});

function isBlackPitch(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
}

describe("FULL_88", () => {
  it("is the full piano range A0-C8", () => {
    expect(FULL_88).toEqual({ low: 21, high: 108 });
  });
});
