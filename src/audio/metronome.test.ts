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

  it("reports every click as unaccented by default", () => {
    const m = new Metronome(score);
    m.enabled = true;
    expect(m.accentDownbeat).toBe(false);
    const accents: boolean[] = [];
    m.onClick((_time, accent) => accents.push(accent));
    m.update(-0.01, 2.6); // beats at 0,0.5,1,1.5,2,2.5 — 0 and 2 are measure starts
    expect(accents.some((a) => a)).toBe(false);
  });

  it("accents the measure downbeats when accentDownbeat is on", () => {
    const m = new Metronome(score);
    m.enabled = true;
    m.accentDownbeat = true;
    const accents: { time: number; accent: boolean }[] = [];
    m.onClick((time, accent) => accents.push({ time, accent }));
    m.update(-0.01, 2.6); // measure starts at t=0 and t=2 are accented
    expect(accents.filter((a) => a.accent).map((a) => a.time)).toEqual([0, 2]);
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

  it("resync re-enables beats already fired so they fire again", () => {
    const m = new Metronome(score);
    m.enabled = true;
    const click = vi.fn();
    m.onClick(click);
    m.update(-0.01, 1.0); // beats at 0,0.5,1.0 fire
    expect(click).toHaveBeenCalledTimes(3);
    m.resync();
    m.update(-0.01, 1.0); // same range: with resync the beats fire again
    expect(click).toHaveBeenCalledTimes(6);
  });

  it("pulse is high right after a beat and lower later", () => {
    const m = new Metronome(score);
    m.enabled = true;
    m.update(-0.01, 0.0); // crosses the beat at 0
    const right = m.pulse;
    m.update(0.0, 0.3); // 0.3 s later, no beat until 0.5
    expect(m.pulse).toBeLessThan(right);
  });

  it("setTimeSignature(2, 4) changes beats-per-bar", () => {
    const m = new Metronome(score);
    m.enabled = true;
    m.accentDownbeat = true;
    m.setTimeSignature(2, 4);
    expect(m.timeSignature).toEqual({ numerator: 2, denominator: 4 });
    // Each 2 s measure now has 2 beats: t=0,1 and t=2,3. Accents on 0 and 2.
    const accents: { time: number; accent: boolean }[] = [];
    m.onClick((time, accent) => accents.push({ time, accent }));
    m.update(-0.01, 4);
    expect(accents.map((a) => a.time)).toEqual([0, 1, 2, 3]);
    expect(accents.filter((a) => a.accent).map((a) => a.time)).toEqual([0, 2]);
  });
});
