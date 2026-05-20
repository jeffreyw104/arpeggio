import { describe, it, expect } from "vitest";
import { PianoRollPanel } from "./PianoRollPanel";
import { Transport } from "../transport/transport";
import type { Score } from "../model/score";

const score = {
  source: "midi", notes: [],
  measures: Array.from({ length: 16 }, (_, i) => ({ index: i, start: i*2, end: (i+1)*2, numerator: 4, denominator: 4 })),
  pedalEvents: [], timeSignatures: [{ start: 0, numerator: 4, denominator: 4 }],
  tempoMap: [{ start: 0, bpm: 120 }], durationSeconds: 32, musicXml: "", qualityWarning: null, sections: [],
} satisfies Score;

describe("PianoRollPanel", () => {
  it("uses a larger page size than the lane", () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientWidth", { value: 800, configurable: true });
    Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
    const transport = new Transport(score);
    const panel = new PianoRollPanel(container, transport);
    transport.clock.seek(9);
    panel.renderFrame();
    expect(panel.currentPage).toEqual({ first: 0, last: 7 });
  });
});
