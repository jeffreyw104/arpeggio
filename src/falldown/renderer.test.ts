import { describe, it, expect, vi } from "vitest";
import { FalldownRenderer } from "./renderer";
import { Transport } from "../transport/transport";
import type { Score } from "../model/score";
import { HandState } from "../practice/hands";

const score = {
  source: "midi",
  notes: [
    { midi: 60, start: 0.5, duration: 0.5, velocity: 0.7, hand: "right" },
    { midi: 64, start: 1.0, duration: 0.5, velocity: 0.7, hand: "left" },
  ],
  measures: [{ index: 0, start: 0, end: 2, numerator: 4, denominator: 4 }],
  pedalEvents: [],
  timeSignatures: [{ start: 0, numerator: 4, denominator: 4 }],
  tempoMap: [{ start: 0, bpm: 120 }],
  durationSeconds: 2,
  musicXml: "",
  qualityWarning: null,
} satisfies Score;

/** A fake 2D context that records the methods the renderer calls. */
function fakeCtx() {
  const calls: string[] = [];
  const rec =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push(`${name}(${args.join(",")})`);
    };
  const ctx = {
    calls,
    clearRect: rec("clearRect"),
    fillRect: rec("fillRect"),
    strokeRect: rec("strokeRect"),
    beginPath: rec("beginPath"),
    moveTo: rec("moveTo"),
    lineTo: rec("lineTo"),
    stroke: rec("stroke"),
    fill: rec("fill"),
    roundRect: rec("roundRect"),
    save: rec("save"),
    restore: rec("restore"),
    fillText: rec("fillText"),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    set fillStyle(v: string | CanvasGradient) {
      if (typeof v === "string") calls.push(`fillStyle=${v}`);
    },
    set strokeStyle(_v: string) {},
    set lineWidth(_v: number) {},
    set font(_v: string) {},
    set textAlign(_v: string) {},
    set globalAlpha(v: number) { calls.push(`globalAlpha=${v}`); },
    set shadowBlur(v: number) { calls.push(`shadowBlur=${v}`); },
    set shadowColor(v: string) { calls.push(`shadowColor=${v}`); },
  };
  return ctx;
}

function makeRenderer() {
  const transport = new Transport(score);
  const ctx = fakeCtx();
  const renderer = new FalldownRenderer(
    ctx as unknown as CanvasRenderingContext2D,
    transport,
    { width: 800, height: 600 },
  );
  return { transport, ctx, renderer };
}

describe("FalldownRenderer", () => {
  it("clears the canvas and draws keys on each frame", () => {
    const { ctx, renderer } = makeRenderer();
    renderer.renderFrame();
    expect(ctx.calls.some((c) => c.startsWith("clearRect"))).toBe(true);
    expect(
      ctx.calls.filter((c) => c.startsWith("fillRect")).length,
    ).toBeGreaterThan(0);
  });

  it("draws falling-note rectangles when notes are visible", () => {
    const { transport, ctx, renderer } = makeRenderer();

    transport.clock.seek(100);
    renderer.renderFrame();
    const keyboardOnly = ctx.calls.filter((c) => c.startsWith("roundRect")).length;

    ctx.calls.length = 0;
    transport.clock.seek(0.4);
    renderer.renderFrame();
    const withNotes = ctx.calls.filter((c) => c.startsWith("roundRect")).length;

    expect(withNotes).toBeGreaterThan(keyboardOnly);
  });

  it("toggles the full-88 key range", () => {
    const { renderer } = makeRenderer();
    expect(renderer.full88).toBe(false);
    renderer.full88 = true;
    expect(renderer.full88).toBe(true);
    renderer.renderFrame(); // must not throw with the wider range
  });

  it("toggles note labels and the beat grid without throwing", () => {
    const { renderer } = makeRenderer();
    renderer.showLabels = true;
    renderer.showBeatGrid = false;
    renderer.renderFrame();
  });

  it("draws the hit-line beat pulse only when showBeatPulse is on", () => {
    const { transport, ctx, renderer } = makeRenderer();
    renderer.showBeatGrid = false; // isolate: only the pulse strokes a line
    transport.clock.play();
    transport.clock.tick(0.5); // onto a beat — beats fall at 0, 0.5, 1, ...

    renderer.renderFrame();
    expect(ctx.calls.some((c) => c.startsWith("stroke("))).toBe(false);

    renderer.showBeatPulse = true;
    ctx.calls.length = 0;
    renderer.renderFrame();
    expect(ctx.calls.some((c) => c.startsWith("stroke("))).toBe(true);
  });

  it("start() then stop() runs and cancels the animation loop", () => {
    const raf = vi
      .spyOn(globalThis, "requestAnimationFrame")
      .mockImplementation(() => 1);
    const caf = vi
      .spyOn(globalThis, "cancelAnimationFrame")
      .mockImplementation(() => {});
    const { renderer } = makeRenderer();
    renderer.start();
    expect(raf).toHaveBeenCalled();
    renderer.stop();
    expect(caf).toHaveBeenCalled();
    raf.mockRestore();
    caf.mockRestore();
  });

  it("initialises timeSignatures from a multi-segment score", () => {
    const multiSigScore: Score = {
      ...score,
      timeSignatures: [
        { start: 0, numerator: 4, denominator: 4 },
        { start: 8, numerator: 3, denominator: 4 },
      ],
    };
    const transport = new Transport(multiSigScore);
    const ctx = fakeCtx();
    const renderer = new FalldownRenderer(
      ctx as unknown as CanvasRenderingContext2D,
      transport,
      { width: 800, height: 600 },
    );
    expect(renderer.timeSignatures).toEqual([
      { start: 0, numerator: 4, denominator: 4 },
      { start: 8, numerator: 3, denominator: 4 },
    ]);
  });

  it("scales pixelsPerSecond by the zoom field", () => {
    const { renderer } = makeRenderer();
    const base = renderer.pixelsPerSecond;
    renderer.zoom = 2;
    expect(renderer.pixelsPerSecond).toBeCloseTo(base * 2, 6);
    renderer.zoom = 0.5;
    expect(renderer.pixelsPerSecond).toBeCloseTo(base * 0.5, 6);
  });

  it("applies velocity-driven opacity and glow while a note is sounding", () => {
    // score note: midi 60, start 0.5, duration 0.5, velocity 0.7, hand right
    // At t=0.75 the note is visible and sounding → alpha ≈ 0.85, shadowBlur=12
    const { transport, ctx, renderer } = makeRenderer();
    transport.clock.seek(0.75);
    renderer.renderFrame();

    // globalAlpha should have been set to 0.5 + 0.5*0.7 = 0.85
    const alphaEntries = ctx.calls
      .filter((c) => c.startsWith("globalAlpha="))
      .map((c) => parseFloat(c.split("=")[1]));
    expect(alphaEntries.length).toBeGreaterThan(0);
    expect(alphaEntries.some((a) => a < 1)).toBe(true);
    // velocity 0.7 → MIN_NOTE_ALPHA + (1 - MIN_NOTE_ALPHA) * 0.7 = 0.85
    expect(alphaEntries.some((a) => Math.abs(a - 0.85) < 0.001)).toBe(true);

    // Note is sounding at t=0.75 → shadowBlur=12 must be recorded
    expect(ctx.calls).toContain("shadowBlur=12");
  });
});

describe("FalldownRenderer resize", () => {
  it("renders without throwing after resize and uses the new size", () => {
    const { ctx, renderer } = makeRenderer();
    renderer.resize(400, 300);
    renderer.renderFrame();

    // The canvas is cleared to the new pixel dimensions.
    expect(ctx.calls).toContain("clearRect(0,0,400,300)");
    // The background fill spans the new dimensions.
    expect(ctx.calls).toContain("fillRect(0,0,400,300)");
  });
});

describe("FalldownRenderer inputHighlights", () => {
  it("exposes a public mutable inputHighlights map and applies it without throwing", () => {
    const { renderer } = makeRenderer();
    // Field must be publicly assignable
    renderer.inputHighlights = new Map([[60, "correct"], [61, "wrong"]]);
    expect(renderer.inputHighlights.get(60)).toBe("correct");
    expect(renderer.inputHighlights.get(61)).toBe("wrong");
    // renderFrame must not throw with highlights set
    expect(() => renderer.renderFrame()).not.toThrow();
  });

  it("paints the neutral held colour (#f0a040) for a 'held' entry", () => {
    const { ctx, renderer } = makeRenderer();
    renderer.inputHighlights = new Map([[60, "held"]]);
    ctx.calls.length = 0;
    renderer.renderFrame();
    expect(ctx.calls).toContain("fillStyle=#f0a040");
  });
});

describe("FalldownRenderer pedalDown", () => {
  it("does not throw when pedalDown is true", () => {
    const { renderer } = makeRenderer();
    renderer.pedalDown = true;
    expect(() => renderer.renderFrame()).not.toThrow();
  });

  it("draws the 'Ped.' label when pedalDown is true", () => {
    const { ctx, renderer } = makeRenderer();
    renderer.pedalDown = true;
    ctx.calls.length = 0;
    renderer.renderFrame();
    expect(ctx.calls.some((c) => c.includes("Ped."))).toBe(true);
  });

  it("does not draw the 'Ped.' label when pedalDown is false", () => {
    const { ctx, renderer } = makeRenderer();
    renderer.pedalDown = false;
    ctx.calls.length = 0;
    renderer.renderFrame();
    expect(ctx.calls.some((c) => c.includes("Ped."))).toBe(false);
  });
});

describe("FalldownRenderer pitchAt", () => {
  function makeRenderer880() {
    const transport = new Transport(score);
    const ctx = fakeCtx();
    const renderer = new FalldownRenderer(
      ctx as unknown as CanvasRenderingContext2D,
      transport,
      { width: 880, height: 300 },
    );
    return { transport, ctx, renderer };
  }

  it("pitchAt maps a coordinate inside the keyboard band to a MIDI pitch", () => {
    const { renderer } = makeRenderer880();
    renderer.renderFrame(); // realise the layout
    // pianoHeight = min(140, 0.22 * 300) = 66; hitLineY = 300 - 66 = 234.
    // Pick a y deep in the lower (white-key) band, plenty of white-key coverage.
    const pitch = renderer.pitchAt(440, 290);
    expect(pitch).not.toBeNull();
    expect(typeof pitch).toBe("number");
  });

  it("pitchAt returns null above the keyboard", () => {
    const { renderer } = makeRenderer880();
    renderer.renderFrame();
    expect(renderer.pitchAt(440, 10)).toBeNull();
  });
});

describe("FalldownRenderer hand hide", () => {
  it("draws dimmed notes at reduced alpha", () => {
    // score note: midi 64, start 1.0, duration 0.5, velocity 0.7, hand left
    // At t=1.2 the left-hand note is on-screen and the hand is set to "dim".
    // undimmed alpha = 0.5 + 0.5*0.7 = 0.85; dimmed = 0.85 * 0.3 ≈ 0.255
    const { transport, ctx, renderer } = makeRenderer();
    const hands = new HandState();
    hands.setVisibility("left", "dim");
    renderer.handState = hands;
    transport.clock.seek(1.2);
    renderer.renderFrame();

    const alphaEntries = ctx.calls
      .filter((c) => c.startsWith("globalAlpha="))
      .map((c) => parseFloat(c.split("=")[1]));
    expect(alphaEntries.length).toBeGreaterThan(0);
    // At least one alpha should be well below 0.5 (the dimmed value ≈ 0.255).
    expect(alphaEntries.some((a) => a < 0.5)).toBe(true);
  });

  it("draws fewer note rects when a hand is hidden", () => {
    const { transport, ctx, renderer } = makeRenderer();
    transport.clock.seek(0.5);
    renderer.renderFrame();
    const fullCount = ctx.calls.filter((c) => c.startsWith("roundRect")).length;

    const { transport: t2, ctx: ctx2, renderer: r2 } = makeRenderer();
    const hands = new HandState();
    hands.setVisibility("left", "hide");
    r2.handState = hands;
    t2.clock.seek(0.5);
    r2.renderFrame();
    const hiddenCount = ctx2.calls.filter((c) =>
      c.startsWith("roundRect"),
    ).length;

    // Hiding a hand removes that hand's falling-note rects, so fewer roundRects.
    expect(hiddenCount).toBeLessThan(fullCount);
  });
});
