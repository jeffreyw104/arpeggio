import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { SectionStrip } from "./SectionStrip";
import { Transport } from "../transport/transport";
import { newSectionId, newBookmarkId, type SectionState } from "../model/sections";
import type { Score } from "../model/score";

function makeScore(): Score {
  return {
    source: "midi",
    notes: [],
    // 15 measures × 4 sec = 60 sec. Multi-measure so bookmark snap-to-measure
    // behavior is exercisable.
    measures: Array.from({ length: 15 }, (_, i) => ({
      index: i,
      start: i * 4,
      end: (i + 1) * 4,
      numerator: 4,
      denominator: 4,
    })),
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
      />,
    );
    expect(container.querySelector(".section-strip")?.className).toMatch(/section-strip--bottom/);
    rerender(
      <SectionStrip
        state={makeState()}
        transport={transport}
        position="top"
        onChange={() => {}}
      />,
    );
    expect(container.querySelector(".section-strip")?.className).toMatch(/section-strip--top/);
  });
});

describe("SectionStrip — click and key", () => {
  it("clicking a block seeks to its start", () => {
    const transport = new Transport(makeScore());
    const state = makeState();
    render(
      <SectionStrip
        state={state}
        transport={transport}
        position="bottom"
        onChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("Verse"));
    expect(transport.clock.position).toBeCloseTo(20, 5);
  });

  it("clicking a bookmark seeks to its time", () => {
    const transport = new Transport(makeScore());
    const state = makeState();
    render(
      <SectionStrip
        state={state}
        transport={transport}
        position="bottom"
        onChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("tricky"));
    expect(transport.clock.position).toBeCloseTo(25, 5);
  });

  it("S key adds a section at the current playhead", () => {
    const transport = new Transport(makeScore());
    transport.clock.seek(10);
    const state = makeState();
    let captured: SectionState | null = null;
    render(
      <SectionStrip
        state={state}
        transport={transport}
        position="bottom"
        onChange={(s) => (captured = s)}
      />,
    );
    fireEvent.keyDown(window, { key: "S" });
    expect(captured).not.toBeNull();
    expect(captured!.sections.some((s) => s.start === 10)).toBe(true);
  });

  it("B key adds a bookmark snapped to the nearest measure", () => {
    const transport = new Transport(makeScore());
    transport.clock.seek(33);
    const state = makeState();
    let captured: SectionState | null = null;
    render(
      <SectionStrip
        state={state}
        transport={transport}
        position="bottom"
        onChange={(s) => (captured = s)}
      />,
    );
    fireEvent.keyDown(window, { key: "B" });
    expect(captured).not.toBeNull();
    // measures: 0, 4, 8, …, 32, 36, … . Playhead at 33 snaps to measure 32.
    expect(captured!.bookmarks.some((b) => b.time === 32)).toBe(true);
    expect(captured!.bookmarks.some((b) => b.time === 33)).toBe(false);
  });

  it("S/B keys are ignored when an input is focused", () => {
    const transport = new Transport(makeScore());
    let captured: SectionState | null = null;
    render(
      <>
        <input data-testid="dummy" />
        <SectionStrip
          state={makeState()}
          transport={transport}
          position="bottom"
          onChange={(s) => (captured = s)}
        />
      </>,
    );
    const dummy = screen.getByTestId("dummy");
    dummy.focus();
    fireEvent.keyDown(dummy, { key: "S" });
    expect(captured).toBeNull();
  });
});

describe("SectionStrip — rename, menu, loop", () => {
  it("renaming a section via right-click menu commits on Enter", () => {
    const transport = new Transport(makeScore());
    const state = makeState();
    let captured: SectionState | null = null;
    render(
      <SectionStrip
        state={state}
        transport={transport}
        position="bottom"
        onChange={(s) => (captured = s)}
      />,
    );
    fireEvent.contextMenu(screen.getByText("Verse"));
    fireEvent.click(screen.getByText("Rename"));
    const input = screen.getByLabelText("Rename section") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Chorus" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(captured).not.toBeNull();
    expect(captured!.sections.find((s) => s.name === "Chorus")).toBeDefined();
  });

  it("double-clicking a section block creates a 📌 bookmark instead of renaming", () => {
    const transport = new Transport(makeScore());
    const state = makeState();
    let captured: SectionState | null = null;
    render(
      <SectionStrip
        state={state}
        transport={transport}
        position="bottom"
        onChange={(s) => (captured = s)}
      />,
    );
    const verseBlock = screen.getByText("Verse").closest(".section-strip__block");
    expect(verseBlock).not.toBeNull();
    fireEvent.doubleClick(verseBlock!);
    expect(captured).not.toBeNull();
    expect(captured!.bookmarks.length).toBe(state.bookmarks.length + 1);
    expect(screen.queryByLabelText("Rename section")).not.toBeInTheDocument();
  });

  it("right-click on a section opens a Rename/Merge-right/Merge-left menu", () => {
    const transport = new Transport(makeScore());
    const state = makeState();
    render(
      <SectionStrip
        state={state}
        transport={transport}
        position="bottom"
        onChange={() => {}}
      />,
    );
    fireEvent.contextMenu(screen.getByText("Verse"));
    expect(screen.getByText("Rename")).toBeInTheDocument();
    expect(screen.getByText("Merge with right")).toBeInTheDocument();
    expect(screen.getByText("Merge with left")).toBeInTheDocument();
    expect(screen.queryByText("Delete section")).not.toBeInTheDocument();
    expect(screen.queryByText("Split here")).not.toBeInTheDocument();
  });

  it("'Loop to next mark' on a bookmark loops to the next mark's time", () => {
    const transport = new Transport(makeScore());
    const state: SectionState = {
      sections: [
        { id: "s", start: 0, end: 60, name: "Whole", isAuto: true },
      ],
      bookmarks: [
        { id: "m1", time: 10, name: "A" },
        { id: "m2", time: 30, name: "B" },
      ],
      version: 1,
    };
    render(
      <SectionStrip
        state={state}
        transport={transport}
        position="bottom"
        onChange={() => {}}
      />,
    );
    fireEvent.contextMenu(screen.getByText("A"));
    fireEvent.click(screen.getByText("Loop to next mark"));
    expect(transport.clock.loop).toEqual({ start: 10, end: 30 });
  });
});

describe("SectionStrip — undo", () => {
  it("'Undo' button is disabled until there is history; click calls onUndo", () => {
    const transport = new Transport(makeScore());
    const onUndo = vi.fn();
    const { rerender } = render(
      <SectionStrip
        state={makeState()}
        transport={transport}
        position="bottom"
        onChange={() => {}}
        canUndo={false}
        onUndo={onUndo}
      />,
    );
    const btn = screen.getByRole("button", { name: /Undo last edit/i });
    expect(btn).toBeDisabled();

    rerender(
      <SectionStrip
        state={makeState()}
        transport={transport}
        position="bottom"
        onChange={() => {}}
        canUndo={true}
        onUndo={onUndo}
      />,
    );
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(onUndo).toHaveBeenCalledTimes(1);
  });
});
