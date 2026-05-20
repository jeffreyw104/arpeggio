import type { Clock } from "../transport/clock";
import type { Score, Hand } from "../model/score";
import type { AudioEngine } from "../audio/engine";
import { startAudioContext } from "../audio/engine";
import type { FalldownRenderer } from "../falldown/renderer";
import type { HandState } from "../practice/hands";
import { MidiInput, type MidiNoteEvent } from "../midi/MidiInput";
import { KeyboardInput } from "../midi/KeyboardInput";
import { PointerInput } from "../midi/PointerInput";
import { LiveNotes } from "../midi/LiveNotes";
import { buildSteps } from "../midi/chords";
import { WaitModeController } from "./WaitModeController";

/** Hands in a fixed order, for iterating mute state. */
const HANDS: readonly Hand[] = ["left", "right"];

/** Seconds of slack on either side of a score note's extent when deciding
 *  whether an input press is "covering" that note. Loose enough for
 *  comfortable early/late timing, tight enough that two different notes at
 *  the same pitch in close succession don't collide. */
const ECHO_LOOKUP_WINDOW_SEC = 0.5;

/**
 * Non-React controller that assembles the whole MIDI Practice session: the two
 * input sources (Web MIDI + QWERTY fallback), the live held-notes store, the
 * wait-mode controller, and the late-bound audio/falldown sinks.
 *
 * Lifecycle is driven by `setActive(isMidiTab)`: the wait-mode controller is
 * enabled ONLY when the MIDI tab is showing AND `waitEnabled` is true, so the
 * play tab is never gated by a clock hold.
 */
export class MidiSession {
  readonly midiInput = new MidiInput();
  readonly keyboardInput = new KeyboardInput();
  readonly pointerInput = new PointerInput((x, y) =>
    this.falldown?.pitchAt(x, y) ?? null,
  );
  readonly liveNotes = new LiveNotes();

  /** Fired when the MIDI device status or device list changes. */
  onStatusChange: (() => void) | null = null;

  private readonly controller: WaitModeController;
  private audioEngine: AudioEngine | null = null;
  private falldown: FalldownRenderer | null = null;
  private pointerCanvas: HTMLCanvasElement | null = null;

  private handsIPlay: Set<Hand> = new Set<Hand>(["right"]);
  private waitEnabled = true;
  private monitorOn = true;
  private active = false;
  private midiStarted = false;
  private audioStarted = false;
  private readonly startAudio: () => Promise<void>;

  /** The user's own hand-mute state, captured when the MIDI tab opens and
   *  restored when it closes — the MIDI auto-mutes are transient and must
   *  never leak onto the Play tab or into the saved practice state. */
  private savedMutes: Record<Hand, boolean> | null = null;

  constructor(
    private readonly clock: Clock,
    private score: Score,
    private readonly handState: HandState,
    startAudio: () => Promise<void> = startAudioContext,
  ) {
    this.startAudio = startAudio;
    this.controller = new WaitModeController(
      clock,
      buildSteps(score.notes, this.handsIPlay),
      this.liveNotes,
    );

    // Route both input sources into the single live-notes store.
    this.midiInput.onNoteOn = (e: MidiNoteEvent) =>
      this.liveNotes.press(e.pitch, e.velocity, e.pressTime);
    this.midiInput.onNoteOff = (e: MidiNoteEvent) =>
      this.liveNotes.release(e.pitch);
    this.midiInput.onPedal = (down: boolean) => this.liveNotes.setPedal(down);
    // A connect/disconnect changes both the mute gate and the echo gate.
    // Re-apply the hand mutes and snap any orphaned input voices silent so
    // the user doesn't end up with a key still ringing under the new rules.
    this.midiInput.onStatusChange = () => {
      if (this.active) {
        this.applyHandMutes();
        if (this.audioEngine) {
          for (const n of this.liveNotes.heldNotes()) {
            this.audioEngine.releaseInputNote(n.pitch);
          }
        }
      }
      this.onStatusChange?.();
    };

    this.keyboardInput.onNoteOn = (e: MidiNoteEvent) =>
      this.liveNotes.press(e.pitch, e.velocity, e.pressTime);
    this.keyboardInput.onNoteOff = (e: MidiNoteEvent) =>
      this.liveNotes.release(e.pitch);

    this.pointerInput.onNoteOn = (e: MidiNoteEvent) =>
      this.liveNotes.press(e.pitch, e.velocity, e.pressTime);
    this.pointerInput.onNoteOff = (e: MidiNoteEvent) =>
      this.liveNotes.release(e.pitch);

    // Input monitor: sound the player's own notes when enabled, EXCEPT for
    // the hand(s) the player has chosen to perform — their own piano already
    // covers those notes, so re-echoing them produces an audible double.
    // The audio-context resume runs regardless of the echo gate so later
    // score / metronome playback isn't gated on a user gesture.
    this.liveNotes.onPressed = (n) => {
      if (!this.audioStarted) {
        this.audioStarted = true;
        this.startAudio().catch(() => {
          this.audioStarted = false;
        });
      }
      if (this.shouldEcho(n.pitch) && this.audioEngine) {
        this.audioEngine.playInputNote(n.pitch, n.velocity);
      }
    };
    // Release is unconditional: a voice attacked under one echo-gate value
    // must still release if the gate flips before key-up, otherwise the note
    // rings forever. triggerRelease on a non-attacking pitch is a no-op.
    this.liveNotes.onReleased = (pitch) => {
      if (this.audioEngine) {
        this.audioEngine.releaseInputNote(pitch);
      }
    };
  }

  /** Whether an input note of `pitch` should echo through the audio engine.
   *  Off when the monitor is turned off. With no MIDI device connected the
   *  computer is the only sound source, so every press echoes. With MIDI
   *  connected, the score's actual hand attribution gates the echo: if the
   *  pitch matches a score note in the player's hand at the current time,
   *  the user's own piano is covering it and a software echo would just
   *  double the sound — suppress. Off-script presses, wrong notes, and
   *  crossing-hand notes whose score-hand isn't being practised all still
   *  echo so the player hears their input. */
  private shouldEcho(pitch: number): boolean {
    if (!this.monitorOn) return false;
    if (!this.isMidiConnected) return true;
    if (this.handsIPlay.size === 0) return true;
    return !this.pitchCoveredByPlayer(pitch);
  }

  /** True when there's a score note at this pitch in a hand the player is
   *  practising, currently active (within a generous early/late window).
   *  Replaces the old middle-C split — the score's own hand tags handle
   *  crossing-hand passages correctly. */
  private pitchCoveredByPlayer(pitch: number): boolean {
    const t = this.clock.position;
    const slack = ECHO_LOOKUP_WINDOW_SEC;
    for (const note of this.score.notes) {
      if (note.midi !== pitch) continue;
      if (!this.handsIPlay.has(note.hand)) continue;
      if (note.start - slack > t) continue;
      if (note.start + note.duration + slack < t) continue;
      return true;
    }
    return false;
  }

  /** Whether a hardware MIDI device is currently delivering input. The hand
   *  mutes and echo gate both depend on this — with no MIDI device the user
   *  is using the computer keyboard / on-screen piano, so the computer must
   *  remain the full sound source. */
  private get isMidiConnected(): boolean {
    return this.midiInput.status === "connected";
  }

  /** Register the status-change listener (PracticeView mirrors it to state). */
  setStatusListener(fn: () => void): void {
    this.onStatusChange = fn;
  }

  /** Late-bind the audio engine (created asynchronously in PracticeView). */
  attachAudio(engine: AudioEngine): void {
    this.audioEngine = engine;
  }

  /** Late-bind the falldown renderer (created in PracticeView's mount effect). */
  attachFalldown(falldown: FalldownRenderer): void {
    this.falldown = falldown;
  }

  /** Attach the pointer input to a canvas; defers the actual attach until
   *  the MIDI tab is active so pointer events are not captured on the Play tab. */
  attachPointerInput(canvas: HTMLCanvasElement): void {
    this.pointerCanvas = canvas;
    if (this.active) this.pointerInput.attach(canvas);
  }

  /** Detach the pointer input and forget the remembered canvas. */
  detachPointerInput(): void {
    this.pointerInput.detach();
    this.pointerCanvas = null;
  }

  /** The MIDI device connection status. */
  get status(): MidiInput["status"] {
    return this.midiInput.status;
  }

  /** The currently-enumerated MIDI input devices. */
  get devices(): MidiInput["devices"] {
    return this.midiInput.devices;
  }

  /** The id of the currently-listened device, if any. */
  get selectedDeviceId(): string | null {
    return this.midiInput.selectedDevice?.id ?? null;
  }

  /** Whether wait-for-me gating is requested by the user. */
  get isWaitEnabled(): boolean {
    return this.waitEnabled;
  }

  /** Whether the input monitor is sounding the player's notes. */
  get isMonitorOn(): boolean {
    return this.monitorOn;
  }

  /** The set of hands the player performs. */
  get hands(): ReadonlySet<Hand> {
    return this.handsIPlay;
  }

  /** Switch the session on/off as the MIDI tab is shown/hidden. */
  setActive(isMidiTab: boolean): void {
    this.active = isMidiTab;
    if (isMidiTab) {
      this.keyboardInput.enable();
      if (this.pointerCanvas) this.pointerInput.attach(this.pointerCanvas);
      // Capture the user's own hand-mute state before overlaying the MIDI
      // auto-mutes, so leaving the tab can restore it exactly. Done BEFORE
      // midiInput.start(), because in environments where Web MIDI resolves
      // synchronously (jsdom: setStatus("unsupported") returns immediately)
      // the onStatusChange handler would otherwise apply the auto-mutes
      // first and pollute the saved snapshot.
      if (this.savedMutes === null) {
        this.savedMutes = {
          left: this.handState.isMuted("left"),
          right: this.handState.isMuted("right"),
        };
      }
      if (!this.midiStarted) {
        this.midiStarted = true;
        void this.midiInput.start();
      }
      // The MIDI tab plays the chosen hand(s) live, so mute them in the app.
      this.applyHandMutes();
    } else {
      this.keyboardInput.disable();
      this.pointerInput.detach();
      // Release any audio voices before dropping the held-notes map so that
      // piano voices attacked while the tab was showing are not stuck on.
      // Unconditional — triggerRelease on a non-attacking pitch is a no-op.
      if (this.audioEngine) {
        for (const n of this.liveNotes.heldNotes()) {
          this.audioEngine.releaseInputNote(n.pitch);
        }
      }
      // Drop stale held notes so they do not leak across a tab switch.
      this.liveNotes.clear();
      // Restore the user's own hand-mute state — the MIDI auto-mutes were
      // transient; the play tab owns its mute state.
      this.restoreMutes();
    }
    this.syncController();
  }

  /** Restore the Play-tab hand-mute state captured when the MIDI tab opened. */
  private restoreMutes(): void {
    if (this.savedMutes === null) return;
    for (const hand of HANDS) {
      this.handState.setMuted(hand, this.savedMutes[hand]);
    }
    this.savedMutes = null;
  }

  setWaitEnabled(on: boolean): void {
    this.waitEnabled = on;
    this.syncController();
  }

  setMonitorOn(on: boolean): void {
    if (this.monitorOn === on) return;
    const wasEchoing = this.echoingPitches();
    this.monitorOn = on;
    this.releaseLostEchoes(wasEchoing);
  }

  /** Swap in a new score (e.g. after a tempo-mode toggle re-times the piece).
   *  Rebuilds the wait-mode steps so their onset times match the new score's
   *  time space — without this, wait-mode parks the clock at stale seconds. */
  setScore(score: Score): void {
    this.score = score;
    this.controller.setSteps(buildSteps(score.notes, this.handsIPlay));
  }

  /** Change which hand(s) the player performs; rebuilds steps and hand mutes. */
  setHandsIPlay(hands: ReadonlySet<Hand>): void {
    const wasEchoing = this.echoingPitches();
    this.handsIPlay = new Set(hands);
    this.controller.setSteps(buildSteps(this.score.notes, this.handsIPlay));
    // Hand mutes only apply while the MIDI tab is active; on the play tab the
    // mutes stay under the user's own control.
    if (this.active) this.applyHandMutes();
    // The hand change can flip a held note's echo from on to off (e.g. the
    // user selects "play right hand" while holding a right-hand input). Drop
    // those voices so the toggle takes effect immediately.
    this.releaseLostEchoes(wasEchoing);
  }

  /** Pitches of currently-held notes that are currently echoing. */
  private echoingPitches(): Set<number> {
    const set = new Set<number>();
    for (const n of this.liveNotes.heldNotes()) {
      if (this.shouldEcho(n.pitch)) set.add(n.pitch);
    }
    return set;
  }

  /** Release input voices that were echoing in the pre-change snapshot but
   *  shouldn't echo anymore — i.e. the echo gate JUST flipped to off for
   *  those pitches. Voices that were already silent stay silent. */
  private releaseLostEchoes(wasEchoing: Set<number>): void {
    const engine = this.audioEngine;
    if (!engine) return;
    for (const pitch of wasEchoing) {
      if (!this.shouldEcho(pitch)) engine.releaseInputNote(pitch);
    }
  }

  /** Listen to a specific MIDI device by id. */
  selectDevice(id: string): void {
    this.midiInput.select(id);
  }

  /**
   * Per-frame tick. Cheap to call regardless of active state — the controller
   * early-returns when disabled. Always refreshes the falldown key-lighting.
   */
  update(): void {
    this.controller.update();
    const falldown = this.falldown;
    if (!falldown) return;
    const highlights = falldown.inputHighlights;
    highlights.clear();
    // First, every key currently held gets the neutral 'held' colour — the
    // baseline "you pressed this" feedback applied regardless of input source.
    for (const note of this.liveNotes.heldNotes()) {
      highlights.set(note.pitch, "held");
    }
    // Then the wait-mode controller's verdict OVERWRITES the held entries for
    // the specific pitches it has an opinion about.
    const result = this.controller.result;
    if (result) {
      for (const pitch of result.accepted) highlights.set(pitch, "correct");
      for (const pitch of result.blocking) highlights.set(pitch, "wrong");
    }
    falldown.pedalDown = this.liveNotes.pedalDown;
  }

  dispose(): void {
    this.midiInput.dispose();
    this.keyboardInput.disable();
    this.pointerInput.detach();
    this.controller.dispose();
    // Restore the user's hand mutes so a dispose while the MIDI tab is showing
    // does not persist the transient MIDI auto-mutes.
    this.restoreMutes();
    // Release any audio voices so disposal does not leave stuck voices.
    if (this.audioEngine) {
      for (const n of this.liveNotes.heldNotes()) {
        this.audioEngine.releaseInputNote(n.pitch);
      }
    }
    this.liveNotes.clear();
    // NOTE: do NOT null out liveNotes.onPressed / onReleased here. React
    // StrictMode (dev) runs every effect cleanup in the middle of the
    // mount → unmount → re-mount cycle; nulling callbacks that were wired
    // in the constructor would leave them null after the re-mount, since
    // the constructor doesn't re-run. The session is reachable via React
    // state anyway, so closure-retention of `this` is moot.
  }

  /** The controller is enabled only on the MIDI tab with wait-mode requested. */
  private syncController(): void {
    this.controller.setEnabled(this.active && this.waitEnabled);
  }

  /**
   * Apply hand mutes for the MIDI Practice tab.
   * • No MIDI device → un-mute everything; the computer is the user's only
   *   sound source.
   * • MIDI connected, no hand selected → un-mute everything; the user is
   *   listening, not playing.
   * • MIDI connected, hand(s) selected → mute exactly the hand(s) the user
   *   is covering on their piano, so the computer plays only the OTHER
   *   hand. Selecting both hands mutes everything.
   */
  private applyHandMutes(): void {
    const midi = this.isMidiConnected;
    for (const hand of HANDS) {
      this.handState.setMuted(hand, midi && this.handsIPlay.has(hand));
    }
  }
}
