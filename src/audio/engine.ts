import type { Transport } from "../transport/transport";
import { notesToTrigger } from "./scheduler";
import { Metronome } from "./metronome";

/** Plays piano notes. Real implementation uses a Tone.js sampler. */
export interface PianoSink {
  playNote(midi: number, durationSeconds: number, velocity: number): void;
}

/** Plays metronome clicks. Real implementation uses a Tone.js synth. */
export interface ClickSink {
  playClick(accent: boolean): void;
}

/** Largest clock advance (seconds) still treated as normal playback; a bigger
 *  jump is a seek and must not trigger every note in between. The Clock does
 *  not flag seeks, so the engine infers them from the size of the advance:
 *  a render frame (even a slow one, or a catch-up tick) advances well under
 *  a measure, whereas a seek lands an arbitrary distance away. */
const SEEK_THRESHOLD = 2.0;

/**
 * Drives audio output from the transport clock. Call `update()` once per frame,
 * after the clock has been ticked. Pure wiring — the two sinks do the sound.
 */
export class AudioEngine {
  readonly metronome: Metronome;
  private prevPosition: number;
  private wasPlaying = false;

  constructor(
    private readonly transport: Transport,
    private readonly piano: PianoSink,
    private readonly click: ClickSink,
  ) {
    this.metronome = new Metronome(transport.score);
    this.prevPosition = transport.clock.position;
    this.metronome.onClick((_t, accent) => this.click.playClick(accent));
  }

  /** Trigger notes and metronome clicks for the clock advance since last call. */
  update(): void {
    const cur = this.transport.clock.position;
    const prev = this.prevPosition;
    const playing = this.transport.clock.playing;
    const advance = cur - prev;

    // Backward or large jumps are seeks, not playback: resync silently.
    if (advance <= 0 || advance > SEEK_THRESHOLD) {
      this.prevPosition = cur;
      this.wasPlaying = playing;
      return;
    }

    const notes = this.transport.score.notes;
    for (const note of notesToTrigger(notes, prev, cur)) {
      this.piano.playNote(note.midi, note.duration, note.velocity);
    }
    // notesToTrigger's window is half-open (prev, cur]; on the first frame after
    // playback starts, also fire any note sitting exactly on the start point so
    // the very first note of a piece (or a seek target) is not skipped.
    if (playing && !this.wasPlaying) {
      for (const note of notes) {
        if (note.start === prev) {
          this.piano.playNote(note.midi, note.duration, note.velocity);
        }
      }
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
