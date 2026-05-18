import { metronomeBeats, type MetronomeBeat } from "./beats";
import type { Measure, Score } from "../model/score";

/** A metronome click listener: receives the beat time and whether it's accented. */
export type ClickListener = (time: number, accent: boolean) => void;

/** Linear pulse decay time (seconds) after a beat. */
const PULSE_DECAY = 0.15;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Tracks which metronome beats have been crossed as the clock advances. Drives
 * clicks via registered listeners and exposes a 0-1 `pulse` for a visual cue.
 * The beat grid is phase-locked to `score.measures`: each measure's span is
 * split into `beatsPerBar` beats, so downbeats land exactly on the barlines.
 * Pure logic — the actual click sound is wired by the AudioEngine.
 */
export class Metronome {
  /** Whether the metronome fires clicks. */
  enabled = false;

  /**
   * Whether the first beat of a measure reports `accent: true` (a distinct
   * downbeat sound). OFF by default — all clicks sound the same.
   */
  accentDownbeat = false;

  private measures: Measure[];
  private beatsPerBar: number;
  private subdivisionValue: number;
  /** Kept only so the `timeSignature` getter can report it; not used for timing. */
  private denominator: number;
  private beats: MetronomeBeat[] = [];
  private readonly listeners = new Set<ClickListener>();
  private curPosition = 0;
  private lastBeatTime: number | null = null;
  /** Largest beat time already fired; prevents double-counting at boundaries. */
  private lastFiredTime = -Infinity;

  constructor(score: Score) {
    const ts = score.timeSignatures[0];
    this.measures = score.measures;
    this.beatsPerBar = ts?.numerator ?? 4;
    this.denominator = ts?.denominator ?? 4;
    this.subdivisionValue = 1;
    this.recompute();
  }

  /** Beat subdivision: 1 = on the beat, 2 = eighths, 4 = sixteenths. */
  get subdivision(): number {
    return this.subdivisionValue;
  }

  set subdivision(value: number) {
    this.subdivisionValue = Math.max(1, Math.floor(value));
    this.recompute();
  }

  /** The current time signature (counted beats per bar). */
  get timeSignature(): { numerator: number; denominator: number } {
    return { numerator: this.beatsPerBar, denominator: this.denominator };
  }

  /** Set the time signature, recompute the grid, and re-align immediately. */
  setTimeSignature(numerator: number, denominator: number): void {
    this.beatsPerBar = numerator;
    this.denominator = denominator;
    this.recompute();
    this.resync();
  }

  /**
   * Swap to a new score and re-grid. A tempo-mode toggle replaces the
   * transport's score with one whose measures sit at different second-times;
   * without this the metronome would keep clicking at the old measure times.
   * The current beats-per-bar and subdivision are kept.
   */
  setScore(score: Score): void {
    this.measures = score.measures;
    this.recompute();
  }

  /** Recompute the cached beat grid for the current settings. */
  private recompute(): void {
    this.beats = metronomeBeats(
      this.measures,
      this.beatsPerBar,
      this.subdivisionValue,
    );
  }

  /**
   * Advance the clock from `prevPosition` to `curPosition`. Fires a click for
   * each beat crossed (when enabled) and updates the pulse state.
   */
  update(prevPosition: number, curPosition: number): void {
    if (this.enabled && curPosition >= prevPosition) {
      // Beats in [prevPosition, curPosition] not already fired. A closed lower
      // bound catches a beat sitting exactly on prevPosition; lastFiredTime
      // guards against firing the same beat twice across consecutive calls.
      const crossed = this.beats
        .filter(
          (b) =>
            b.time >= prevPosition &&
            b.time <= curPosition &&
            b.time > this.lastFiredTime,
        )
        .sort((a, b) => a.time - b.time);
      for (const beat of crossed) {
        const accent = beat.accent && this.accentDownbeat;
        for (const listener of this.listeners) listener(beat.time, accent);
        this.lastFiredTime = beat.time;
      }
    }

    this.curPosition = curPosition;
    let last: number | null = null;
    for (const beat of this.beats) {
      if (
        beat.mainBeat &&
        beat.time <= curPosition &&
        (last === null || beat.time > last)
      ) {
        last = beat.time;
      }
    }
    if (last !== null) this.lastBeatTime = last;
  }

  /** A 0-1 visual pulse: 1 right after a beat, decaying linearly over 150 ms. */
  get pulse(): number {
    if (this.lastBeatTime === null) return 0;
    const elapsed = this.curPosition - this.lastBeatTime;
    return 1 - clamp(elapsed / PULSE_DECAY, 0, 1);
  }

  /**
   * Reset the high-water mark so beats can fire again after a loop wrap or
   * seek. Leaves `lastBeatTime` alone so the visual pulse keeps working.
   */
  resync(): void {
    this.lastFiredTime = -Infinity;
  }

  /** Register a click listener; returns an unsubscribe function. */
  onClick(fn: ClickListener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
}
