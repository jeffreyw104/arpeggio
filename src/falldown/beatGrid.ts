import { metronomeBeats } from "../audio/beats";

export interface BeatGridConfig {
  hitLineY: number;
  pixelsPerSecond: number;
}

/** A horizontal beat-grid line. `downbeat` marks the first beat of a bar. */
export interface BeatLine {
  y: number;
  downbeat: boolean;
}

/**
 * Y positions of every beat line visible in the falldown at clock time `t`,
 * for a regular grid of `numerator`/`denominator` beats at `bpm`. A beat at
 * time `b` sits at `y = hitLineY - (b - t) * pixelsPerSecond`; lines outside
 * `[0, hitLineY]` are dropped. A line is a `downbeat` when it is a bar start.
 */
export function beatGridLines(
  numerator: number,
  denominator: number,
  bpm: number,
  durationSeconds: number,
  t: number,
  config: BeatGridConfig,
): BeatLine[] {
  const beats = metronomeBeats(
    { numerator, denominator, subdivision: 1 },
    bpm,
    durationSeconds,
  );
  const lines: BeatLine[] = [];
  for (const beat of beats) {
    const y = config.hitLineY - (beat.time - t) * config.pixelsPerSecond;
    if (y < 0 || y > config.hitLineY) continue;
    lines.push({ y, downbeat: beat.accent });
  }
  return lines;
}
