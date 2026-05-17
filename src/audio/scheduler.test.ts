import { describe, it, expect } from "vitest";
import { notesToTrigger, timesInWindow } from "./scheduler";
import type { Note } from "../model/score";

const notes: Note[] = [
  { midi: 60, start: 0.0, duration: 0.5, velocity: 0.7, hand: "right" },
  { midi: 62, start: 0.5, duration: 0.5, velocity: 0.7, hand: "right" },
  { midi: 64, start: 1.0, duration: 0.5, velocity: 0.7, hand: "right" },
];

describe("notesToTrigger", () => {
  it("returns notes whose start is in (prev, cur]", () => {
    expect(notesToTrigger(notes, 0.4, 0.6).map((n) => n.midi)).toEqual([62]);
  });

  it("includes a note starting exactly at cur, excludes one exactly at prev", () => {
    expect(notesToTrigger(notes, 0.0, 0.5).map((n) => n.midi)).toEqual([62]);
  });

  it("returns nothing when the clock does not advance", () => {
    expect(notesToTrigger(notes, 1.0, 1.0)).toEqual([]);
    expect(notesToTrigger(notes, 1.0, 0.5)).toEqual([]);
  });

  it("can return several notes in a wide window", () => {
    expect(notesToTrigger(notes, -0.1, 1.0).map((n) => n.midi)).toEqual([
      60, 62, 64,
    ]);
  });
});

describe("timesInWindow", () => {
  it("returns sorted times in (prev, cur]", () => {
    expect(timesInWindow([0, 0.5, 1, 1.5], 0.25, 1.0)).toEqual([0.5, 1]);
  });

  it("returns nothing when prev >= cur", () => {
    expect(timesInWindow([0, 1, 2], 2, 1)).toEqual([]);
  });
});
