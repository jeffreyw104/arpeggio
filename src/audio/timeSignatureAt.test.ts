import { describe, it, expect } from "vitest";
import { timeSignatureAt } from "./timeSignatureAt";
import type { TimeSignature } from "../model/score";

describe("timeSignatureAt", () => {
  it("returns the 4/4 fallback when the list is empty", () => {
    expect(timeSignatureAt([], 0)).toEqual({
      start: 0,
      numerator: 4,
      denominator: 4,
    });
    expect(timeSignatureAt([], 99)).toEqual({
      start: 0,
      numerator: 4,
      denominator: 4,
    });
  });

  it("returns the only entry when there is just one", () => {
    const sigs: TimeSignature[] = [
      { start: 0, numerator: 3, denominator: 4 },
    ];
    expect(timeSignatureAt(sigs, 0)).toBe(sigs[0]);
    expect(timeSignatureAt(sigs, 10)).toBe(sigs[0]);
  });

  it("returns the last entry whose start <= time", () => {
    const sigs: TimeSignature[] = [
      { start: 0, numerator: 4, denominator: 4 },
      { start: 8, numerator: 6, denominator: 4 },
      { start: 20, numerator: 3, denominator: 4 },
    ];
    expect(timeSignatureAt(sigs, 0)).toBe(sigs[0]);
    expect(timeSignatureAt(sigs, 7.99)).toBe(sigs[0]);
    expect(timeSignatureAt(sigs, 8)).toBe(sigs[1]); // exactly on boundary
    expect(timeSignatureAt(sigs, 15)).toBe(sigs[1]);
    expect(timeSignatureAt(sigs, 20)).toBe(sigs[2]);
    expect(timeSignatureAt(sigs, 999)).toBe(sigs[2]);
  });

  it("returns the first entry when time is before all starts", () => {
    const sigs: TimeSignature[] = [
      { start: 5, numerator: 4, denominator: 4 },
      { start: 10, numerator: 3, denominator: 4 },
    ];
    expect(timeSignatureAt(sigs, 0)).toBe(sigs[0]);
    expect(timeSignatureAt(sigs, -1)).toBe(sigs[0]);
  });
});
