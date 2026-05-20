import type { Score } from "../model/score";
import { Clock } from "./clock";
import { measureLoop } from "./loop";
import { SpeedUp, type SpeedUpConfig } from "./speedUp";
import {
  applyTempoMode,
  averageBpm,
  beatsToSeconds,
  secondsToBeats,
  type TempoMode,
} from "./tempoMap";

/**
 * The public playback API. Composes the master Clock with loop building,
 * absolute-BPM tempo, gradual speed-up, and the tempo-map mode. Later features
 * read `transport.clock` and `transport.score`.
 */
export class Transport {
  readonly clock: Clock;
  private _score: Score;
  private _baseScore: Score;
  private _tempoMode: TempoMode = "preserve";
  private _bpm: number;
  private _speedUp: SpeedUp | null = null;
  private offLoop: (() => void) | null = null;
  private readonly scoreListeners = new Set<(s: Score) => void>();

  constructor(score: Score, tempoMode: TempoMode = "preserve") {
    this._baseScore = score;
    this._score = applyTempoMode(score, tempoMode);
    this._tempoMode = tempoMode;
    this.clock = new Clock(this._score.durationSeconds);
    this._bpm = this.referenceBpm;
  }

  get score(): Score {
    return this._score;
  }

  /** The piece's own average tempo — the 1.0-rate reference. */
  get referenceBpm(): number {
    return averageBpm(this._score);
  }

  /** The current absolute playback tempo in BPM. */
  get bpm(): number {
    return this._bpm;
  }

  get tempoMode(): TempoMode {
    return this._tempoMode;
  }

  /** Whether gradual speed-up is currently running. */
  get speedUpActive(): boolean {
    return this._speedUp !== null;
  }

  /** Set the absolute playback tempo; translates to a clock rate. */
  setBpm(bpm: number): void {
    this._bpm = bpm;
    if (!this._speedUp) this.clock.setRate(bpm / this.referenceBpm);
  }

  /** Loop measures [first, last] inclusive. */
  loopMeasures(first: number, last: number): void {
    this.clock.setLoop(measureLoop(this._score, first, last));
  }

  clearLoop(): void {
    this.clock.setLoop(null);
  }

  /** Start ramping the clock rate up across loop passes. */
  enableSpeedUp(config: SpeedUpConfig): void {
    this._speedUp = new SpeedUp(config);
    this.clock.setRate(this._speedUp.rate);
    this.offLoop?.();
    this.offLoop = this.clock.onLoop(() => {
      this._speedUp?.advance();
      if (this._speedUp) this.clock.setRate(this._speedUp.rate);
    });
  }

  disableSpeedUp(): void {
    this._speedUp = null;
    this.offLoop?.();
    this.offLoop = null;
    this.clock.setRate(this._bpm / this.referenceBpm);
  }

  /**
   * Switch preserve/flatten; rebuilds the score from the original import.
   * The clock position AND any active loop are converted through musical
   * beats — invariant across tempo modes — so playback and the loop region
   * stay at the same musical point.
   */
  setTempoMode(mode: TempoMode): void {
    const oldScore = this._score;
    const oldPosition = this.clock.position;
    const oldLoop = this.clock.loop;
    const beats = secondsToBeats(oldScore.tempoMap, oldPosition);

    this._tempoMode = mode;
    this._score = applyTempoMode(this._baseScore, mode);

    const newPosition = beatsToSeconds(this._score.tempoMap, beats);
    this.clock.setDuration(this._score.durationSeconds);
    this.clock.seek(Math.min(newPosition, this._score.durationSeconds));

    if (oldLoop) {
      const startBeats = secondsToBeats(oldScore.tempoMap, oldLoop.start);
      const endBeats = secondsToBeats(oldScore.tempoMap, oldLoop.end);
      this.clock.setLoop({
        start: beatsToSeconds(this._score.tempoMap, startBeats),
        end: beatsToSeconds(this._score.tempoMap, endBeats),
      });
    }

    // Notify subscribers that the score reference has been swapped. Anything
    // that pre-built state from the old `score.notes` times (wait-mode steps,
    // metronome beat grid…) needs to rebuild against the new times.
    for (const fn of this.scoreListeners) fn(this._score);
  }

  /** Subscribe to score-reference swaps (e.g. tempo-mode toggle). Returns an
   *  unsubscribe function. The new score is in the same time space as the
   *  clock and any active loop at the time the listener fires. */
  onScoreChange(fn: (score: Score) => void): () => void {
    this.scoreListeners.add(fn);
    return () => {
      this.scoreListeners.delete(fn);
    };
  }
}
