import { describe, it, expect } from "vitest";
import { keyLayout, midiToNoteName, drawPiano } from "./piano";

describe("keyLayout", () => {
  it("tiles white keys edge-to-edge across the width", () => {
    // C4..C5 = MIDI 60..72 : 8 white keys (C D E F G A B C).
    const layout = keyLayout({ low: 60, high: 72 }, 800);
    const whites = layout.keys.filter((k) => !k.black);
    expect(whites).toHaveLength(8);
    expect(whites[0].x).toBeCloseTo(0, 6);
    expect(whites[0].width).toBeCloseTo(100, 6);
    expect(whites[7].x).toBeCloseTo(700, 6);
  });

  it("places black keys narrower and between their white neighbours", () => {
    const layout = keyLayout({ low: 60, high: 72 }, 800);
    const cSharp = layout.keys.find((k) => k.midi === 61);
    expect(cSharp).toBeDefined();
    expect(cSharp!.black).toBe(true);
    expect(cSharp!.width).toBeLessThan(100);
    // C#4 sits around the C4/D4 boundary (~100 px).
    expect(cSharp!.x + cSharp!.width / 2).toBeGreaterThan(60);
    expect(cSharp!.x + cSharp!.width / 2).toBeLessThan(140);
  });

  it("can look a key up by midi number", () => {
    const layout = keyLayout({ low: 60, high: 72 }, 800);
    expect(layout.byMidi(64)).toBeDefined();
    expect(layout.byMidi(999)).toBeUndefined();
  });
});

describe("midiToNoteName", () => {
  it("names natural and sharp pitches with octave numbers", () => {
    expect(midiToNoteName(60)).toBe("C4");
    expect(midiToNoteName(61)).toBe("C#4");
    expect(midiToNoteName(69)).toBe("A4");
  });
});

describe("drawPiano", () => {
  it("fills a rect for every key and highlights active keys", () => {
    const layout = keyLayout({ low: 60, high: 72 }, 800);
    const calls: string[] = [];
    const ctx = {
      set fillStyle(v: string) {
        calls.push(`fill=${v}`);
      },
      fillRect: () => calls.push("fillRect"),
      strokeRect: () => calls.push("strokeRect"),
      set strokeStyle(_v: string) {},
      set lineWidth(_v: number) {},
    } as unknown as CanvasRenderingContext2D;
    drawPiano(ctx, layout, {
      y: 300,
      height: 100,
      activeKeys: new Set([64]),
      activeColor: "#4a8",
      whiteColor: "#fff",
      blackColor: "#222",
    });
    expect(calls.filter((c) => c === "fillRect").length).toBeGreaterThanOrEqual(
      layout.keys.length,
    );
    expect(calls).toContain("fill=#4a8"); // the active key was highlighted
  });
});
