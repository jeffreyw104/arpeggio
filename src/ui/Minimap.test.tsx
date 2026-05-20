import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { Minimap } from "./Minimap";
import { Transport } from "../transport/transport";
import type { Score } from "../model/score";

const score = {
  source: "midi" as const, notes: [],
  measures: Array.from({ length: 10 }, (_, i) => ({ index: i, start: i, end: i + 1, numerator: 4, denominator: 4 })),
  pedalEvents: [], timeSignatures: [{ start: 0, numerator: 4, denominator: 4 }],
  tempoMap: [{ start: 0, bpm: 120 }], durationSeconds: 10, musicXml: "", qualityWarning: null, sections: [],
} satisfies Score;

function rectStub(el: Element, width = 1000): void {
  Object.defineProperty(el, "getBoundingClientRect", {
    value: () => ({ left: 0, top: 0, right: width, bottom: 16, width, height: 16, x: 0, y: 0, toJSON: () => "" }),
    configurable: true,
  });
}

describe("Minimap", () => {
  it("seeks on click", () => {
    const transport = new Transport(score);
    const { container } = render(<Minimap transport={transport} viewportWindow={{ start: 0, end: 4 }} />);
    const strip = container.querySelector(".minimap")!;
    rectStub(strip);
    fireEvent.mouseDown(strip, { clientX: 300 });
    fireEvent.mouseUp(strip, { clientX: 300 });
    expect(transport.clock.position).toBeCloseTo(3, 5);
  });

  it("loops on drag", () => {
    const transport = new Transport(score);
    const { container } = render(<Minimap transport={transport} viewportWindow={{ start: 0, end: 4 }} />);
    const strip = container.querySelector(".minimap")!;
    rectStub(strip);
    fireEvent.mouseDown(strip, { clientX: 100 });
    fireEvent.mouseMove(strip, { clientX: 400 });
    fireEvent.mouseUp(strip, { clientX: 400 });
    expect(transport.clock.loop?.start).toBeCloseTo(1, 1);
    expect(transport.clock.loop?.end).toBeCloseTo(4, 1);
  });
});
