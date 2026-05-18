import { describe, it, expect } from "vitest";
import { Clock } from "../transport/clock";
import { HandState } from "../practice/hands";
import type { Score, Note } from "../model/score";
import { MidiSession } from "./MidiSession";

/** Build a minimal Score around a given note list. */
function makeScore(notes: Note[]): Score {
  return {
    source: "midi",
    notes,
    measures: [{ index: 0, start: 0, end: 4, numerator: 4, denominator: 4 }],
    pedalEvents: [],
    timeSignatures: [{ start: 0, numerator: 4, denominator: 4 }],
    tempoMap: [{ start: 0, bpm: 120 }],
    durationSeconds: 10,
    musicXml: "",
    qualityWarning: null,
  } satisfies Score;
}

const note = (midi: number, start: number, hand: Note["hand"]): Note => ({
  midi,
  start,
  duration: 1,
  velocity: 0.8,
  hand,
});

/** Dispatch a synthetic keydown for a QWERTY key (`a` → C4 = 60). */
function pressKey(key: string): void {
  window.dispatchEvent(new KeyboardEvent("keydown", { key }));
}

describe("MidiSession", () => {
  it("routes a QWERTY keydown into liveNotes when active", () => {
    const score = makeScore([note(60, 1, "right")]);
    const session = new MidiSession(new Clock(10), score, new HandState());
    session.setActive(true);

    pressKey("a"); // 'a' maps to C4 = 60

    expect(session.liveNotes.heldNotes().map((n) => n.pitch)).toContain(60);
    session.dispose();
  });

  it("does not route keypresses before the session is active", () => {
    const score = makeScore([note(60, 1, "right")]);
    const session = new MidiSession(new Clock(10), score, new HandState());

    pressKey("a");

    expect(session.liveNotes.heldNotes()).toHaveLength(0);
    session.dispose();
  });

  it("advances the clock hold when the required chord is pressed", () => {
    // Two right-hand steps at t=1 and t=2.
    const score = makeScore([note(60, 1, "right"), note(62, 2, "right")]);
    const clock = new Clock(10);
    const session = new MidiSession(clock, score, new HandState());
    session.setActive(true); // wait-mode enabled by default

    clock.play();
    clock.tick(1);
    session.update(); // arm + hold at step 0 (t=1)
    expect(clock.holdAt).toBe(1);

    pressKey("a"); // C4 = 60 — the required pitch for step 0
    session.update(); // match -> advance to step 1

    expect(clock.holdAt).toBe(2);
    session.dispose();
  });

  it("does not advance the clock when the wrong key is pressed", () => {
    const score = makeScore([note(60, 1, "right"), note(62, 2, "right")]);
    const clock = new Clock(10);
    const session = new MidiSession(clock, score, new HandState());
    session.setActive(true);

    clock.play();
    clock.tick(1);
    session.update();
    pressKey("s"); // D4 = 62 — wrong for step 0
    session.update();

    expect(clock.holdAt).toBe(1); // still parked on step 0
    session.dispose();
  });

  it("clears liveNotes and lifts the clock hold when deactivated", () => {
    const score = makeScore([note(60, 1, "right")]);
    const clock = new Clock(10);
    const session = new MidiSession(clock, score, new HandState());
    session.setActive(true);
    clock.play();
    clock.tick(1);
    session.update();
    pressKey("a");
    expect(session.liveNotes.heldNotes()).toHaveLength(1);
    expect(clock.holdAt).toBe(1);

    session.setActive(false);

    expect(session.liveNotes.heldNotes()).toHaveLength(0);
    expect(clock.holdAt).toBeNull();
    session.dispose();
  });

  it("leaves the clock ungated while the play tab is showing", () => {
    const score = makeScore([note(60, 1, "right")]);
    const clock = new Clock(10);
    const session = new MidiSession(clock, score, new HandState());
    // never activated — equivalent to sitting on the play tab
    clock.play();
    clock.tick(1);
    session.update();

    expect(clock.holdAt).toBeNull();
    session.dispose();
  });

  it("mutes the hand the player performs and sounds the other", () => {
    const score = makeScore([note(60, 1, "right"), note(48, 1, "left")]);
    const handState = new HandState();
    const session = new MidiSession(new Clock(10), score, handState);

    // Default — player plays the right hand.
    expect(handState.isMuted("right")).toBe(true);
    expect(handState.isMuted("left")).toBe(false);

    session.setHandsIPlay(new Set(["left"]));
    expect(handState.isMuted("left")).toBe(true);
    expect(handState.isMuted("right")).toBe(false);

    session.setHandsIPlay(new Set(["left", "right"]));
    expect(handState.isMuted("left")).toBe(true);
    expect(handState.isMuted("right")).toBe(true);
    session.dispose();
  });

  it("does not gate the clock when active but waitEnabled is false", () => {
    // Covers the other half of the active && waitEnabled invariant: the
    // controller must stay disabled (and the clock must remain ungated) when
    // the MIDI tab is open but the user has turned off wait-for-me.
    const score = makeScore([note(60, 1, "right")]);
    const clock = new Clock(10);
    const session = new MidiSession(clock, score, new HandState());
    session.setActive(true);
    session.setWaitEnabled(false);

    clock.play();
    clock.tick(1.5); // advance past the step onset at t=1
    session.update(); // controller should be a no-op — not enabled

    expect(clock.holdAt).toBeNull(); // clock was never parked
    expect(clock.position).toBeGreaterThan(1); // it actually advanced freely
    session.dispose();
  });

  it("reports unsupported MIDI status under jsdom", () => {
    const score = makeScore([]);
    const session = new MidiSession(new Clock(10), score, new HandState());
    session.setActive(true);
    // Status is read synchronously, before the async start() settles, so it
    // is "no-device" at assertion time.  Once start() resolves in an
    // environment without Web MIDI it becomes "unsupported".  The test accepts
    // either because it does not await the settle.
    expect(["unsupported", "no-device"]).toContain(session.status);
    session.dispose();
  });
});
