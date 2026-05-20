import { describe, it, expect } from "vitest";
import { evaluateStep } from "./waitMode";
import type { PracticeStep } from "./chords";
import type { HeldNote } from "./LiveNotes";

const step: PracticeStep = {
  time: 1,
  requiredPitches: new Set([60, 64, 67]),
  sustainingPitches: new Set(),
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

  it("does not flag a re-press of a sustaining (tied-over) pitch as wrong", () => {
    // Tied / sustained scenario: a long note that started before this step
    // is still ringing here. The user happens to re-press it (a fresh
    // physical attack), but the score has that pitch carrying over — the
    // re-press should NOT count as a wrong extra.
    const tied: PracticeStep = {
      time: 1,
      requiredPitches: new Set([64, 67]),
      sustainingPitches: new Set([60]), // C is held over from before
    };
    const r = evaluateStep(
      tied,
      // 60 re-pressed AFTER armTime — without the sustaining-allow-list
      // it would be flagged as wrong.
      [held(60, 1020), held(64, 1000), held(67, 1010)],
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

  it("does not accept a pitch consumed by an earlier step", () => {
    // The same physical press matched a previous step. A subsequent step
    // requiring the same pitch must NOT auto-pass — the player needs to
    // release and re-press.
    const repeated: PracticeStep = {
      time: 2,
      requiredPitches: new Set([60]),
      sustainingPitches: new Set(),
    };
    const consumed = new Map([[60, 1000]]);
    const r = evaluateStep(repeated, [held(60, 1000)], 1500, consumed);
    expect(r.state).toBe("pending");
    expect(r.accepted).toEqual([]);
  });

  it("accepts a previously consumed pitch when the score has it as sustaining (tied over)", () => {
    // Score-tied: the same press legitimately carries through the notation,
    // so it still counts for the next step even though it's consumed.
    const tied: PracticeStep = {
      time: 2,
      requiredPitches: new Set([60, 64]),
      sustainingPitches: new Set([60]),
    };
    const consumed = new Map([[60, 1000]]);
    const r = evaluateStep(
      tied,
      [held(60, 1000), held(64, 1600)],
      1500,
      consumed,
    );
    expect(r.state).toBe("matched");
    expect(r.accepted.sort()).toEqual([60, 64]);
  });

  it("accepts a fresh re-press of a previously consumed pitch", () => {
    // Player released and re-pressed — the new pressTime differs from the
    // consumed entry so the press counts as fresh.
    const repeated: PracticeStep = {
      time: 2,
      requiredPitches: new Set([60]),
      sustainingPitches: new Set(),
    };
    const consumed = new Map([[60, 1000]]);
    const r = evaluateStep(repeated, [held(60, 1700)], 1500, consumed);
    expect(r.state).toBe("matched");
  });

  it("does not flag a tied carry-over as staggered when paired with a fresh press", () => {
    // Tied 60 with a much earlier pressTime; freshly pressed 64 starts the
    // new chord. The spread must only account for the fresh presses,
    // otherwise the tie would always stagger the step.
    const tied: PracticeStep = {
      time: 2,
      requiredPitches: new Set([60, 64]),
      sustainingPitches: new Set([60]),
    };
    const consumed = new Map([[60, 1000]]);
    const r = evaluateStep(
      tied,
      [held(60, 1000), held(64, 1600)],
      1500,
      consumed,
    );
    expect(r.state).toBe("matched");
  });
});
