import { describe, it, expect, vi } from "vitest";
import { HandState, NO_HAND_FILTER } from "./hands";

describe("HandState", () => {
  it("starts with both hands audible and visible", () => {
    const h = new HandState();
    expect(h.isMuted("left")).toBe(false);
    expect(h.isMuted("right")).toBe(false);
    expect(h.isHidden("left")).toBe(false);
    expect(h.isHidden("right")).toBe(false);
  });

  it("mutes and hides each hand independently", () => {
    const h = new HandState();
    h.setMuted("left", true);
    h.setHidden("right", true);
    expect(h.isMuted("left")).toBe(true);
    expect(h.isMuted("right")).toBe(false);
    expect(h.isHidden("right")).toBe(true);
    expect(h.isHidden("left")).toBe(false);
  });

  it("notifies change listeners and supports unsubscribe", () => {
    const h = new HandState();
    const fn = vi.fn();
    const off = h.onChange(fn);
    h.setMuted("left", true);
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    h.setMuted("right", true);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("NO_HAND_FILTER", () => {
  it("mutes and hides nothing", () => {
    expect(NO_HAND_FILTER.isMuted("left")).toBe(false);
    expect(NO_HAND_FILTER.isHidden("right")).toBe(false);
  });
});
