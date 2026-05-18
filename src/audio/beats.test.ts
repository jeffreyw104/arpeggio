import { describe, it, expect } from "vitest";
import { metronomeBeats, type BeatGridSpec } from "./beats";

describe("metronomeBeats", () => {
  it("emits a regular 4/4 grid at subdivision 1", () => {
    const spec: BeatGridSpec = { numerator: 4, denominator: 4, subdivision: 1 };
    const beats = metronomeBeats(spec, 120, 4);
    expect(beats.map((b) => b.time)).toEqual([
      0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4,
    ]);
    // Every beat is a main beat at subdivision 1.
    expect(beats.every((b) => b.mainBeat)).toBe(true);
    // Accents fall every 4th beat: t=0 and t=2.0.
    expect(beats.filter((b) => b.accent).map((b) => b.time)).toEqual([0, 2, 4]);
    // 0.5/1.0/1.5 are not accented.
    expect(beats.find((b) => b.time === 0.5)!.accent).toBe(false);
    expect(beats.find((b) => b.time === 1)!.accent).toBe(false);
    expect(beats.find((b) => b.time === 1.5)!.accent).toBe(false);
  });

  it("splits each beat into subdivision ticks", () => {
    const spec: BeatGridSpec = { numerator: 4, denominator: 4, subdivision: 2 };
    const beats = metronomeBeats(spec, 120, 4);
    expect(beats.slice(0, 5).map((b) => b.time)).toEqual([
      0, 0.25, 0.5, 0.75, 1,
    ]);
    // mainBeat true only on half-second multiples.
    expect(beats.find((b) => b.time === 0.25)!.mainBeat).toBe(false);
    expect(beats.find((b) => b.time === 0.5)!.mainBeat).toBe(true);
    // accent only on bar starts (t=0, t=2).
    expect(beats.filter((b) => b.accent).map((b) => b.time)).toEqual([0, 2, 4]);
  });

  it("uses the numerator for the bar length (6/4)", () => {
    const spec: BeatGridSpec = { numerator: 6, denominator: 4, subdivision: 1 };
    const beats = metronomeBeats(spec, 120, 4);
    // 6 beats per bar: beat index 6 (t=3.0) is the next accent.
    const accents = beats.filter((b) => b.accent).map((b) => b.time);
    expect(accents).toEqual([0, 3]);
  });

  it("clamps a 0 subdivision to 1", () => {
    const a = metronomeBeats(
      { numerator: 4, denominator: 4, subdivision: 0 },
      120,
      4,
    );
    const b = metronomeBeats(
      { numerator: 4, denominator: 4, subdivision: 1 },
      120,
      4,
    );
    expect(a).toEqual(b);
  });
});
