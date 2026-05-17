import { describe, it, expect } from "vitest";
import { measureLoop, beatLoop, clampLoop } from "./loop";
import type { Score } from "../model/score";

// A minimal 2-measure 4/4 score at 120 BPM: each measure is 2 s, each beat 0.5 s.
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

describe("measureLoop", () => {
  it("spans the start of the first measure to the end of the last", () => {
    expect(measureLoop(score, 0, 1)).toEqual({ start: 0, end: 4 });
    expect(measureLoop(score, 1, 1)).toEqual({ start: 2, end: 4 });
  });

  it("orders a reversed measure range", () => {
    expect(measureLoop(score, 1, 0)).toEqual({ start: 0, end: 4 });
  });
});

describe("beatLoop", () => {
  it("returns the single beat containing the given position", () => {
    // position 1.2 s is inside beat 2 of measure 0: [1.0, 1.5)
    expect(beatLoop(score, 1.2)).toEqual({ start: 1.0, end: 1.5 });
  });

  it("works in the second measure", () => {
    // position 2.6 s -> beat starting at 2.5 s
    expect(beatLoop(score, 2.6)).toEqual({ start: 2.5, end: 3.0 });
  });
});

describe("clampLoop", () => {
  it("clamps to [0, duration] and keeps start < end", () => {
    expect(clampLoop({ start: -1, end: 99 }, 4)).toEqual({ start: 0, end: 4 });
  });
});
