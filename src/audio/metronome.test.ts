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

  it("setScore re-grids onto the new score's measures", () => {
    const m = new Metronome(score);
    m.enabled = true;
    // A re-timed score (as a flatten/preserve toggle produces): the same two
    // measures, but each now spanning 1 s instead of 2 s.
    const reTimed = {
      ...score,
      measures: [
        { index: 0, start: 0, end: 1, numerator: 4, denominator: 4 },
        { index: 1, start: 1, end: 2, numerator: 4, denominator: 4 },
      ],
      durationSeconds: 2,
    } satisfies Score;
    m.setScore(reTimed);
    const times: number[] = [];
    m.onClick((time) => times.push(time));
    m.update(-0.01, 2); // 4 beats per 1 s measure -> every 0.25 s
    expect(times).toEqual([0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75]);
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

  it("free-run fires a click on the first updateFree call", () => {
    const m = new Metronome(score);
    m.enabled = true;
    m.freeRun = true;
    const click = vi.fn();
    m.onClick(click);
    m.updateFree(120, 1000);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("free-run fires one click per 60000/bpm ms of wall-clock time", () => {
    const m = new Metronome(score);
    m.enabled = true;
    m.freeRun = true;
    const click = vi.fn();
    m.onClick(click);
    // 120 bpm → 500 ms between beats. Schedule: t=1000 (arm + first click),
    // next due t=1500, then t=2000, t=2500…
    m.updateFree(120, 1000); // arm + first click (1)
    m.updateFree(120, 1400); // before next due → still 1 total
    expect(click).toHaveBeenCalledTimes(1);
    m.updateFree(120, 1500); // due → 2 total
    m.updateFree(120, 2500); // catch up 2000 + 2500 → 4 total
    expect(click).toHaveBeenCalledTimes(4);
  });

  it("free-run catches up if the caller stops calling for a while", () => {
    const m = new Metronome(score);
    m.enabled = true;
    m.freeRun = true;
    const click = vi.fn();
    m.onClick(click);
    // 60 bpm → 1000 ms intervals.
    m.updateFree(60, 0); // first beat at t=0
    // Skip to t=4200 — should fire beats at 1000, 2000, 3000, 4000.
    m.updateFree(60, 4200);
    expect(click).toHaveBeenCalledTimes(5);
  });

  it("score-locked update is a no-op while freeRun is on", () => {
    const m = new Metronome(score);
    m.enabled = true;
    m.freeRun = true;
    const click = vi.fn();
    m.onClick(click);
    m.update(0, 2); // would fire 4 beats on the score grid
    expect(click).not.toHaveBeenCalled();
  });

  it("freeRun click reports accent=false (no downbeat in free-run mode)", () => {
    const m = new Metronome(score);
    m.enabled = true;
    m.freeRun = true;
    m.accentDownbeat = true; // even with accents requested, free-run is unaccented
    const accents: boolean[] = [];
    m.onClick((_time, accent) => accents.push(accent));
    m.updateFree(120, 1000);
    m.updateFree(120, 1500);
    expect(accents).toEqual([false, false]);
  });

  it("resetFreeRun lets a fresh start fire immediately", () => {
    const m = new Metronome(score);
    m.enabled = true;
    m.freeRun = true;
    const click = vi.fn();
    m.onClick(click);
    m.updateFree(120, 1000); // arm
    m.updateFree(120, 1200); // no new click yet
    expect(click).toHaveBeenCalledTimes(1);
    m.resetFreeRun();
    m.updateFree(120, 1200); // re-arm fires immediately
    expect(click).toHaveBeenCalledTimes(2);
  });

  it("updateFree is a no-op when not enabled or not in freeRun", () => {
    const m = new Metronome(score);
    const click = vi.fn();
    m.onClick(click);
    m.freeRun = true;
    m.enabled = false;
    m.updateFree(120, 1000);
    expect(click).not.toHaveBeenCalled();
    m.enabled = true;
    m.freeRun = false;
    m.updateFree(120, 1000);
    expect(click).not.toHaveBeenCalled();
  });
});
