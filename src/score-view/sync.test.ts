import { describe, it, expect } from "vitest";
import { currentMeasureIndex, measureRange, notesAtTime } from "./sync";
import type { TimemapEntry } from "./verovio";
import type { Score } from "../model/score";

const score = {
  source: "midi",
  notes: [],
  measures: [
    { index: 0, start: 0, end: 2, numerator: 4, denominator: 4 },
    { index: 1, start: 2, end: 4, numerator: 4, denominator: 4 },
    { index: 2, start: 4, end: 6, numerator: 4, denominator: 4 },
  ],
  pedalEvents: [],
  timeSignatures: [{ start: 0, numerator: 4, denominator: 4 }],
  tempoMap: [{ start: 0, bpm: 120 }],
  durationSeconds: 6,
  musicXml: "",
  qualityWarning: null,
} satisfies Score;

describe("currentMeasureIndex", () => {
  it("finds the measure containing a time", () => {
    expect(currentMeasureIndex(score, 0)).toBe(0);
    expect(currentMeasureIndex(score, 1.9)).toBe(0);
    expect(currentMeasureIndex(score, 2)).toBe(1);
    expect(currentMeasureIndex(score, 5.5)).toBe(2);
  });

  it("clamps before the start and after the end", () => {
    expect(currentMeasureIndex(score, -5)).toBe(0);
    expect(currentMeasureIndex(score, 999)).toBe(2);
  });
});

describe("measureRange", () => {
  it("returns the [start, end] of a measure index", () => {
    expect(measureRange(score, 1)).toEqual({ start: 2, end: 4 });
  });

  it("clamps an out-of-bounds index", () => {
    expect(measureRange(score, 99)).toEqual({ start: 4, end: 6 });
    expect(measureRange(score, -1)).toEqual({ start: 0, end: 2 });
  });
});

describe("notesAtTime", () => {
  // n1 sounds [0,1000)ms, n2 [500,1500)ms, n3 from 1000ms on.
  const timemap: TimemapEntry[] = [
    { tstamp: 0, on: ["n1"] },
    { tstamp: 500, on: ["n2"] },
    { tstamp: 1000, on: ["n3"], off: ["n1"] },
    { tstamp: 1500, off: ["n2"] },
  ];

  it("accumulates notes that are on and not yet off at a time", () => {
    expect(notesAtTime(timemap, 250)).toEqual(new Set(["n1"]));
    expect(notesAtTime(timemap, 700)).toEqual(new Set(["n1", "n2"]));
    expect(notesAtTime(timemap, 1200)).toEqual(new Set(["n2", "n3"]));
    expect(notesAtTime(timemap, 1800)).toEqual(new Set(["n3"]));
  });

  it("is empty before the first entry", () => {
    expect(notesAtTime(timemap, -10)).toEqual(new Set());
  });
});
