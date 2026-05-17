import type { Score } from "../model/score";
import { Clock } from "./clock";
import { measureLoop } from "./loop";
import { SpeedUp, type SpeedUpConfig } from "./speedUp";
import { applyTempoMode, averageBpm, type TempoMode } from "./tempoMap";

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

  /** Switch preserve/flatten; rebuilds the score from the original import. */
  setTempoMode(mode: TempoMode): void {
    this._tempoMode = mode;
    this._score = applyTempoMode(this._baseScore, mode);
    const pos = this.clock.position;
    this.clock.seek(Math.min(pos, this._score.durationSeconds));
  }
}
