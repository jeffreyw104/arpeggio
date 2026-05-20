import { describe, it, expect, vi } from "vitest";
import { PianoRollLane } from "./PianoRollLane";
import { Transport } from "../transport/transport";
import type { Score } from "../model/score";

const score = {
  source: "midi",
  notes: [],
  measures: Array.from({ length: 12 }, (_, i) => ({
    index: i,
    start: i * 2,
    end: (i + 1) * 2,
    numerator: 4,
    denominator: 4,
  })),
  pedalEvents: [],
  timeSignatures: [{ start: 0, numerator: 4, denominator: 4 }],
  tempoMap: [{ start: 0, bpm: 120 }],
  durationSeconds: 24,
  musicXml: "",
  qualityWarning: null,
  sections: [],
} satisfies Score;

function makeLane(): { lane: PianoRollLane; container: HTMLElement; transport: Transport } {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientWidth", { value: 400, configurable: true });
  Object.defineProperty(container, "clientHeight", { value: 100, configurable: true });
  document.body.appendChild(container);
  const transport = new Transport(score);
  const lane = new PianoRollLane(container, transport, { measuresPerPage: 4 });
  return { lane, container, transport };
}

describe("PianoRollLane", () => {
  it("mounts a canvas inside the container", () => {
    const { container } = makeLane();
    expect(container.querySelector("canvas")).not.toBeNull();
  });

  it("starts on the page containing the playhead", () => {
    const { lane, transport } = makeLane();
    transport.clock.seek(5); // measure 2 → page [0..3]
    lane.renderFrame();
    expect(lane.currentPage).toEqual({ first: 0, last: 3 });
  });

  it("jumps to the next page when the playhead crosses the boundary", () => {
    const { lane, transport } = makeLane();
    transport.clock.seek(0);
    lane.renderFrame();
    transport.clock.seek(9); // measure 4 → page [4..7]
    lane.renderFrame();
    expect(lane.currentPage).toEqual({ first: 4, last: 7 });
  });
});

describe("PianoRollLane interactions", () => {
  it("click on a measure seeks to its start", () => {
    const { lane, container, transport } = makeLane();
    transport.clock.seek(0);
    lane.renderFrame(); // _currentPage = { first: 0, last: 3 }

    const canvas = container.querySelector("canvas")!;
    // Canvas covers measures 0-3 (0-8s), width=400px → 50px/s
    // clientX=150 → t=3s → measure 1 (2-4s) → seek to 2s
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      left: 0, top: 0, width: 400, height: 100,
      right: 400, bottom: 100, x: 0, y: 0, toJSON: () => {},
    } as DOMRect);

    canvas.dispatchEvent(new MouseEvent("mousedown", { clientX: 150, bubbles: true }));
    canvas.dispatchEvent(new MouseEvent("mouseup", { clientX: 150, bubbles: true }));

    expect(transport.clock.position).toBeCloseTo(2, 5);
  });

  it("drag across measures sets loop range", () => {
    const { lane, container, transport } = makeLane();
    transport.clock.seek(0);
    lane.renderFrame(); // _currentPage = { first: 0, last: 3 }

    const canvas = container.querySelector("canvas")!;
    // Canvas covers measures 0-3 (0-8s), width=400px → 50px/s
    // mousedown at clientX=25 → t=0.5s → measure 0
    // mouseup   at clientX=325 → t=6.5s → measure 3
    // but plan says drag measures 0..2 → loop { start:0, end:6 }
    // So: mousedown clientX=25 (measure 0), mouseup clientX=275 (t=5.5s → measure 2)
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      left: 0, top: 0, width: 400, height: 100,
      right: 400, bottom: 100, x: 0, y: 0, toJSON: () => {},
    } as DOMRect);

    canvas.dispatchEvent(new MouseEvent("mousedown", { clientX: 25, bubbles: true }));
    canvas.dispatchEvent(new MouseEvent("mouseup", { clientX: 275, bubbles: true }));

    expect(transport.clock.loop).toEqual({ start: 0, end: 6 });
  });
});
