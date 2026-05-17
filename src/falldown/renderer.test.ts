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
    fillText: rec("fillText"),
    set fillStyle(_v: string) {},
    set strokeStyle(_v: string) {},
    set lineWidth(_v: number) {},
    set font(_v: string) {},
    set textAlign(_v: string) {},
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

    // Render at a far-future time (no notes visible) to capture the
    // keyboard-only fillRect count (keys + background).
    transport.clock.seek(100);
    renderer.renderFrame();
    const keyboardOnlyFillRects = ctx.calls.filter((c) =>
      c.startsWith("fillRect"),
    ).length;

    // Reset and render at t=0.4: the note at start=0.5 is 0.1 s above the
    // hit line and clearly inside the falldown area, so at least one extra
    // fillRect is emitted for the falling note rectangle.
    ctx.calls.length = 0;
    transport.clock.seek(0.4);
    renderer.renderFrame();
    const withNotesFillRects = ctx.calls.filter((c) =>
      c.startsWith("fillRect"),
    ).length;

    expect(withNotesFillRects).toBeGreaterThan(keyboardOnlyFillRects);
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
});

describe("FalldownRenderer hand hide", () => {
  it("draws fewer note rects when a hand is hidden", () => {
    const { transport, ctx, renderer } = makeRenderer();
    transport.clock.seek(0.5);
    renderer.renderFrame();
    const fullCount = ctx.calls.filter((c) => c.startsWith("fillRect")).length;

    const { transport: t2, ctx: ctx2, renderer: r2 } = makeRenderer();
    const hands = new HandState();
    hands.setHidden("left", true);
    r2.handState = hands;
    t2.clock.seek(0.5);
    r2.renderFrame();
    const hiddenCount = ctx2.calls.filter((c) =>
      c.startsWith("fillRect"),
    ).length;

    // Hiding a hand removes that hand's falling-note rects, so fewer fillRects.
    expect(hiddenCount).toBeLessThan(fullCount);
  });
});
