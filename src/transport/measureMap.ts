import type { Transport } from "./transport";

/** Index of the measure containing `time`, or 0 if none matches. */
export function measureAt(transport: Transport, time: number): number {
  const i = transport.score.measures.findIndex(
    (m) => time >= m.start && time < m.end,
  );
  return i === -1 ? 0 : i;
}

/** Measure indices [first, last] of an active loop, or null. 0-based. */
export function loopMeasureRange(
  transport: Transport,
): { first: number; last: number } | null {
  const loop = transport.clock.loop;
  if (!loop) return null;
  const measures = transport.score.measures;
  const first = measures.findIndex(
    (m) => loop.start >= m.start && loop.start < m.end,
  );
  const last = measures.findIndex(
    (m) => loop.end > m.start && loop.end <= m.end,
  );
  return {
    first: first === -1 ? 0 : first,
    last: last === -1 ? (first === -1 ? 0 : first) : last,
  };
}
