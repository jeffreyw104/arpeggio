import { describe, it, expect } from "vitest";
import { pitchTrack } from "./pitchTrack";

describe("pitchTrack", () => {
  it("places the highest pitch at the top of the viewport", () => {
    const y = pitchTrack(72, { lowMidi: 60, highMidi: 72 }, { top: 0, height: 120 });
    expect(y).toBe(0);
  });

  it("places the lowest pitch at the bottom row", () => {
    const y = pitchTrack(60, { lowMidi: 60, highMidi: 72 }, { top: 0, height: 120 });
    expect(y).toBe(110);
  });

  it("returns track height as the row height", () => {
    expect(pitchTrack.rowHeight({ lowMidi: 60, highMidi: 72 }, 120)).toBe(10);
  });

  it("clamps out-of-range pitches to the viewport", () => {
    const y = pitchTrack(80, { lowMidi: 60, highMidi: 72 }, { top: 0, height: 120 });
    expect(y).toBeGreaterThanOrEqual(0);
  });
});
