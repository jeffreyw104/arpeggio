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

  it("resyncs to the new position on a manual seek when no loop is active", () => {
    // steps at t=1 and t=2. Match step 0, then advance to step 1.
    const clock = new Clock(10);
    const live = new LiveNotes();
    const ctrl = new WaitModeController(clock, steps, live, () => 5000);
    ctrl.setEnabled(true);
    clock.play();
    clock.tick(1);
    ctrl.update();
    live.press(60, 0.8, 5001);
    ctrl.update(); // step 0 matched → hold parked at t=2 (step 1)
    expect(clock.holdAt).toBe(2);
    // User seeks back to t=0 — wait-mode should re-arm at step 0 (t=1).
    clock.seek(0);
    ctrl.update();
    expect(clock.holdAt).toBe(1);
  });

  it("does NOT resync to a manual seek while a loop is active", () => {
    // Same advance pattern as above; the loop wraps via clock.onLoop separately.
    const clock = new Clock(10);
    const live = new LiveNotes();
    const ctrl = new WaitModeController(clock, steps, live, () => 5000);
    clock.setLoop({ start: 1, end: 3 });
    ctrl.setEnabled(true);
    clock.play();
    clock.tick(1);
    ctrl.update();
    live.press(60, 0.8, 5001);
    ctrl.update(); // step 0 matched → hold parked at t=2 (step 1)
    expect(clock.holdAt).toBe(2);
    // Manual seek inside the loop — wait-mode keeps its current arming
    // (step 1 / hold at t=2). The looper owns navigation here.
    clock.seek(1.5);
    ctrl.update();
    expect(clock.holdAt).toBe(2);
  });

  it("a manual seek past the current hold does not snap back to the old hold", () => {
    // Regression: previously, after a held wait-mode parked holdAt at step k,
    // seeking past it left the stale holdAt in place — the next clock.tick
    // would instantly snap the position back to the OLD hold before the
    // controller had a chance to refresh holdAt to the new step's onset.
    const clock = new Clock(10);
    const live = new LiveNotes();
    const ctrl = new WaitModeController(clock, steps, live, () => 5000);
    ctrl.setEnabled(true);
    clock.play();
    clock.tick(1); // hold parks position at step 0 (t=1)
    ctrl.update();
    expect(clock.holdAt).toBe(1);

    // User clicks measure 3 — far past the current hold at 1.
    clock.seek(3);
    // Without the fix, the next tick would see holdAt=1 still and snap
    // position back to 1.
    clock.tick(0.001);
    expect(clock.position).toBeGreaterThanOrEqual(3);

    // The controller's update() re-arms at the next step (here: step 1 at t=2,
    // which is now BEFORE position 3, so the controller falls off to "no more
    // steps" — null hold) without dragging position backward.
    ctrl.update();
    expect(clock.position).toBeGreaterThanOrEqual(3);
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
