import type { Score } from "../model/score";
import type { TimemapEntry } from "./verovio";

/**
 * Index of the measure containing clock time `seconds`. Clamps to the first
 * measure before the piece starts and the last measure after it ends.
 */
export function currentMeasureIndex(score: Score, seconds: number): number {
  const measures = score.measures;
  if (measures.length === 0) return 0;
  for (let i = 0; i < measures.length; i++) {
    if (seconds < measures[i].end) return Math.max(0, i);
  }
  return measures.length - 1;
}

/** The [start, end] seconds of a measure index, clamped to valid indices. */
export function measureRange(
  score: Score,
  index: number,
): { start: number; end: number } {
  const measures = score.measures;
  const i = Math.min(Math.max(index, 0), measures.length - 1);
  return { start: measures[i].start, end: measures[i].end };
}

/**
 * The set of Verovio element IDs sounding at `ms`. Walks the timemap in order,
 * adding each entry's `on` IDs and removing its `off` IDs, for every entry with
 * `tstamp <= ms`.
 */
export function notesAtTime(timemap: TimemapEntry[], ms: number): Set<string> {
  const sounding = new Set<string>();
  for (const entry of timemap) {
    if (entry.tstamp > ms) break;
    for (const id of entry.off ?? []) sounding.delete(id);
    for (const id of entry.on ?? []) sounding.add(id);
  }
  return sounding;
}
