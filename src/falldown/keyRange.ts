import type { Score } from "../model/score";

/** An inclusive MIDI key range. */
export interface KeyRange {
  low: number;
  high: number;
}

/** The full 88-key piano: A0 (21) to C8 (108). */
export const FULL_88: KeyRange = { low: 21, high: 108 };

const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);

function isBlack(midi: number): boolean {
  return BLACK_PITCH_CLASSES.has(((midi % 12) + 12) % 12);
}

/**
 * The key range a score actually uses — the lowest to highest note, with each
 * bound widened outward to the nearest white key so the keyboard begins and
 * ends cleanly. An empty score falls back to a one-octave middle range.
 */
export function autoFitRange(score: Score): KeyRange {
  if (score.notes.length === 0) return { low: 60, high: 72 };
  let low = Math.min(...score.notes.map((n) => n.midi));
  let high = Math.max(...score.notes.map((n) => n.midi));
  while (isBlack(low) && low > 0) low--;
  while (isBlack(high) && high < 127) high++;
  return { low, high };
}
