import { describe, it, expect } from "vitest";
import { keyLayout } from "./piano";
import { FULL_88 } from "./keyRange";
import { pointerHit } from "./pointerHit";

const PIANO_Y = 200;
const PIANO_H = 100;

describe("pointerHit", () => {
  const layout = keyLayout(FULL_88, 880);
  const blackBand = PIANO_Y + PIANO_H * 0.62;

  it("returns null outside the keyboard vertical band", () => {
    expect(pointerHit(layout, 100, PIANO_Y - 1, PIANO_Y, PIANO_H)).toBeNull();
    expect(pointerHit(layout, 100, PIANO_Y + PIANO_H + 1, PIANO_Y, PIANO_H))
      .toBeNull();
  });

  it("hits a white key below the black-key band", () => {
    const c4 = layout.byMidi(60)!;
    const x = c4.x + c4.width / 2;
    const y = blackBand + 5;
    expect(pointerHit(layout, x, y, PIANO_Y, PIANO_H)).toBe(60);
  });

  it("hits a black key when in the upper band over its rect", () => {
    const cSharp4 = layout.byMidi(61)!;
    const x = cSharp4.x + cSharp4.width / 2;
    const y = PIANO_Y + 5;
    expect(pointerHit(layout, x, y, PIANO_Y, PIANO_H)).toBe(61);
  });

  it("falls through to the white key when the upper-band x has no black key", () => {
    const e4 = layout.byMidi(64)!;
    const x = e4.x + e4.width / 2;
    const y = PIANO_Y + 5;
    expect(pointerHit(layout, x, y, PIANO_Y, PIANO_H)).toBe(64);
  });

  it("returns null when x is outside the keyboard", () => {
    expect(pointerHit(layout, -5, PIANO_Y + 10, PIANO_Y, PIANO_H)).toBeNull();
    expect(
      pointerHit(layout, layout.width + 5, PIANO_Y + 10, PIANO_Y, PIANO_H),
    ).toBeNull();
  });
});
