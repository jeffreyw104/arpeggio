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
    // ticks past the onset — also exercises the snap-back
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

  it("resyncs stepIndex after a loop wrap", () => {
    // Use steps at t=3 and t=4 so the hold (t=3) sits beyond loop.end (t=2).
    // This means tick() reaches loop.end before the hold clamps it, firing onLoop.
    const loopSteps: PracticeStep[] = [
      { time: 3, requiredPitches: new Set([60]) },
      { time: 4, requiredPitches: new Set([62]) },
    ];
    const clock = new Clock(10);
    const live = new LiveNotes();
    const ctrl = new WaitModeController(clock, loopSteps, live, () => 0);
    // Loop region ends at t=2, before either step onset.
    clock.setLoop({ start: 0.5, end: 2 });
    ctrl.setEnabled(true); // resync → stepIndex=0, hold placed at t=3
    clock.play();

    // tick(2): next would be 2, which >= loop.end (2) and < holdAt (3),
    // so the loop-wrap branch fires: position resets to loop.start (0.5)
    // and onLoop fires, which calls resyncToPosition() in the controller.
    clock.tick(2);
    expect(clock.position).toBe(0.5); // confirm the loop actually wrapped

    // After the wrap, resyncToPosition() resets stepIndex to the first step >= 0.5,
    // which is index 0 (t=3). update() should re-park the hold at t=3.
    ctrl.update();
    expect(clock.holdAt).toBe(3);
  });
});
