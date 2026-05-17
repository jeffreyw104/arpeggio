import { describe, it, expect } from "vitest";
import { metronomeBeats } from "./beats";
import type { Score } from "../model/score";

// 2 measures, 4/4, 120 BPM: each measure 2 s, each beat 0.5 s.
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

describe("metronomeBeats", () => {
  it("emits one click per beat at subdivision 1", () => {
    expect(metronomeBeats(score, 1)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
  });

  it("emits subdivided clicks at subdivision 2", () => {
    const beats = metronomeBeats(score, 2);
    expect(beats.length).toBe(16); // 8 beats x 2
    expect(beats.slice(0, 4)).toEqual([0, 0.25, 0.5, 0.75]);
  });

  it("clamps subdivision to at least 1", () => {
    expect(metronomeBeats(score, 0)).toEqual(metronomeBeats(score, 1));
  });
});
