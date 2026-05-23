import { describe, it, expect } from "vitest";
import {
  renameSection,
  splitAt,
  mergeRight,
  resizeBoundary,
  deleteSection,
  addSection,
  addBookmark,
  renameBookmark,
  deleteBookmark,
} from "./edits";
import {
  newSectionId,
  newBookmarkId,
  normalize,
  type SectionState,
} from "../model/sections";

const DURATION = 60;

function freshState(): SectionState {
  return normalize(
    {
      sections: [
        { id: "a", start: 0, end: 20, name: "A", isAuto: true },
        { id: "b", start: 20, end: 40, name: "B", isAuto: true },
        { id: "c", start: 40, end: 60, name: "C", isAuto: true },
      ],
      bookmarks: [{ id: "m1", time: 25, name: "Mark" }],
      version: 1,
    },
    DURATION,
  );
}

describe("renameSection", () => {
  it("updates name and flips isAuto to false; other fields unchanged", () => {
    const before = freshState();
    const next = renameSection(before, "b", "Verse", DURATION);
    const b = next.sections.find((s) => s.id === "b")!;
    expect(b.name).toBe("Verse");
    expect(b.isAuto).toBe(false);
    expect(b.start).toBe(20);
    expect(b.end).toBe(40);
  });
});

describe("splitAt", () => {
  it("splits a section into two parts summing to the original range", () => {
    const before = freshState();
    const next = splitAt(before, "b", 28, DURATION);
    const bs = next.sections.filter((s) => s.start >= 20 && s.end <= 40);
    expect(bs).toHaveLength(2);
    expect(bs[0].end).toBe(28);
    expect(bs[1].start).toBe(28);
    expect(bs.every((s) => !s.isAuto)).toBe(true);
  });

  it("no-ops when split time is at the section boundary", () => {
    const before = freshState();
    const next = splitAt(before, "b", 20, DURATION);
    expect(next.sections.length).toBe(before.sections.length);
  });
});

describe("mergeRight", () => {
  it("merges a section with its right neighbour, keeping the left's name", () => {
    const before = freshState();
    const next = mergeRight(before, "a", DURATION);
    expect(next.sections.length).toBe(2);
    expect(next.sections[0]).toMatchObject({ start: 0, end: 40, name: "A", isAuto: false });
  });

  it("no-ops when there is no right neighbour", () => {
    const before = freshState();
    const next = mergeRight(before, "c", DURATION);
    expect(next).toBe(before);
  });
});

describe("resizeBoundary", () => {
  it("moves the boundary between two siblings and preserves the cover", () => {
    const before = freshState();
    // Boundary between b (20-40) and c (40-60) moves to 30.
    const next = resizeBoundary(before, "b", 30, DURATION);
    const b = next.sections.find((s) => s.id === "b")!;
    const c = next.sections.find((s) => s.id === "c")!;
    expect(b.end).toBe(30);
    expect(c.start).toBe(30);
    expect(b.isAuto).toBe(false);
    expect(c.isAuto).toBe(false);
  });

  it("clamps so neither side becomes shorter than minSeconds", () => {
    const before = freshState();
    const next = resizeBoundary(before, "b", 20.0001, DURATION, 1);
    const b = next.sections.find((s) => s.id === "b")!;
    expect(b.end).toBeGreaterThanOrEqual(21);
  });
});

describe("deleteSection", () => {
  it("absorbs the deleted section's range into its left neighbour", () => {
    const before = freshState();
    const next = deleteSection(before, "b", DURATION);
    expect(next.sections.length).toBe(2);
    expect(next.sections[0].end).toBe(40);
  });

  it("absorbs into the right neighbour when deleting the first section", () => {
    const before = freshState();
    const next = deleteSection(before, "a", DURATION);
    expect(next.sections[0].start).toBe(0);
    expect(next.sections[0].id).toBe("b");
  });
});

describe("addSection", () => {
  it("inserts a section boundary at the given time", () => {
    const before = freshState();
    const next = addSection(before, 10, DURATION);
    expect(next.sections.length).toBe(4);
    const split = next.sections.find((s) => s.start === 10);
    expect(split).toBeDefined();
  });

  it("no-ops at duration 0 and duration end", () => {
    const before = freshState();
    expect(addSection(before, 0, DURATION).sections.length).toBe(before.sections.length);
    expect(addSection(before, DURATION, DURATION).sections.length).toBe(before.sections.length);
  });
});

describe("bookmarks", () => {
  it("addBookmark inserts in time order", () => {
    const before = freshState();
    const next = addBookmark(before, 50, "Late", DURATION);
    expect(next.bookmarks.map((b) => b.time)).toEqual([25, 50]);
  });

  it("renameBookmark only changes the name", () => {
    const before = freshState();
    const id = before.bookmarks[0].id;
    const next = renameBookmark(before, id, "Renamed");
    expect(next.bookmarks[0].name).toBe("Renamed");
  });

  it("deleteBookmark removes it", () => {
    const before = freshState();
    const id = before.bookmarks[0].id;
    const next = deleteBookmark(before, id);
    expect(next.bookmarks).toEqual([]);
  });
});
