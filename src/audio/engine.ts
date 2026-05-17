import type { Transport } from "../transport/transport";
import { notesToTrigger } from "./scheduler";
import { Metronome } from "./metronome";
import { type HandFilter, NO_HAND_FILTER } from "../practice/hands";

/** Plays piano notes. Real implementation uses a Tone.js sampler. */
export interface PianoSink {
  playNote(midi: number, durationSeconds: number, velocity: number): void;
}

/** Plays metronome clicks. Real implementation uses a Tone.js synth. */
export interface ClickSink {
  playClick(accent: boolean): void;
}

/**
 * Drives audio output from the transport clock. Call `update()` once per frame,
 * after the clock has been ticked. Pure wiring — the two sinks do the sound.
 *
 * Discontinuities are deterministic, not guessed: the engine no longer infers
 * seeks from the size of the position jump. The Clock tells it about seeks
 * (`onSeek`) and loop wraps (`onLoop`); both trigger a `resync()` so playback
 * never bursts every note between an old and new position.
 *
 * The render loop (a later feature) is responsible for clamping the per-frame
 * `dt` it passes to `clock.tick()`, so a backgrounded tab resuming does not
 * produce one enormous tick that the engine would treat as ordinary playback.
 */
export class AudioEngine {
  readonly metronome: Metronome;
  handState: HandFilter = NO_HAND_FILTER;
  private prevPosition: number;
  private wasPlaying = false;
  private firePrevBoundary = false;

  constructor(
    private readonly transport: Transport,
    private readonly piano: PianoSink,
    private readonly click: ClickSink,
  ) {
    this.metronome = new Metronome(transport.score);
    this.prevPosition = transport.clock.position;
    this.metronome.onClick((_t, accent) => this.click.playClick(accent));
    this.transport.clock.onSeek(() => this.resync());
    this.transport.clock.onLoop(() => this.resync());
  }

  /** Re-anchor to the clock's current position after a seek or loop wrap. */
  private resync(): void {
    this.prevPosition = this.transport.clock.position;
    this.firePrevBoundary = true;
    this.metronome.resync();
  }

  /** Trigger notes and metronome clicks for the clock advance since last call. */
  update(): void {
    const cur = this.transport.clock.position;
    const prev = this.prevPosition;
    const playing = this.transport.clock.playing;
    const advance = cur - prev;

    // No forward advance: paused, or the loop-wrap frame where the clock
    // jumped back. The wrap was already handled by onLoop -> resync.
    if (advance <= 0) {
      this.prevPosition = cur;
      this.wasPlaying = playing;
      return;
    }

    const notes = this.transport.score.notes;
    for (const note of notesToTrigger(notes, prev, cur)) {
      if (!this.handState.isMuted(note.hand)) {
        this.piano.playNote(note.midi, note.duration, note.velocity);
      }
    }
    // notesToTrigger's window is half-open (prev, cur]; a note sitting exactly
    // on `prev` would be missed. Fire it when `prev` is a play-start, seek
    // target, or loop start.
    if (this.firePrevBoundary || (playing && !this.wasPlaying)) {
      for (const note of notes) {
        if (note.start === prev && !this.handState.isMuted(note.hand)) {
          this.piano.playNote(note.midi, note.duration, note.velocity);
        }
      }
      this.firePrevBoundary = false;
    }
    this.metronome.update(prev, cur);

    this.prevPosition = cur;
    this.wasPlaying = playing;
  }
}

/**
 * Build an AudioEngine wired to real Tone.js output: a sampled acoustic piano
 * and a click synth. Tone.js is imported dynamically so test code never loads
 * an AudioContext. The audio context is suspended until `Tone.start()` is
 * called from a user gesture (the UI layer does that).
 */
export async function createAudioEngine(
  transport: Transport,
): Promise<AudioEngine> {
  const Tone = await import("tone");

  // Sampled acoustic piano — Salamander grand, the Tone.js reference sample set.
  const sampler = new Tone.Sampler({
    urls: {
      A0: "A0.mp3", C1: "C1.mp3", "D#1": "Ds1.mp3", "F#1": "Fs1.mp3",
      A1: "A1.mp3", C2: "C2.mp3", "D#2": "Ds2.mp3", "F#2": "Fs2.mp3",
      A2: "A2.mp3", C3: "C3.mp3", "D#3": "Ds3.mp3", "F#3": "Fs3.mp3",
      A3: "A3.mp3", C4: "C4.mp3", "D#4": "Ds4.mp3", "F#4": "Fs4.mp3",
      A4: "A4.mp3", C5: "C5.mp3", "D#5": "Ds5.mp3", "F#5": "Fs5.mp3",
      A5: "A5.mp3", C6: "C6.mp3", "D#6": "Ds6.mp3", "F#6": "Fs6.mp3",
      A6: "A6.mp3", C7: "C7.mp3", "D#7": "Ds7.mp3", "F#7": "Fs7.mp3",
      A7: "A7.mp3", C8: "C8.mp3",
    },
    baseUrl: "https://tonejs.github.io/audio/salamander/",
  }).toDestination();

  // Click: a short pitched blip; accented beats sound higher.
  const clickSynth = new Tone.MembraneSynth({
    volume: -6,
    envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.02 },
  }).toDestination();

  const piano: PianoSink = {
    playNote(midi, durationSeconds, velocity) {
      sampler.triggerAttackRelease(
        Tone.Frequency(midi, "midi").toNote(),
        Math.max(durationSeconds, 0.05),
        undefined,
        velocity,
      );
    },
  };
  const click: ClickSink = {
    playClick(accent) {
      clickSynth.triggerAttackRelease(accent ? "C5" : "C4", 0.05);
    },
  };

  return new AudioEngine(transport, piano, click);
}

/**
 * Resume the Web Audio context. Browsers keep it suspended until a user
 * gesture, so the UI calls this from the play-button click handler.
 */
export async function startAudioContext(): Promise<void> {
  const Tone = await import("tone");
  await Tone.start();
}
