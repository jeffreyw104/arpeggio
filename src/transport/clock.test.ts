import { describe, it, expect, vi } from "vitest";
import { Clock } from "./clock";

describe("Clock", () => {
  it("starts paused at position 0", () => {
    const c = new Clock(10);
    expect(c.position).toBe(0);
    expect(c.playing).toBe(false);
    expect(c.rate).toBe(1);
  });

  it("does not advance while paused", () => {
    const c = new Clock(10);
    c.tick(1);
    expect(c.position).toBe(0);
  });

  it("advances by real elapsed time times rate while playing", () => {
    const c = new Clock(10);
    c.play();
    c.tick(1);
    expect(c.position).toBeCloseTo(1, 6);
    c.setRate(2);
    c.tick(1);
    expect(c.position).toBeCloseTo(3, 6);
  });

  it("seek clamps to [0, duration]", () => {
    const c = new Clock(10);
    c.seek(-5);
    expect(c.position).toBe(0);
    c.seek(99);
    expect(c.position).toBe(10);
  });

  it("stops at the end of the piece", () => {
    const c = new Clock(10);
    c.play();
    c.tick(99);
    expect(c.position).toBe(10);
    expect(c.playing).toBe(false);
  });

  it("wraps within an A-B loop and fires onLoop", () => {
    const c = new Clock(100);
    c.setLoop({ start: 2, end: 4 });
    c.seek(2);
    c.play();
    const looped = vi.fn();
    c.onLoop(looped);
    c.tick(2.5); // 2 -> 4.5, wraps: lands exactly on loop.start (2)
    expect(c.position).toBe(2);
    expect(looped).toHaveBeenCalledTimes(1);
  });

  it("notifies seek listeners on seek but not on tick", () => {
    const c = new Clock(10);
    const seeked = vi.fn();
    c.onSeek(seeked);
    c.seek(5);
    expect(seeked).toHaveBeenCalledTimes(1);
    c.play();
    c.tick(1);
    expect(seeked).toHaveBeenCalledTimes(1);
  });

  it("notifies change listeners and supports unsubscribe", () => {
    const c = new Clock(10);
    const fn = vi.fn();
    const off = c.onChange(fn);
    c.play();
    expect(fn).toHaveBeenCalled();
    off();
    const before = fn.mock.calls.length;
    c.pause();
    expect(fn.mock.calls.length).toBe(before);
  });
});
