import { describe, it, expect, vi } from "vitest";
import { HandState, NO_HAND_FILTER } from "./hands";

describe("HandState", () => {
  it("starts with both hands audible and shown", () => {
    const h = new HandState();
    expect(h.isMuted("left")).toBe(false);
    expect(h.visibility("left")).toBe("show");
    expect(h.visibility("right")).toBe("show");
  });

  it("mutes and sets visibility for each hand independently", () => {
    const h = new HandState();
    h.setMuted("left", true);
    h.setVisibility("right", "dim");
    h.setVisibility("left", "hide");
    expect(h.isMuted("left")).toBe(true);
    expect(h.isMuted("right")).toBe(false);
    expect(h.visibility("right")).toBe("dim");
    expect(h.visibility("left")).toBe("hide");
  });

  it("notifies change listeners and supports unsubscribe", () => {
    const h = new HandState();
    const fn = vi.fn();
    const off = h.onChange(fn);
    h.setVisibility("left", "hide");
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    h.setMuted("right", true);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("NO_HAND_FILTER", () => {
  it("mutes nothing and shows everything", () => {
    expect(NO_HAND_FILTER.isMuted("left")).toBe(false);
    expect(NO_HAND_FILTER.visibility("right")).toBe("show");
  });
});
