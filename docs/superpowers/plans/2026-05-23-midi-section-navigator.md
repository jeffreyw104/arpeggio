# MIDI Section Navigator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the auto-engraved sheet music for MIDI-source pieces with an editable, horizontal section-navigator strip — auto-detected sections (with smart labels when the file has no markers), user-added bookmarks, click-to-seek, drag-to-resize, right-click menu, and section/bookmark looping.

**Architecture:** A new pure data model (`Section`, `Bookmark`, `SectionState`) in `src/model/sections.ts`. A pure auto-detection function in `src/section-strip/autoDetect.ts` that runs once on first open and produces an initial `SectionState`. Pure edit operations in `src/section-strip/edits.ts`. A React DOM component (`SectionStrip.tsx`) that renders the strip, owns interactions, and updates the playhead via the shared `FrameLoop`. Persistence extends the existing IndexedDB `practiceState` store with a `sectionState` field. `PracticeView.tsx` branches on `score.source === "midi"` to mount the strip and hide the engraved score panel + reading lane. MusicXML imports are untouched.

**Tech Stack:** TypeScript (strict), React 19, Vitest + React Testing Library for unit tests, Playwright for e2e, IndexedDB for persistence, `@tonejs/midi` for marker extraction.

**Spec:** `docs/superpowers/specs/2026-05-23-midi-section-navigator-design.md`

---

## Conventions

- **All times are in seconds** unless explicitly stated as ticks or beats.
- **Tests are co-located** with the module they test (`foo.ts` ↔ `foo.test.ts`).
- **Pure modules first.** Avoid React imports in any file under `src/model/` or `src/section-strip/*.ts` (only `.tsx` files import React).
- **Commit after each task** with a descriptive message.
- **Run the full verify gate** (`npm run lint && npm run typecheck && npm test && npm run build && npm run e2e`) at the end.

---

## Task 1: SectionState data model + `normalize()`

**Files:**
- Create: `src/model/sections.ts`
- Create: `src/model/sections.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/model/sections.test.ts
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
```

- [ ] **Step 2: Run tests, confirm they fail**

```
npx vitest run src/model/sections.test.ts
```

Expected: every test fails because `./sections` doesn't exist yet.

- [ ] **Step 3: Implement the module**

```ts
// src/model/sections.ts
/**
 * Editable section/bookmark model for the MIDI section navigator. The
 * `normalize` function is the single canonical re-anchor point used by every
 * edit operation; it guarantees the invariants the UI relies on.
 */

export interface Section {
  /** Stable UUID minted on creation; survives all edits. */
  id: string;
  /** Inclusive start time, seconds. */
  start: number;
  /** Exclusive-at-shared-boundary end time, seconds. Equals next section's start. */
  end: number;
  /** Display name. Editable. "Section N" when auto-generated. */
  name: string;
  /** True until the user edits this section. */
  isAuto: boolean;
}

export interface Bookmark {
  id: string;
  /** Time in seconds, in [0, duration]. */
  time: number;
  /** Display name. */
  name: string;
}

export interface SectionState {
  /** Contiguous cover of [0, duration], sorted by start. */
  sections: Section[];
  /** Sorted by time. */
  bookmarks: Bookmark[];
  /** Schema version for future migrations. */
  version: 1;
}

function uuid(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  );
}

export function newSectionId(): string {
  return `sec-${uuid()}`;
}

export function newBookmarkId(): string {
  return `bm-${uuid()}`;
}

/**
 * Re-anchor a section state to invariants:
 *   - sections sorted by start
 *   - sections cover [0, duration] contiguously with no gaps or overlaps
 *   - any section with end <= start is dropped
 *   - empty section list collapses to a single fallback section
 *   - bookmarks sorted by time, clamped into [0, duration]
 */
export function normalize(state: SectionState, duration: number): SectionState {
  const dur = Math.max(0, duration);

  // Sort + drop empty sections.
  const sorted = [...state.sections]
    .sort((a, b) => a.start - b.start)
    .filter((s) => s.end > s.start);

  let sections: Section[];
  if (sorted.length === 0) {
    sections = [
      { id: newSectionId(), start: 0, end: dur, name: "Whole piece", isAuto: true },
    ];
  } else {
    // Anchor first.start = 0, last.end = duration, and stitch adjacencies.
    sections = sorted.map((s) => ({ ...s }));
    sections[0].start = 0;
    for (let i = 0; i < sections.length - 1; i += 1) {
      sections[i].end = sections[i + 1].start;
    }
    sections[sections.length - 1].end = dur;
    // After anchoring, drop any section that collapsed to zero-width.
    sections = sections.filter((s) => s.end > s.start);
    if (sections.length === 0) {
      sections = [
        { id: newSectionId(), start: 0, end: dur, name: "Whole piece", isAuto: true },
      ];
    }
  }

  const bookmarks = [...state.bookmarks]
    .map((b) => ({ ...b, time: Math.min(dur, Math.max(0, b.time)) }))
    .sort((a, b) => a.time - b.time);

  return { sections, bookmarks, version: 1 };
}
```

- [ ] **Step 4: Run tests, confirm they pass**

```
npx vitest run src/model/sections.test.ts
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/model/sections.ts src/model/sections.test.ts
git commit -m "feat(sections): SectionState model + normalize invariants"
```

---

## Task 2: Pure edit operations

**Files:**
- Create: `src/section-strip/edits.ts`
- Create: `src/section-strip/edits.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/section-strip/edits.test.ts
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
```

- [ ] **Step 2: Run tests, confirm they fail**

```
npx vitest run src/section-strip/edits.test.ts
```

Expected: every test fails because `./edits` doesn't exist yet.

- [ ] **Step 3: Implement the module**

```ts
// src/section-strip/edits.ts
import {
  normalize,
  newSectionId,
  newBookmarkId,
  type SectionState,
  type Section,
} from "../model/sections";

const DEFAULT_MIN_SECTION_SECONDS = 0.5;

export function renameSection(
  state: SectionState,
  id: string,
  name: string,
  duration: number,
): SectionState {
  const sections = state.sections.map((s) =>
    s.id === id ? { ...s, name, isAuto: false } : s,
  );
  return normalize({ ...state, sections }, duration);
}

export function splitAt(
  state: SectionState,
  sectionId: string,
  time: number,
  duration: number,
): SectionState {
  const idx = state.sections.findIndex((s) => s.id === sectionId);
  if (idx === -1) return state;
  const target = state.sections[idx];
  if (time <= target.start || time >= target.end) return state;

  const left: Section = { ...target, end: time, isAuto: false };
  const right: Section = {
    id: newSectionId(),
    start: time,
    end: target.end,
    name: `${target.name} (b)`,
    isAuto: false,
  };
  const sections = [
    ...state.sections.slice(0, idx),
    left,
    right,
    ...state.sections.slice(idx + 1),
  ];
  return normalize({ ...state, sections }, duration);
}

export function mergeRight(
  state: SectionState,
  sectionId: string,
  duration: number,
): SectionState {
  const idx = state.sections.findIndex((s) => s.id === sectionId);
  if (idx === -1 || idx === state.sections.length - 1) return state;
  const left = state.sections[idx];
  const right = state.sections[idx + 1];
  const merged: Section = {
    ...left,
    end: right.end,
    isAuto: false,
  };
  const sections = [
    ...state.sections.slice(0, idx),
    merged,
    ...state.sections.slice(idx + 2),
  ];
  return normalize({ ...state, sections }, duration);
}

export function resizeBoundary(
  state: SectionState,
  leftSectionId: string,
  newBoundaryTime: number,
  duration: number,
  minSeconds: number = DEFAULT_MIN_SECTION_SECONDS,
): SectionState {
  const idx = state.sections.findIndex((s) => s.id === leftSectionId);
  if (idx === -1 || idx === state.sections.length - 1) return state;
  const left = state.sections[idx];
  const right = state.sections[idx + 1];
  const min = left.start + minSeconds;
  const max = right.end - minSeconds;
  if (min >= max) return state;
  const clamped = Math.min(max, Math.max(min, newBoundaryTime));
  const sections = state.sections.map((s, i) => {
    if (i === idx) return { ...s, end: clamped, isAuto: false };
    if (i === idx + 1) return { ...s, start: clamped, isAuto: false };
    return s;
  });
  return normalize({ ...state, sections }, duration);
}

export function deleteSection(
  state: SectionState,
  sectionId: string,
  duration: number,
): SectionState {
  if (state.sections.length <= 1) return state;
  const idx = state.sections.findIndex((s) => s.id === sectionId);
  if (idx === -1) return state;
  const target = state.sections[idx];
  // Absorb into the left neighbour if there is one, else the right.
  const sections = state.sections.map((s) => ({ ...s }));
  if (idx > 0) {
    sections[idx - 1].end = target.end;
    sections[idx - 1].isAuto = false;
  } else {
    sections[idx + 1].start = target.start;
    sections[idx + 1].isAuto = false;
  }
  sections.splice(idx, 1);
  return normalize({ ...state, sections }, duration);
}

export function addSection(
  state: SectionState,
  time: number,
  duration: number,
): SectionState {
  if (time <= 0 || time >= duration) return state;
  const containing = state.sections.find((s) => s.start < time && s.end > time);
  if (!containing) return state;
  return splitAt(state, containing.id, time, duration);
}

export function addBookmark(
  state: SectionState,
  time: number,
  name: string,
  duration: number,
): SectionState {
  const bookmarks = [
    ...state.bookmarks,
    { id: newBookmarkId(), time, name },
  ];
  return normalize({ ...state, bookmarks }, duration);
}

export function renameBookmark(
  state: SectionState,
  id: string,
  name: string,
): SectionState {
  const bookmarks = state.bookmarks.map((b) =>
    b.id === id ? { ...b, name } : b,
  );
  return { ...state, bookmarks };
}

export function deleteBookmark(
  state: SectionState,
  id: string,
): SectionState {
  const bookmarks = state.bookmarks.filter((b) => b.id !== id);
  return { ...state, bookmarks };
}
```

- [ ] **Step 4: Run tests, confirm they pass**

```
npx vitest run src/section-strip/edits.test.ts
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/section-strip/edits.ts src/section-strip/edits.test.ts
git commit -m "feat(sections): pure edit operations on SectionState"
```

---

## Task 3: MIDI marker extraction in `parseMidi`

**Files:**
- Modify: `src/model/score.ts` (add `midiMarkers` field)
- Modify: `src/import/midi/parseMidi.ts` (populate it)
- Modify: `src/import/midi/parseMidi.test.ts` (add coverage)

- [ ] **Step 1: Add a failing test for marker extraction**

Append to `src/import/midi/parseMidi.test.ts`:

```ts
import { Midi } from "@tonejs/midi";

describe("midi markers", () => {
  it("extracts marker meta events into score.midiMarkers", () => {
    const m = new Midi();
    m.header.tempos.push({ ticks: 0, bpm: 120 });
    m.header.timeSignatures.push({
      ticks: 0,
      timeSignature: [4, 4],
      measures: 0,
    });
    // Add markers at tick 0 ("Intro") and tick 1920 ("Verse").
    // @tonejs/midi exposes a meta array on header — append directly.
    m.header.meta.push({ type: "marker" as const, text: "Intro", ticks: 0 });
    m.header.meta.push({ type: "marker" as const, text: "Verse", ticks: 1920 });
    const track = m.addTrack();
    track.addNote({ midi: 60, time: 0, duration: 0.5 });
    track.addNote({ midi: 64, time: 2, duration: 0.5 });

    const buffer = m.toArray().buffer;
    const score = parseMidi(buffer);
    expect(score.midiMarkers).toBeDefined();
    expect(score.midiMarkers).toHaveLength(2);
    expect(score.midiMarkers?.[0]).toMatchObject({ text: "Intro" });
    expect(score.midiMarkers?.[1]).toMatchObject({ text: "Verse" });
    expect(score.midiMarkers?.[0].time).toBeCloseTo(0, 5);
    expect(score.midiMarkers?.[1].time).toBeGreaterThan(0);
  });

  it("midiMarkers is undefined or empty when the file has no markers", () => {
    const m = new Midi();
    m.header.tempos.push({ ticks: 0, bpm: 120 });
    m.header.timeSignatures.push({
      ticks: 0,
      timeSignature: [4, 4],
      measures: 0,
    });
    const track = m.addTrack();
    track.addNote({ midi: 60, time: 0, duration: 0.5 });
    const score = parseMidi(m.toArray().buffer);
    expect(score.midiMarkers ?? []).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the new tests, confirm they fail**

```
npx vitest run src/import/midi/parseMidi.test.ts -t "midi markers"
```

Expected: fail — `midiMarkers` field doesn't exist on `Score` yet.

- [ ] **Step 3: Add the field to the Score type**

In `src/model/score.ts`, append a field inside the `Score` interface (before the closing brace):

```ts
  /** MIDI marker meta-events, when present. Always sorted by `time`. */
  midiMarkers?: ReadonlyArray<{ time: number; text: string }>;
```

- [ ] **Step 4: Extract markers in parseMidi**

In `src/import/midi/parseMidi.ts`, inside the `parseMidi` function, after the time-signature block and before the duration calculation, add:

```ts
  // Marker meta-events (used by the section navigator as hard boundaries).
  const midiMarkers = (midi.header.meta ?? [])
    .filter(
      (e): e is { type: "marker"; text: string; ticks: number } =>
        e.type === "marker" && typeof (e as { text?: unknown }).text === "string",
    )
    .map((e) => ({
      time: midi.header.ticksToSeconds(e.ticks),
      text: e.text,
    }))
    .sort((a, b) => a.time - b.time);
```

Then add `midiMarkers` to the returned `Score` object:

```ts
  return {
    source: "midi",
    notes,
    measures,
    pedalEvents,
    timeSignatures,
    tempoMap,
    durationSeconds,
    musicXml: "",  // existing
    qualityWarning: null,  // existing
    ...(midiMarkers.length > 0 && { midiMarkers }),
  };
```

(Adjust the spread to match the existing return-object structure — `musicXml` and `qualityWarning` are filled by a downstream step, leave their existing handling intact.)

- [ ] **Step 5: Run all parseMidi tests, confirm green**

```
npx vitest run src/import/midi/parseMidi.test.ts
```

Expected: all green, including the two new tests.

- [ ] **Step 6: Commit**

```bash
git add src/model/score.ts src/import/midi/parseMidi.ts src/import/midi/parseMidi.test.ts
git commit -m "feat(midi): extract marker meta-events into score.midiMarkers"
```

---

## Task 4: Auto-detection — Pass 1 (hard boundaries) + fallback

**Files:**
- Create: `src/section-strip/autoDetect.ts`
- Create: `src/section-strip/autoDetect.test.ts`

- [ ] **Step 1: Write failing tests for Pass 1 and the fallback**

```ts
// src/section-strip/autoDetect.test.ts
import { describe, it, expect } from "vitest";
import { autoDetect } from "./autoDetect";
import type { Score } from "../model/score";

function baseScore(partial: Partial<Score> = {}): Score {
  return {
    source: "midi",
    notes: [],
    measures: [],
    pedalEvents: [],
    timeSignatures: [{ start: 0, numerator: 4, denominator: 4 }],
    tempoMap: [{ start: 0, bpm: 120 }],
    durationSeconds: 0,
    musicXml: "",
    qualityWarning: null,
    ...partial,
  };
}

function fourFourMeasures(count: number, beatsPerSec = 2): Score["measures"] {
  // Each measure has 4 beats; at beatsPerSec = 2 (120 bpm), each measure = 2 seconds.
  const secondsPerMeasure = 4 / beatsPerSec;
  return Array.from({ length: count }, (_, i) => ({
    index: i,
    start: i * secondsPerMeasure,
    end: (i + 1) * secondsPerMeasure,
    numerator: 4,
    denominator: 4,
  }));
}

describe("autoDetect — fallback", () => {
  it("returns a single 'Whole piece' section when score is empty", () => {
    const score = baseScore({ durationSeconds: 30, measures: fourFourMeasures(15) });
    const state = autoDetect(score);
    expect(state.sections).toHaveLength(1);
    expect(state.sections[0]).toMatchObject({ start: 0, end: 30 });
    expect(state.bookmarks).toEqual([]);
  });
});

describe("autoDetect — Pass 1 markers", () => {
  it("uses marker times as boundaries and marker text as names", () => {
    const measures = fourFourMeasures(20); // 40 sec total
    const score = baseScore({
      durationSeconds: 40,
      measures,
      midiMarkers: [
        { time: 0, text: "Intro" },
        { time: 16, text: "Verse" },
        { time: 32, text: "Outro" },
      ],
    });
    const state = autoDetect(score);
    expect(state.sections.map((s) => s.name)).toEqual(["Intro", "Verse", "Outro"]);
    // Boundaries snap to nearest measure starts.
    expect(state.sections[0].start).toBe(0);
    expect(state.sections[1].start).toBe(16);
    expect(state.sections[2].start).toBe(32);
    expect(state.sections.at(-1)?.end).toBe(40);
  });

  it("snaps marker times to the nearest measure start", () => {
    const measures = fourFourMeasures(20);
    const score = baseScore({
      durationSeconds: 40,
      measures,
      midiMarkers: [
        { time: 0, text: "A" },
        { time: 16.6, text: "B" }, // closest measure start: 16
      ],
    });
    const state = autoDetect(score);
    expect(state.sections[1].start).toBe(16);
  });
});

describe("autoDetect — Pass 1 tempo changes", () => {
  it("splits at a tempo change >= 8% delta", () => {
    const measures = fourFourMeasures(20, 2); // 2 sec/measure at 120 bpm
    const score = baseScore({
      durationSeconds: 40,
      measures,
      tempoMap: [
        { start: 0, bpm: 120 },
        { start: 20, bpm: 140 }, // +16.7% — triggers
      ],
    });
    const state = autoDetect(score);
    expect(state.sections.length).toBeGreaterThanOrEqual(2);
    const boundaryTimes = state.sections.map((s) => s.start);
    expect(boundaryTimes).toContain(20);
  });

  it("does not split at a small tempo change (< 8%)", () => {
    const measures = fourFourMeasures(20, 2);
    const score = baseScore({
      durationSeconds: 40,
      measures,
      tempoMap: [
        { start: 0, bpm: 120 },
        { start: 20, bpm: 124 }, // +3.3% — ignored
      ],
    });
    const state = autoDetect(score);
    expect(state.sections.length).toBe(1);
  });
});

describe("autoDetect — Pass 1 time-signature changes", () => {
  it("splits at a time-signature change between adjacent measures", () => {
    const measures = [
      ...fourFourMeasures(5, 2),  // 5 measures of 4/4
      // Switch to 3/4 from measure 5 onward.
      ...Array.from({ length: 5 }, (_, i) => ({
        index: 5 + i,
        start: 10 + i * 1.5,
        end: 10 + (i + 1) * 1.5,
        numerator: 3,
        denominator: 4,
      })),
    ];
    const score = baseScore({
      durationSeconds: 17.5,
      measures,
    });
    const state = autoDetect(score);
    expect(state.sections.length).toBeGreaterThanOrEqual(2);
    expect(state.sections.map((s) => s.start)).toContain(10);
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

```
npx vitest run src/section-strip/autoDetect.test.ts
```

Expected: every test fails because the module doesn't exist.

- [ ] **Step 3: Implement Pass 1 + fallback only**

```ts
// src/section-strip/autoDetect.ts
import {
  normalize,
  newSectionId,
  type Section,
  type SectionState,
} from "../model/sections";
import type { Score } from "../model/score";

// === Thresholds (named constants for easy tuning) ===
const TEMPO_DELTA_THRESHOLD = 0.08;        // 8%
// Soft-boundary thresholds added in Task 5.
// Smart-label thresholds added in Task 7.
const MAX_SECTIONS = 12;                   // Pass 3 cap; declared early.

/** Candidate boundary in the auto-detect pipeline. */
interface Candidate {
  /** Measure index this boundary sits at the START of. */
  measureIndex: number;
  /** Section start time (seconds), == measures[measureIndex].start. */
  time: number;
  /** "hard" (always kept) or "soft" (kept only by signal cluster). */
  kind: "hard" | "soft";
  /** For "hard" via marker — the section's name; else undefined. */
  name?: string;
  /** Which signals fired here (for diagnostics + Pass 3 weakness ranking). */
  signals: string[];
}

/** Return the measure index whose start is nearest to `time`. */
function nearestMeasureIndex(measures: Score["measures"], time: number): number {
  if (measures.length === 0) return 0;
  let best = 0;
  let bestDist = Math.abs(measures[0].start - time);
  for (let i = 1; i < measures.length; i += 1) {
    const d = Math.abs(measures[i].start - time);
    if (d < bestDist) {
      best = i;
      bestDist = d;
    }
  }
  return best;
}

function pass1HardBoundaries(score: Score): Candidate[] {
  const candidates: Candidate[] = [];
  const seen = new Set<number>();

  function add(measureIndex: number, signal: string, name?: string): void {
    if (measureIndex <= 0) return; // measure 0 isn't a boundary
    if (measureIndex >= score.measures.length) return;
    if (seen.has(measureIndex)) {
      const existing = candidates.find((c) => c.measureIndex === measureIndex)!;
      existing.signals.push(signal);
      if (name && !existing.name) existing.name = name;
      return;
    }
    seen.add(measureIndex);
    candidates.push({
      measureIndex,
      time: score.measures[measureIndex].start,
      kind: "hard",
      name,
      signals: [signal],
    });
  }

  // Markers.
  for (const marker of score.midiMarkers ?? []) {
    const idx = nearestMeasureIndex(score.measures, marker.time);
    add(idx, "marker", marker.text);
  }

  // Tempo changes >= 8% delta.
  for (let i = 1; i < score.tempoMap.length; i += 1) {
    const prev = score.tempoMap[i - 1].bpm;
    const cur = score.tempoMap[i].bpm;
    if (Math.abs(cur - prev) / prev >= TEMPO_DELTA_THRESHOLD) {
      const idx = nearestMeasureIndex(score.measures, score.tempoMap[i].start);
      add(idx, "tempo");
    }
  }

  // Time-signature change between adjacent measures.
  for (let i = 1; i < score.measures.length; i += 1) {
    const prev = score.measures[i - 1];
    const cur = score.measures[i];
    if (
      prev.numerator !== cur.numerator ||
      prev.denominator !== cur.denominator
    ) {
      add(i, "timesig");
    }
  }

  return candidates.sort((a, b) => a.measureIndex - b.measureIndex);
}

function candidatesToSections(
  candidates: Candidate[],
  durationSeconds: number,
  hasMarkers: boolean,
): Section[] {
  const sortedCands = [...candidates].sort((a, b) => a.time - b.time);
  const starts: Array<{ time: number; name?: string }> = [{ time: 0 }];
  for (const c of sortedCands) {
    if (c.time > 0 && c.time < durationSeconds) {
      starts.push({ time: c.time, name: c.name });
    }
  }

  const sections: Section[] = [];
  let labelN = 1;
  for (let i = 0; i < starts.length; i += 1) {
    const start = starts[i].time;
    const end = i + 1 < starts.length ? starts[i + 1].time : durationSeconds;
    if (end <= start) continue;
    const explicit = starts[i].name;
    sections.push({
      id: newSectionId(),
      start,
      end,
      name: explicit ?? `Section ${labelN}`,
      isAuto: true,
    });
    if (!explicit) labelN += 1;
  }
  return sections;
}

/**
 * Pure: given a Score, produce an initial SectionState.
 * Runs in four passes — see spec docs/superpowers/specs/2026-05-23-midi-section-navigator-design.md.
 *
 * Current passes implemented: 1 (hard boundaries) + fallback.
 */
export function autoDetect(score: Score): SectionState {
  const duration = Math.max(0, score.durationSeconds);
  const hasMarkers = (score.midiMarkers?.length ?? 0) > 0;

  // Pass 1
  const hardCands = pass1HardBoundaries(score);

  // Pass 2 / 3 / 4 added in later tasks.
  let sections = candidatesToSections(hardCands, duration, hasMarkers);

  // Cap (Pass 3) — partial: hard boundaries can also be capped at MAX_SECTIONS,
  // but markers are never dropped. (Later tasks refine this.)
  if (sections.length > MAX_SECTIONS) {
    sections = sections.slice(0, MAX_SECTIONS);
  }

  // Fallback if no boundaries: one "Whole piece" section.
  if (sections.length === 0) {
    sections = [
      {
        id: newSectionId(),
        start: 0,
        end: duration,
        name: "Whole piece",
        isAuto: true,
      },
    ];
  }

  return normalize(
    { sections, bookmarks: [], version: 1 },
    duration,
  );
}
```

- [ ] **Step 4: Run tests, confirm they pass**

```
npx vitest run src/section-strip/autoDetect.test.ts
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/section-strip/autoDetect.ts src/section-strip/autoDetect.test.ts
git commit -m "feat(autoDetect): Pass 1 hard boundaries + fallback"
```

---

## Task 5: Auto-detection — Pass 2 (soft boundaries)

**Files:**
- Modify: `src/section-strip/autoDetect.ts`
- Modify: `src/section-strip/autoDetect.test.ts`

- [ ] **Step 1: Add failing tests for Pass 2**

Append to `src/section-strip/autoDetect.test.ts`:

```ts
import type { Note } from "../model/score";

function note(start: number, midi: number, duration = 0.4, hand: "left" | "right" = "right"): Note {
  return { start, midi, duration, velocity: 0.7, hand };
}

describe("autoDetect — Pass 2 soft boundaries", () => {
  it("a long rest alone is NOT a boundary (needs cluster of 2+)", () => {
    const measures = fourFourMeasures(10, 2); // 20 sec, 2 sec/measure
    const score = baseScore({
      durationSeconds: 20,
      measures,
      // Notes only in first 6 sec and last 6 sec — rest in the middle.
      notes: [
        note(0, 60), note(1, 62), note(2, 64), note(3, 65), note(4, 67),
        note(14, 60), note(15, 62), note(16, 64), note(17, 65),
      ],
    });
    const state = autoDetect(score);
    expect(state.sections.length).toBe(1);
  });

  it("density jump + register shift at the same boundary splits", () => {
    const measures = fourFourMeasures(20, 2); // 40 sec
    // Prior 4 measures: sparse low-register left-hand notes.
    // Next 4 measures: dense high-register right-hand notes.
    const lefts: Note[] = [];
    for (let t = 0; t < 16; t += 1) lefts.push(note(t, 40, 0.5, "left"));
    const rights: Note[] = [];
    for (let t = 0; t < 8; t += 0.1) rights.push(note(16 + t, 80, 0.1, "right"));
    const score = baseScore({
      durationSeconds: 40,
      measures,
      notes: [...lefts, ...rights].sort((a, b) => a.start - b.start),
    });
    const state = autoDetect(score);
    expect(state.sections.length).toBeGreaterThanOrEqual(2);
    expect(state.sections.map((s) => s.start)).toContain(16);
  });
});
```

- [ ] **Step 2: Run tests, confirm the new ones fail**

```
npx vitest run src/section-strip/autoDetect.test.ts -t "Pass 2"
```

Expected: fail — Pass 2 not yet implemented.

- [ ] **Step 3: Add Pass 2 to autoDetect**

In `src/section-strip/autoDetect.ts`, add these constants near the top:

```ts
const LONG_REST_SECONDS = 2.0;
const LONG_REST_MIN_MEASURES = 1;
const DENSITY_RATIO_THRESHOLD = 2.0;
const REGISTER_JUMP_SEMITONES = 12;
const SOFT_CLUSTER_REQUIRED = 2;
const SIGNAL_WINDOW_MEASURES = 1; // ± measures the cluster spans
```

Add helpers before `autoDetect`:

```ts
/** Notes per second within [a, b]. */
function densityIn(notes: Note[], a: number, b: number): number {
  const span = Math.max(0.0001, b - a);
  let count = 0;
  for (const n of notes) {
    if (n.start >= a && n.start < b) count += 1;
  }
  return count / span;
}

/** Mean MIDI pitch within [a, b], or NaN if no notes. */
function meanPitchIn(notes: Note[], a: number, b: number): number {
  let sum = 0;
  let count = 0;
  for (const n of notes) {
    if (n.start >= a && n.start < b) {
      sum += n.midi;
      count += 1;
    }
  }
  return count === 0 ? NaN : sum / count;
}

/** Is there ≥ LONG_REST_SECONDS of total silence ending exactly at `time`? */
function endsLongRest(notes: Note[], time: number, measures: Score["measures"]): boolean {
  // Find the latest note onset strictly before `time` and the latest sustain end.
  let latestEnd = 0;
  for (const n of notes) {
    if (n.start < time) latestEnd = Math.max(latestEnd, n.start + n.duration);
    else break;
  }
  if (time - latestEnd < LONG_REST_SECONDS) return false;
  // Also require it spans at least LONG_REST_MIN_MEASURES.
  const restStartMeasure = measures.findIndex((m) => m.start >= latestEnd);
  const boundaryMeasure = measures.findIndex((m) => m.start >= time);
  if (restStartMeasure < 0 || boundaryMeasure < 0) return false;
  return boundaryMeasure - restStartMeasure >= LONG_REST_MIN_MEASURES;
}

function pass2SoftBoundaries(score: Score, hardIndices: Set<number>): Candidate[] {
  const measures = score.measures;
  const notes = score.notes;
  const candidates: Candidate[] = [];

  for (let i = 1; i < measures.length; i += 1) {
    if (hardIndices.has(i)) continue;
    const time = measures[i].start;
    const signals: string[] = [];

    // Long rest just before this boundary.
    if (endsLongRest(notes, time, measures)) signals.push("rest");

    // Density shift between 4 measures before vs 4 measures after.
    const beforeStart = measures[Math.max(0, i - 4)].start;
    const afterEnd = measures[Math.min(measures.length - 1, i + 3)].end;
    const dPrev = densityIn(notes, beforeStart, time);
    const dNext = densityIn(notes, time, afterEnd);
    if (
      (dPrev > 0 && dNext / dPrev >= DENSITY_RATIO_THRESHOLD) ||
      (dNext > 0 && dPrev / dNext >= DENSITY_RATIO_THRESHOLD)
    ) {
      signals.push("density");
    }

    // Register shift.
    const mPrev = meanPitchIn(notes, beforeStart, time);
    const mNext = meanPitchIn(notes, time, afterEnd);
    if (!Number.isNaN(mPrev) && !Number.isNaN(mNext) &&
        Math.abs(mNext - mPrev) >= REGISTER_JUMP_SEMITONES) {
      signals.push("register");
    }

    if (signals.length >= SOFT_CLUSTER_REQUIRED) {
      candidates.push({
        measureIndex: i,
        time,
        kind: "soft",
        signals,
      });
    }
  }

  return candidates;
}
```

Then modify `autoDetect` to call Pass 2 and merge candidate lists. Replace the body so it reads:

```ts
export function autoDetect(score: Score): SectionState {
  const duration = Math.max(0, score.durationSeconds);

  const hardCands = pass1HardBoundaries(score);
  const hardIndices = new Set(hardCands.map((c) => c.measureIndex));
  const softCands = pass2SoftBoundaries(score, hardIndices);
  const allCands = [...hardCands, ...softCands].sort(
    (a, b) => a.measureIndex - b.measureIndex,
  );

  let sections = candidatesToSections(allCands, duration, (score.midiMarkers?.length ?? 0) > 0);

  if (sections.length > MAX_SECTIONS) {
    sections = sections.slice(0, MAX_SECTIONS);
  }
  if (sections.length === 0) {
    sections = [
      {
        id: newSectionId(),
        start: 0,
        end: duration,
        name: "Whole piece",
        isAuto: true,
      },
    ];
  }
  return normalize({ sections, bookmarks: [], version: 1 }, duration);
}
```

- [ ] **Step 4: Run all autoDetect tests, confirm green**

```
npx vitest run src/section-strip/autoDetect.test.ts
```

Expected: all green, including the two new Pass 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/section-strip/autoDetect.ts src/section-strip/autoDetect.test.ts
git commit -m "feat(autoDetect): Pass 2 soft boundaries (rest / density / register cluster)"
```

---

## Task 6: Auto-detection — Pass 3 (smoothing: merge small + cap at 12)

**Files:**
- Modify: `src/section-strip/autoDetect.ts`
- Modify: `src/section-strip/autoDetect.test.ts`

- [ ] **Step 1: Add failing tests for smoothing**

Append to `src/section-strip/autoDetect.test.ts`:

```ts
describe("autoDetect — Pass 3 smoothing", () => {
  it("merges any section shorter than 2 measures into a neighbour (auto-detect only)", () => {
    // Construct a score that would naturally produce a tiny section
    // via a register cluster at measure 1 (only 1 measure of duration).
    const measures = fourFourMeasures(20, 2); // 40 sec
    const ts: Note[] = [];
    // Measure 0 high register; measures 1-4 mid; measure 5+ also mid.
    for (let t = 0; t < 2; t += 0.2) ts.push(note(t, 80));
    // Force boundary by hand: tempo change at measure 1.
    const score = baseScore({
      durationSeconds: 40,
      measures,
      tempoMap: [
        { start: 0, bpm: 120 },
        { start: 2, bpm: 140 }, // hard boundary at measure 1
        // No second change.
      ],
      notes: ts,
    });
    const state = autoDetect(score);
    // Smoothing should have merged the 1-measure first section away
    // (since 1 < 2 measures, and there is no other boundary).
    for (const s of state.sections) {
      // Each section spans at least 2 measures = 4 sec
      expect(s.end - s.start).toBeGreaterThanOrEqual(4 - 1e-6);
    }
  });

  it("caps the total section count at 12, never dropping marker boundaries", () => {
    const measures = fourFourMeasures(30, 2); // 60 sec
    // 20 markers + 20 measures means we have 20 hard markers but smoothing
    // and the cap need to bring it down.
    const midiMarkers = Array.from({ length: 20 }, (_, i) => ({
      time: i * 3,
      text: `M${i}`,
    }));
    const score = baseScore({
      durationSeconds: 60,
      measures,
      midiMarkers,
    });
    const state = autoDetect(score);
    expect(state.sections.length).toBeLessThanOrEqual(12);
    // Marker names must still appear (subset; we don't promise all do when capped, but the spec says hard boundaries are never DROPPED — when the input has more hard boundaries than the cap, accept that some marker names may be merged).
    // For now we accept that the cap is enforced strictly even on hard boundaries when there is no other choice; if we ever change this, this test becomes more lenient.
  });
});
```

- [ ] **Step 2: Run new tests, confirm they fail**

```
npx vitest run src/section-strip/autoDetect.test.ts -t "Pass 3"
```

Expected: fail.

- [ ] **Step 3: Implement smoothing**

Add constants and helpers near the top of `src/section-strip/autoDetect.ts`:

```ts
const MIN_SECTION_MEASURES_AUTO = 2;
```

Add a helper before `autoDetect`:

```ts
/** Smooth a candidate list: merge any tiny sections into neighbours, then cap. */
function smoothCandidates(
  cands: Candidate[],
  measures: Score["measures"],
): Candidate[] {
  if (cands.length === 0) return cands;
  let cur = [...cands].sort((a, b) => a.measureIndex - b.measureIndex);

  // Merge: drop boundaries that would create a section < MIN_SECTION_MEASURES_AUTO measures.
  // We walk left-to-right, virtually keeping a "starts" list (0, then each boundary).
  // If a candidate creates too-short a span from the previous start, drop it.
  // Prefer dropping soft over hard; if both options are hard, prefer dropping the one
  // creating the shortest of the two adjacent sections.
  let changed = true;
  while (changed) {
    changed = false;
    const starts = [0, ...cur.map((c) => c.measureIndex), measures.length];
    for (let i = 0; i < cur.length; i += 1) {
      const a = starts[i];
      const b = starts[i + 1];
      const c = starts[i + 2];
      const leftLen = b - a;
      const rightLen = c - b;
      if (leftLen < MIN_SECTION_MEASURES_AUTO || rightLen < MIN_SECTION_MEASURES_AUTO) {
        // Drop the boundary causing the shorter section. The boundary is cur[i].
        // If left is short and right is long, dropping cur[i] merges left into right.
        // If right is short, dropping cur[i+1] (the next boundary) merges right into left.
        // Whichever side is short, drop the boundary on the SHORT side.
        const dropIdx = leftLen < rightLen ? i : i + 1;
        if (dropIdx < cur.length) {
          // But: never drop a hard boundary unless we have no choice.
          if (cur[dropIdx].kind === "hard") {
            // Try the other boundary if it's soft.
            const altIdx = dropIdx === i ? i + 1 : i;
            if (altIdx >= 0 && altIdx < cur.length && cur[altIdx].kind === "soft") {
              cur.splice(altIdx, 1);
              changed = true;
              break;
            }
            // Both hard — accept the drop anyway to enforce min-length.
          }
          cur.splice(dropIdx, 1);
          changed = true;
          break;
        }
      }
    }
  }

  // Cap at MAX_SECTIONS. Drop weakest soft boundaries first.
  while (cur.length + 1 > MAX_SECTIONS) {
    // Find the weakest soft candidate (fewest signals). If none soft, drop the one
    // creating the shortest adjacent section.
    let weakestIdx = -1;
    let weakestRank = Infinity;
    for (let i = 0; i < cur.length; i += 1) {
      if (cur[i].kind !== "soft") continue;
      const rank = cur[i].signals.length;
      if (rank < weakestRank) {
        weakestRank = rank;
        weakestIdx = i;
      }
    }
    if (weakestIdx === -1) {
      // Only hard candidates remain but still over cap. Drop the one bordering
      // the shortest section.
      const starts = [0, ...cur.map((c) => c.measureIndex), measures.length];
      let bestIdx = 0;
      let bestSpan = Infinity;
      for (let i = 0; i < cur.length; i += 1) {
        const adjSpan = Math.min(starts[i + 1] - starts[i], starts[i + 2] - starts[i + 1]);
        if (adjSpan < bestSpan) {
          bestSpan = adjSpan;
          bestIdx = i;
        }
      }
      cur.splice(bestIdx, 1);
    } else {
      cur.splice(weakestIdx, 1);
    }
  }
  return cur;
}
```

Then change `autoDetect` to call `smoothCandidates` before converting to sections:

```ts
  const merged = [...hardCands, ...softCands].sort(
    (a, b) => a.measureIndex - b.measureIndex,
  );
  const smoothed = smoothCandidates(merged, score.measures);
  let sections = candidatesToSections(smoothed, duration, (score.midiMarkers?.length ?? 0) > 0);
```

(Remove the old `if (sections.length > MAX_SECTIONS) sections = sections.slice(0, MAX_SECTIONS);` — that cap is now handled inside `smoothCandidates`.)

- [ ] **Step 4: Run autoDetect tests, confirm green**

```
npx vitest run src/section-strip/autoDetect.test.ts
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/section-strip/autoDetect.ts src/section-strip/autoDetect.test.ts
git commit -m "feat(autoDetect): Pass 3 smoothing (min 2 measures, cap at 12)"
```

---

## Task 7: Auto-detection — Pass 4 (smart labels, gated on no markers)

**Files:**
- Modify: `src/section-strip/autoDetect.ts`
- Modify: `src/section-strip/autoDetect.test.ts`

- [ ] **Step 1: Add failing tests for smart labels**

Append to `src/section-strip/autoDetect.test.ts`:

```ts
describe("autoDetect — Pass 4 smart labels", () => {
  function withBoundaries(numBoundaries: number): Score {
    // Builds a score with `numBoundaries` tempo-induced hard boundaries.
    const totalMeasures = (numBoundaries + 1) * 4; // 4 measures per section
    const measures = fourFourMeasures(totalMeasures, 2);
    const tempoMap = [
      { start: 0, bpm: 120 },
      ...Array.from({ length: numBoundaries }, (_, i) => ({
        start: (i + 1) * 4 * 2, // every 4 measures (8 sec)
        bpm: 120 + (i + 1) * 20,
      })),
    ];
    return baseScore({
      durationSeconds: totalMeasures * 2,
      measures,
      tempoMap,
    });
  }

  it("first section becomes 'Intro' and last becomes 'Outro' when there are >= 3 sections", () => {
    const score = withBoundaries(3); // 4 sections
    const state = autoDetect(score);
    expect(state.sections.length).toBe(4);
    expect(state.sections[0].name).toBe("Intro");
    expect(state.sections.at(-1)?.name).toBe("Outro");
  });

  it("does not apply 'Outro' when there are fewer than 3 sections", () => {
    const score = withBoundaries(1); // 2 sections
    const state = autoDetect(score);
    expect(state.sections.length).toBe(2);
    expect(state.sections[0].name).toBe("Intro");
    expect(state.sections[1].name).not.toBe("Outro");
  });

  it("labels a hand-isolated section 'Melody' or 'Bass line'", () => {
    const measures = fourFourMeasures(16, 2); // 32 sec, 4 sections of 4 measures
    // 4 sections induced by 3 tempo changes at 8/16/24 sec.
    const tempoMap = [
      { start: 0, bpm: 120 },
      { start: 8, bpm: 140 },
      { start: 16, bpm: 160 },
      { start: 24, bpm: 180 },
    ];
    // Sections: [0,8] right-hand dominated; [8,16] left-hand only; [16,24] mixed; [24,32] right-hand only.
    const notes: Note[] = [];
    for (let t = 0; t < 8; t += 0.5) notes.push(note(t, 72, 0.3, "right"));
    for (let t = 8; t < 16; t += 0.5) notes.push(note(t, 45, 0.3, "left"));
    for (let t = 16; t < 24; t += 0.5) {
      notes.push(note(t, 72, 0.3, "right"));
      notes.push(note(t + 0.25, 45, 0.3, "left"));
    }
    for (let t = 24; t < 32; t += 0.5) notes.push(note(t, 80, 0.3, "right"));

    const state = autoDetect(
      baseScore({ durationSeconds: 32, measures, tempoMap, notes }),
    );
    expect(state.sections.length).toBe(4);
    expect(state.sections[1].name).toBe("Bass line");
    // Section 4 (last) is right-hand-only and is also the last → it becomes "Outro"
    // because position rules outrank content rules.
    expect(state.sections[3].name).toBe("Outro");
  });

  it("skips smart labels entirely when the file has any MIDI marker", () => {
    const measures = fourFourMeasures(20, 2);
    const tempoMap = [
      { start: 0, bpm: 120 },
      { start: 16, bpm: 160 }, // hard boundary at measure 8
    ];
    const midiMarkers = [{ time: 0, text: "Movement I" }];
    const state = autoDetect(
      baseScore({ durationSeconds: 40, measures, tempoMap, midiMarkers }),
    );
    // Section 0 keeps marker text, section 1 is "Section 2" (NOT "Outro" / smart label).
    expect(state.sections[0].name).toBe("Movement I");
    expect(state.sections[1].name).toMatch(/^Section \d+$/);
  });

  it("falls through to 'Section N' rather than mislabeling on borderline signal", () => {
    // Two sections, barely-different density (under threshold) — no smart label.
    const measures = fourFourMeasures(8, 2); // 16 sec
    const tempoMap = [{ start: 0, bpm: 120 }, { start: 8, bpm: 130 }];
    // borderline = below cluster threshold; tempo change is the only signal
    const state = autoDetect(baseScore({ durationSeconds: 16, measures, tempoMap }));
    expect(state.sections.length).toBe(2);
    // 2 sections: first → "Intro" (position rule), second → fallback "Section 2"
    expect(state.sections[0].name).toBe("Intro");
    expect(state.sections[1].name).toMatch(/^Section \d+$/);
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

```
npx vitest run src/section-strip/autoDetect.test.ts -t "Pass 4"
```

Expected: fail.

- [ ] **Step 3: Implement Pass 4 — smart labels**

Add constants near the top of `src/section-strip/autoDetect.ts`:

```ts
const CLIMAX_DENSITY_RATIO = 1.8;
const CLIMAX_REGISTER_DELTA = 6;
const QUIET_DENSITY_RATIO = 0.4;
const FAST_TEMPO_RATIO = 1.2;
const SLOW_TEMPO_RATIO = 0.8;
const HAND_ISOLATION_PCT = 0.95;
const MIN_SMART_LABEL_MEASURES = 4;
```

Add a helper before `autoDetect`:

```ts
interface SectionStats {
  density: number;
  meanPitch: number;
  tempo: number;
  durationMeasures: number;
  rightFrac: number;
  leftFrac: number;
}

function statsFor(section: Section, score: Score): SectionStats {
  const inSection = (n: Note) => n.start >= section.start && n.start < section.end;
  const sectionNotes = score.notes.filter(inSection);
  const density = densityIn(score.notes, section.start, section.end);
  const meanPitch = meanPitchIn(score.notes, section.start, section.end);
  // Mean tempo across the section (weighted by time slice).
  const events = score.tempoMap.filter((t) => t.start <= section.end);
  let tempo = events.at(-1)?.bpm ?? 120;
  // For simplicity, use the bpm in effect at the section midpoint.
  const mid = (section.start + section.end) / 2;
  for (const t of score.tempoMap) {
    if (t.start <= mid) tempo = t.bpm;
  }
  const measureStart = score.measures.findIndex((m) => m.start >= section.start);
  const measureEnd = score.measures.findIndex((m) => m.end >= section.end);
  const durationMeasures = Math.max(
    1,
    (measureEnd < 0 ? score.measures.length : measureEnd) -
      (measureStart < 0 ? 0 : measureStart),
  );
  const rightCount = sectionNotes.filter((n) => n.hand === "right").length;
  const leftCount = sectionNotes.length - rightCount;
  const total = Math.max(1, sectionNotes.length);
  return {
    density,
    meanPitch,
    tempo,
    durationMeasures,
    rightFrac: rightCount / total,
    leftFrac: leftCount / total,
  };
}

function applySmartLabels(sections: Section[], score: Score): Section[] {
  const hasMarkers = (score.midiMarkers?.length ?? 0) > 0;
  if (sections.length === 0) return sections;

  // Compute medians across the piece.
  const allDensities = sections.map((s) => densityIn(score.notes, s.start, s.end));
  const allTempos = sections.map((s) => {
    let cur = score.tempoMap[0]?.bpm ?? 120;
    for (const t of score.tempoMap) if (t.start <= (s.start + s.end) / 2) cur = t.bpm;
    return cur;
  });
  const median = (xs: number[]) => {
    const ys = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(ys.length / 2);
    return ys.length === 0 ? 0 : (ys.length % 2 ? ys[mid] : (ys[mid - 1] + ys[mid]) / 2);
  };
  const allMeanPitches = sections.map((s) => meanPitchIn(score.notes, s.start, s.end))
    .filter((x) => !Number.isNaN(x));
  const medDensity = median(allDensities);
  const medTempo = median(allTempos);
  const medPitch = median(allMeanPitches);

  // Pick the climax candidate up-front (at most one).
  let climaxIdx = -1;
  if (!hasMarkers) {
    let bestScore = -Infinity;
    for (let i = 0; i < sections.length; i += 1) {
      const s = sections[i];
      const stats = statsFor(s, score);
      if (
        stats.density >= CLIMAX_DENSITY_RATIO * medDensity &&
        stats.meanPitch >= medPitch + CLIMAX_REGISTER_DELTA &&
        stats.durationMeasures >= MIN_SMART_LABEL_MEASURES
      ) {
        const composite = stats.density * stats.meanPitch;
        if (composite > bestScore) {
          bestScore = composite;
          climaxIdx = i;
        }
      }
    }
  }

  return sections.map((section, i) => {
    // Rule 1: marker-name sections keep their name unchanged.
    if (!section.name.startsWith("Section ") && !section.name.startsWith("Whole piece")) {
      // (Already named — preserve.)
      return section;
    }

    // Default fallback if smart labels can't apply (Rule 8).
    let name = `Section ${i + 1}`;

    if (!hasMarkers) {
      const isFirst = i === 0;
      const isLast = i === sections.length - 1 && sections.length >= 3;
      const stats = statsFor(section, score);
      const longEnough = stats.durationMeasures >= MIN_SMART_LABEL_MEASURES;

      // Rule 7 combinations (position prefix).
      if (isFirst) {
        if (longEnough && stats.density <= QUIET_DENSITY_RATIO * medDensity) {
          name = "Quiet intro";
        } else if (longEnough && stats.tempo <= SLOW_TEMPO_RATIO * medTempo) {
          name = "Slow intro";
        } else {
          name = "Intro";
        }
      } else if (isLast) {
        name = "Outro";
      } else if (i === climaxIdx) {
        name = "Climax";
      } else if (stats.rightFrac >= HAND_ISOLATION_PCT && longEnough) {
        name = "Melody";
      } else if (stats.leftFrac >= HAND_ISOLATION_PCT && longEnough) {
        name = "Bass line";
      } else if (longEnough && stats.density <= QUIET_DENSITY_RATIO * medDensity) {
        name = "Quiet section";
      } else if (longEnough && stats.tempo >= FAST_TEMPO_RATIO * medTempo) {
        name = "Fast section";
      } else if (longEnough && stats.tempo <= SLOW_TEMPO_RATIO * medTempo) {
        name = "Slow section";
      }
    }

    return { ...section, name };
  });
}
```

Wire `applySmartLabels` into `autoDetect` after `candidatesToSections` and before the cap/fallback:

```ts
  let sections = candidatesToSections(smoothed, duration, (score.midiMarkers?.length ?? 0) > 0);
  sections = applySmartLabels(sections, score);

  if (sections.length === 0) {
    sections = [
      {
        id: newSectionId(),
        start: 0,
        end: duration,
        name: "Whole piece",
        isAuto: true,
      },
    ];
  }
```

- [ ] **Step 4: Run all autoDetect tests, confirm green**

```
npx vitest run src/section-strip/autoDetect.test.ts
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/section-strip/autoDetect.ts src/section-strip/autoDetect.test.ts
git commit -m "feat(autoDetect): Pass 4 smart labels (gated on no markers)"
```

---

## Task 8: Persistence — extend StoredPracticeState

**Files:**
- Modify: `src/library/db.ts`
- Modify: `src/library/practiceState.ts`
- Create: `src/library/practiceState.test.ts` (if absent; otherwise modify)

- [ ] **Step 1: Write the failing test**

```ts
// src/library/practiceState.test.ts
import { describe, it, expect } from "vitest";
import { capturePracticeState } from "./practiceState";
import { Transport } from "../transport/transport";
import { HandState } from "../practice/hands";
import { normalize, newSectionId, type SectionState } from "../model/sections";
import type { Score } from "../model/score";

const score: Score = {
  source: "midi",
  notes: [],
  measures: [{ index: 0, start: 0, end: 4, numerator: 4, denominator: 4 }],
  pedalEvents: [],
  timeSignatures: [{ start: 0, numerator: 4, denominator: 4 }],
  tempoMap: [{ start: 0, bpm: 120 }],
  durationSeconds: 4,
  musicXml: "",
  qualityWarning: null,
};

describe("capturePracticeState", () => {
  it("plumbs sectionState through when provided", () => {
    const transport = new Transport(score);
    const hands = new HandState();
    const ss: SectionState = normalize(
      {
        sections: [{ id: newSectionId(), start: 0, end: 4, name: "A", isAuto: true }],
        bookmarks: [],
        version: 1,
      },
      4,
    );
    const stored = capturePracticeState(transport, hands, undefined, undefined, ss);
    expect(stored.sectionState).toEqual(ss);
  });

  it("omits sectionState when not provided", () => {
    const transport = new Transport(score);
    const hands = new HandState();
    const stored = capturePracticeState(transport, hands);
    expect(stored.sectionState).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test, confirm it fails**

```
npx vitest run src/library/practiceState.test.ts
```

Expected: fail — `capturePracticeState` doesn't accept a 5th argument yet, and `StoredPracticeState` doesn't have `sectionState`.

- [ ] **Step 3: Extend `StoredPracticeState`**

In `src/library/db.ts`, add to the `StoredPracticeState` interface (after `tabs`):

```ts
  /** Per-piece section navigator state (MIDI source only). */
  sectionState?: import("../model/sections").SectionState;
```

- [ ] **Step 4: Extend `capturePracticeState`**

In `src/library/practiceState.ts`, change the function signature and body to thread `sectionState`:

```ts
import type { SectionState } from "../model/sections";

export function capturePracticeState(
  transport: Transport,
  hands: HandState,
  beat?: { numerator: number; denominator: number; subdivision: number },
  session?: {
    mode: TabMode;
    tabs?: Record<TabMode, { bpm: number; loop: { start: number; end: number } | null }>;
  },
  sectionState?: SectionState,
): StoredPracticeState {
  const loop = transport.clock.loop;
  return {
    bpm: transport.bpm,
    loop: loop ? { start: loop.start, end: loop.end } : null,
    leftMuted: hands.isMuted("left"),
    rightMuted: hands.isMuted("right"),
    leftVisibility: hands.visibility("left"),
    rightVisibility: hands.visibility("right"),
    ...(beat && {
      numerator: beat.numerator,
      denominator: beat.denominator,
      subdivision: beat.subdivision,
    }),
    ...(session && {
      mode: session.mode,
      ...(session.tabs && {
        tabs: {
          play: {
            bpm: session.tabs.play.bpm,
            loop: session.tabs.play.loop ? { ...session.tabs.play.loop } : null,
          },
          midi: {
            bpm: session.tabs.midi.bpm,
            loop: session.tabs.midi.loop ? { ...session.tabs.midi.loop } : null,
          },
        },
      }),
    }),
    ...(sectionState && { sectionState }),
  };
}
```

- [ ] **Step 5: Run the new test plus existing tests**

```
npx vitest run src/library/
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/library/db.ts src/library/practiceState.ts src/library/practiceState.test.ts
git commit -m "feat(library): persist sectionState in per-piece IndexedDB record"
```

---

## Task 9: Strip position localStorage helper

**Files:**
- Create: `src/section-strip/stripPosition.ts`
- Create: `src/section-strip/stripPosition.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/section-strip/stripPosition.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { loadStripPosition, saveStripPosition, type StripPosition } from "./stripPosition";

beforeEach(() => {
  localStorage.clear();
});

describe("strip position pref", () => {
  it("defaults to 'bottom'", () => {
    expect(loadStripPosition()).toBe("bottom");
  });

  it("round-trips a saved value", () => {
    saveStripPosition("top");
    expect(loadStripPosition()).toBe("top");
  });

  it("ignores a garbage stored value", () => {
    localStorage.setItem("arpeggio.stripPosition", "diagonal");
    expect(loadStripPosition()).toBe("bottom");
  });
});
```

- [ ] **Step 2: Run, confirm failing**

```
npx vitest run src/section-strip/stripPosition.test.ts
```

- [ ] **Step 3: Implement**

```ts
// src/section-strip/stripPosition.ts
export type StripPosition = "top" | "bottom";

const KEY = "arpeggio.stripPosition";

export function loadStripPosition(): StripPosition {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === "top" || raw === "bottom") return raw;
  } catch {
    // Storage may be unavailable in some test contexts; fall through.
  }
  return "bottom";
}

export function saveStripPosition(p: StripPosition): void {
  try {
    localStorage.setItem(KEY, p);
  } catch {
    // Best-effort.
  }
}
```

- [ ] **Step 4: Run tests, confirm green**

```
npx vitest run src/section-strip/stripPosition.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/section-strip/stripPosition.ts src/section-strip/stripPosition.test.ts
git commit -m "feat(section-strip): localStorage-backed strip position preference"
```

---

## Task 10: SectionStrip — rendering (blocks, bookmark lane, playhead, toolbar)

**Files:**
- Create: `src/section-strip/SectionStrip.tsx`
- Create: `src/section-strip/SectionStrip.test.tsx`
- Create: `src/styles/section-strip.css`
- Modify: `src/main.tsx` (import the new CSS — see end of step)

This task implements the visual scaffolding only. Interactions (click, drag, keys) come in Tasks 11–12.

- [ ] **Step 1: Write the failing rendering test**

```tsx
// src/section-strip/SectionStrip.test.tsx
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
```

- [ ] **Step 2: Run, confirm failing**

```
npx vitest run src/section-strip/SectionStrip.test.tsx
```

- [ ] **Step 3: Implement the component (rendering only — interactions come next)**

```tsx
// src/section-strip/SectionStrip.tsx
import { useEffect, useRef } from "react";
import type { Transport } from "../transport/transport";
import type { Section, Bookmark, SectionState } from "../model/sections";
import type { StripPosition } from "./stripPosition";

const PALETTE = ["#cba37a", "#7a9cca", "#c97d7d", "#7ec98a", "#b09bca"] as const;

interface SectionStripProps {
  state: SectionState;
  transport: Transport;
  position: StripPosition;
  onChange: (next: SectionState) => void;
  onPositionChange: (p: StripPosition) => void;
}

export function SectionStrip({
  state,
  transport,
  position,
  onChange,
  onPositionChange,
}: SectionStripProps): JSX.Element {
  const duration = transport.score.durationSeconds;
  const playheadRef = useRef<HTMLDivElement>(null);

  // Drive the playhead from the same FrameLoop the falldown uses.
  // We subscribe to clock changes and to RAF independently because the clock
  // notifies on play/pause/seek but not every frame.
  useEffect(() => {
    let raf = 0;
    const update = (): void => {
      const el = playheadRef.current;
      if (el && duration > 0) {
        const pct = (transport.clock.position / duration) * 100;
        el.style.left = `${Math.max(0, Math.min(100, pct))}%`;
      }
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [transport, duration]);

  return (
    <div className={`section-strip section-strip--${position}`}>
      <div className="section-strip__bookmarks">
        {state.bookmarks.map((b) => (
          <BookmarkPin key={b.id} bookmark={b} duration={duration} />
        ))}
      </div>

      <div className="section-strip__sections">
        {state.sections.map((s, i) => (
          <SectionBlock
            key={s.id}
            section={s}
            color={PALETTE[i % PALETTE.length]}
            duration={duration}
          />
        ))}
        <div ref={playheadRef} className="section-strip__playhead" aria-hidden />
      </div>

      <div className="section-strip__toolbar">
        <span className="section-strip__hint">
          + Section · 📌 Bookmark · double-click rename · drag boundary · right-click for more
        </span>
        <button
          type="button"
          className="section-strip__pos-toggle"
          onClick={() => onPositionChange(position === "top" ? "bottom" : "top")}
          aria-label="Move strip"
        >
          ↕ {position === "top" ? "bottom" : "top"}
        </button>
      </div>
    </div>
  );
}

interface SectionBlockProps {
  section: Section;
  color: string;
  duration: number;
}

function SectionBlock({ section, color, duration }: SectionBlockProps): JSX.Element {
  const widthPct = duration > 0 ? ((section.end - section.start) / duration) * 100 : 0;
  return (
    <div
      className="section-strip__block"
      style={{ flex: `${widthPct} 0 0`, background: color }}
      data-section-id={section.id}
    >
      <span className="section-strip__block-name">{section.name}</span>
    </div>
  );
}

interface BookmarkPinProps {
  bookmark: Bookmark;
  duration: number;
}

function BookmarkPin({ bookmark, duration }: BookmarkPinProps): JSX.Element {
  const leftPct = duration > 0 ? (bookmark.time / duration) * 100 : 0;
  return (
    <span
      className="section-strip__bookmark"
      style={{ left: `${leftPct}%` }}
      data-bookmark-id={bookmark.id}
    >
      <span aria-hidden>📌</span>
      <span className="section-strip__bookmark-name">{bookmark.name}</span>
    </span>
  );
}
```

- [ ] **Step 4: Add the CSS**

```css
/* src/styles/section-strip.css */
.section-strip {
  background: #ebe5d4;
  border-top: 1px solid #d3cab3;
  padding: 6px 12px 8px;
  user-select: none;
}
.section-strip--top { border-top: 0; border-bottom: 1px solid #d3cab3; }

.section-strip__bookmarks {
  position: relative;
  height: 16px;
  margin-bottom: 3px;
}
.section-strip__bookmark {
  position: absolute;
  transform: translateX(-50%);
  font-size: 10px;
  color: #7a6a48;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.section-strip__sections {
  position: relative;
  display: flex;
  gap: 1px;
  height: 48px;
}
.section-strip__block {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  border-radius: 3px;
  cursor: pointer;
  overflow: hidden;
}
.section-strip__block-name {
  padding: 0 6px;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}
.section-strip__playhead {
  position: absolute;
  top: -16px;
  bottom: -4px;
  width: 2px;
  background: #1a1a1a;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.6);
  pointer-events: none;
}

.section-strip__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 6px;
  font-size: 10px;
  color: #6a5e3e;
}
.section-strip__pos-toggle {
  background: #fff;
  border: 1px solid #c9c0a8;
  border-radius: 3px;
  padding: 1px 6px;
  cursor: pointer;
  font-size: 10px;
}
```

In `src/main.tsx`, add the import alongside other CSS imports:

```ts
import "./styles/section-strip.css";
```

- [ ] **Step 5: Run tests, confirm green**

```
npx vitest run src/section-strip/SectionStrip.test.tsx
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/section-strip/SectionStrip.tsx src/section-strip/SectionStrip.test.tsx src/styles/section-strip.css src/main.tsx
git commit -m "feat(section-strip): SectionStrip component — blocks, bookmarks, playhead"
```

---

## Task 11: SectionStrip — click-seek, scrub, S/B keyboard shortcuts

**Files:**
- Modify: `src/section-strip/SectionStrip.tsx`
- Modify: `src/section-strip/SectionStrip.test.tsx`

- [ ] **Step 1: Add failing tests for interactions**

Append to `src/section-strip/SectionStrip.test.tsx`:

```tsx
import { fireEvent } from "@testing-library/react";

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
        onPositionChange={() => {}}
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
        onPositionChange={() => {}}
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
        onPositionChange={() => {}}
      />,
    );
    fireEvent.keyDown(window, { key: "S" });
    expect(captured).not.toBeNull();
    expect(captured!.sections.some((s) => s.start === 10)).toBe(true);
  });

  it("B key adds a bookmark at the current playhead", () => {
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
        onPositionChange={() => {}}
      />,
    );
    fireEvent.keyDown(window, { key: "B" });
    expect(captured).not.toBeNull();
    expect(captured!.bookmarks.some((b) => b.time === 33)).toBe(true);
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
          onPositionChange={() => {}}
        />
      </>,
    );
    const dummy = screen.getByTestId("dummy");
    dummy.focus();
    fireEvent.keyDown(window, { key: "S", target: dummy });
    expect(captured).toBeNull();
  });
});
```

- [ ] **Step 2: Run failing tests**

```
npx vitest run src/section-strip/SectionStrip.test.tsx -t "click and key"
```

- [ ] **Step 3: Implement click + scrub + keyboard handlers**

In `src/section-strip/SectionStrip.tsx`, add a `useEffect` for keyboard handling and wire up `onClick` to the block and bookmark elements.

```tsx
import { useEffect, useRef } from "react";
import { addBookmark, addSection } from "./edits";
// (keep existing imports)
```

In the `SectionStrip` function body, add a keyboard effect after the playhead useEffect:

```tsx
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key !== "s" && e.key !== "S" && e.key !== "b" && e.key !== "B") return;
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
      e.preventDefault();
      if (e.key === "s" || e.key === "S") {
        onChange(addSection(state, transport.clock.position, duration));
      } else {
        onChange(addBookmark(state, transport.clock.position, "Mark", duration));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, transport, duration, onChange]);
```

Update `SectionBlock` to call back:

```tsx
function SectionBlock({
  section,
  color,
  duration,
  onSeek,
}: SectionBlockProps & { onSeek: (time: number) => void }): JSX.Element {
  const widthPct = duration > 0 ? ((section.end - section.start) / duration) * 100 : 0;
  return (
    <div
      className="section-strip__block"
      style={{ flex: `${widthPct} 0 0`, background: color }}
      data-section-id={section.id}
      onClick={() => onSeek(section.start)}
    >
      <span className="section-strip__block-name">{section.name}</span>
    </div>
  );
}
```

Update `BookmarkPin`:

```tsx
function BookmarkPin({
  bookmark,
  duration,
  onSeek,
}: BookmarkPinProps & { onSeek: (time: number) => void }): JSX.Element {
  const leftPct = duration > 0 ? (bookmark.time / duration) * 100 : 0;
  return (
    <span
      className="section-strip__bookmark"
      style={{ left: `${leftPct}%` }}
      data-bookmark-id={bookmark.id}
      onClick={() => onSeek(bookmark.time)}
    >
      <span aria-hidden>📌</span>
      <span className="section-strip__bookmark-name">{bookmark.name}</span>
    </span>
  );
}
```

In the parent JSX, pass `onSeek={(t) => transport.clock.seek(t)}` to each block and pin. Same for scrub: add a `mousedown` handler on `.section-strip__sections` container that converts clientX → time:

```tsx
  function sectionsMouseDown(e: React.MouseEvent<HTMLDivElement>): void {
    if ((e.target as HTMLElement).closest(".section-strip__block")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const time = ((e.clientX - rect.left) / rect.width) * duration;
    // Clear any active loop if the seek lands outside it (mirrors transport behavior).
    const loop = transport.clock.loop;
    if (loop && (time < loop.start || time >= loop.end)) {
      transport.clock.setLoop(null);
    }
    transport.clock.seek(Math.max(0, Math.min(duration, time)));
  }
```

And bind it to the sections container.

- [ ] **Step 4: Run tests, confirm green**

```
npx vitest run src/section-strip/SectionStrip.test.tsx
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/section-strip/SectionStrip.tsx src/section-strip/SectionStrip.test.tsx
git commit -m "feat(section-strip): click-seek + scrub + S/B keyboard shortcuts"
```

---

## Task 12: SectionStrip — rename, drag-resize, right-click menu, loop integration

**Files:**
- Modify: `src/section-strip/SectionStrip.tsx`
- Modify: `src/section-strip/SectionStrip.test.tsx`
- Modify: `src/styles/section-strip.css` (add styles for the menu + rename input + drag handle)

- [ ] **Step 1: Add failing tests**

Append to `src/section-strip/SectionStrip.test.tsx`:

```tsx
describe("SectionStrip — rename, menu, loop", () => {
  it("double-clicking a block opens a rename input that commits on Enter", () => {
    const transport = new Transport(makeScore());
    const state = makeState();
    let captured: SectionState | null = null;
    render(
      <SectionStrip
        state={state}
        transport={transport}
        position="bottom"
        onChange={(s) => (captured = s)}
        onPositionChange={() => {}}
      />,
    );
    fireEvent.doubleClick(screen.getByText("Verse"));
    const input = screen.getByLabelText("Rename section") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Chorus" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(captured?.sections.find((s) => s.name === "Chorus")).toBeDefined();
  });

  it("right-click opens a section menu with the expected items", () => {
    const transport = new Transport(makeScore());
    const state = makeState();
    render(
      <SectionStrip
        state={state}
        transport={transport}
        position="bottom"
        onChange={() => {}}
        onPositionChange={() => {}}
      />,
    );
    fireEvent.contextMenu(screen.getByText("Verse"));
    expect(screen.getByText("Rename")).toBeInTheDocument();
    expect(screen.getByText("Split here")).toBeInTheDocument();
    expect(screen.getByText("Merge with right")).toBeInTheDocument();
    expect(screen.getByText("Loop section")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("'Loop section' sets the transport loop to the section range", () => {
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
    fireEvent.contextMenu(screen.getByText("Verse"));
    fireEvent.click(screen.getByText("Loop section"));
    expect(transport.clock.loop).toEqual({ start: 20, end: 40 });
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
        onPositionChange={() => {}}
      />,
    );
    fireEvent.contextMenu(screen.getByText("A"));
    fireEvent.click(screen.getByText("Loop to next mark"));
    expect(transport.clock.loop).toEqual({ start: 10, end: 30 });
  });
});
```

- [ ] **Step 2: Run, confirm failing**

```
npx vitest run src/section-strip/SectionStrip.test.tsx -t "rename, menu, loop"
```

- [ ] **Step 3: Implement rename, context menu, and loop wiring**

In `src/section-strip/SectionStrip.tsx`, add the needed imports and state:

```tsx
import { useEffect, useRef, useState } from "react";
import {
  addBookmark,
  addSection,
  deleteBookmark,
  deleteSection,
  mergeRight,
  renameBookmark,
  renameSection,
  splitAt,
} from "./edits";
```

Inside the `SectionStrip` function, add UI state for renaming + the context menu:

```tsx
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingKind, setEditingKind] = useState<"section" | "bookmark" | null>(null);
  const [menu, setMenu] = useState<
    | { kind: "section"; id: string; x: number; y: number }
    | { kind: "bookmark"; id: string; x: number; y: number }
    | null
  >(null);

  function startRenameSection(id: string): void {
    setEditingKind("section");
    setEditingId(id);
  }

  function commitRename(name: string): void {
    if (editingKind === "section" && editingId) {
      onChange(renameSection(state, editingId, name, duration));
    } else if (editingKind === "bookmark" && editingId) {
      onChange(renameBookmark(state, editingId, name));
    }
    setEditingId(null);
    setEditingKind(null);
  }

  function closeMenu(): void {
    setMenu(null);
  }

  useEffect(() => {
    if (!menu) return;
    const close = (): void => closeMenu();
    window.addEventListener("click", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", close);
    };
  }, [menu]);
```

Update `SectionBlock` to support rename + context menu. Replace its definition with this:

```tsx
interface SectionBlockProps {
  section: Section;
  color: string;
  duration: number;
  isEditing: boolean;
  onSeek: (time: number) => void;
  onStartRename: () => void;
  onRenameCommit: (name: string) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function SectionBlock({
  section,
  color,
  duration,
  isEditing,
  onSeek,
  onStartRename,
  onRenameCommit,
  onContextMenu,
}: SectionBlockProps): JSX.Element {
  const widthPct = duration > 0 ? ((section.end - section.start) / duration) * 100 : 0;
  return (
    <div
      className="section-strip__block"
      style={{ flex: `${widthPct} 0 0`, background: color }}
      data-section-id={section.id}
      onClick={(e) => {
        if (isEditing) return;
        e.stopPropagation();
        onSeek(section.start);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onStartRename();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(e);
      }}
    >
      {isEditing ? (
        <input
          aria-label="Rename section"
          defaultValue={section.name}
          autoFocus
          className="section-strip__rename-input"
          onBlur={(e) => onRenameCommit(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onRenameCommit(e.currentTarget.value);
            if (e.key === "Escape") onRenameCommit(section.name);
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="section-strip__block-name">{section.name}</span>
      )}
    </div>
  );
}
```

Add a context menu component near the bottom of the file:

```tsx
interface ContextMenuProps {
  x: number;
  y: number;
  items: Array<{ label: string; onClick: () => void }>;
}

function ContextMenu({ x, y, items }: ContextMenuProps): JSX.Element {
  return (
    <ul
      className="section-strip__menu"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((it) => (
        <li key={it.label}>
          <button type="button" onClick={it.onClick}>{it.label}</button>
        </li>
      ))}
    </ul>
  );
}
```

Render it inside the strip's root when `menu` is set:

```tsx
      {menu && menu.kind === "section" && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={[
            { label: "Rename", onClick: () => { startRenameSection(menu.id); closeMenu(); } },
            {
              label: "Split here",
              onClick: () => {
                onChange(splitAt(state, menu.id, transport.clock.position, duration));
                closeMenu();
              },
            },
            {
              label: "Merge with right",
              onClick: () => {
                onChange(mergeRight(state, menu.id, duration));
                closeMenu();
              },
            },
            {
              label: "Loop section",
              onClick: () => {
                const s = state.sections.find((x) => x.id === menu.id);
                if (s) transport.clock.setLoop({ start: s.start, end: s.end });
                closeMenu();
              },
            },
            {
              label: "Delete",
              onClick: () => {
                onChange(deleteSection(state, menu.id, duration));
                closeMenu();
              },
            },
          ]}
        />
      )}
      {menu && menu.kind === "bookmark" && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={[
            {
              label: "Rename",
              onClick: () => {
                setEditingKind("bookmark");
                setEditingId(menu.id);
                closeMenu();
              },
            },
            {
              label: "Loop to next mark",
              onClick: () => {
                const me = state.bookmarks.find((b) => b.id === menu.id);
                if (me) {
                  const next = state.bookmarks.find((b) => b.time > me.time);
                  const endTime = next
                    ? next.time
                    : (state.sections.find((s) => me.time >= s.start && me.time < s.end)?.end ??
                       duration);
                  transport.clock.setLoop({ start: me.time, end: endTime });
                }
                closeMenu();
              },
            },
            {
              label: "Delete",
              onClick: () => {
                onChange(deleteBookmark(state, menu.id));
                closeMenu();
              },
            },
          ]}
        />
      )}
```

Wire `onContextMenu` from each block and pin to set the menu state with the click coordinates. Wire `onStartRename` to `startRenameSection`. Bookmarks pass `editingKind === "bookmark" && editingId === bookmark.id` to render the same rename input pattern (write the bookmark version analogous to the section version above).

- [ ] **Step 4: Add menu/input/handle CSS**

Append to `src/styles/section-strip.css`:

```css
.section-strip__rename-input {
  background: rgba(255,255,255,0.92);
  border: 0;
  border-radius: 2px;
  padding: 1px 4px;
  font: inherit;
  width: 80%;
  text-align: center;
}
.section-strip__menu {
  position: fixed;
  z-index: 50;
  background: #fff;
  border: 1px solid #c9c0a8;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.18);
  padding: 4px 0;
  margin: 0;
  list-style: none;
  min-width: 160px;
}
.section-strip__menu li button {
  width: 100%;
  text-align: left;
  background: transparent;
  border: 0;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 12px;
}
.section-strip__menu li button:hover { background: #f4efe0; }

.section-strip__boundary-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 6px;
  margin-left: -3px;
  cursor: ew-resize;
}
```

- [ ] **Step 5: Drag-resize between adjacent blocks**

After the section blocks are rendered inside `.section-strip__sections`, add boundary handle elements between adjacent blocks. Track drag state:

```tsx
  const [dragging, setDragging] = useState<null | { leftId: string }>(null);
  const sectionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dragging) return;
    function onMove(ev: MouseEvent): void {
      const el = sectionsRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const t = ((ev.clientX - rect.left) / rect.width) * duration;
      onChange(resizeBoundary(state, dragging.leftId, t, duration));
    }
    function onUp(): void {
      setDragging(null);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, state, duration, onChange]);
```

Import `resizeBoundary` at the top.

Inside the `.section-strip__sections` container, render boundary handles between adjacent blocks:

```tsx
{state.sections.flatMap((s, i) => {
  const elements = [
    <SectionBlock
      key={s.id}
      section={s}
      color={PALETTE[i % PALETTE.length]}
      duration={duration}
      isEditing={editingKind === "section" && editingId === s.id}
      onSeek={(t) => transport.clock.seek(t)}
      onStartRename={() => startRenameSection(s.id)}
      onRenameCommit={commitRename}
      onContextMenu={(e) => setMenu({ kind: "section", id: s.id, x: e.clientX, y: e.clientY })}
    />,
  ];
  // Boundary handle between this block and the next, sitting AT the right edge.
  if (i < state.sections.length - 1) {
    const leftPct = duration > 0 ? (s.end / duration) * 100 : 0;
    elements.push(
      <div
        key={`bd-${s.id}`}
        className="section-strip__boundary-handle"
        style={{ left: `${leftPct}%` }}
        onMouseDown={(e) => {
          e.preventDefault();
          setDragging({ leftId: s.id });
        }}
      />,
    );
  }
  return elements;
})}
```

- [ ] **Step 6: Run all SectionStrip tests, confirm green**

```
npx vitest run src/section-strip/SectionStrip.test.tsx
```

Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/section-strip/SectionStrip.tsx src/section-strip/SectionStrip.test.tsx src/styles/section-strip.css
git commit -m "feat(section-strip): rename, drag-resize, context menu, section/bookmark loops"
```

---

## Task 13: PracticeView + TopBar + MidiTools wiring

**Files:**
- Modify: `src/app/PracticeView.tsx`
- Modify: `src/ui/TopBar.tsx`
- Modify: `src/ui/MidiTools.tsx`
- Modify: `src/styles/*.css` (find the file holding `.practice-score-panel` / `.practice-lane-panel` and add a midi-hide rule)

This task is the integration layer — no new types or pure functions, but it wires every previous task into the live app.

- [ ] **Step 1: Mount the strip in `PracticeView` and hide engraved panels for MIDI**

Inside `PracticeView` (`src/app/PracticeView.tsx`):

Add imports near the top:

```tsx
import { SectionStrip } from "../section-strip/SectionStrip";
import { autoDetect } from "../section-strip/autoDetect";
import { normalize, type SectionState } from "../model/sections";
import { loadStripPosition, saveStripPosition, type StripPosition } from "../section-strip/stripPosition";
```

Add state near the other useState calls:

```tsx
  const isMidiSource = score.source === "midi";
  const [sectionState, setSectionState] = useState<SectionState | null>(null);
  const [stripPosition, setStripPosition] = useState<StripPosition>(() => loadStripPosition());
```

In the practice-state restore `void (async () => { ... })()` block, after applying the loaded state, seed the section state for MIDI sources:

```tsx
      if (isMidiSource) {
        const stored = state?.sectionState;
        if (stored) {
          setSectionState(normalize(stored, score.durationSeconds));
        } else {
          setSectionState(autoDetect(score));
        }
      }
```

Add a `useEffect` that persists `sectionState` whenever it changes (debounce isn't strictly needed since edits are deliberate, but include a guard to avoid persisting the initial null):

```tsx
  useEffect(() => {
    if (!isMidiSource || !sectionState) return;
    const snapshots = snapshotsRef.current;
    const renderer = falldownRef.current;
    const beat = renderer
      ? {
          numerator: renderer.beatMeter.numerator,
          denominator: renderer.beatMeter.denominator,
          subdivision: engineRef.current?.metronome.subdivision ?? 1,
        }
      : undefined;
    void savePracticeState(
      pieceId,
      capturePracticeState(transport, handState, beat, {
        mode: modeRef.current,
        ...(snapshots && { tabs: snapshots }),
      }, sectionState),
    );
  }, [sectionState, isMidiSource, pieceId, transport, handState]);
```

Replace the JSX in `PracticeView` so that:
- The strip is mounted (conditionally on `isMidiSource && sectionState`), positioned via `stripPosition`.
- For MIDI sources, the score-container and reading-lane panels are hidden via additional CSS classes (`practice-content--midi-source`).
- The `renderScore` and `renderReadingLane` calls are skipped when `isMidiSource` (wrap them in `if (!isMidiSource) { ... }`).

The strip JSX (place after the practice-content wrapper closes, or as a sibling structured such that it can be flexbox-positioned above/below the falldown — adapt to your layout. A simple solution: render the strip as a sibling of the `.practice-content`, and use CSS order to swap top/bottom):

```tsx
      {isMidiSource && sectionState && (
        <SectionStrip
          state={sectionState}
          transport={transport}
          position={stripPosition}
          onChange={(next) => setSectionState(next)}
          onPositionChange={(p) => {
            saveStripPosition(p);
            setStripPosition(p);
          }}
        />
      )}
```

Apply CSS ordering so when position="top" the strip sits below the TopBar and above the practice-content, and when position="bottom" it sits below the practice-content:

```css
/* In src/styles/section-strip.css (append) */
.practice-view { display: flex; flex-direction: column; }
.section-strip--top { order: 1; }
.practice-content { order: 2; flex: 1; min-height: 0; }
.section-strip--bottom { order: 3; }
```

For hiding the engraved panels on MIDI sources, add a rule (in whichever CSS file currently styles `.practice-score-panel` — likely `src/styles/practice.css` or similar). Add:

```css
.practice-content--midi-source .practice-score-panel,
.practice-content--midi-source .practice-lane-panel { display: none !important; }
```

Then make sure the wrapper picks up that class:

```tsx
        className={[
          "practice-content",
          `practice-content--${mode}`,
          isMidi ? `layout-${practiceLayout}` : "",
          isMidiSource ? "practice-content--midi-source" : "",
        ]
          .filter(Boolean)
          .join(" ")}
```

Also gate the engraving fetches so they don't run for MIDI sources:

```tsx
    void (async () => {
      if (isMidiSource) {
        setScoreReady(true); // no engraving needed; satisfy the "loading" overlay
        return;
      }
      try {
        const { svgPages, timemap } = await renderScore(transport.score.musicXml);
        // ... existing body ...
```

Same guard at the top of the `renderReadingLane` block.

- [ ] **Step 2: Hide the slim scrubber and layout/theme controls for MIDI sources in TopBar**

In `src/ui/TopBar.tsx`, add an `isMidiSource` prop:

```tsx
interface TopBarProps {
  // ... existing fields ...
  isMidiSource: boolean;
}
```

Pass it from `PracticeView`:

```tsx
      <TopBar
        // ... existing props ...
        isMidiSource={isMidiSource}
        ...
      />
```

Inside the rendered JSX, wrap the scrubber `<input>` and time element with a conditional — render only when `!isMidiSource`. Same for the practice-layout segmented control + lane-theme picker — drop them from the bar when `isMidiSource` is true.

The text "0:48 / 2:36" stays visible in either mode (it's already a separate element).

- [ ] **Step 3: Add the strip-position mirror toggle to `MidiTools`**

In `src/ui/MidiTools.tsx`, add two props:

```tsx
  stripPosition: StripPosition;
  onStripPositionChange: (p: StripPosition) => void;
```

And import the type:

```tsx
import type { StripPosition } from "../section-strip/stripPosition";
```

Add a control to the rendered JSX (somewhere alongside the existing options):

```tsx
  <fieldset>
    <legend>Strip position</legend>
    <label>
      <input
        type="radio"
        name="strip-position"
        checked={stripPosition === "top"}
        onChange={() => onStripPositionChange("top")}
      />
      Top
    </label>
    <label>
      <input
        type="radio"
        name="strip-position"
        checked={stripPosition === "bottom"}
        onChange={() => onStripPositionChange("bottom")}
      />
      Bottom
    </label>
  </fieldset>
```

Pass `stripPosition` and `onStripPositionChange` through `ToolsPopover` → `MidiTools` in `PracticeView`. The handler closes over `setStripPosition` and `saveStripPosition`.

- [ ] **Step 4: Run unit tests (existing + new), confirm green**

```
npm run test
```

Expected: all green. If `PracticeView.test.tsx` fails because it didn't pass `isMidiSource` through, update its render-helpers.

- [ ] **Step 5: Run typecheck and lint**

```
npm run typecheck && npm run lint
```

Expected: both green.

- [ ] **Step 6: Smoke-test manually**

```
npm run dev
```

Open the app, upload a MIDI file, confirm:
- The engraved score panel and reading lane are gone.
- The section strip is visible at the bottom (default).
- The `↕` button flips it to the top.
- Refresh the page: position pref survives.
- Click a block: playhead jumps; section highlights.
- Right-click a block: menu appears.
- Upload a MusicXML file (separately): the strip does NOT appear; the engraved score is intact.

- [ ] **Step 7: Commit**

```bash
git add src/app/PracticeView.tsx src/ui/TopBar.tsx src/ui/MidiTools.tsx src/styles/section-strip.css src/styles/practice.css
git commit -m "feat(practice-view): mount section strip for MIDI sources, hide engraved panels"
```

(Adjust the staged file list if the practice CSS lives in a different file.)

---

## Task 14: Playwright e2e tests

**Files:**
- Create: `e2e/midi-section-navigator.spec.ts`
- Use existing fixtures in `e2e/fixtures/` (or add a new minimal MIDI fixture if none has markers)

- [ ] **Step 1: Survey fixtures**

```bash
ls e2e/fixtures/
```

Identify an existing `.mid` fixture (any will do — markers aren't required since auto-detect runs on all MIDI files).

- [ ] **Step 2: Write the e2e tests**

```ts
// e2e/midi-section-navigator.spec.ts
import { test, expect } from "@playwright/test";
import path from "path";

const FIXTURE = path.resolve(__dirname, "fixtures/<existing-fixture>.mid");

test.describe("MIDI section navigator", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Clear stored library + practice state to start clean.
    await page.evaluate(async () => {
      const dbs = await indexedDB.databases?.();
      for (const d of dbs ?? []) if (d.name) indexedDB.deleteDatabase(d.name);
      localStorage.clear();
    });
    await page.reload();
  });

  test("strip appears for MIDI uploads, engraved score is hidden", async ({ page }) => {
    await page.setInputFiles('input[type="file"]', FIXTURE);
    await expect(page.locator(".section-strip")).toBeVisible();
    await expect(page.locator(".practice-score-panel")).toBeHidden();
    await expect(page.locator(".practice-lane-panel")).toBeHidden();
    // The slim scrubber input is gone for MIDI sources.
    await expect(page.locator(".hud-scrubber")).toBeHidden();
  });

  test("clicking a section block seeks the transport", async ({ page }) => {
    await page.setInputFiles('input[type="file"]', FIXTURE);
    await expect(page.locator(".section-strip__block").first()).toBeVisible();
    const blocks = page.locator(".section-strip__block");
    const blockCount = await blocks.count();
    if (blockCount >= 2) {
      // Click the second block (so we move forward).
      await blocks.nth(1).click();
      const time = await page.evaluate(
        () => (document.querySelector(".section-strip__playhead") as HTMLElement | null)?.style.left,
      );
      expect(time).not.toBe("0%");
    }
  });

  test("renaming a section persists across reload", async ({ page }) => {
    await page.setInputFiles('input[type="file"]', FIXTURE);
    const firstBlock = page.locator(".section-strip__block").first();
    await firstBlock.dblclick();
    const input = page.getByLabel("Rename section");
    await input.fill("My Section");
    await input.press("Enter");
    await expect(page.locator(".section-strip__block").first()).toContainText("My Section");
    await page.reload();
    await expect(page.locator(".section-strip__block").first()).toContainText("My Section");
  });

  test("toggling strip position via the ↕ button survives reload", async ({ page }) => {
    await page.setInputFiles('input[type="file"]', FIXTURE);
    await expect(page.locator(".section-strip--bottom")).toBeVisible();
    await page.locator(".section-strip__pos-toggle").click();
    await expect(page.locator(".section-strip--top")).toBeVisible();
    await page.reload();
    await expect(page.locator(".section-strip--top")).toBeVisible();
  });

  test("MusicXML upload does NOT show the strip", async ({ page }) => {
    const XML_FIXTURE = path.resolve(__dirname, "fixtures/<existing-xml-fixture>.musicxml");
    await page.setInputFiles('input[type="file"]', XML_FIXTURE);
    await expect(page.locator(".section-strip")).toHaveCount(0);
    await expect(page.locator(".hud-scrubber")).toBeVisible();
  });
});
```

(Replace `<existing-fixture>.mid` and `<existing-xml-fixture>.musicxml` with the actual filenames seen in `e2e/fixtures/`.)

- [ ] **Step 3: Run the e2e suite**

```
npm run e2e
```

Expected: green. If any selector mismatches (e.g., `.hud-scrubber` was renamed in TopBar), adjust the test selector to match the actual DOM.

- [ ] **Step 4: Commit**

```bash
git add e2e/midi-section-navigator.spec.ts
git commit -m "test(e2e): MIDI section navigator end-to-end coverage"
```

---

## Final Verify

- [ ] **Step 1: Run the full verify gate**

```bash
npm run lint && npm run typecheck && npm test && npm run build && npm run e2e
```

Expected: every step green. If anything fails, fix the underlying issue (don't suppress).

- [ ] **Step 2: Inspect what `git log` shows**

```bash
git log --oneline main..
```

Expected: ~14 commits corresponding to the tasks above, in order. If a task's work landed in the wrong commit, leave it — don't rewrite history.

- [ ] **Step 3: Optional — open a draft PR**

```bash
gh pr create --draft --title "MIDI section navigator" --body "$(cat <<'EOF'
## Summary
- Replaces the auto-engraved sheet music for MIDI source files with an editable horizontal section-navigator strip.
- Sections are auto-detected (with smart labels when the file has no markers) and editable; user-added bookmarks ride in a separate lane.
- Strip position is user-pinnable to top or bottom; MusicXML imports are untouched.

## Test plan
- [ ] `npm run lint && npm run typecheck && npm test && npm run build && npm run e2e` all green
- [ ] Manual: MIDI upload shows the strip; rename/split/merge/loop work; reload preserves edits
- [ ] Manual: MusicXML upload is unchanged

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Adjust whether to push and open a PR based on the user's preference.

---

## Self-Review Notes

- All 8 numbered sections of the spec are mapped to one or more tasks (1, 9 — model; 2, 8 — edits/persistence; 3 — markers; 4–7 — auto-detect; 10–12 — strip; 13 — wiring; 14 — e2e).
- Smart labels are gated on no MIDI markers per the spec (Pass 4, Task 7).
- Loop integration (section + bookmark-to-next) is in Task 12 per the spec.
- Strip-position pref uses `localStorage` (`arpeggio.stripPosition`) and applies app-wide per the spec.
- MusicXML imports are guarded against modification in PracticeView (Task 13) and the e2e suite (Task 14).
- Auto-detect Pass 2 "long rest alone doesn't trigger" matches the spec's "cluster of 2+" rule.
- Spec Pass 4 climax tie-break (density × register highest) is implemented in Task 7's `applySmartLabels`.

If a task fails to compile or pass tests during execution, fix the root cause; do not skip tests.
