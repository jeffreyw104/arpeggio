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

  it("full-88 layout has 52 white keys, all positive width, starting at x≈0", () => {
    // Standard 88-key piano: MIDI 21 (A0) to MIDI 108 (C8).
    const layout = keyLayout({ low: 21, high: 108 }, 5200);
    const whites = layout.keys.filter((k) => !k.black);
    expect(whites).toHaveLength(52);
    for (const key of whites) {
      expect(key.width).toBeGreaterThan(0);
    }
    // White keys are emitted in ascending MIDI order (ascending x). The first
    // white key should start at x≈0.
    const sorted = [...whites].sort((a, b) => a.x - b.x);
    expect(sorted[0].x).toBeCloseTo(0, 6);
    // Each subsequent white key should be contiguous with the previous one.
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].x).toBeCloseTo(sorted[i - 1].x + sorted[i - 1].width, 6);
    }
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
      set fillStyle(v: string | CanvasGradient) {
        if (typeof v === "string") calls.push(`fill=${v}`);
      },
      fillRect: () => calls.push("fillRect"),
      strokeRect: () => calls.push("strokeRect"),
      set strokeStyle(_v: string) {},
      set lineWidth(_v: number) {},
      set shadowBlur(_v: number) {},
      set shadowColor(_v: string) {},
      save: () => {},
      restore: () => {},
      createLinearGradient: () => ({ addColorStop: () => {} }),
    } as unknown as CanvasRenderingContext2D;
    drawPiano(ctx, layout, {
      y: 300,
      height: 100,
      activeKeyColors: new Map([[64, "#e08a3c"]]),
      whiteColor: "#fff",
      blackColor: "#222",
    });
    expect(calls.filter((c) => c === "fillRect").length).toBeGreaterThanOrEqual(
      layout.keys.length,
    );
    expect(calls).toContain("fill=#e08a3c"); // the active key was tinted
  });

  it("shades white keys with a vertical gradient for depth", () => {
    const layout = keyLayout({ low: 60, high: 72 }, 800);
    let gradients = 0;
    const ctx = {
      set fillStyle(_v: string | CanvasGradient) {},
      fillRect: () => {},
      strokeRect: () => {},
      set strokeStyle(_v: string) {},
      set lineWidth(_v: number) {},
      set shadowBlur(_v: number) {},
      set shadowColor(_v: string) {},
      save: () => {},
      restore: () => {},
      createLinearGradient: () => {
        gradients++;
        return { addColorStop: () => {} };
      },
    } as unknown as CanvasRenderingContext2D;
    drawPiano(ctx, layout, {
      y: 300,
      height: 100,
      activeKeyColors: new Map<number, string>(),
      whiteColor: "#fff",
      blackColor: "#222",
    });
    expect(gradients).toBeGreaterThan(0);
  });
});
