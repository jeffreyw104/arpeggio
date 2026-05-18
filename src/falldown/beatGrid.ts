import { metronomeBeats } from "../audio/beats";
import type { Measure } from "../model/score";

export interface BeatGridConfig {
  hitLineY: number;
  pixelsPerSecond: number;
}

/** A horizontal beat-grid line. `downbeat` marks the first beat of a measure. */
export interface BeatLine {
  y: number;
  downbeat: boolean;
}

/**
 * Y positions of every beat line visible in the falldown at clock time `t`,
 * derived from the score's measures so downbeats land exactly on the actual
 * barlines. A beat at time `b` sits at `y = hitLineY - (b - t) *
 * pixelsPerSecond`; lines outside `[0, hitLineY]` are dropped. A line is a
 * `downbeat` when it is a measure start.
 */
export function beatGridLines(
  measures: Measure[],
  beatsPerBar: number,
  t: number,
  config: BeatGridConfig,
): BeatLine[] {
  const beats = metronomeBeats(measures, beatsPerBar, 1);
  const lines: BeatLine[] = [];
  for (const beat of beats) {
    const y = config.hitLineY - (beat.time - t) * config.pixelsPerSecond;
    if (y < 0 || y > config.hitLineY) continue;
    lines.push({ y, downbeat: beat.accent });
  }
  return lines;
}
