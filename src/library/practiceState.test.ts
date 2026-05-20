import { describe, it, expect } from "vitest";
import { capturePracticeState, applyPracticeState } from "./practiceState";
import { seedTabSnapshots } from "./practiceState";
import { Transport } from "../transport/transport";
import { HandState } from "../practice/hands";
import type { Score } from "../model/score";
import { TAB_MODES } from "../layout/practiceMode";

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
  sections: [],
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
    hands.setVisibility("right", "hide");
    const state = capturePracticeState(t, hands);
    expect(state.bpm).toBeCloseTo(90, 3);
    expect(state.loop).toEqual({ start: 1, end: 3 });
    expect(state.leftMuted).toBe(true);
    expect(state.rightMuted).toBe(false);
    expect(state.rightVisibility).toBe("hide");
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
        leftVisibility: "hide",
        rightVisibility: "show",
      },
      t,
      hands,
    );
    expect(t.bpm).toBeCloseTo(75, 3);
    expect(t.clock.loop).toEqual({ start: 2, end: 4 });
    expect(hands.isMuted("right")).toBe(true);
    expect(hands.visibility("left")).toBe("hide");
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

  it("reads legacy leftHidden/rightHidden booleans", () => {
    const t = new Transport(score);
    const hands = new HandState();
    applyPracticeState(
      {
        bpm: 80,
        loop: null,
        leftMuted: false,
        rightMuted: false,
        leftHidden: true,
        rightHidden: false,
      },
      t,
      hands,
    );
    expect(hands.visibility("left")).toBe("hide");
    expect(hands.visibility("right")).toBe("show");
  });
});

describe("practice-mode persistence", () => {
  it("round-trips mode", () => {
    const t = new Transport(score);
    const hands = new HandState();
    const captured = capturePracticeState(t, hands, undefined, {
      mode: "midi",
    });
    expect(captured.mode).toBe("midi");
    expect(TAB_MODES).toContain(captured.mode);
  });

  it("omits mode when not given", () => {
    const t = new Transport(score);
    const hands = new HandState();
    const captured = capturePracticeState(t, hands);
    expect(captured.mode).toBeUndefined();
  });
});

describe("per-tab transport snapshots", () => {
  it("capturePracticeState records both tabs when given the tabs argument", () => {
    const t = new Transport(score);
    const hands = new HandState();
    const captured = capturePracticeState(t, hands, undefined, {
      mode: "midi",
      tabs: {
        play: { bpm: 120, loop: null },
        midi: { bpm: 80, loop: { start: 1, end: 3 } },
      },
    });
    expect(captured.tabs).toEqual({
      play: { bpm: 120, loop: null },
      midi: { bpm: 80, loop: { start: 1, end: 3 } },
    });
  });

  it("capturePracticeState omits tabs when the tabs argument is not given", () => {
    const t = new Transport(score);
    const hands = new HandState();
    expect(capturePracticeState(t, hands, undefined, { mode: "play" }).tabs)
      .toBeUndefined();
  });

  it("seedTabSnapshots returns the stored per-tab state", () => {
    const t = new Transport(score);
    const seeded = seedTabSnapshots(t, {
      bpm: 120,
      loop: null,
      leftMuted: false,
      rightMuted: false,
      tabs: {
        play: { bpm: 110, loop: null },
        midi: { bpm: 70, loop: { start: 2, end: 4 } },
      },
    });
    expect(seeded.play).toEqual({ position: 0, bpm: 110, loop: null });
    expect(seeded.midi).toEqual({
      position: 0,
      bpm: 70,
      loop: { start: 2, end: 4 },
    });
  });

  it("seedTabSnapshots falls back to the live transport for records with no tabs", () => {
    const t = new Transport(score);
    t.setBpm(95);
    t.clock.seek(1.5);
    const seeded = seedTabSnapshots(t, null);
    expect(seeded.play.bpm).toBeCloseTo(95, 3);
    expect(seeded.midi.bpm).toBeCloseTo(95, 3);
    expect(seeded.play.position).toBe(1.5);
    expect(seeded.midi.position).toBe(1.5);
  });
});
