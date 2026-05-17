import type { Score } from "../model/score";
import type { Loop } from "./clock";

/** A-B loop spanning measures [firstIndex, lastIndex] inclusive (any order). */
export function measureLoop(
  score: Score,
  firstIndex: number,
  lastIndex: number,
): Loop {
  const lo = Math.min(firstIndex, lastIndex);
  const hi = Math.max(firstIndex, lastIndex);
  const first = score.measures[lo];
  const last = score.measures[hi];
  return { start: first.start, end: last.end };
}

/**
 * The single-beat loop containing `positionSeconds`. Beat length is derived from
 * the containing measure's time signature: a beat is one denominator-unit, i.e.
 * (60 / bpm) * (4 / denominator) seconds.
 */
export function beatLoop(score: Score, positionSeconds: number): Loop {
  const measure =
    score.measures.find(
      (m) => positionSeconds >= m.start && positionSeconds < m.end,
    ) ?? score.measures[score.measures.length - 1];
  const bpm = score.tempoMap[0]?.bpm ?? 120;
  const beatLen = (60 / bpm) * (4 / measure.denominator);
  const beatIndex = Math.floor((positionSeconds - measure.start) / beatLen);
  const start = measure.start + beatIndex * beatLen;
  return { start, end: start + beatLen };
}

/** Clamp a loop to [0, duration]; guarantee start < end. */
export function clampLoop(loop: Loop, duration: number): Loop {
  const start = Math.min(Math.max(loop.start, 0), duration);
  const end = Math.min(Math.max(loop.end, 0), duration);
  return start < end ? { start, end } : { start, end: duration };
}
