import { describe, it, expect, vi } from "vitest";
import { Metronome } from "./metronome";
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

describe("Metronome", () => {
  it("is disabled by default and fires no clicks", () => {
    const m = new Metronome(score);
    const click = vi.fn();
    m.onClick(click);
    expect(m.enabled).toBe(false);
    m.update(0, 1);
    expect(click).not.toHaveBeenCalled();
  });

  it("fires a click for each beat crossed while enabled", () => {
    const m = new Metronome(score);
    m.enabled = true;
    const click = vi.fn();
    m.onClick(click);
    m.update(0, 1.1); // beats at 0, 0.5, 1.0 fall in (0, 1.1]
    expect(click).toHaveBeenCalledTimes(3);
  });

  it("marks the first beat of a measure as accented", () => {
    const m = new Metronome(score);
    m.enabled = true;
    const accents: boolean[] = [];
    m.onClick((_time, accent) => accents.push(accent));
    m.update(-0.01, 0.6); // beats 0.0 (accent) and 0.5 (not)
    expect(accents).toEqual([true, false]);
  });

  it("respects the subdivision setting", () => {
    const m = new Metronome(score);
    m.enabled = true;
    m.subdivision = 2;
    const click = vi.fn();
    m.onClick(click);
    m.update(-0.01, 1.0); // 0,0.25,0.5,0.75,1.0 -> 5 clicks
    expect(click).toHaveBeenCalledTimes(5);
  });

  it("pulse is high right after a beat and lower later", () => {
    const m = new Metronome(score);
    m.enabled = true;
    m.update(-0.01, 0.0); // crosses the beat at 0
    const right = m.pulse;
    m.update(0.0, 0.3); // 0.3 s later, no beat until 0.5
    expect(m.pulse).toBeLessThan(right);
  });
});
