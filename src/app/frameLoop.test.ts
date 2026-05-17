import { describe, it, expect, vi } from "vitest";
import { FrameLoop } from "./frameLoop";
import { Clock } from "../transport/clock";

describe("FrameLoop", () => {
  it("ticks the clock by the real delta between frames", () => {
    let now = 1000;
    const raf = vi
      .spyOn(globalThis, "requestAnimationFrame")
      .mockImplementation(() => 1);
    const clock = new Clock(100);
    clock.play();
    const loop = new FrameLoop(clock);
    loop.start();
    // FrameLoop calls requestAnimationFrame(cb); grab and invoke cb manually.
    const cb = raf.mock.calls[0][0];
    cb(now); // first frame: establishes the baseline, no advance
    expect(clock.position).toBeCloseTo(0, 6);
    now = 1100;
    cb(now); // 0.1 s later — a realistic frame gap, under the clamp
    expect(clock.position).toBeCloseTo(0.1, 6);
    now = 1200;
    cb(now); // another 0.1 s
    expect(clock.position).toBeCloseTo(0.2, 6);
    raf.mockRestore();
  });

  it("clamps a huge delta (backgrounded tab) to the max frame delta", () => {
    let now = 0;
    const raf = vi
      .spyOn(globalThis, "requestAnimationFrame")
      .mockImplementation(() => 1);
    const clock = new Clock(1000);
    clock.play();
    const loop = new FrameLoop(clock);
    loop.start();
    const cb = raf.mock.calls[0][0];
    cb(now);
    now = 60_000; // 60 s gap
    cb(now);
    expect(clock.position).toBeLessThanOrEqual(0.25); // clamped, not 60
    raf.mockRestore();
  });

  it("calls registered consumers each frame", () => {
    const raf = vi
      .spyOn(globalThis, "requestAnimationFrame")
      .mockImplementation(() => 1);
    const clock = new Clock(100);
    const loop = new FrameLoop(clock);
    const consumer = vi.fn();
    loop.onFrame(consumer);
    loop.start();
    const cb = raf.mock.calls[0][0];
    cb(0);
    cb(16);
    expect(consumer).toHaveBeenCalledTimes(2);
    raf.mockRestore();
  });

  it("stop() cancels the loop", () => {
    const raf = vi
      .spyOn(globalThis, "requestAnimationFrame")
      .mockImplementation(() => 7);
    const caf = vi
      .spyOn(globalThis, "cancelAnimationFrame")
      .mockImplementation(() => {});
    const clock = new Clock(100);
    const loop = new FrameLoop(clock);
    loop.start();
    loop.stop();
    expect(caf).toHaveBeenCalledWith(7);
    raf.mockRestore();
    caf.mockRestore();
  });
});
