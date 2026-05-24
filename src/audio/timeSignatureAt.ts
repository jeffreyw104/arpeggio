import type { TimeSignature } from "../model/score";

const FALLBACK: TimeSignature = { start: 0, numerator: 4, denominator: 4 };

/**
 * Return the time signature active at clock time `time` — the last entry in
 * `sigs` whose `start <= time`. Assumes `sigs` is sorted by `start` (matches
 * both parsers' output). If `sigs` is empty or every entry starts after
 * `time`, returns the first entry or a 4/4 fallback.
 */
export function timeSignatureAt(
  sigs: TimeSignature[],
  time: number,
): TimeSignature {
  if (sigs.length === 0) return FALLBACK;
  let active = sigs[0];
  for (const sig of sigs) {
    if (sig.start <= time) active = sig;
    else break;
  }
  return active;
}
