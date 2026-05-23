import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionStrip } from "./SectionStrip";
import { Transport } from "../transport/transport";
import { newSectionId, newBookmarkId, type SectionState } from "../model/sections";
import type { Score } from "../model/score";

function makeScore(): Score {
  return {
    source: "midi",
    notes: [],
    measures: [{ index: 0, start: 0, end: 60, numerator: 4, denominator: 4 }],
    pedalEvents: [],
    timeSignatures: [{ start: 0, numerator: 4, denominator: 4 }],
    tempoMap: [{ start: 0, bpm: 120 }],
    durationSeconds: 60,
    musicXml: "",
    qualityWarning: null,
  };
}

function makeState(): SectionState {
  return {
    sections: [
      { id: newSectionId(), start: 0, end: 20, name: "Intro", isAuto: true },
      { id: newSectionId(), start: 20, end: 40, name: "Verse", isAuto: true },
      { id: newSectionId(), start: 40, end: 60, name: "Outro", isAuto: true },
    ],
    bookmarks: [{ id: newBookmarkId(), time: 25, name: "tricky" }],
    version: 1,
  };
}

describe("SectionStrip rendering", () => {
  it("renders one block per section with names and a bookmark", () => {
    const transport = new Transport(makeScore());
    render(
      <SectionStrip
        state={makeState()}
        transport={transport}
        position="bottom"
        onChange={() => {}}
        onPositionChange={() => {}}
      />,
    );
    expect(screen.getByText("Intro")).toBeInTheDocument();
    expect(screen.getByText("Verse")).toBeInTheDocument();
    expect(screen.getByText("Outro")).toBeInTheDocument();
    expect(screen.getByText("tricky")).toBeInTheDocument();
  });

  it("applies the position class for top vs bottom", () => {
    const transport = new Transport(makeScore());
    const { container, rerender } = render(
      <SectionStrip
        state={makeState()}
        transport={transport}
        position="bottom"
        onChange={() => {}}
        onPositionChange={() => {}}
      />,
    );
    expect(container.querySelector(".section-strip")?.className).toMatch(/section-strip--bottom/);
    rerender(
      <SectionStrip
        state={makeState()}
        transport={transport}
        position="top"
        onChange={() => {}}
        onPositionChange={() => {}}
      />,
    );
    expect(container.querySelector(".section-strip")?.className).toMatch(/section-strip--top/);
  });
});
