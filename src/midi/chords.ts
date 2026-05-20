import type { Note, Hand } from "../model/score";

/** One chord the player must press together. */
export interface PracticeStep {
  /** Onset time, score seconds. */
  time: number;
  /** Pitches required for this step. */
  requiredPitches: Set<number>;
  /** Pitches whose earlier notes are still sounding at this step's onset —
   *  e.g. a long note tied / sustained across the next chord. Re-pressing
   *  one of these pitches must not count as a wrong extra: the user is
   *  legitimately holding it over the chord boundary. */
  sustainingPitches: Set<number>;
}

/** Notes within this of a cluster head form one chord step. */
export const STEP_GROUPING_SEC = 0.04;

/**
 * Group hand-filtered notes into ordered chord steps. Because the hand filter
 * is applied first, every emitted step has at least one required pitch — a
 * passage the app plays alone never produces a step, so the clock never holds
 * on a rest.
 */
export function buildSteps(
  notes: Note[],
  hands: ReadonlySet<Hand>,
): PracticeStep[] {
  const relevant = notes
    .filter((n) => hands.has(n.hand))
    .slice()
    .sort((a, b) => a.start - b.start);
  const steps: PracticeStep[] = [];
  let i = 0;
  while (i < relevant.length) {
    const head = relevant[i];
    const groupEnd = head.start + STEP_GROUPING_SEC;
    const requiredPitches = new Set<number>();
    while (i < relevant.length && relevant[i].start <= groupEnd) {
      requiredPitches.add(relevant[i].midi);
      i++;
    }
    // Pitches still sounding from earlier notes — i.e. tied / sustained
    // notes that overlap this onset. Excluded from `required` (they aren't
    // a fresh press the user owes us) but consumed by wait-mode as
    // "allowed extras" so re-pressing them isn't flagged as wrong.
    const sustainingPitches = new Set<number>();
    for (const n of relevant) {
      if (n.start >= head.start) break;
      if (n.start + n.duration > head.start) sustainingPitches.add(n.midi);
    }
    steps.push({ time: head.start, requiredPitches, sustainingPitches });
  }
  return steps;
}
