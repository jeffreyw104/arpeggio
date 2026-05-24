/**
 * Touch-specific tests for SectionStrip.
 * Kept in a separate file so that the module-level vi.mock for
 * useIsTouchDevice doesn't interfere with the existing desktop-oriented
 * SectionStrip.test.tsx suite.
 */
import { describe, it, expect, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import type { SectionState } from "../model/sections";
import { newSectionId, newBookmarkId } from "../model/sections";
import type { Score } from "../model/score";
import { Transport } from "../transport/transport";

// Force touch mode for every test in this file.
vi.mock("../responsive/useIsTouchDevice", () => ({
  useIsTouchDevice: () => true,
}));

// Import AFTER the mock is in place.
import { SectionStrip } from "./SectionStrip";

function makeScore(): Score {
  return {
    source: "midi",
    notes: [],
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

describe("SectionStrip — touch long-press", () => {
  it("long-press on empty bookmarks lane creates a bookmark under touch", async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const baseState = makeState();
    const transport = new Transport(makeScore());
    const { container } = render(
      <SectionStrip
        state={baseState}
        transport={transport}
        position="bottom"
        onChange={onChange}
      />,
    );
    const bookmarksLane = container.querySelector(".section-strip__bookmarks") as HTMLElement;
    expect(bookmarksLane).not.toBeNull();

    fireEvent.pointerDown(bookmarksLane, { clientX: 200, clientY: 10 });
    act(() => { vi.advanceTimersByTime(500); });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].bookmarks.length).toBe(
      baseState.bookmarks.length + 1,
    );
    vi.useRealTimers();
  });

  it("long-press on a bookmark pin opens the bookmark context menu", async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const baseState = makeState();
    const transport = new Transport(makeScore());
    const { container } = render(
      <SectionStrip
        state={baseState}
        transport={transport}
        position="bottom"
        onChange={onChange}
      />,
    );
    const bookmarkEl = container.querySelector(".section-strip__bookmark") as HTMLElement;
    expect(bookmarkEl).not.toBeNull();

    fireEvent.pointerDown(bookmarkEl, { clientX: 100, clientY: 10 });
    act(() => { vi.advanceTimersByTime(500); });

    // Menu should appear — onChange NOT called (no mutation for menu open).
    expect(onChange).not.toHaveBeenCalled();
    // Context menu renders as a list
    const menu = container.querySelector(".section-strip__menu");
    expect(menu).not.toBeNull();
    vi.useRealTimers();
  });

  it("long-press on a section block opens the section context menu", async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const baseState = makeState();
    const transport = new Transport(makeScore());
    const { container } = render(
      <SectionStrip
        state={baseState}
        transport={transport}
        position="bottom"
        onChange={onChange}
      />,
    );
    const blockEl = container.querySelector(".section-strip__block") as HTMLElement;
    expect(blockEl).not.toBeNull();

    fireEvent.pointerDown(blockEl, { clientX: 150, clientY: 30 });
    act(() => { vi.advanceTimersByTime(500); });

    expect(onChange).not.toHaveBeenCalled();
    const menu = container.querySelector(".section-strip__menu");
    expect(menu).not.toBeNull();
    vi.useRealTimers();
  });

  it("adds section-strip--touch class to root element when touch device", () => {
    const baseState = makeState();
    const transport = new Transport(makeScore());
    const { container } = render(
      <SectionStrip
        state={baseState}
        transport={transport}
        position="bottom"
        onChange={() => {}}
      />,
    );
    const root = container.querySelector(".section-strip");
    expect(root?.className).toMatch(/section-strip--touch/);
  });
});
