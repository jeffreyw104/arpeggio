import type { Measure } from "../model/score";

/** Direction of a measure jump. */
export type JumpDirection = "prev" | "next";

/**
 * The seek time (seconds) for jumping one measure from `position`. "next" goes
 * to the start of the measure after the one containing `position`; "prev" goes
 * to the start of the previous measure. Clamped to the first/last measure.
 * Returns 0 when there are no measures.
 */
export function measureJumpTarget(
  measures: Measure[],
  position: number,
  direction: JumpDirection,
): number {
  if (measures.length === 0) return 0;
  let current = measures.findIndex(
    (m) => position >= m.start && position < m.end,
  );
  if (current === -1) {
    // Past the end (or before the first) — treat as the last/first measure.
    current = position < measures[0].start ? 0 : measures.length - 1;
  }
  const target =
    direction === "next"
      ? Math.min(current + 1, measures.length - 1)
      : Math.max(current - 1, 0);
  return measures[target].start;
}
