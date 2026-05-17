import type { Score } from "../model/score";
import { metronomeBeats } from "../audio/beats";

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
 * Y positions of every beat line visible in the falldown area at clock time
 * `t`. A beat at time `b` sits at `y = hitLineY - (b - t) * pixelsPerSecond`;
 * lines outside `[0, hitLineY]` are dropped. A line is a `downbeat` when its
 * time coincides with a measure start.
 */
export function beatGridLines(
  score: Score,
  t: number,
  config: BeatGridConfig,
): BeatLine[] {
  const beats = metronomeBeats(score, 1);
  const measureStarts = new Set(score.measures.map((m) => m.start));
  const lines: BeatLine[] = [];
  for (const b of beats) {
    const y = config.hitLineY - (b - t) * config.pixelsPerSecond;
    if (y < 0 || y > config.hitLineY) continue;
    const downbeat = [...measureStarts].some((s) => Math.abs(s - b) < 1e-6);
    lines.push({ y, downbeat });
  }
  return lines;
}
