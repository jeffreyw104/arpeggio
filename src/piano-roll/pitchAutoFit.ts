import type { Note } from "../model/score";

const A0 = 21;
const C8 = 108;

export interface PitchAutoFitCap {
  /** Minimum semitones the returned range must span. */
  minSpan: number;
  /** Maximum semitones the returned range may span. */
  maxSpan: number;
}

export interface PitchRange {
  lowMidi: number;
  highMidi: number;
}

/**
 * Compute the [low, high] pitch range to render. The literal min/max of the
 * notes is widened symmetrically to at least `minSpan` semitones, then
 * narrowed to at most `maxSpan`, then clamped into the A0..C8 piano range.
 * With no notes, returns the full piano.
 */
export function pitchAutoFit(
  notes: readonly Note[],
  cap: PitchAutoFitCap,
): PitchRange {
  if (notes.length === 0) return { lowMidi: A0, highMidi: C8 };

  let low = Infinity;
  let high = -Infinity;
  for (const n of notes) {
    if (n.midi < low) low = n.midi;
    if (n.midi > high) high = n.midi;
  }

  let span = high - low;
  if (span < cap.minSpan) {
    const pad = (cap.minSpan - span) / 2;
    low = Math.floor(low - pad);
    high = Math.ceil(high + pad);
    span = high - low;
  }

  if (span > cap.maxSpan) {
    const trim = (span - cap.maxSpan) / 2;
    low = Math.ceil(low + trim);
    high = Math.floor(high - trim);
  }

  if (low < A0) {
    high += A0 - low;
    low = A0;
  }
  if (high > C8) {
    low -= high - C8;
    high = C8;
  }
  low = Math.max(A0, low);
  high = Math.min(C8, high);

  return { lowMidi: low, highMidi: high };
}
