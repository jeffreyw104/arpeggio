import { describe, it, expect } from "vitest";
import { evaluateStep } from "./waitMode";
import type { PracticeStep } from "./chords";
import type { HeldNote } from "./LiveNotes";

const step: PracticeStep = {
  time: 1,
  requiredPitches: new Set([60, 64, 67]),
};

function held(pitch: number, pressTime: number): HeldNote {
  return { pitch, velocity: 0.8, pressTime };
}

describe("evaluateStep", () => {
  it("is pending when not all required pitches are down", () => {
    const r = evaluateStep(step, [held(60, 1000), held(64, 1010)], 900);
    expect(r.state).toBe("pending");
  });

  it("matches a chord pressed together", () => {
    const r = evaluateStep(
      step,
      [held(60, 1000), held(64, 1020), held(67, 1040)],
      900,
    );
    expect(r.state).toBe("matched");
  });

  it("is staggered when the chord is spread too wide", () => {
    const r = evaluateStep(
      step,
      [held(60, 1000), held(64, 1100), held(67, 1300)],
      900,
    );
    expect(r.state).toBe("staggered");
  });

  it("blocks on a wrong note pressed after arming", () => {
    const r = evaluateStep(
      step,
      [held(60, 1000), held(64, 1010), held(67, 1020), held(62, 1030)],
      900,
    );
    expect(r.state).toBe("wrong");
    expect(r.blocking).toEqual([62]);
  });

  it("ignores a note held over from before the step armed", () => {
    // 50 is not required and was pressed at 800, before armTime 900.
    const r = evaluateStep(
      step,
      [held(50, 800), held(60, 1000), held(64, 1010), held(67, 1020)],
      900,
    );
    expect(r.state).toBe("matched");
  });

  it("ignores a sustained (pedal-only) wrong note even when its pressTime is after armTime", () => {
    // 62 is not required; it was pressed *after* armTime (so the armTime
    // guard alone would flag it as blocking) but the key is no longer
    // physically held — the sustain pedal is the only reason it's still
    // ringing. The user shouldn't be punished for the resonance.
    const sustained: HeldNote = {
      pitch: 62,
      velocity: 0.7,
      pressTime: 1030,
      sustained: true,
    };
    const r = evaluateStep(
      step,
      [held(60, 1000), held(64, 1010), held(67, 1020), sustained],
      900,
    );
    expect(r.state).toBe("matched");
    expect(r.blocking).toEqual([]);
  });

  it("still accepts a sustained note that satisfies a required pitch", () => {
    // Arpeggiated chord with pedal down: the first two notes are sustained
    // (released physically, kept by pedal); the third is physically held.
    // All three should count toward the chord.
    const r = evaluateStep(
      step,
      [
        { pitch: 60, velocity: 0.8, pressTime: 1000, sustained: true },
        { pitch: 64, velocity: 0.8, pressTime: 1010, sustained: true },
        held(67, 1020),
      ],
      900,
    );
    expect(r.accepted.sort()).toEqual([60, 64, 67]);
  });
});
