import { describe, it, expect } from "vitest";
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
