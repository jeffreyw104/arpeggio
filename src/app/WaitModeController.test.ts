import { describe, it, expect } from "vitest";
import { Clock } from "../transport/clock";
import { LiveNotes } from "../midi/LiveNotes";
import { WaitModeController } from "./WaitModeController";
import type { PracticeStep } from "../midi/chords";

const steps: PracticeStep[] = [
  { time: 1, requiredPitches: new Set([60]), sustainingPitches: new Set() },
  { time: 2, requiredPitches: new Set([62]), sustainingPitches: new Set() },
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

  it("does not auto-advance past the seek target when the player is still holding the chord", () => {
    // Repro: player matches step 0 (chord 60), the controller advances to step
    // 1 and parks. Player is STILL holding pitch 60. They click measure 1 to
    // retry — clock.seek(1) re-arms wait-mode at step 0 (t=1). Before the fix,
    // resyncToPosition() cleared consumedPresses, so the held 60 immediately
    // re-satisfied step 0 and the controller raced past — wait-mode never
    // stopped at the clicked measure.
    const sameSteps: PracticeStep[] = [
      { time: 1, requiredPitches: new Set([60]), sustainingPitches: new Set() },
      {
        time: 2,
        requiredPitches: new Set([60]),
        sustainingPitches: new Set(),
      },
    ];
    const clock = new Clock(10);
    const live = new LiveNotes();
    let now = 5000;
    const ctrl = new WaitModeController(clock, sameSteps, live, () => now);
    ctrl.setEnabled(true);
    clock.play();
    clock.tick(1);
    ctrl.update();
    live.press(60, 0.8, 5001);
    ctrl.update(); // step 0 matched → parked at step 1 (t=2)
    expect(clock.holdAt).toBe(2);

    // Player STILL holds 60, then clicks measure 1 (t=1) to retry.
    expect(live.heldNotes().map((n) => n.pitch)).toEqual([60]);
    now = 5500;
    clock.seek(1);
    ctrl.update();
    // The fix: the held 60 (pressTime 5001) is now in consumedPresses, so it
    // can't re-satisfy step 0. The hold must stay parked at t=1.
    expect(clock.holdAt).toBe(1);
    expect(ctrl.result?.state).toBe("pending");

    // A fresh release+repress satisfies step 0 cleanly.
    live.release(60);
    live.press(60, 0.8, 5600);
    now = 5600;
    ctrl.update();
    expect(ctrl.result?.state).toBe("matched");
    expect(clock.holdAt).toBe(2);
  });

  it("re-arms wait-mode at the next step after a forward seek to a position between steps", () => {
    // Steps at t=1,2,3,4. Player matches step 0 (now parked at step 1, t=2),
    // then clicks a measure ahead of where they are (e.g. m. corresponding to
    // t=2.5 — between step 1 and step 2). Wait-mode must re-arm at step 2 (t=3)
    // instead of being stuck at the old hold.
    const fwdSteps: PracticeStep[] = [
      { time: 1, requiredPitches: new Set([60]), sustainingPitches: new Set() },
      { time: 2, requiredPitches: new Set([62]), sustainingPitches: new Set() },
      { time: 3, requiredPitches: new Set([64]), sustainingPitches: new Set() },
      { time: 4, requiredPitches: new Set([65]), sustainingPitches: new Set() },
    ];
    const clock = new Clock(10);
    const live = new LiveNotes();
    const ctrl = new WaitModeController(clock, fwdSteps, live, () => 5000);
    ctrl.setEnabled(true);
    clock.play();
    clock.tick(1);
    ctrl.update();
    live.press(60, 0.8, 5001);
    ctrl.update(); // step 0 matched → parked at step 1 (t=2)
    expect(clock.holdAt).toBe(2);
    live.release(60);

    // Forward seek to between step 1 (t=2) and step 2 (t=3).
    clock.seek(2.5);
    ctrl.update();
    // Next step at or after 2.5 is step 2 (t=3). Hold should park there.
    expect(clock.holdAt).toBe(3);
  });

  it("re-arms cleanly on a forward seek even when the future chord is already held", () => {
    // Player is still pressing C4 (60) after step 0 matched. They click a far-
    // forward measure whose first step ALSO requires C4. Without the
    // consumed-press populate the held 60 would race through that step on the
    // very next frame — the same shape as the back-click bug.
    const fwdSteps: PracticeStep[] = [
      { time: 1, requiredPitches: new Set([60]), sustainingPitches: new Set() },
      { time: 2, requiredPitches: new Set([62]), sustainingPitches: new Set() },
      { time: 3, requiredPitches: new Set([60]), sustainingPitches: new Set() },
    ];
    const clock = new Clock(10);
    const live = new LiveNotes();
    let now = 5000;
    const ctrl = new WaitModeController(clock, fwdSteps, live, () => now);
    ctrl.setEnabled(true);
    clock.play();
    clock.tick(1);
    ctrl.update();
    live.press(60, 0.8, 5001);
    ctrl.update(); // step 0 matched
    // Don't release — the player is still holding C4.
    expect(live.heldNotes().map((n) => n.pitch)).toEqual([60]);

    // Forward seek to step 2's onset (t=3).
    now = 5500;
    clock.seek(3);
    ctrl.update();
    expect(clock.holdAt).toBe(3);
    expect(ctrl.result?.state).toBe("pending");

    // Fresh re-press satisfies it.
    live.release(60);
    live.press(60, 0.8, 5600);
    now = 5600;
    ctrl.update();
    expect(ctrl.result?.state).toBe("matched");
    // Past last step → hold lifted.
    expect(clock.holdAt).toBeNull();
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

  it("does not auto-advance through a repeated pitch held across two steps", () => {
    // Both steps require pitch 60. The player presses 60 once — that single
    // press matched step 0; step 1 must NOT pass without a fresh re-press.
    const repeatedSteps: PracticeStep[] = [
      { time: 1, requiredPitches: new Set([60]), sustainingPitches: new Set() },
      {
        time: 1.05,
        requiredPitches: new Set([60]),
        sustainingPitches: new Set(),
      },
    ];
    const clock = new Clock(10);
    const live = new LiveNotes();
    let now = 5000;
    const ctrl = new WaitModeController(clock, repeatedSteps, live, () => now);
    ctrl.setEnabled(true);
    clock.play();
    clock.tick(1);
    ctrl.update();
    live.press(60, 0.8, 5001);
    ctrl.update(); // step 0 matched → consume 60 at pressTime 5001
    expect(ctrl.result?.state).toBe("matched");

    // Clock advances to step 1's onset; arm step 1 with a fresh armTime.
    now = 5200;
    clock.tick(0.05);
    ctrl.update();
    expect(ctrl.result?.state).toBe("pending");
    expect(clock.holdAt).toBe(1.05);
  });

  it("advances a repeated step on a fresh re-press", () => {
    const repeatedSteps: PracticeStep[] = [
      { time: 1, requiredPitches: new Set([60]), sustainingPitches: new Set() },
      {
        time: 1.05,
        requiredPitches: new Set([60]),
        sustainingPitches: new Set(),
      },
    ];
    const clock = new Clock(10);
    const live = new LiveNotes();
    let now = 5000;
    const ctrl = new WaitModeController(clock, repeatedSteps, live, () => now);
    ctrl.setEnabled(true);
    clock.play();
    clock.tick(1);
    ctrl.update();
    live.press(60, 0.8, 5001);
    ctrl.update(); // step 0 matched
    // Player releases and re-presses with a new pressTime.
    live.release(60);
    live.press(60, 0.8, 5200);
    now = 5200;
    clock.tick(0.05);
    ctrl.update();
    expect(ctrl.result?.state).toBe("matched");
  });

  it("advances a score-tied repeated step without re-press", () => {
    // Step 1 marks 60 as sustainingPitches — the score says it's tied over,
    // so the same press legitimately satisfies both steps.
    const tiedSteps: PracticeStep[] = [
      { time: 1, requiredPitches: new Set([60]), sustainingPitches: new Set() },
      {
        time: 1.05,
        requiredPitches: new Set([60]),
        sustainingPitches: new Set([60]),
      },
    ];
    const clock = new Clock(10);
    const live = new LiveNotes();
    let now = 5000;
    const ctrl = new WaitModeController(clock, tiedSteps, live, () => now);
    ctrl.setEnabled(true);
    clock.play();
    clock.tick(1);
    ctrl.update();
    live.press(60, 0.8, 5001);
    ctrl.update(); // step 0 matched
    now = 5200;
    clock.tick(0.05);
    ctrl.update(); // tied → step 1 matches without re-press
    expect(ctrl.result?.state).toBe("matched");
  });

  it("resyncs stepIndex after a loop wrap", () => {
    // Use steps at t=3 and t=4 so the hold (t=3) sits beyond loop.end (t=2).
    // This means tick() reaches loop.end before the hold clamps it, firing onLoop.
    const loopSteps: PracticeStep[] = [
      { time: 3, requiredPitches: new Set([60]), sustainingPitches: new Set() },
      { time: 4, requiredPitches: new Set([62]), sustainingPitches: new Set() },
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
