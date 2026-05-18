import { describe, it, expect } from "vitest";
import { measureJumpTarget } from "./measureJump";
import type { Measure } from "../model/score";

const measures: Measure[] = [
  { index: 0, start: 0, end: 2, numerator: 4, denominator: 4 },
  { index: 1, start: 2, end: 4, numerator: 4, denominator: 4 },
  { index: 2, start: 4, end: 6, numerator: 4, denominator: 4 },
];

describe("measureJumpTarget", () => {
  it("jumps forward to the next measure start", () => {
    expect(measureJumpTarget(measures, 1, "next")).toBe(2);
    expect(measureJumpTarget(measures, 3, "next")).toBe(4);
  });

  it("jumps back to the previous measure start", () => {
    expect(measureJumpTarget(measures, 5, "prev")).toBe(2);
    expect(measureJumpTarget(measures, 3, "prev")).toBe(0);
  });

  it("clamps at the last measure going forward", () => {
    expect(measureJumpTarget(measures, 5, "next")).toBe(4);
  });

  it("clamps at the first measure going back", () => {
    expect(measureJumpTarget(measures, 1, "prev")).toBe(0);
  });

  it("returns 0 for an empty measure list", () => {
    expect(measureJumpTarget([], 3, "next")).toBe(0);
  });
});
