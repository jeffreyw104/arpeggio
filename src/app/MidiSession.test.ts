import { describe, it, expect, vi } from "vitest";
import { Clock } from "../transport/clock";
import { HandState } from "../practice/hands";
import type { Score, Note } from "../model/score";
import { MidiSession } from "./MidiSession";
import type { AudioEngine } from "../audio/engine";

/** A duck-typed audio engine that records playInputNote / releaseInputNote
 *  calls. Cast through `unknown` because the real AudioEngine has many more
 *  fields the input-monitor path doesn't touch. */
function makeMockAudio() {
  return {
    playInputNote: vi.fn(),
    releaseInputNote: vi.fn(),
  };
}
function asEngine(mock: ReturnType<typeof makeMockAudio>): AudioEngine {
  return mock as unknown as AudioEngine;
}

/** Pin a session's MIDI status — jsdom can never reach "connected" on its
 *  own. Used by tests that exercise the MIDI-connected mute / echo gating. */
function pinMidiStatus(session: MidiSession, status: "connected" | "no-device"): void {
  Object.defineProperty(session.midiInput, "status", {
    get: () => status,
    configurable: true,
  });
}

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

  it("mutes the played hand on score playback when MIDI is connected", () => {
    // Right selected → only left plays; Left selected → only right plays;
    // Both selected → silence; none selected → full score plays.
    const score = makeScore([note(60, 1, "right"), note(48, 1, "left")]);
    const handState = new HandState();
    const session = new MidiSession(new Clock(10), score, handState);
    pinMidiStatus(session, "connected");

    // Before the MIDI tab is shown, no hand mutes are applied — the play tab
    // owns its own mute state.
    expect(handState.isMuted("right")).toBe(false);
    expect(handState.isMuted("left")).toBe(false);

    // Activating the MIDI tab with the default hand selection ({right})
    // mutes right, leaves left audible.
    session.setActive(true);
    expect(handState.isMuted("right")).toBe(true);
    expect(handState.isMuted("left")).toBe(false);

    session.setHandsIPlay(new Set(["left"]));
    expect(handState.isMuted("left")).toBe(true);
    expect(handState.isMuted("right")).toBe(false);

    session.setHandsIPlay(new Set(["left", "right"]));
    expect(handState.isMuted("left")).toBe(true);
    expect(handState.isMuted("right")).toBe(true);

    // Deselect every hand — the user is now listening, not playing.
    session.setHandsIPlay(new Set());
    expect(handState.isMuted("left")).toBe(false);
    expect(handState.isMuted("right")).toBe(false);

    // Leaving the MIDI tab restores the user's own mutes (here: none).
    session.setActive(false);
    expect(handState.isMuted("right")).toBe(false);
    expect(handState.isMuted("left")).toBe(false);
    session.dispose();
  });

  it("does NOT mute any hand when no MIDI device is connected", () => {
    // With no MIDI the computer is the only sound source; muting the played
    // hand would mean practising in partial silence.
    const score = makeScore([note(60, 1, "right"), note(48, 1, "left")]);
    const handState = new HandState();
    const session = new MidiSession(new Clock(10), score, handState);

    session.setActive(true);
    session.setHandsIPlay(new Set(["right"]));
    expect(handState.isMuted("right")).toBe(false);
    expect(handState.isMuted("left")).toBe(false);

    session.setHandsIPlay(new Set(["left", "right"]));
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
    pinMidiStatus(session, "connected");

    // Entering the MIDI tab overlays its own auto-mutes (default handsIPlay
    // = {right} mutes right, leaves left audible), discarding the user's
    // choice for the duration.
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
    pinMidiStatus(session, "connected");
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

  it("echoes input through playInputNote when monitor is on and no hand is being practised", () => {
    const score = makeScore([note(60, 1, "right")]);
    const audio = makeMockAudio();
    const session = new MidiSession(new Clock(10), score, new HandState());
    session.attachAudio(asEngine(audio));
    // Clear the constructor default ({right}) so no hand is being practised.
    session.setHandsIPlay(new Set());

    session.liveNotes.press(60, 0.8, 1000);
    expect(audio.playInputNote).toHaveBeenCalledWith(60, 0.8);
    session.dispose();
  });

  it("suppresses echo when the input matches a score note in the played hand (MIDI connected)", () => {
    // Two notes in the score at the SAME time: right-hand C5 (high pitch),
    // left-hand A5 (even higher — crossing into the right-hand range).
    // The middle-C heuristic would mis-classify A5 as right-hand and
    // mis-suppress; the score-based lookup correctly uses the actual hand
    // tags from the score.
    const score = makeScore([
      note(72, 1, "right"), // C5, right hand
      note(81, 1, "left"), // A5, left hand crossing high
    ]);
    const audio = makeMockAudio();
    const clock = new Clock(10);
    const session = new MidiSession(clock, score, new HandState());
    pinMidiStatus(session, "connected");
    session.attachAudio(asEngine(audio));
    session.setHandsIPlay(new Set(["right"]));
    clock.seek(1); // park the clock at the notes' onset

    // C5 is a right-hand note → user's piano covers, suppress.
    session.liveNotes.press(72, 0.8, 1000);
    expect(audio.playInputNote).not.toHaveBeenCalled();

    // A5 is a left-hand crossing note → the score says it's the computer's
    // side, so the user pressing it (a crossing-hand mistake, or curiosity)
    // still echoes.
    session.liveNotes.press(81, 0.8, 1001);
    expect(audio.playInputNote).toHaveBeenCalledWith(81, 0.8);
    session.dispose();
  });

  it("echoes off-script presses with no matching score note even when the played hand is selected", () => {
    // Pitch the user pressed has no score note nearby → it's a wrong note
    // the player wants to hear. Echo it so they get feedback.
    const score = makeScore([note(60, 1, "right")]);
    const audio = makeMockAudio();
    const clock = new Clock(10);
    const session = new MidiSession(clock, score, new HandState());
    pinMidiStatus(session, "connected");
    session.attachAudio(asEngine(audio));
    session.setHandsIPlay(new Set(["right"]));
    clock.seek(1);

    session.liveNotes.press(72, 0.8, 1000); // not in the score → echo
    expect(audio.playInputNote).toHaveBeenCalledWith(72, 0.8);
    session.dispose();
  });

  it("suppresses echo for both hands when the player practises both (MIDI connected)", () => {
    const score = makeScore([note(60, 1, "right"), note(48, 1, "left")]);
    const audio = makeMockAudio();
    const clock = new Clock(10);
    const session = new MidiSession(clock, score, new HandState());
    pinMidiStatus(session, "connected");
    session.attachAudio(asEngine(audio));
    session.setHandsIPlay(new Set(["left", "right"]));
    clock.seek(1);

    session.liveNotes.press(60, 0.8, 1000); // right, covered
    session.liveNotes.press(48, 0.8, 1001); // left, covered
    expect(audio.playInputNote).not.toHaveBeenCalled();
    session.dispose();
  });

  it("echoes every input when no MIDI device is connected, regardless of hand selection", () => {
    // With no MIDI, the computer is the only source — even pitches in the
    // hand the player practises must echo, otherwise QWERTY / on-screen
    // piano presses go silent.
    const audio = makeMockAudio();
    const session = new MidiSession(
      new Clock(10),
      makeScore([note(60, 1, "right")]),
      new HandState(),
    );
    session.attachAudio(asEngine(audio));
    session.setHandsIPlay(new Set(["right"]));

    session.liveNotes.press(60, 0.8, 1000); // even though it's a played-hand note
    expect(audio.playInputNote).toHaveBeenCalledWith(60, 0.8);
    session.dispose();
  });

  it("releases the input voice even after the monitor was toggled off mid-note", () => {
    // Bug 2 regression: with the old logic, the release branch was gated by
    // monitorOn — toggling monitor off while a note was held meant
    // triggerRelease never fired and the voice rang forever.
    const audio = makeMockAudio();
    const session = new MidiSession(
      new Clock(10),
      makeScore([]),
      new HandState(),
    );
    session.attachAudio(asEngine(audio));
    session.setHandsIPlay(new Set()); // echo unconditionally
    session.liveNotes.press(60, 0.8, 1000);
    expect(audio.playInputNote).toHaveBeenCalledWith(60, 0.8);

    session.setMonitorOn(false);
    // setMonitorOn(false) snaps the held voice silent immediately.
    expect(audio.releaseInputNote).toHaveBeenCalledWith(60);

    audio.releaseInputNote.mockClear();
    session.liveNotes.release(60);
    // Physical release lands a release call too (idempotent, but it must
    // always fire so a voice cannot leak past the toggle).
    expect(audio.releaseInputNote).toHaveBeenCalledWith(60);
    session.dispose();
  });

  it("releases voices whose hand becomes one being practised (MIDI connected)", () => {
    // The user is holding a right-hand input note with monitor on, no hand
    // selected (so it's echoing); they then switch to 'play right hand', so
    // the score-attributed note is now covered by the player and the echo
    // must be released.
    const score = makeScore([note(60, 1, "right")]);
    const audio = makeMockAudio();
    const clock = new Clock(10);
    const session = new MidiSession(clock, score, new HandState());
    pinMidiStatus(session, "connected");
    session.attachAudio(asEngine(audio));
    session.setHandsIPlay(new Set()); // start with no hand selected
    clock.seek(1);
    session.liveNotes.press(60, 0.8, 1000); // echoing — no hand to suppress
    expect(audio.playInputNote).toHaveBeenCalledWith(60, 0.8);

    session.setHandsIPlay(new Set(["right"]));
    expect(audio.releaseInputNote).toHaveBeenCalledWith(60);
    session.dispose();
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
