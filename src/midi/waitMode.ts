import type { HeldNote } from "./LiveNotes";
import type { PracticeStep } from "./chords";

export type MatchState = "pending" | "wrong" | "staggered" | "matched";

/** Max press-time spread (seconds) for a chord to count as played together. */
export const SIMULTANEITY_SEC = 0.08;

export interface MatchResult {
  state: MatchState;
  /** Required pitches currently held. */
  accepted: number[];
  /** Held pitches blocking advancement (fresh wrong presses). */
  blocking: number[];
}

/**
 * Evaluate a step against the live held notes.
 *
 * `armTime` is the performance.now() ms at which the step became active. A
 * held pitch that is not required counts as a *blocking extra* only if it was
 * pressed after `armTime` — notes held over from a previous step have earlier
 * press times and are ignored, so strict "no extras" never punishes legato.
 *
 * Press times are in milliseconds, so the seconds window is scaled by 1000.
 */
export function evaluateStep(
  step: PracticeStep,
  held: HeldNote[],
  armTime: number,
): MatchResult {
  const required = step.requiredPitches;
  const accepted: number[] = [];
  const blocking: number[] = [];
  for (const note of held) {
    if (required.has(note.pitch)) {
      accepted.push(note.pitch);
    } else if (note.pressTime > armTime) {
      blocking.push(note.pitch);
    }
  }
  if (blocking.length > 0) {
    return { state: "wrong", accepted, blocking };
  }
  if (accepted.length < required.size) {
    return { state: "pending", accepted, blocking };
  }
  const times = held
    .filter((n) => required.has(n.pitch))
    .map((n) => n.pressTime);
  const spread = Math.max(...times) - Math.min(...times);
  if (spread > SIMULTANEITY_SEC * 1000) {
    return { state: "staggered", accepted, blocking };
  }
  return { state: "matched", accepted, blocking };
}
