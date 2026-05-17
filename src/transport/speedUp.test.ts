import { describe, it, expect } from "vitest";
import { SpeedUp } from "./speedUp";

describe("SpeedUp", () => {
  it("begins at the start rate", () => {
    const s = new SpeedUp({ startRate: 0.5, targetRate: 1, step: 0.1 });
    expect(s.rate).toBe(0.5);
    expect(s.done).toBe(false);
  });

  it("ramps by step on each advance, clamped at the target", () => {
    const s = new SpeedUp({ startRate: 0.5, targetRate: 1, step: 0.2 });
    s.advance(); // 0.7
    expect(s.rate).toBeCloseTo(0.7, 6);
    s.advance(); // 0.9
    s.advance(); // 1.0 (clamped, not 1.1)
    expect(s.rate).toBeCloseTo(1, 6);
    expect(s.done).toBe(true);
    s.advance(); // stays at target
    expect(s.rate).toBeCloseTo(1, 6);
  });

  it("reset returns to the start rate", () => {
    const s = new SpeedUp({ startRate: 0.6, targetRate: 1, step: 0.1 });
    s.advance();
    s.reset();
    expect(s.rate).toBe(0.6);
  });
});
