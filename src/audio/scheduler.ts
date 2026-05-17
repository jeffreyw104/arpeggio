import type { Note } from "../model/score";

/**
 * Notes whose onset falls in the half-open window (prevPosition, curPosition].
 * Empty when the clock did not advance forward. The caller resyncs on seek and
 * loop discontinuities, so this is only ever passed a normal playback advance.
 */
export function notesToTrigger(
  notes: Note[],
  prevPosition: number,
  curPosition: number,
): Note[] {
  if (curPosition <= prevPosition) return [];
  return notes.filter((n) => n.start > prevPosition && n.start <= curPosition);
}

/** Sorted subset of `times` lying in the half-open window (prev, cur]. */
export function timesInWindow(
  times: number[],
  prevPosition: number,
  curPosition: number,
): number[] {
  if (curPosition <= prevPosition) return [];
  return times
    .filter((t) => t > prevPosition && t <= curPosition)
    .sort((a, b) => a - b);
}
