import { metronomeBeats } from "./beats";
import type { Score } from "../model/score";

/** A metronome click listener: receives the beat time and whether it's accented. */
export type ClickListener = (time: number, accent: boolean) => void;

/** Tolerance (seconds) for matching a beat time to a measure start. */
const ACCENT_EPSILON = 1e-6;

/** Linear pulse decay time (seconds) after a beat. */
const PULSE_DECAY = 0.15;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Tracks which metronome beats have been crossed as the clock advances. Drives
 * clicks via registered listeners and exposes a 0-1 `pulse` for a visual cue.
 * Pure logic — the actual click sound is wired by the AudioEngine.
 */
export class Metronome {
  /** Whether the metronome fires clicks. */
  enabled = false;

  private readonly score: Score;
  private subdivisionValue = 1;
  private beatTimes: number[] = [];
  private accentSet = new Set<number>();
  private readonly listeners = new Set<ClickListener>();
  private curPosition = 0;
  private lastBeatTime: number | null = null;
  /** Largest beat time already fired; prevents double-counting at boundaries. */
  private lastFiredTime = -Infinity;

  constructor(score: Score) {
    this.score = score;
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

  /** Recompute cached beat times and accent set for the current subdivision. */
  private recompute(): void {
    this.beatTimes = metronomeBeats(this.score, this.subdivisionValue);
    this.accentSet = new Set();
    for (const t of this.beatTimes) {
      const accented = this.score.measures.some(
        (m) => Math.abs(m.start - t) <= ACCENT_EPSILON,
      );
      if (accented) this.accentSet.add(t);
    }
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
      const crossed = this.beatTimes
        .filter(
          (t) =>
            t >= prevPosition && t <= curPosition && t > this.lastFiredTime,
        )
        .sort((a, b) => a - b);
      for (const t of crossed) {
        const accent = this.accentSet.has(t);
        for (const listener of this.listeners) listener(t, accent);
        this.lastFiredTime = t;
      }
    }

    this.curPosition = curPosition;
    let last: number | null = null;
    for (const t of this.beatTimes) {
      if (t <= curPosition && (last === null || t > last)) last = t;
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
