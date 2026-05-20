import { describe, it, expect } from "vitest";
import { PianoRollRenderer } from "./PianoRollRenderer";
import { Transport } from "../transport/transport";
import type { Score } from "../model/score";

const baseScore = {
  source: "midi",
  notes: [],
  measures: [
    { index: 0, start: 0, end: 2, numerator: 4, denominator: 4 },
    { index: 1, start: 2, end: 4, numerator: 4, denominator: 4 },
  ],
  pedalEvents: [],
  timeSignatures: [{ start: 0, numerator: 4, denominator: 4 }],
  tempoMap: [{ start: 0, bpm: 120 }],
  durationSeconds: 4,
  musicXml: "",
  qualityWarning: null,
  sections: [],
} satisfies Score;

function fakeCtx() {
  const calls: string[] = [];
  const rec = (name: string) => (...a: unknown[]) => calls.push(`${name}(${a.join(",")})`);
  const stub = { save: rec("save"), restore: rec("restore"), beginPath: rec("beginPath"),
    moveTo: rec("moveTo"), lineTo: rec("lineTo"), stroke: rec("stroke"),
    fillRect: rec("fillRect"), clearRect: rec("clearRect"), fill: rec("fill"),
    fillText: rec("fillText"), roundRect: rec("roundRect"), translate: rec("translate"),
    setLineDash: rec("setLineDash"), strokeRect: rec("strokeRect"),
    fillStyle: "", strokeStyle: "", lineWidth: 0, font: "", textAlign: "" as CanvasTextAlign,
    globalAlpha: 1, shadowColor: "", shadowBlur: 0,
  };
  return { ctx: stub as unknown as CanvasRenderingContext2D, calls };
}

describe("PianoRollRenderer skeleton", () => {
  it("clears the canvas and draws a vertical playhead at the current time", () => {
    const transport = new Transport(baseScore);
    transport.clock.seek(1);
    const { ctx, calls } = fakeCtx();
    const r = new PianoRollRenderer(ctx, transport, { width: 200, height: 100 });
    r.setViewport({ start: 0, end: 2 });
    r.renderFrame();
    expect(calls.some((c) => c.startsWith("clearRect"))).toBe(true);
    // 1s of 2s window at width 200 = x=100. The playhead line should move to 100.
    expect(calls.some((c) => c === "moveTo(100,0)")).toBe(true);
  });

  it("draws downbeat lines at each measure start inside the viewport", () => {
    const transport = new Transport(baseScore);
    const { ctx, calls } = fakeCtx();
    const r = new PianoRollRenderer(ctx, transport, { width: 200, height: 100 });
    r.setViewport({ start: 0, end: 4 });
    r.renderFrame();
    // Two measures start in [0, 4]: x=0 and x=100.
    expect(calls).toContain("moveTo(0,0)");
    expect(calls).toContain("moveTo(100,0)");
  });
});

describe("PianoRollRenderer notes", () => {
  it("draws a rect per note inside the viewport, hand-coloured", () => {
    const score = {
      ...baseScore,
      notes: [
        { midi: 64, start: 0, duration: 0.5, velocity: 1, hand: "right" as const },
        { midi: 60, start: 0.5, duration: 0.5, velocity: 1, hand: "left" as const },
      ],
    };
    const transport = new Transport(score);
    const { ctx, calls } = fakeCtx();
    const r = new PianoRollRenderer(ctx, transport, { width: 200, height: 100 });
    r.setViewport({ start: 0, end: 2 });
    r.renderFrame();
    const fillRectCalls = calls.filter((c) => c.startsWith("fillRect"));
    expect(fillRectCalls.length).toBeGreaterThanOrEqual(3);
  });

  it("skips notes whose end is before the viewport start", () => {
    const score = {
      ...baseScore,
      notes: [
        { midi: 60, start: -1, duration: 0.5, velocity: 1, hand: "right" as const },
      ],
    };
    const transport = new Transport(score);
    const { ctx, calls } = fakeCtx();
    const r = new PianoRollRenderer(ctx, transport, { width: 200, height: 100 });
    r.setViewport({ start: 0, end: 2 });
    r.renderFrame();
    const fillRectCalls = calls.filter((c) => c.startsWith("fillRect"));
    expect(fillRectCalls.length).toBe(1);
  });
});
