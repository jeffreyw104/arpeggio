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
 * Notes that are currently only ringing because of the sustain pedal
 * (`note.sustained === true`) are NEVER blocking: the user physically
 * released them, so they shouldn't be punished for the resonance the pedal
 * is keeping alive. They CAN still satisfy required pitches, so arpeggiated
 * chords with the pedal down still match.
 *
 * `consumedPresses` (pitch → the pressTime that satisfied an earlier step)
 * blocks a single key-hold from auto-satisfying consecutive steps. A held
 * note whose `(pitch, pressTime)` matches a consumed entry no longer counts
 * as accepted — the player must release and re-press for the next step. The
 * exception is `sustainingPitches`: the score explicitly carries that pitch
 * over (a tie), so the same press legitimately satisfies both steps.
 *
 * Press times are in milliseconds, so the seconds window is scaled by 1000.
 */
export function evaluateStep(
  step: PracticeStep,
  held: HeldNote[],
  armTime: number,
  consumedPresses: ReadonlyMap<number, number> = new Map(),
): MatchResult {
  const required = step.requiredPitches;
  const sustaining = step.sustainingPitches;
  const accepted: number[] = [];
  const blocking: number[] = [];
  // pressTimes of required pitches that count toward the simultaneity spread
  // — score-tied carry-overs are excluded so their old pressTime doesn't
  // stretch the spread of the fresh chord.
  const freshTimes: number[] = [];
  for (const note of held) {
    if (required.has(note.pitch)) {
      const isConsumed = consumedPresses.get(note.pitch) === note.pressTime;
      if (!isConsumed) {
        accepted.push(note.pitch);
        freshTimes.push(note.pressTime);
      } else if (sustaining.has(note.pitch)) {
        // Score-tied: the same press legitimately satisfies this step too.
        accepted.push(note.pitch);
      }
      // else: this exact press already satisfied an earlier step and the
      //       score doesn't carry the pitch over — needs a re-press.
    } else if (
      !note.sustained &&
      !sustaining.has(note.pitch) &&
      note.pressTime > armTime
    ) {
      blocking.push(note.pitch);
    }
  }
  if (blocking.length > 0) {
    return { state: "wrong", accepted, blocking };
  }
  if (accepted.length < required.size) {
    return { state: "pending", accepted, blocking };
  }
  // All required pitches accepted; if EVERY one was tied-over, there's no
  // fresh chord to spread-check — it's a match by definition.
  if (freshTimes.length === 0) {
    return { state: "matched", accepted, blocking };
  }
  const spread = Math.max(...freshTimes) - Math.min(...freshTimes);
  if (spread > SIMULTANEITY_SEC * 1000) {
    return { state: "staggered", accepted, blocking };
  }
  return { state: "matched", accepted, blocking };
}
