import type { Clock } from "../transport/clock";
import type { LiveNotes } from "../midi/LiveNotes";
import type { PracticeStep } from "../midi/chords";
import { evaluateStep, type MatchResult } from "../midi/waitMode";

/** How far before a step's onset presses begin counting. */
export const EARLY_ACCEPT_SEC = 0.12;

/**
 * Drives wait-mode: each frame it parks the clock's hold at the next chord's
 * onset, evaluates the player's input against that chord, and advances when it
 * matches. Pure of UI — `result` is read by the tab for key-lighting.
 */
export class WaitModeController {
  /** Latest match evaluation, or null when no step is armed. */
  result: MatchResult | null = null;

  private stepIndex = 0;
  private armTime = 0;
  private armedFor = -1;
  private enabled = false;
  /** Press times (pitch → pressTime) of held notes that have already
   *  satisfied an earlier step. Keeps a single key-hold from auto-passing
   *  consecutive steps that share a required pitch. Cleared on seek/loop. */
  private readonly consumedPresses = new Map<number, number>();

  constructor(
    private readonly clock: Clock,
    private steps: PracticeStep[],
    private readonly live: LiveNotes,
    private readonly now: () => number = () => performance.now(),
  ) {
    clock.onLoop(() => this.resyncToPosition());
    // Re-arm at the new position whenever the user manually seeks — except
    // when a loop is active, in which case the looper owns navigation and a
    // mid-loop click shouldn't drag wait-mode out of the loop region.
    clock.onSeek(() => {
      if (this.clock.loop) return;
      this.resyncToPosition();
    });
  }

  /** Replace the steps (e.g. after the hand selection changes). */
  setSteps(steps: PracticeStep[]): void {
    this.steps = steps;
    this.resyncToPosition();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (on) {
      this.resyncToPosition();
      this.update(); // place the hold immediately rather than waiting for the next frame
    } else {
      this.clock.setHold(null);
      this.result = null;
    }
  }

  /** Point the step pointer at the first step at or after the clock. */
  private resyncToPosition(): void {
    const pos = this.clock.position;
    const idx = this.steps.findIndex((s) => s.time >= pos);
    this.stepIndex = idx === -1 ? this.steps.length : idx;
    this.armedFor = -1;
    this.result = null; // clear stale evaluation from the previous position
    // Consumed marks are tied to a continuous step run — a seek / loop wrap
    // re-opens every step's accept window, so any pressing-and-holding from
    // before the jump shouldn't keep "satisfying" the new arming.
    this.consumedPresses.clear();
  }

  /** Call once per frame, after the clock has ticked. */
  update(): void {
    if (!this.enabled) return;
    if (this.stepIndex >= this.steps.length) {
      this.clock.setHold(null);
      this.result = null;
      return;
    }
    const step = this.steps[this.stepIndex];
    // setHold itself handles the "position is past the hold" snap-back. Doing
    // the snap inside the controller via clock.seek used to trigger our own
    // onSeek listener (the manual-seek resync) and mutate stepIndex mid-
    // update — race the controller produces against itself.
    this.clock.setHold(step.time);

    if (this.clock.position < step.time - EARLY_ACCEPT_SEC) {
      this.result = null;
      return;
    }
    if (this.armedFor !== this.stepIndex) {
      this.armTime = this.now();
      this.armedFor = this.stepIndex;
    }
    const held = this.live.heldNotes();
    this.result = evaluateStep(step, held, this.armTime, this.consumedPresses);
    if (this.result.state === "matched") {
      // Mark the presses that satisfied this step so the same key-hold can't
      // silently satisfy a later step requiring the same pitch — the player
      // must release and re-press for it to count again.
      for (const note of held) {
        if (step.requiredPitches.has(note.pitch)) {
          this.consumedPresses.set(note.pitch, note.pressTime);
        }
      }
      this.stepIndex++;
      this.armedFor = -1;
      const next = this.steps[this.stepIndex];
      this.clock.setHold(next ? next.time : null);
    }
  }

  dispose(): void {
    // Why this isn't more aggressive: React StrictMode (dev) runs every
    // effect through setup → cleanup → setup on the SAME session/controller
    // instance. If we unsubscribed from clock.onLoop / clock.onSeek here,
    // the second mount would silently lose the loop-wrap and manual-seek
    // resync (the constructor wires those listeners once and never re-
    // runs), and any wait-mode click would snap the playhead back to the
    // last step.
    //
    // Just disable the per-frame logic and lift the clock hold. The
    // subscriptions die naturally when the controller itself is GC'd.
    this.enabled = false;
    this.clock.setHold(null);
  }
}
