import { describe, it, expect } from "vitest";
import { metronomeBeats, beatPulse } from "./beats";
import type { Measure, TimeSignature } from "../model/score";

// Two 4/4 measures spanning [0,2] and [2,4].
const measures: Measure[] = [
  { index: 0, start: 0, end: 2, numerator: 4, denominator: 4 },
  { index: 1, start: 2, end: 4, numerator: 4, denominator: 4 },
];
const SIGS_44: TimeSignature[] = [{ start: 0, numerator: 4, denominator: 4 }];

describe("metronomeBeats", () => {
  it("emits a 4/4 grid from the measures at subdivision 1", () => {
    const beats = metronomeBeats(measures, SIGS_44, 1);
    expect(beats.map((b) => b.time)).toEqual([
      0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5,
    ]);
    expect(beats.every((b) => b.mainBeat)).toBe(true);
    expect(beats.filter((b) => b.accent).map((b) => b.time)).toEqual([0, 2]);
    expect(beats.find((b) => b.time === 0.5)!.accent).toBe(false);
    expect(beats.find((b) => b.time === 1)!.accent).toBe(false);
    expect(beats.find((b) => b.time === 1.5)!.accent).toBe(false);
  });

  it("splits each beat into subdivision ticks", () => {
    const beats = metronomeBeats(measures, SIGS_44, 2);
    expect(beats.length).toBe(16);
    expect(beats.slice(0, 5).map((b) => b.time)).toEqual([
      0, 0.25, 0.5, 0.75, 1,
    ]);
    expect(beats.find((b) => b.time === 0.25)!.mainBeat).toBe(false);
    expect(beats.find((b) => b.time === 0.5)!.mainBeat).toBe(true);
    expect(beats.filter((b) => b.accent).map((b) => b.time)).toEqual([0, 2]);
  });

  it("divides a measure of a different length evenly", () => {
    const longMeasure: Measure[] = [
      { index: 0, start: 0, end: 3, numerator: 6, denominator: 8 },
    ];
    const sigs68: TimeSignature[] = [
      { start: 0, numerator: 6, denominator: 8 },
    ];
    const beats = metronomeBeats(longMeasure, sigs68, 1);
    // beatLen = 3 / 6 = 0.5
    expect(beats.map((b) => b.time)).toEqual([0, 0.5, 1, 1.5, 2, 2.5]);
  });

  it("uses the active segment's numerator per measure", () => {
    // Four 2-second measures; 4/4 for the first two, 3/4 starting at t=4.
    const ms: Measure[] = [
      { index: 0, start: 0, end: 2, numerator: 4, denominator: 4 },
      { index: 1, start: 2, end: 4, numerator: 4, denominator: 4 },
      { index: 2, start: 4, end: 6, numerator: 3, denominator: 4 },
      { index: 3, start: 6, end: 8, numerator: 3, denominator: 4 },
    ];
    const sigs: TimeSignature[] = [
      { start: 0, numerator: 4, denominator: 4 },
      { start: 4, numerator: 3, denominator: 4 },
    ];
    const beats = metronomeBeats(ms, sigs, 1);
    // 4 + 4 + 3 + 3 = 14 main beats.
    expect(beats.length).toBe(14);
    // Measures 0 and 1: 4 beats spaced 0.5 apart starting at 0 and 2.
    expect(beats.slice(0, 4).map((b) => b.time)).toEqual([0, 0.5, 1, 1.5]);
    expect(beats.slice(4, 8).map((b) => b.time)).toEqual([2, 2.5, 3, 3.5]);
    // Measure 2: 3 beats spread across [4, 6] -> beatLen 2/3.
    expect(beats.slice(8, 11).map((b) => b.time)).toEqual([
      4,
      4 + 2 / 3,
      4 + 4 / 3,
    ]);
    // Accents on every measure start (4, 4, 3, 3 grids → accents at 0, 2, 4, 6).
    expect(beats.filter((b) => b.accent).map((b) => b.time)).toEqual([
      0, 2, 4, 6,
    ]);
  });

  it("falls back to 4/4 when the signature list is empty", () => {
    const beats = metronomeBeats(measures, [], 1);
    expect(beats.map((b) => b.time)).toEqual([
      0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5,
    ]);
  });

  it("clamps a 0 subdivision to 1", () => {
    const a = metronomeBeats(measures, SIGS_44, 0);
    const b = metronomeBeats(measures, SIGS_44, 1);
    expect(a).toEqual(b);
  });
});

describe("beatPulse", () => {
  it("is 1 on a beat and decays linearly to 0 over the decay window", () => {
    expect(beatPulse(measures, SIGS_44, 1, 0.2)).toBe(1);
    expect(beatPulse(measures, SIGS_44, 1.1, 0.2)).toBeCloseTo(0.5, 6);
    expect(beatPulse(measures, SIGS_44, 1.3, 0.2)).toBe(0);
  });

  it("is 0 before the first beat", () => {
    expect(beatPulse(measures, SIGS_44, -1, 0.2)).toBe(0);
  });

  it("uses the active segment's numerator at time t", () => {
    // Same 4/4 → 3/4 score as above. A pulse query at t=4 should fire (the
    // 3/4 segment starts with a beat at exactly t=4).
    const ms: Measure[] = [
      { index: 0, start: 0, end: 2, numerator: 4, denominator: 4 },
      { index: 1, start: 2, end: 4, numerator: 4, denominator: 4 },
      { index: 2, start: 4, end: 6, numerator: 3, denominator: 4 },
    ];
    const sigs: TimeSignature[] = [
      { start: 0, numerator: 4, denominator: 4 },
      { start: 4, numerator: 3, denominator: 4 },
    ];
    expect(beatPulse(ms, sigs, 4, 0.2)).toBe(1);
  });
});
