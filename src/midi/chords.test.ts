import { describe, it, expect } from "vitest";
import { buildSteps } from "./chords";
import type { Note } from "../model/score";

function note(midi: number, start: number, hand: "left" | "right"): Note {
  return { midi, start, duration: 1, velocity: 0.8, hand };
}

describe("buildSteps", () => {
  it("groups near-simultaneous notes into one step", () => {
    const notes = [
      note(60, 0, "right"),
      note(64, 0.02, "right"),
      note(67, 0.03, "right"),
      note(72, 1.0, "right"),
    ];
    const steps = buildSteps(notes, new Set(["right"]));
    expect(steps).toHaveLength(2);
    expect([...steps[0].requiredPitches].sort((a, b) => a - b)).toEqual([
      60, 64, 67,
    ]);
    expect(steps[0].time).toBe(0);
    expect([...steps[1].requiredPitches]).toEqual([72]);
  });

  it("filters to the chosen hand(s)", () => {
    const notes = [note(60, 0, "right"), note(48, 0, "left")];
    const steps = buildSteps(notes, new Set(["right"]));
    expect(steps).toHaveLength(1);
    expect([...steps[0].requiredPitches]).toEqual([60]);
  });

  it("includes both hands when both are chosen", () => {
    const notes = [note(60, 0, "right"), note(48, 0.01, "left")];
    const steps = buildSteps(notes, new Set(["left", "right"]));
    expect(steps).toHaveLength(1);
    expect([...steps[0].requiredPitches].sort((a, b) => a - b)).toEqual([
      48, 60,
    ]);
  });
});
