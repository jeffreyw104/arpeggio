import { describe, it, expect } from "vitest";
import { capturePracticeState, applyPracticeState } from "./practiceState";
import { Transport } from "../transport/transport";
import { HandState } from "../practice/hands";
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

describe("capturePracticeState", () => {
  it("captures tempo, loop, and hand settings", () => {
    const t = new Transport(score);
    t.setBpm(90);
    t.clock.setLoop({ start: 1, end: 3 });
    const hands = new HandState();
    hands.setMuted("left", true);
    hands.setHidden("right", true);
    const state = capturePracticeState(t, hands);
    expect(state.bpm).toBeCloseTo(90, 3);
    expect(state.loop).toEqual({ start: 1, end: 3 });
    expect(state.leftMuted).toBe(true);
    expect(state.rightMuted).toBe(false);
    expect(state.rightHidden).toBe(true);
  });

  it("includes beat settings when given the beat argument", () => {
    const t = new Transport(score);
    const hands = new HandState();
    const state = capturePracticeState(t, hands, {
      numerator: 6,
      denominator: 4,
      subdivision: 2,
    });
    expect(state.numerator).toBe(6);
    expect(state.denominator).toBe(4);
    expect(state.subdivision).toBe(2);
  });

  it("leaves beat settings undefined when the beat argument is omitted", () => {
    const t = new Transport(score);
    const hands = new HandState();
    const state = capturePracticeState(t, hands);
    expect(state.numerator).toBeUndefined();
    expect(state.denominator).toBeUndefined();
    expect(state.subdivision).toBeUndefined();
  });
});

describe("applyPracticeState", () => {
  it("restores tempo, loop, and hand settings", () => {
    const t = new Transport(score);
    const hands = new HandState();
    applyPracticeState(
      {
        bpm: 75,
        loop: { start: 2, end: 4 },
        leftMuted: false,
        rightMuted: true,
        leftHidden: true,
        rightHidden: false,
      },
      t,
      hands,
    );
    expect(t.bpm).toBeCloseTo(75, 3);
    expect(t.clock.loop).toEqual({ start: 2, end: 4 });
    expect(hands.isMuted("right")).toBe(true);
    expect(hands.isHidden("left")).toBe(true);
  });

  it("round-trips through capture", () => {
    const t = new Transport(score);
    t.setBpm(100);
    const hands = new HandState();
    hands.setMuted("right", true);
    const captured = capturePracticeState(t, hands);

    const t2 = new Transport(score);
    const hands2 = new HandState();
    applyPracticeState(captured, t2, hands2);
    expect(capturePracticeState(t2, hands2)).toEqual(captured);
  });
});
