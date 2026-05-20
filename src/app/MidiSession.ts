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
    clock: Clock,
    private readonly score: Score,
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
    this.midiInput.onStatusChange = () => this.onStatusChange?.();

    this.keyboardInput.onNoteOn = (e: MidiNoteEvent) =>
      this.liveNotes.press(e.pitch, e.velocity, e.pressTime);
    this.keyboardInput.onNoteOff = (e: MidiNoteEvent) =>
      this.liveNotes.release(e.pitch);

    this.pointerInput.onNoteOn = (e: MidiNoteEvent) =>
      this.liveNotes.press(e.pitch, e.velocity, e.pressTime);
    this.pointerInput.onNoteOff = (e: MidiNoteEvent) =>
      this.liveNotes.release(e.pitch);

    // Input monitor: sound the player's own notes when enabled.
    this.liveNotes.onPressed = (n) => {
      if (!this.audioStarted) {
        this.audioStarted = true;
        this.startAudio().catch(() => {
          this.audioStarted = false;
        });
      }
      if (this.monitorOn && this.audioEngine) {
        this.audioEngine.playInputNote(n.pitch, n.velocity);
      }
    };
    this.liveNotes.onReleased = (pitch) => {
      if (this.monitorOn && this.audioEngine) {
        this.audioEngine.releaseInputNote(pitch);
      }
    };
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
      if (!this.midiStarted) {
        this.midiStarted = true;
        void this.midiInput.start();
      }
      // Capture the user's own hand-mute state before overlaying the MIDI
      // auto-mutes, so leaving the tab can restore it exactly.
      if (this.savedMutes === null) {
        this.savedMutes = {
          left: this.handState.isMuted("left"),
          right: this.handState.isMuted("right"),
        };
      }
      // The MIDI tab plays the chosen hand(s) live, so mute them in the app.
      this.applyHandMutes();
    } else {
      this.keyboardInput.disable();
      this.pointerInput.detach();
      // Release any audio voices before dropping the held-notes map so that
      // piano voices attacked while the tab was showing are not stuck on.
      for (const n of this.liveNotes.heldNotes()) {
        if (this.monitorOn && this.audioEngine) {
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
    this.monitorOn = on;
  }

  /** Change which hand(s) the player performs; rebuilds steps and hand mutes. */
  setHandsIPlay(hands: ReadonlySet<Hand>): void {
    this.handsIPlay = new Set(hands);
    this.controller.setSteps(buildSteps(this.score.notes, this.handsIPlay));
    // Hand mutes only apply while the MIDI tab is active; on the play tab the
    // mutes stay under the user's own control.
    if (this.active) this.applyHandMutes();
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
    for (const n of this.liveNotes.heldNotes()) {
      if (this.monitorOn && this.audioEngine) {
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
   * Mute the hand(s) the player performs so the app sounds only the other
   * hand(s). A hand the player plays is muted; a hand they do not play sounds.
   */
  private applyHandMutes(): void {
    for (const hand of HANDS) {
      this.handState.setMuted(hand, this.handsIPlay.has(hand));
    }
  }
}
