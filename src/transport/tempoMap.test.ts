import { describe, it, expect } from "vitest";
import {
  secondsToBeats,
  beatsToSeconds,
  averageBpm,
  applyTempoMode,
} from "./tempoMap";
import type { Score } from "../model/score";

const constant = [{ start: 0, bpm: 120 }]; // 2 beats/sec

describe("secondsToBeats / beatsToSeconds", () => {
  it("convert at a constant tempo", () => {
    expect(secondsToBeats(constant, 3)).toBeCloseTo(6, 6);
    expect(beatsToSeconds(constant, 6)).toBeCloseTo(3, 6);
  });

  it("integrate across a tempo change", () => {
    // 120 BPM (2 beats/s) for [0,2)s, then 60 BPM (1 beat/s) from 2s.
    const map = [
      { start: 0, bpm: 120 },
      { start: 2, bpm: 60 },
    ];
    // 4 beats in the first 2 s, then 3 beats over the next 3 s = 7 beats @ 5 s
    expect(secondsToBeats(map, 5)).toBeCloseTo(7, 6);
    expect(beatsToSeconds(map, 7)).toBeCloseTo(5, 6);
  });
});

const variableScore = {
  source: "midi",
  notes: [
    { midi: 60, start: 0, duration: 1, velocity: 0.7, hand: "right" },
    { midi: 62, start: 2, duration: 1, velocity: 0.7, hand: "right" },
  ],
  measures: [{ index: 0, start: 0, end: 5, numerator: 4, denominator: 4 }],
  pedalEvents: [],
  timeSignatures: [{ start: 0, numerator: 4, denominator: 4 }],
  tempoMap: [
    { start: 0, bpm: 120 },
    { start: 2, bpm: 60 },
  ],
  sections: [],
  durationSeconds: 5,
  musicXml: "",
  qualityWarning: null,
} satisfies Score;

describe("averageBpm", () => {
  it("is the duration-weighted mean tempo", () => {
    // 7 beats over 5 s = 1.4 beats/s = 84 BPM.
    expect(averageBpm(variableScore)).toBeCloseTo(84, 6);
  });
});

describe("applyTempoMode", () => {
  it("preserve returns the score unchanged", () => {
    expect(applyTempoMode(variableScore, "preserve")).toEqual(variableScore);
  });

  it("flatten re-times notes onto a single constant tempo", () => {
    const flat = applyTempoMode(variableScore, "flatten");
    expect(flat.tempoMap).toHaveLength(1);
    // note 2 is at beat 4 (end of the 120-BPM section); under the flattened
    // constant tempo its start time changes but its beat position is preserved.
    const beatBefore = secondsToBeats(variableScore.tempoMap, 2);
    const beatAfter = secondsToBeats(flat.tempoMap, flat.notes[1].start);
    expect(beatAfter).toBeCloseTo(beatBefore, 6);
  });
});
