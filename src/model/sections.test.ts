import { describe, it, expect } from "vitest";
import {
  normalize,
  newSectionId,
  newBookmarkId,
  type Section,
  type Bookmark,
  type SectionState,
} from "./sections";

function section(start: number, end: number, name = "X"): Section {
  return { id: newSectionId(), start, end, name, isAuto: true };
}

function bookmark(time: number, name = "B"): Bookmark {
  return { id: newBookmarkId(), time, name };
}

describe("normalize", () => {
  it("sorts sections by start", () => {
    const state: SectionState = {
      sections: [section(4, 6, "B"), section(0, 4, "A")],
      bookmarks: [],
      version: 1,
    };
    const out = normalize(state, 6);
    expect(out.sections.map((s) => s.name)).toEqual(["A", "B"]);
  });

  it("clamps the first section start to 0 and the last to duration", () => {
    const state: SectionState = {
      sections: [section(2, 4, "A"), section(4, 5, "B")],
      bookmarks: [],
      version: 1,
    };
    const out = normalize(state, 6);
    expect(out.sections[0].start).toBe(0);
    expect(out.sections.at(-1)?.end).toBe(6);
  });

  it("repairs adjacency: a section's end becomes the next section's start", () => {
    const state: SectionState = {
      sections: [section(0, 3, "A"), section(4, 6, "B")],
      bookmarks: [],
      version: 1,
    };
    const out = normalize(state, 6);
    expect(out.sections[0].end).toBe(out.sections[1].start);
  });

  it("drops sections with end <= start after repair", () => {
    const state: SectionState = {
      sections: [section(0, 0, "Bad"), section(0, 6, "Good")],
      bookmarks: [],
      version: 1,
    };
    const out = normalize(state, 6);
    expect(out.sections.map((s) => s.name)).toEqual(["Good"]);
  });

  it("returns a single fallback section when input has no sections", () => {
    const state: SectionState = { sections: [], bookmarks: [], version: 1 };
    const out = normalize(state, 10);
    expect(out.sections).toHaveLength(1);
    expect(out.sections[0]).toMatchObject({ start: 0, end: 10 });
  });

  it("sorts bookmarks by time and clamps them into [0, duration]", () => {
    const state: SectionState = {
      sections: [section(0, 10, "A")],
      bookmarks: [bookmark(11, "late"), bookmark(-1, "early"), bookmark(5, "mid")],
      version: 1,
    };
    const out = normalize(state, 10);
    expect(out.bookmarks.map((b) => b.time)).toEqual([0, 5, 10]);
  });
});

describe("id minting", () => {
  it("newSectionId returns unique strings", () => {
    expect(newSectionId()).not.toBe(newSectionId());
  });
});
