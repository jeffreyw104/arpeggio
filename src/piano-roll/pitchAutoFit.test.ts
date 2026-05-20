import { describe, it, expect } from "vitest";
import { pitchAutoFit } from "./pitchAutoFit";
import type { Note } from "../model/score";

const n = (midi: number): Note => ({
  midi,
  start: 0,
  duration: 1,
  velocity: 0.8,
  hand: "right",
});

describe("pitchAutoFit", () => {
  it("returns the literal min/max when the span exceeds minSpan", () => {
    const r = pitchAutoFit([n(48), n(72)], { minSpan: 12, maxSpan: 88 });
    expect(r).toEqual({ lowMidi: 48, highMidi: 72 });
  });

  it("pads symmetrically up to minSpan", () => {
    const r = pitchAutoFit([n(60), n(64)], { minSpan: 24, maxSpan: 88 });
    expect(r.highMidi - r.lowMidi).toBe(24);
    expect(r.lowMidi).toBeLessThanOrEqual(60);
    expect(r.highMidi).toBeGreaterThanOrEqual(64);
  });

  it("clamps to the A0..C8 piano range", () => {
    const r = pitchAutoFit([n(108)], { minSpan: 24, maxSpan: 88 });
    expect(r.highMidi).toBeLessThanOrEqual(108);
    expect(r.lowMidi).toBeGreaterThanOrEqual(21);
  });

  it("returns the full piano when no notes are given", () => {
    const r = pitchAutoFit([], { minSpan: 24, maxSpan: 88 });
    expect(r).toEqual({ lowMidi: 21, highMidi: 108 });
  });

  it("caps the maximum span", () => {
    const r = pitchAutoFit([n(21), n(108)], { minSpan: 24, maxSpan: 60 });
    expect(r.highMidi - r.lowMidi).toBeLessThanOrEqual(60);
  });
});
