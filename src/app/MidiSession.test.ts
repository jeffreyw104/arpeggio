import { describe, it, expect, vi } from "vitest";
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

/** Minimal setup helper that allows injecting an optional startAudio mock. */
function setupSession(opts: { startAudio?: () => Promise<void> } = {}) {
  const score = makeScore([note(60, 1, "right")]);
  const session = new MidiSession(
    new Clock(10),
    score,
    new HandState(),
    opts.startAudio,
  );
  return { session };
}

describe("MidiSession", () => {
  it("routes a QWERTY keydown into liveNotes when active", () => {
    const score = makeScore([note(60, 1, "right")]);
    const session = new MidiSession(new Clock(10), score, new HandState());
    session.setActive(true);

    pressKey("z"); // 'z' maps to C4 = 60 (2-octave FL layout)

    expect(session.liveNotes.heldNotes().map((n) => n.pitch)).toContain(60);
    session.dispose();
  });

  it("does not route keypresses before the session is active", () => {
    const score = makeScore([note(60, 1, "right")]);
    const session = new MidiSession(new Clock(10), score, new HandState());

    pressKey("z");

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

    pressKey("z"); // C4 = 60 (z in 2-octave FL layout)
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
    pressKey("x"); // D4 = 62 (x in 2-octave FL layout) — wrong for step 0
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
    pressKey("z");
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

    // Before the MIDI tab is shown, no hand mutes are applied — the play tab
    // owns its own mute state.
    expect(handState.isMuted("right")).toBe(false);
    expect(handState.isMuted("left")).toBe(false);

    // Activating the MIDI tab applies the mute for the played hand (right).
    session.setActive(true);
    expect(handState.isMuted("right")).toBe(true);
    expect(handState.isMuted("left")).toBe(false);

    session.setHandsIPlay(new Set(["left"]));
    expect(handState.isMuted("left")).toBe(true);
    expect(handState.isMuted("right")).toBe(false);

    session.setHandsIPlay(new Set(["left", "right"]));
    expect(handState.isMuted("left")).toBe(true);
    expect(handState.isMuted("right")).toBe(true);

    // Leaving the MIDI tab restores the user's own mutes (here: none).
    session.setActive(false);
    expect(handState.isMuted("right")).toBe(false);
    expect(handState.isMuted("left")).toBe(false);
    session.dispose();
  });

  it("restores the user's own hand mutes when the MIDI tab is left", () => {
    const score = makeScore([note(60, 1, "right"), note(48, 1, "left")]);
    const handState = new HandState();
    // The user muted the left hand on the Play tab.
    handState.setMuted("left", true);
    const session = new MidiSession(new Clock(10), score, handState);

    // Entering the MIDI tab overlays its own auto-mutes (plays right → right
    // muted, left sounded), discarding the user's choice for the duration.
    session.setActive(true);
    expect(handState.isMuted("left")).toBe(false);
    expect(handState.isMuted("right")).toBe(true);

    // Leaving the MIDI tab restores exactly what the user had.
    session.setActive(false);
    expect(handState.isMuted("left")).toBe(true);
    expect(handState.isMuted("right")).toBe(false);
    session.dispose();
  });

  it("restores the user's own hand mutes on dispose while still active", () => {
    const score = makeScore([note(60, 1, "right")]);
    const handState = new HandState();
    handState.setMuted("right", true);
    const session = new MidiSession(new Clock(10), score, handState);
    session.setActive(true);

    // Disposing without first leaving the tab must still restore the user's
    // mutes, so the transient MIDI auto-mutes are never persisted.
    session.dispose();
    expect(handState.isMuted("right")).toBe(true);
    expect(handState.isMuted("left")).toBe(false);
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

  it("lights every held note as 'held' on update()", () => {
    const score = makeScore([note(60, 1, "right"), note(64, 2, "right")]);
    const session = new MidiSession(new Clock(10), score, new HandState());
    const falldown = {
      inputHighlights: new Map<number, "correct" | "wrong" | "held">(),
      pedalDown: false,
    };
    session.attachFalldown(falldown as never);

    session.liveNotes.press(60, 0.7, performance.now());
    session.liveNotes.press(64, 0.7, performance.now());
    session.update();

    expect(falldown.inputHighlights.get(60)).toBe("held");
    expect(falldown.inputHighlights.get(64)).toBe("held");
    session.dispose();
  });

  it("wait-mode accepted/blocking results override 'held' for those pitches", () => {
    const score = makeScore([note(60, 1, "right"), note(64, 2, "right")]);
    const session = new MidiSession(new Clock(10), score, new HandState());
    const falldown = {
      inputHighlights: new Map<number, "correct" | "wrong" | "held">(),
      pedalDown: false,
    };
    session.attachFalldown(falldown as never);

    session.liveNotes.press(60, 0.7, performance.now());
    session.liveNotes.press(64, 0.7, performance.now());
    vi.spyOn(session["controller"], "result", "get").mockReturnValue({
      state: "wrong" as const,
      accepted: [60],
      blocking: [64],
    });
    session.update();

    expect(falldown.inputHighlights.get(60)).toBe("correct");
    expect(falldown.inputHighlights.get(64)).toBe("wrong");
    session.dispose();
  });

  it("resumes the audio context on the first live-input note", async () => {
    const startAudio = vi.fn().mockResolvedValue(undefined);
    const { session } = setupSession({ startAudio });
    expect(startAudio).not.toHaveBeenCalled();
    session.liveNotes.press(60, 0.7, performance.now());
    await Promise.resolve(); // flush the void-promise
    expect(startAudio).toHaveBeenCalledTimes(1);
    session.dispose();
  });

  it("only resumes the audio context once across many live-input notes", async () => {
    const startAudio = vi.fn().mockResolvedValue(undefined);
    const { session } = setupSession({ startAudio });
    session.liveNotes.press(60, 0.7, performance.now());
    session.liveNotes.press(64, 0.7, performance.now());
    session.liveNotes.press(67, 0.7, performance.now());
    await Promise.resolve();
    expect(startAudio).toHaveBeenCalledTimes(1);
    session.dispose();
  });

  it("resets the audio-start latch when startAudio rejects so the next press retries", async () => {
    const startAudio = vi.fn()
      .mockRejectedValueOnce(new Error("user gesture refused"))
      .mockResolvedValueOnce(undefined);
    const { session } = setupSession({ startAudio });
    session.liveNotes.press(60, 0.7, performance.now());
    await Promise.resolve(); // let the rejection settle
    await Promise.resolve(); // .catch() handler runs on a later tick
    expect(startAudio).toHaveBeenCalledTimes(1);
    session.liveNotes.press(64, 0.7, performance.now());
    await Promise.resolve();
    expect(startAudio).toHaveBeenCalledTimes(2); // retry happened
  });

  it("routes pointerInput note-on into liveNotes", () => {
    const { session } = setupSession();
    session.pointerInput.onNoteOn?.({
      pitch: 60,
      velocity: 0.7,
      pressTime: performance.now(),
    });
    expect(session.liveNotes.heldNotes().some((n) => n.pitch === 60)).toBe(true);
  });

  it("setScore rebuilds wait-mode steps in the new time space", () => {
    // Regression: a tempo-mode toggle swaps the transport's score for a
    // re-timed one. Before this fix, MidiSession kept the original score
    // and its wait-mode steps stayed at old onset seconds — practice mode
    // parked the clock at stale points and effectively froze.
    const oldScore = makeScore([note(60, 1, "right")]);
    const newScore = makeScore([note(60, 3, "right")]);
    const clock = new Clock(10);
    const session = new MidiSession(clock, oldScore, new HandState());
    session.setActive(true);

    // Old time space: stepping past t=1 arms the hold at t=1.
    clock.play();
    clock.tick(1);
    session.update();
    expect(clock.holdAt).toBe(1);

    // Swap to the new score; the same single note now lives at t=3.
    session.setScore(newScore);
    session.update();
    // resyncToPosition() (called by setSteps) re-finds the first step at
    // or after the current clock position; clock is at 1, step at 3, so
    // the hold moves to 3.
    expect(clock.holdAt).toBe(3);

    session.dispose();
  });

  it("attachPointerInput defers actual attach until the MIDI tab is active", () => {
    const { session } = setupSession();
    const canvas = document.createElement("canvas");
    const attachSpy = vi.spyOn(session.pointerInput, "attach");
    const detachSpy = vi.spyOn(session.pointerInput, "detach");

    // Before setActive(true): attachPointerInput remembers the canvas but doesn't attach.
    session.attachPointerInput(canvas);
    expect(attachSpy).not.toHaveBeenCalled();

    // Activate -> attach happens with the remembered canvas.
    session.setActive(true);
    expect(attachSpy).toHaveBeenCalledWith(canvas);

    // Deactivate -> detach happens.
    session.setActive(false);
    expect(detachSpy).toHaveBeenCalled();
  });
});
