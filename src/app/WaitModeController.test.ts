import { describe, it, expect } from "vitest";
import { Clock } from "../transport/clock";
import { LiveNotes } from "../midi/LiveNotes";
import { WaitModeController } from "./WaitModeController";
import type { PracticeStep } from "../midi/chords";

const steps: PracticeStep[] = [
  { time: 1, requiredPitches: new Set([60]) },
  { time: 2, requiredPitches: new Set([62]) },
];

describe("WaitModeController", () => {
  it("holds the clock at the next step's onset", () => {
    const clock = new Clock(10);
    const live = new LiveNotes();
    const ctrl = new WaitModeController(clock, steps, live, () => 5000);
    ctrl.setEnabled(true);
    clock.play();
    clock.tick(1.5);
    ctrl.update();
    expect(clock.holdAt).toBe(1);
    expect(clock.position).toBe(1);
  });

  it("advances to the next step when the chord matches", () => {
    const clock = new Clock(10);
    const live = new LiveNotes();
    const ctrl = new WaitModeController(clock, steps, live, () => 5000);
    ctrl.setEnabled(true);
    clock.play();
    clock.tick(1);
    ctrl.update(); // arm + hold at step 0 (time 1)
    live.press(60, 0.8, 5001);
    ctrl.update(); // match -> advance
    expect(ctrl.result?.state).toBe("matched");
    expect(clock.holdAt).toBe(2);
  });

  it("clears the hold when disabled", () => {
    const clock = new Clock(10);
    const ctrl = new WaitModeController(clock, steps, new LiveNotes(), () => 0);
    ctrl.setEnabled(true);
    ctrl.setEnabled(false);
    expect(clock.holdAt).toBeNull();
  });
});
