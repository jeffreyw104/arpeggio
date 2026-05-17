/** Configures a gradual loop speed-up. Rates are clock playback-rate multipliers. */
export interface SpeedUpConfig {
  /** Rate for the first loop pass (e.g. 0.5 = half speed). */
  startRate: number;
  /** Rate to ramp up to (e.g. 1 = full speed). */
  targetRate: number;
  /** Increment added to the rate after each completed loop pass. */
  step: number;
}

/**
 * Ramps a playback rate from startRate to targetRate, one `step` per loop pass.
 * The owner calls advance() each time the clock completes a loop.
 */
export class SpeedUp {
  private _rate: number;

  constructor(private readonly config: SpeedUpConfig) {
    this._rate = config.startRate;
  }

  get rate(): number {
    return this._rate;
  }

  get done(): boolean {
    return this._rate >= this.config.targetRate;
  }

  /** Advance one loop pass: raise the rate by `step`, clamped to the target. */
  advance(): void {
    this._rate = Math.min(this._rate + this.config.step, this.config.targetRate);
  }

  /** Restore the rate to the configured start. */
  reset(): void {
    this._rate = this.config.startRate;
  }
}
