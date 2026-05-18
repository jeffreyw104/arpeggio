import { describe, it, expect } from "vitest";
import { beatGridLines } from "./beatGrid";

// 4/4 at 120 BPM: each beat 0.5 s.
const NUM = 4;
const DEN = 4;
const BPM = 120;
const DURATION = 4;

describe("beatGridLines", () => {
  it("places the beat at the current time on the hit line", () => {
    const lines = beatGridLines(NUM, DEN, BPM, DURATION, 0, {
      hitLineY: 400,
      pixelsPerSecond: 100,
    });
    const atZero = lines.find((l) => Math.abs(l.y - 400) < 1e-6);
    expect(atZero).toBeDefined();
  });

  it("marks bar downbeats distinctly from ordinary beats", () => {
    const lines = beatGridLines(NUM, DEN, BPM, DURATION, 0, {
      hitLineY: 400,
      pixelsPerSecond: 100,
    });
    const downbeat = lines.find((l) => Math.abs(l.y - 400) < 1e-6);
    expect(downbeat!.downbeat).toBe(true);
    // beat at t=0.5 -> y = 400 - 0.5*100 = 350, not a downbeat
    const ordinary = lines.find((l) => Math.abs(l.y - 350) < 1e-6);
    expect(ordinary!.downbeat).toBe(false);
  });

  it("only returns lines within the falldown area", () => {
    const lines = beatGridLines(NUM, DEN, BPM, DURATION, 0, {
      hitLineY: 400,
      pixelsPerSecond: 100,
    });
    for (const l of lines) {
      expect(l.y).toBeGreaterThanOrEqual(0);
      expect(l.y).toBeLessThanOrEqual(400);
    }
  });
});
