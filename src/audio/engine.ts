import type { Transport } from "../transport/transport";
import type { Score } from "../model/score";
import { notesToTrigger } from "./scheduler";
import { Metronome } from "./metronome";
import { type HandFilter, NO_HAND_FILTER } from "../practice/hands";

/** A selectable metronome click sound. */
export type MetronomeSound = "click" | "woodblock" | "beep" | "hitick";

/** All metronome sounds, with display labels, in menu order. */
export const METRONOME_SOUNDS: ReadonlyArray<{
  value: MetronomeSound;
  label: string;
}> = [
  { value: "click", label: "Click" },
  { value: "woodblock", label: "Woodblock" },
  { value: "beep", label: "Beep" },
  { value: "hitick", label: "Hi-tick" },
];

/** Plays piano notes. Real implementation uses a Tone.js sampler. */
export interface PianoSink {
  playNote(midi: number, durationSeconds: number, velocity: number): void;
  /** Begin a sustained note (live input). */
  attackNote(midi: number, velocity: number): void;
  /** End a sustained note (live input). */
  releaseNote(midi: number): void;
}

/** Plays metronome clicks. Real implementation uses Tone.js synths. */
export interface ClickSink {
  /** The currently selected click sound. */
  sound: MetronomeSound;
  playClick(accent: boolean): void;
}

/** Controls the master output level. Real implementation drives Tone's
 *  destination volume. */
export interface OutputSink {
  /** Set the master volume, 0 (silent) to 1 (full). */
  setVolume(level: number): void;
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
  /** The score the metronome is currently gridded to; tracks tempo-mode swaps. */
  private score: Score;
  /** When wait-mode parks the clock at a step.time and the clock arrives at
   *  that position, any notes starting AT the hold (other-hand chord tones,
   *  cross-hand voices etc.) are postponed instead of firing on arrival —
   *  otherwise the computer's side of the chord sounds first and the user's
   *  matching press lands a beat late. Stored as the score-time of the
   *  postponed onset; cleared on seek/loop and on the next update when the
   *  hold lifts. */
  private deferredAt: number | null = null;

  constructor(
    private readonly transport: Transport,
    private readonly piano: PianoSink,
    private readonly click: ClickSink,
    private readonly output: OutputSink | null = null,
  ) {
    this.metronome = new Metronome(transport.score);
    this.score = transport.score;
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
    // Any notes we were postponing for a wait-mode hold are stale after a
    // jump — the clock's new position has nothing to do with the old hold.
    this.deferredAt = null;
  }

  /** Trigger notes and metronome clicks for the clock advance since last call. */
  update(): void {
    // A tempo-mode toggle replaces the transport's score with a re-timed one.
    // The metronome caches its beat grid, so re-grid it onto the new measures.
    const score = this.transport.score;
    if (score !== this.score) {
      this.score = score;
      this.metronome.setScore(score);
    }

    const cur = this.transport.clock.position;
    const prev = this.prevPosition;
    const playing = this.transport.clock.playing;
    const advance = cur - prev;
    const holdAt = this.transport.clock.holdAt;
    const notes = this.transport.score.notes;

    // If we postponed any notes at a previous hold and the hold has just
    // moved on (the user matched the step, or wait-mode was disabled), fire
    // the postponed onset now so the other-hand voices sound together with
    // the player's chord rather than ahead of it.
    if (this.deferredAt !== null && holdAt !== this.deferredAt) {
      const at = this.deferredAt;
      this.deferredAt = null;
      for (const note of notes) {
        if (note.start === at && !this.handState.isMuted(note.hand)) {
          this.piano.playNote(note.midi, note.duration, note.velocity);
        }
      }
    }

    // Free-run metronome must tick even while wait-mode parks the clock
    // (advance == 0), so drive it BEFORE the no-advance early-out. The
    // score-locked path needs prev/cur and is driven below.
    if (this.metronome.freeRun) {
      this.metronome.updateFree(this.transport.bpm, performance.now());
    }

    // No forward advance: paused, or the loop-wrap frame where the clock
    // jumped back. The wrap was already handled by onLoop -> resync.
    if (advance <= 0) {
      this.prevPosition = cur;
      this.wasPlaying = playing;
      return;
    }

    for (const note of notesToTrigger(notes, prev, cur)) {
      // Postpone notes landing exactly on an active hold — they'll fire when
      // the wait-mode controller releases the hold (i.e. the player matched).
      if (holdAt !== null && note.start === holdAt) {
        this.deferredAt = holdAt;
        continue;
      }
      if (!this.handState.isMuted(note.hand)) {
        this.piano.playNote(note.midi, note.duration, note.velocity);
      }
    }
    // notesToTrigger's window is half-open (prev, cur]; a note sitting exactly
    // on `prev` would be missed. Fire it when `prev` is a play-start, seek
    // target, or loop start.
    if (this.firePrevBoundary || (playing && !this.wasPlaying)) {
      for (const note of notes) {
        if (note.start !== prev) continue;
        if (holdAt !== null && note.start === holdAt) {
          this.deferredAt = holdAt;
          continue;
        }
        if (!this.handState.isMuted(note.hand)) {
          this.piano.playNote(note.midi, note.duration, note.velocity);
        }
      }
      this.firePrevBoundary = false;
    }
    // Score-locked metronome runs after the note triggers; the free-run path
    // already ran above, before the no-advance early-out.
    if (!this.metronome.freeRun) {
      this.metronome.update(prev, cur);
    }

    this.prevPosition = cur;
    this.wasPlaying = playing;
  }

  /** The selected metronome click sound. */
  get metronomeSound(): MetronomeSound {
    return this.click.sound;
  }
  set metronomeSound(sound: MetronomeSound) {
    this.click.sound = sound;
  }

  /** Play a single metronome click immediately. Used by the count-in. */
  playClick(accent: boolean): void {
    this.click.playClick(accent);
  }

  /** Sound a live-input note press through the piano. */
  playInputNote(midi: number, velocity: number): void {
    this.piano.attackNote(midi, velocity);
  }

  /** End a live-input note. */
  releaseInputNote(midi: number): void {
    this.piano.releaseNote(midi);
  }

  /** Set the master output volume, 0 (silent) to 1 (full). */
  setVolume(level: number): void {
    this.output?.setVolume(level);
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

  // Four metronome voices, all synthesised (no sample assets).
  const clickVoice = new Tone.MembraneSynth({
    volume: -6,
    envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.02 },
  }).toDestination();
  const woodVoice = new Tone.MembraneSynth({
    volume: -3,
    octaves: 1.5,
    pitchDecay: 0.008,
    envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.01 },
  }).toDestination();
  const beepVoice = new Tone.Synth({
    volume: -12,
    oscillator: { type: "triangle" },
    envelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.02 },
  }).toDestination();
  const tickFilter = new Tone.Filter(3500, "highpass").toDestination();
  const tickVoice = new Tone.NoiseSynth({
    volume: -4,
    noise: { type: "white" },
    envelope: { attack: 0.001, decay: 0.018, sustain: 0, release: 0.01 },
  }).connect(tickFilter);

  const piano: PianoSink = {
    playNote(midi, durationSeconds, velocity) {
      // The Salamander samples stream from a CDN; until every buffer has
      // loaded, triggerAttackRelease throws "buffer is either not set or not
      // loaded". Skip silently rather than let the throw escape into the
      // per-frame AudioEngine.update() call.
      if (!sampler.loaded) return;
      sampler.triggerAttackRelease(
        Tone.Frequency(midi, "midi").toNote(),
        Math.max(durationSeconds, 0.05),
        undefined,
        velocity,
      );
    },
    attackNote(midi, velocity) {
      if (!sampler.loaded) return;
      sampler.triggerAttack(
        Tone.Frequency(midi, "midi").toNote(),
        undefined,
        velocity,
      );
    },
    releaseNote(midi) {
      if (!sampler.loaded) return;
      sampler.triggerRelease(Tone.Frequency(midi, "midi").toNote());
    },
  };
  const click: ClickSink = {
    sound: "woodblock",
    playClick(accent) {
      switch (this.sound) {
        case "woodblock":
          woodVoice.triggerAttackRelease(accent ? "C6" : "G5", 0.03);
          break;
        case "beep":
          beepVoice.triggerAttackRelease(accent ? "E6" : "C6", 0.05);
          break;
        case "hitick":
          tickVoice.triggerAttackRelease(accent ? 0.035 : 0.018);
          break;
        case "click":
        default:
          clickVoice.triggerAttackRelease(accent ? "C5" : "C4", 0.05);
          break;
      }
    },
  };

  // Master output level — drives Tone's destination volume in decibels.
  const output: OutputSink = {
    setVolume(level) {
      Tone.getDestination().volume.value =
        level <= 0 ? -Infinity : Tone.gainToDb(level);
    },
  };

  return new AudioEngine(transport, piano, click, output);
}

/**
 * Resume the Web Audio context. Browsers keep it suspended until a user
 * gesture, so the UI calls this from the play-button click handler.
 */
export async function startAudioContext(): Promise<void> {
  const Tone = await import("tone");
  await Tone.start();
}
