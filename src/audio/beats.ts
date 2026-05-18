/** The metric grid: a bar of `numerator` beats, each beat a `denominator`-note,
 *  each beat split into `subdivision` ticks. */
export interface BeatGridSpec {
  numerator: number;
  denominator: number;
  subdivision: number;
}

/** One position on the metric grid. */
export interface MetronomeBeat {
  /** Time in seconds from the start of the piece. */
  time: number;
  /** True on the first beat of a bar (the downbeat). */
  accent: boolean;
  /** True on a counted beat (not an in-between subdivision tick). */
  mainBeat: boolean;
}

/**
 * A perfectly regular metric grid from t=0 through `durationSeconds`.
 * beatLen = (60 / bpm) * (4 / denominator) seconds; a bar is `numerator` beats;
 * each beat is divided into `subdivision` ticks.
 */
export function metronomeBeats(
  spec: BeatGridSpec,
  bpm: number,
  durationSeconds: number,
): MetronomeBeat[] {
  const numerator = Math.max(1, Math.floor(spec.numerator));
  const denominator = Math.max(1, Math.floor(spec.denominator));
  const subdivision = Math.max(1, Math.floor(spec.subdivision));

  const beatLen = (60 / bpm) * (4 / denominator);
  const tick = beatLen / subdivision;

  const beats: MetronomeBeat[] = [];
  for (let k = 0; k * tick <= durationSeconds + 1e-9; k++) {
    const time = k * tick;
    const mainBeat = k % subdivision === 0;
    const accent = mainBeat && (k / subdivision) % numerator === 0;
    beats.push({ time, accent, mainBeat });
  }
  return beats;
}
