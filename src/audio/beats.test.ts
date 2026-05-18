import { describe, it, expect } from "vitest";
import { metronomeBeats } from "./beats";
import type { Measure } from "../model/score";

// Two 4/4 measures spanning [0,2] and [2,4].
const measures: Measure[] = [
  { index: 0, start: 0, end: 2, numerator: 4, denominator: 4 },
  { index: 1, start: 2, end: 4, numerator: 4, denominator: 4 },
];

describe("metronomeBeats", () => {
  it("emits a 4/4 grid from the measures at subdivision 1", () => {
    const beats = metronomeBeats(measures, 4, 1);
    expect(beats.map((b) => b.time)).toEqual([
      0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5,
    ]);
    // Every beat is a main beat at subdivision 1.
    expect(beats.every((b) => b.mainBeat)).toBe(true);
    // Accents fall on the measure starts: t=0 and t=2.
    expect(beats.filter((b) => b.accent).map((b) => b.time)).toEqual([0, 2]);
    expect(beats.find((b) => b.time === 0.5)!.accent).toBe(false);
    expect(beats.find((b) => b.time === 1)!.accent).toBe(false);
    expect(beats.find((b) => b.time === 1.5)!.accent).toBe(false);
  });

  it("splits each beat into subdivision ticks", () => {
    const beats = metronomeBeats(measures, 4, 2);
    expect(beats.length).toBe(16);
    expect(beats.slice(0, 5).map((b) => b.time)).toEqual([
      0, 0.25, 0.5, 0.75, 1,
    ]);
    // mainBeat true only on the beat positions.
    expect(beats.find((b) => b.time === 0.25)!.mainBeat).toBe(false);
    expect(beats.find((b) => b.time === 0.5)!.mainBeat).toBe(true);
    // accent only on the two measure starts.
    expect(beats.filter((b) => b.accent).map((b) => b.time)).toEqual([0, 2]);
  });

  it("divides a measure of a different length evenly", () => {
    const longMeasure: Measure[] = [
      { index: 0, start: 0, end: 3, numerator: 6, denominator: 8 },
    ];
    const beats = metronomeBeats(longMeasure, 6, 1);
    // beatLen = 3 / 6 = 0.5
    expect(beats.map((b) => b.time)).toEqual([0, 0.5, 1, 1.5, 2, 2.5]);
  });

  it("clamps a 0 beatsPerBar/subdivision to 1", () => {
    const a = metronomeBeats(measures, 0, 0);
    const b = metronomeBeats(measures, 1, 1);
    expect(a).toEqual(b);
  });
});
