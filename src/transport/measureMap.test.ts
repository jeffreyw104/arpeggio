import { describe, it, expect } from "vitest";
import { measureAt, loopMeasureRange } from "./measureMap";
import type { Transport } from "./transport";

function makeFakeTransport(opts: {
  measures: { start: number; end: number }[];
  loop?: { start: number; end: number } | null;
}): Transport {
  return {
    score: { measures: opts.measures },
    clock: { loop: opts.loop ?? null },
  } as unknown as Transport;
}

describe("measureAt", () => {
  it("returns the index of the measure containing the given time", () => {
    const t = makeFakeTransport({
      measures: [
        { start: 0, end: 2 },
        { start: 2, end: 4 },
        { start: 4, end: 6 },
      ],
    });
    expect(measureAt(t, 0)).toBe(0);
    expect(measureAt(t, 1.5)).toBe(0);
    expect(measureAt(t, 2)).toBe(1);
    expect(measureAt(t, 5.9)).toBe(2);
  });

  it("returns 0 when the time matches no measure", () => {
    const t = makeFakeTransport({ measures: [{ start: 0, end: 2 }] });
    expect(measureAt(t, 99)).toBe(0);
  });
});

describe("loopMeasureRange", () => {
  it("returns null when no loop is active", () => {
    const t = makeFakeTransport({ measures: [{ start: 0, end: 2 }] });
    expect(loopMeasureRange(t)).toBeNull();
  });

  it("returns first/last measure indices for the loop range", () => {
    const t = makeFakeTransport({
      measures: [
        { start: 0, end: 2 },
        { start: 2, end: 4 },
        { start: 4, end: 6 },
        { start: 6, end: 8 },
      ],
      loop: { start: 2, end: 8 },
    });
    expect(loopMeasureRange(t)).toEqual({ first: 1, last: 3 });
  });

  it("defaults last to first when the loop end matches no measure", () => {
    const t = makeFakeTransport({
      measures: [{ start: 0, end: 2 }],
      loop: { start: 0, end: 1 },
    });
    expect(loopMeasureRange(t)).toEqual({ first: 0, last: 0 });
  });
});
