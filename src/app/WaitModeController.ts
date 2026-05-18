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
  private readonly unsubscribeLoop: () => void;

  constructor(
    private readonly clock: Clock,
    private steps: PracticeStep[],
    private readonly live: LiveNotes,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.unsubscribeLoop = clock.onLoop(() => this.resyncToPosition());
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
    } else {
      this.clock.setHold(null);
      this.result = null;
    }
  }

  /** Point the step pointer at the first step at or after the clock. */
  resyncToPosition(): void {
    const pos = this.clock.position;
    const idx = this.steps.findIndex((s) => s.time >= pos);
    this.stepIndex = idx === -1 ? this.steps.length : idx;
    this.armedFor = -1;
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
    this.clock.setHold(step.time);
    // If the clock already overshot the hold (e.g. first update() after play),
    // snap it back so position === holdAt.
    if (this.clock.position > step.time) {
      this.clock.seek(step.time);
    }

    if (this.clock.position < step.time - EARLY_ACCEPT_SEC) {
      this.result = null;
      return;
    }
    if (this.armedFor !== this.stepIndex) {
      this.armTime = this.now();
      this.armedFor = this.stepIndex;
    }
    this.result = evaluateStep(step, this.live.heldNotes(), this.armTime);
    if (this.result.state === "matched") {
      this.stepIndex++;
      this.armedFor = -1;
      const next = this.steps[this.stepIndex];
      this.clock.setHold(next ? next.time : null);
    }
  }

  dispose(): void {
    this.unsubscribeLoop();
    this.clock.setHold(null);
  }
}
