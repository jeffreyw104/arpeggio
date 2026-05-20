import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { MeasureProgressBar } from "./MeasureProgressBar";
import { Transport } from "../transport/transport";
import type { Score } from "../model/score";

const score = {
  source: "midi" as const, notes: [],
  measures: [
    { index: 0, start: 0, end: 2, numerator: 4, denominator: 4 },
    { index: 1, start: 2, end: 4, numerator: 4, denominator: 4 },
    { index: 2, start: 4, end: 6, numerator: 4, denominator: 4 },
  ],
  pedalEvents: [], timeSignatures: [{ start: 0, numerator: 4, denominator: 4 }],
  tempoMap: [{ start: 0, bpm: 120 }], durationSeconds: 6,
  musicXml: "", qualityWarning: null, sections: [],
} satisfies Score;

describe("MeasureProgressBar", () => {
  it("renders one cell per measure", () => {
    const transport = new Transport(score);
    const { container } = render(<MeasureProgressBar transport={transport} />);
    expect(container.querySelectorAll(".measure-progress-bar > .measure-cell")).toHaveLength(3);
  });

  it("seeks on cell click", () => {
    const transport = new Transport(score);
    const { container } = render(<MeasureProgressBar transport={transport} />);
    const cells = container.querySelectorAll<HTMLElement>(".measure-cell");
    fireEvent.mouseDown(cells[1]);
    fireEvent.mouseUp(cells[1]);
    expect(transport.clock.position).toBe(2);
  });

  it("loops a range on drag across cells", () => {
    const transport = new Transport(score);
    const { container } = render(<MeasureProgressBar transport={transport} />);
    const cells = container.querySelectorAll<HTMLElement>(".measure-cell");
    fireEvent.mouseDown(cells[0]);
    fireEvent.mouseEnter(cells[1]);
    fireEvent.mouseUp(cells[2]);
    expect(transport.clock.loop).toEqual({ start: 0, end: 6 });
  });
});
