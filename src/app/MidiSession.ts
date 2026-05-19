import type { Clock } from "../transport/clock";
import type { Score, Hand } from "../model/score";
import type { AudioEngine } from "../audio/engine";
import type { FalldownRenderer } from "../falldown/renderer";
import type { HandState } from "../practice/hands";
import { MidiInput, type MidiNoteEvent } from "../midi/MidiInput";
import { KeyboardInput } from "../midi/KeyboardInput";
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
  readonly liveNotes = new LiveNotes();

  /** Fired when the MIDI device status or device list changes. */
  onStatusChange: (() => void) | null = null;

  private readonly controller: WaitModeController;
  private audioEngine: AudioEngine | null = null;
  private falldown: FalldownRenderer | null = null;

  private handsIPlay: Set<Hand> = new Set<Hand>(["right"]);
  private waitEnabled = true;
  private monitorOn = true;
  private active = false;
  private midiStarted = false;

  constructor(
    clock: Clock,
    private readonly score: Score,
    private readonly handState: HandState,
  ) {
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

    // Input monitor: sound the player's own notes when enabled.
    this.liveNotes.onPressed = (n) => {
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
      if (!this.midiStarted) {
        this.midiStarted = true;
        void this.midiInput.start();
      }
      // The MIDI tab plays the chosen hand(s) live, so mute them in the app.
      this.applyHandMutes();
    } else {
      this.keyboardInput.disable();
      // Release any audio voices before dropping the held-notes map so that
      // piano voices attacked while the tab was showing are not stuck on.
      for (const n of this.liveNotes.heldNotes()) {
        if (this.monitorOn && this.audioEngine) {
          this.audioEngine.releaseInputNote(n.pitch);
        }
      }
      // Drop stale held notes so they do not leak across a tab switch.
      this.liveNotes.clear();
      // Clear the MIDI-imposed hand mutes so the play tab is never left with a
      // hand silenced (the play tab owns its own mute state).
      for (const hand of HANDS) this.handState.setMuted(hand, false);
    }
    this.syncController();
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
    this.controller.dispose();
    // Release any audio voices so disposal does not leave stuck voices.
    for (const n of this.liveNotes.heldNotes()) {
      if (this.monitorOn && this.audioEngine) {
        this.audioEngine.releaseInputNote(n.pitch);
      }
    }
    this.liveNotes.clear();
    // Null the callbacks so closures over this session are not retained.
    this.liveNotes.onPressed = null;
    this.liveNotes.onReleased = null;
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
