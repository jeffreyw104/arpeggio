# MIDI-Native Visualizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the approximate-engraved score views with a MIDI-native piano-roll for MIDI imports, and add a measure progress bar + whole-piece minimap that benefit both sources. Surface section markers when the source carries them.

**Architecture:** New `src/piano-roll/` package containing a Canvas2D renderer (reuses the falldown's pure-helper style), a paginated `PianoRollLane` that mirrors `ReadingLaneView`, and a `PianoRollPanel` for the split view. Two new React UI components (`MeasureProgressBar`, `Minimap`) replace/supplement the TopBar scrubber. `PracticeView` branches on `score.source` at mount; `Score` gains a `sections: Section[]` field populated by both importers.

**Tech Stack:** TypeScript (strict), React 19, Canvas2D, Vitest + jsdom for unit/component tests, Playwright for e2e. `@tonejs/midi` for MIDI parsing (already in deps). DOM-parser MusicXML walking (already in deps).

**Spec:** `docs/superpowers/specs/2026-05-20-midi-visualizer-design.md`

**Verify gate (run after each task):** `npm run lint && npm run typecheck && npm test`. Run `npm run build && npm run e2e` before final commit.

---

## File Structure

**New (`src/piano-roll/`):**
- `PianoRollRenderer.ts` — Canvas2D renderer. Pure: takes ctx + transport + viewport, draws one frame. Mirrors `FalldownRenderer` style.
- `PianoRollLane.ts` — paginated lane wrapper. Mirrors `ReadingLaneView` (canvas + overlay divs for loop/drag/hover).
- `PianoRollPanel.ts` — split-view variant. Same renderer, larger page size, no overlay chrome.
- `pitchAutoFit.ts` — pure: notes → `{lowMidi, highMidi}` capped + clamped.
- `measurePaging.ts` — pure: `pageForMeasure(idx, perPage)`.
- `pitchTrack.ts` — pure: midi → y-coordinate inside a viewport range.
- `noteRectsInWindow.ts` — pure: notes + viewport → rects to draw.

**New (`src/ui/`):**
- `MeasureProgressBar.tsx` — replaces TopBar `hud-scrubber`. Per-measure flex cells.
- `Minimap.tsx` — 16px strip below TopBar. Density + caret + viewport box + sections.

**New (`src/test/fixtures/`):**
- `sections.mid` — small MIDI with marker meta events.
- `sections.musicxml` — small MusicXML with `<rehearsal>` elements.

**New (`tests/e2e/`):**
- `piano-roll.spec.ts` — Playwright test for the MIDI source path.

**Modified:**
- `src/model/score.ts` — add `Section` type + `sections: Section[]` field.
- `src/import/midi/parseMidi.ts` — extract markers.
- `src/import/musicxml/parseMusicXml.ts` — extract `<rehearsal>`.
- `src/import/midi/parseMidi.test.ts` — add a markers test.
- `src/import/musicxml/parseMusicXml.test.ts` — add a rehearsal test.
- `src/ui/TopBar.tsx` — swap `hud-scrubber` → `<MeasureProgressBar/>`, add minimap toggle.
- `src/app/PracticeView.tsx` — branch on `score.source`, add two canvas refs.
- `src/library/LibraryBrowser.tsx` — source label in row.
- `src/library/practiceState.ts` — capture/apply `minimapVisible`.
- `src/library/db.ts` — add `minimapVisible?: boolean` to `StoredPracticeState`.
- `src/styles/theme.css` — add piano-roll / progress-bar / minimap styles; remove `.hud-scrubber` rules.

---

## Task 1: Add `Section` type and empty-array field to `Score`

**Files:**
- Modify: `src/model/score.ts`
- Modify: `src/import/midi/parseMidi.ts` (add `sections: []`)
- Modify: `src/import/musicxml/parseMusicXml.ts` (add `sections: []`)
- Modify: `src/falldown/renderer.test.ts` (fixture missing `sections`)

- [ ] **Step 1: Add the type and field**

Edit `src/model/score.ts` — after the `Measure` interface:

```ts
/** A section / rehearsal marker imported from the source file. */
export interface Section {
  /** Onset, seconds from start of piece. */
  start: number;
  /** Display label as written in the source (e.g. "Verse 1", "A"). */
  label: string;
}
```

Inside `Score`, after `tempoMap`:

```ts
  /** Section/rehearsal markers from the source, sorted by `start`. Empty
   *  array when the source carried none. */
  sections: Section[];
```

- [ ] **Step 2: Set `sections: []` in both importers**

Edit `src/import/midi/parseMidi.ts` — wherever the `Score` object is returned, add `sections: [],` to the literal.

Edit `src/import/musicxml/parseMusicXml.ts` — same change in its returned `Score` literal.

- [ ] **Step 3: Update the falldown renderer test fixture**

Edit `src/falldown/renderer.test.ts` — add `sections: [],` to the `score` literal so it still satisfies `Score`.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: clean. Any other `satisfies Score` literal in tests must be updated the same way; grep for `satisfies Score` and add `sections: []` to each.

- [ ] **Step 5: Tests**

Run: `npm test`
Expected: 386 tests pass (same as baseline).

- [ ] **Step 6: Commit**

```bash
git add src/model/score.ts src/import/midi/parseMidi.ts src/import/musicxml/parseMusicXml.ts src/falldown/renderer.test.ts
git commit -m "model(score): add Section type and sections field

Empty array everywhere; importers and tests will populate in later tasks."
```

---

## Task 2: Extract MIDI markers in `parseMidi`

**Files:**
- Test: `src/import/midi/parseMidi.test.ts`
- Modify: `src/import/midi/parseMidi.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/import/midi/parseMidi.test.ts`:

```ts
  it("extracts marker meta events as sections", () => {
    const midi = new Midi();
    midi.header.ppq = 480;
    midi.header.tempos = [{ ticks: 0, bpm: 120 }];
    midi.header.timeSignatures = [{ ticks: 0, timeSignature: [4, 4] }];
    midi.header.meta = [
      { type: "marker", ticks: 0, text: "Intro" },
      { type: "marker", ticks: 960, text: "Verse" },
      { type: "trackName", ticks: 0, text: "Piano" }, // should be ignored
    ];
    midi.addTrack().addNote({ midi: 60, time: 0, duration: 0.5 });
    const score = parseMidi(toBuffer(midi));
    expect(score.sections).toEqual([
      { start: 0, label: "Intro" },
      { start: 1, label: "Verse" }, // 960 ticks at 480 ppq @ 120 bpm = 1s
    ]);
  });

  it("returns empty sections when no markers are present", () => {
    const score = parseMidi(load("clean.mid"));
    expect(score.sections).toEqual([]);
  });
```

- [ ] **Step 2: Run the test (expect FAIL)**

Run: `npm test -- src/import/midi/parseMidi.test.ts`
Expected: the new tests fail — `score.sections` is `[]`.

- [ ] **Step 3: Implement marker extraction**

Edit `src/import/midi/parseMidi.ts`. Locate where the `Score` literal is built. Before it, add:

```ts
const sections = midi.header.meta
  .filter((e) => e.type === "marker")
  .map((e) => ({
    start: midi.header.ticksToSeconds(e.ticks),
    label: e.text,
  }))
  .sort((a, b) => a.start - b.start);
```

Then in the `Score` return literal, change `sections: []` to `sections,`.

- [ ] **Step 4: Run the test (expect PASS)**

Run: `npm test -- src/import/midi/parseMidi.test.ts`
Expected: PASS for both new tests; all prior tests in this file still pass.

- [ ] **Step 5: Commit**

```bash
git add src/import/midi/parseMidi.ts src/import/midi/parseMidi.test.ts
git commit -m "import(midi): extract marker meta events into score.sections"
```

---

## Task 3: Extract MusicXML `<rehearsal>` in `parseMusicXml`

**Files:**
- Test: `src/import/musicxml/parseMusicXml.test.ts`
- Modify: `src/import/musicxml/parseMusicXml.ts`

- [ ] **Step 1: Write the failing test**

First, locate how existing tests construct inline MusicXML. Open `src/import/musicxml/parseMusicXml.test.ts` and follow the existing helper pattern (likely a `xml` template literal). Append:

```ts
  it("extracts <rehearsal> as sections", () => {
    const xml = `<?xml version="1.0"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <direction><direction-type><rehearsal>A</rehearsal></direction-type></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>
    </measure>
    <measure number="2">
      <direction><direction-type><rehearsal>Verse</rehearsal></direction-type></direction>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`;
    const score = parseMusicXml(xml);
    expect(score.sections).toEqual([
      { start: 0, label: "A" },
      { start: 2, label: "Verse" }, // measure 2 at 120 bpm 4/4 = 2s
    ]);
  });

  it("returns empty sections when no <rehearsal> tags are present", () => {
    // Reuse whichever minimal XML the existing tests use; assert empty sections.
    const score = parseMusicXml(MINIMAL_XML);
    expect(score.sections).toEqual([]);
  });
```

If the existing file does not have a constant like `MINIMAL_XML`, reuse the inline XML from another test in the same file.

- [ ] **Step 2: Run the test (expect FAIL)**

Run: `npm test -- src/import/musicxml/parseMusicXml.test.ts`
Expected: new tests fail — `sections` is `[]`.

- [ ] **Step 3: Implement extraction**

Edit `src/import/musicxml/parseMusicXml.ts`. Find the per-measure loop. Inside it, after the measure's `start` time is known, walk for rehearsal marks:

```ts
const rehearsalEls = measureEl.querySelectorAll(
  "direction > direction-type > rehearsal",
);
for (const r of rehearsalEls) {
  sections.push({ start: measureStart, label: r.textContent?.trim() ?? "" });
}
```

Before the loop, declare `const sections: Section[] = [];` (and `import type { Section } from "../../model/score";` if not already imported).

After the loop, set `sections,` on the returned `Score` literal (replacing `sections: []`).

- [ ] **Step 4: Run the test (expect PASS)**

Run: `npm test -- src/import/musicxml/parseMusicXml.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/import/musicxml/parseMusicXml.ts src/import/musicxml/parseMusicXml.test.ts
git commit -m "import(musicxml): extract <rehearsal> into score.sections"
```

---

## Task 4: `pitchAutoFit` pure helper

**Files:**
- Create: `src/piano-roll/pitchAutoFit.ts`
- Test: `src/piano-roll/pitchAutoFit.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/piano-roll/pitchAutoFit.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { pitchAutoFit } from "./pitchAutoFit";
import type { Note } from "../model/score";

const n = (midi: number): Note => ({
  midi,
  start: 0,
  duration: 1,
  velocity: 0.8,
  hand: "right",
});

describe("pitchAutoFit", () => {
  it("returns the literal min/max when the span exceeds minSpan", () => {
    const r = pitchAutoFit([n(48), n(72)], { minSpan: 12, maxSpan: 88 });
    expect(r).toEqual({ lowMidi: 48, highMidi: 72 });
  });

  it("pads symmetrically up to minSpan", () => {
    const r = pitchAutoFit([n(60), n(64)], { minSpan: 24, maxSpan: 88 });
    expect(r.highMidi - r.lowMidi).toBe(24);
    // 60 and 64 should both lie inside.
    expect(r.lowMidi).toBeLessThanOrEqual(60);
    expect(r.highMidi).toBeGreaterThanOrEqual(64);
  });

  it("clamps to the A0..C8 piano range", () => {
    const r = pitchAutoFit([n(108)], { minSpan: 24, maxSpan: 88 });
    expect(r.highMidi).toBeLessThanOrEqual(108); // C8
    expect(r.lowMidi).toBeGreaterThanOrEqual(21); // A0
  });

  it("returns the full piano when no notes are given", () => {
    const r = pitchAutoFit([], { minSpan: 24, maxSpan: 88 });
    expect(r).toEqual({ lowMidi: 21, highMidi: 108 });
  });

  it("caps the maximum span", () => {
    const r = pitchAutoFit([n(21), n(108)], { minSpan: 24, maxSpan: 60 });
    expect(r.highMidi - r.lowMidi).toBeLessThanOrEqual(60);
  });
});
```

- [ ] **Step 2: Run the test (expect FAIL)**

Run: `npm test -- src/piano-roll/pitchAutoFit.test.ts`
Expected: FAIL — `pitchAutoFit` doesn't exist yet.

- [ ] **Step 3: Implement**

Create `src/piano-roll/pitchAutoFit.ts`:

```ts
import type { Note } from "../model/score";

const A0 = 21;
const C8 = 108;

export interface PitchAutoFitCap {
  /** Minimum number of semitones the returned range must span. */
  minSpan: number;
  /** Maximum number of semitones the returned range may span. */
  maxSpan: number;
}

export interface PitchRange {
  lowMidi: number;
  highMidi: number;
}

/**
 * Compute the [low, high] pitch range to render. The literal min/max of the
 * notes is widened symmetrically to at least `minSpan` semitones, then
 * narrowed to at most `maxSpan`, then clamped into the A0..C8 piano range.
 * With no notes, returns the full piano.
 */
export function pitchAutoFit(
  notes: readonly Note[],
  cap: PitchAutoFitCap,
): PitchRange {
  if (notes.length === 0) return { lowMidi: A0, highMidi: C8 };

  let low = Infinity;
  let high = -Infinity;
  for (const n of notes) {
    if (n.midi < low) low = n.midi;
    if (n.midi > high) high = n.midi;
  }

  // Widen to at least minSpan, centred on the current midpoint.
  let span = high - low;
  if (span < cap.minSpan) {
    const pad = (cap.minSpan - span) / 2;
    low = Math.floor(low - pad);
    high = Math.ceil(high + pad);
    span = high - low;
  }

  // Narrow if past maxSpan — drop equally from both ends.
  if (span > cap.maxSpan) {
    const trim = (span - cap.maxSpan) / 2;
    low = Math.ceil(low + trim);
    high = Math.floor(high - trim);
  }

  // Clamp to the piano.
  if (low < A0) {
    high += A0 - low;
    low = A0;
  }
  if (high > C8) {
    low -= high - C8;
    high = C8;
  }
  low = Math.max(A0, low);
  high = Math.min(C8, high);

  return { lowMidi: low, highMidi: high };
}
```

- [ ] **Step 4: Run the test (expect PASS)**

Run: `npm test -- src/piano-roll/pitchAutoFit.test.ts`
Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/piano-roll/pitchAutoFit.ts src/piano-roll/pitchAutoFit.test.ts
git commit -m "piano-roll: pitchAutoFit helper (min/max span + piano clamp)"
```

---

## Task 5: `measurePaging` pure helper

**Files:**
- Create: `src/piano-roll/measurePaging.ts`
- Test: `src/piano-roll/measurePaging.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/piano-roll/measurePaging.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { pageForMeasure } from "./measurePaging";

describe("pageForMeasure", () => {
  it("groups consecutive measures into fixed-size pages", () => {
    expect(pageForMeasure(0, 4)).toEqual({ first: 0, last: 3 });
    expect(pageForMeasure(3, 4)).toEqual({ first: 0, last: 3 });
    expect(pageForMeasure(4, 4)).toEqual({ first: 4, last: 7 });
    expect(pageForMeasure(11, 4)).toEqual({ first: 8, last: 11 });
  });

  it("supports page size of one", () => {
    expect(pageForMeasure(7, 1)).toEqual({ first: 7, last: 7 });
  });
});
```

- [ ] **Step 2: Run the test (expect FAIL)**

Run: `npm test -- src/piano-roll/measurePaging.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `src/piano-roll/measurePaging.ts`:

```ts
/** Which page (range of measure indices) a given measure belongs to. */
export function pageForMeasure(
  measureIndex: number,
  measuresPerPage: number,
): { first: number; last: number } {
  const first = Math.floor(measureIndex / measuresPerPage) * measuresPerPage;
  return { first, last: first + measuresPerPage - 1 };
}
```

- [ ] **Step 4: Run the test (expect PASS)**

Run: `npm test -- src/piano-roll/measurePaging.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/piano-roll/measurePaging.ts src/piano-roll/measurePaging.test.ts
git commit -m "piano-roll: measurePaging helper"
```

---

## Task 6: `pitchTrack` + `noteRectsInWindow` pure helpers

**Files:**
- Create: `src/piano-roll/pitchTrack.ts`
- Create: `src/piano-roll/noteRectsInWindow.ts`
- Test: `src/piano-roll/pitchTrack.test.ts`
- Test: `src/piano-roll/noteRectsInWindow.test.ts`

- [ ] **Step 1: pitchTrack test**

Create `src/piano-roll/pitchTrack.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { pitchTrack } from "./pitchTrack";

describe("pitchTrack", () => {
  it("places the highest pitch at the top of the viewport", () => {
    const y = pitchTrack(72, { lowMidi: 60, highMidi: 72 }, { top: 0, height: 120 });
    expect(y).toBe(0);
  });

  it("places the lowest pitch at the bottom row", () => {
    const y = pitchTrack(60, { lowMidi: 60, highMidi: 72 }, { top: 0, height: 120 });
    // 12 semitones across 120px = 10px per row, lowest row top = 110.
    expect(y).toBe(110);
  });

  it("returns track height as the row height", () => {
    expect(pitchTrack.rowHeight({ lowMidi: 60, highMidi: 72 }, 120)).toBe(10);
  });

  it("clamps out-of-range pitches to the viewport", () => {
    const y = pitchTrack(80, { lowMidi: 60, highMidi: 72 }, { top: 0, height: 120 });
    expect(y).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Implement pitchTrack**

Create `src/piano-roll/pitchTrack.ts`:

```ts
import type { PitchRange } from "./pitchAutoFit";

interface ViewportV { top: number; height: number }

/**
 * The pixel `y` of the top of the row for `midi`, inside a viewport
 * `{ top, height }`. The highest pitch sits at the top.
 */
export function pitchTrack(
  midi: number,
  range: PitchRange,
  vp: ViewportV,
): number {
  const rows = range.highMidi - range.lowMidi + 1;
  const rowH = vp.height / rows;
  const fromTop = range.highMidi - midi;
  const clamped = Math.max(0, Math.min(rows - 1, fromTop));
  return vp.top + clamped * rowH;
}

pitchTrack.rowHeight = function rowHeight(
  range: PitchRange,
  height: number,
): number {
  const rows = range.highMidi - range.lowMidi + 1;
  return height / rows;
};
```

- [ ] **Step 3: noteRectsInWindow test**

Create `src/piano-roll/noteRectsInWindow.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { noteRectsInWindow } from "./noteRectsInWindow";
import type { Note } from "../model/score";

const n = (midi: number, start: number, duration: number, hand: "left" | "right"): Note => ({
  midi, start, duration, velocity: 0.8, hand,
});

describe("noteRectsInWindow", () => {
  it("places a note's x by its start time within the window", () => {
    const rects = noteRectsInWindow(
      [n(60, 1, 0.5, "right")],
      {
        viewport: { left: 0, top: 0, width: 200, height: 100 },
        timeWindow: { start: 0, end: 2 },
        pitchRange: { lowMidi: 60, highMidi: 60 },
        rightColor: "#4a90d9",
        leftColor: "#e08a3c",
      },
    );
    // 1s of 2s window at 200px width = x=100, width=50.
    expect(rects[0].x).toBe(100);
    expect(rects[0].width).toBe(50);
  });

  it("colours notes by hand", () => {
    const rects = noteRectsInWindow(
      [n(60, 0, 1, "right"), n(60, 0, 1, "left")],
      {
        viewport: { left: 0, top: 0, width: 100, height: 100 },
        timeWindow: { start: 0, end: 1 },
        pitchRange: { lowMidi: 60, highMidi: 60 },
        rightColor: "#4a90d9",
        leftColor: "#e08a3c",
      },
    );
    expect(rects[0].color).toBe("#4a90d9");
    expect(rects[1].color).toBe("#e08a3c");
  });

  it("excludes notes outside the time window", () => {
    const rects = noteRectsInWindow(
      [n(60, 3, 0.5, "right")],
      {
        viewport: { left: 0, top: 0, width: 100, height: 100 },
        timeWindow: { start: 0, end: 2 },
        pitchRange: { lowMidi: 60, highMidi: 60 },
        rightColor: "#4a90d9",
        leftColor: "#e08a3c",
      },
    );
    expect(rects).toEqual([]);
  });

  it("includes a note that starts before the window but sounds inside it", () => {
    const rects = noteRectsInWindow(
      [n(60, -0.5, 1, "right")],
      {
        viewport: { left: 0, top: 0, width: 100, height: 100 },
        timeWindow: { start: 0, end: 1 },
        pitchRange: { lowMidi: 60, highMidi: 60 },
        rightColor: "#4a90d9",
        leftColor: "#e08a3c",
      },
    );
    expect(rects).toHaveLength(1);
    expect(rects[0].x).toBeLessThan(0);
  });
});
```

- [ ] **Step 4: Implement noteRectsInWindow**

Create `src/piano-roll/noteRectsInWindow.ts`:

```ts
import type { Note } from "../model/score";
import type { PitchRange } from "./pitchAutoFit";
import { pitchTrack } from "./pitchTrack";

interface Viewport { left: number; top: number; width: number; height: number }
interface TimeWindow { start: number; end: number }

export interface NoteRect {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  velocity: number;
  midi: number;
  start: number;
  end: number;
}

export interface NoteRectsOptions {
  viewport: Viewport;
  timeWindow: TimeWindow;
  pitchRange: PitchRange;
  rightColor: string;
  leftColor: string;
}

export function noteRectsInWindow(
  notes: readonly Note[],
  opts: NoteRectsOptions,
): NoteRect[] {
  const { viewport: vp, timeWindow: tw, pitchRange: pr } = opts;
  const pxPerSec = vp.width / (tw.end - tw.start);
  const rowH = pitchTrack.rowHeight(pr, vp.height);
  const rects: NoteRect[] = [];
  for (const note of notes) {
    const end = note.start + note.duration;
    if (end <= tw.start) continue;
    if (note.start >= tw.end) continue;
    const x = vp.left + (note.start - tw.start) * pxPerSec;
    const width = note.duration * pxPerSec;
    const y = pitchTrack(note.midi, pr, { top: vp.top, height: vp.height });
    rects.push({
      x,
      y,
      width,
      height: rowH,
      color: note.hand === "right" ? opts.rightColor : opts.leftColor,
      velocity: note.velocity,
      midi: note.midi,
      start: note.start,
      end,
    });
  }
  return rects;
}
```

- [ ] **Step 5: Tests**

Run: `npm test -- src/piano-roll/`
Expected: all piano-roll tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/piano-roll/pitchTrack.ts src/piano-roll/pitchTrack.test.ts src/piano-roll/noteRectsInWindow.ts src/piano-roll/noteRectsInWindow.test.ts
git commit -m "piano-roll: pitchTrack + noteRectsInWindow pure helpers"
```

---

## Task 7: `PianoRollRenderer` — skeleton + playhead + beat grid

**Files:**
- Create: `src/piano-roll/PianoRollRenderer.ts`
- Test: `src/piano-roll/PianoRollRenderer.test.ts`

This task creates the renderer with the framing it needs (transport, viewport math, frame loop) and draws the beat grid and playhead only. Notes / sections / wait-mode highlights come in tasks 8 and 9.

- [ ] **Step 1: Test**

Create `src/piano-roll/PianoRollRenderer.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { PianoRollRenderer } from "./PianoRollRenderer";
import { Transport } from "../transport/transport";
import type { Score } from "../model/score";

const baseScore = {
  source: "midi",
  notes: [],
  measures: [
    { index: 0, start: 0, end: 2, numerator: 4, denominator: 4 },
    { index: 1, start: 2, end: 4, numerator: 4, denominator: 4 },
  ],
  pedalEvents: [],
  timeSignatures: [{ start: 0, numerator: 4, denominator: 4 }],
  tempoMap: [{ start: 0, bpm: 120 }],
  durationSeconds: 4,
  musicXml: "",
  qualityWarning: null,
  sections: [],
} satisfies Score;

function fakeCtx() {
  const calls: string[] = [];
  const rec = (name: string) => (...a: unknown[]) => calls.push(`${name}(${a.join(",")})`);
  const stub = { save: rec("save"), restore: rec("restore"), beginPath: rec("beginPath"),
    moveTo: rec("moveTo"), lineTo: rec("lineTo"), stroke: rec("stroke"),
    fillRect: rec("fillRect"), clearRect: rec("clearRect"), fill: rec("fill"),
    fillText: rec("fillText"), roundRect: rec("roundRect"), translate: rec("translate"),
    setLineDash: rec("setLineDash"), strokeRect: rec("strokeRect"),
    fillStyle: "", strokeStyle: "", lineWidth: 0, font: "", textAlign: "" as CanvasTextAlign,
    globalAlpha: 1, shadowColor: "", shadowBlur: 0,
  };
  return { ctx: stub as unknown as CanvasRenderingContext2D, calls };
}

describe("PianoRollRenderer skeleton", () => {
  it("clears the canvas and draws a vertical playhead at the current time", () => {
    const transport = new Transport(baseScore);
    transport.clock.seek(1);
    const { ctx, calls } = fakeCtx();
    const r = new PianoRollRenderer(ctx, transport, { width: 200, height: 100 });
    r.setViewport({ start: 0, end: 2 });
    r.renderFrame();
    expect(calls.some((c) => c.startsWith("clearRect"))).toBe(true);
    // 1s of 2s window at width 200 = x=100. The playhead line should move to 100.
    expect(calls.some((c) => c === "moveTo(100,0)")).toBe(true);
  });

  it("draws downbeat lines at each measure start inside the viewport", () => {
    const transport = new Transport(baseScore);
    const { ctx, calls } = fakeCtx();
    const r = new PianoRollRenderer(ctx, transport, { width: 200, height: 100 });
    r.setViewport({ start: 0, end: 4 });
    r.renderFrame();
    // Two measures start in [0, 4]: x=0 and x=100.
    expect(calls).toContain("moveTo(0,0)");
    expect(calls).toContain("moveTo(100,0)");
  });
});
```

- [ ] **Step 2: Run test (expect FAIL)**

Run: `npm test -- src/piano-roll/PianoRollRenderer.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement skeleton**

Create `src/piano-roll/PianoRollRenderer.ts`:

```ts
import type { Transport } from "../transport/transport";

const BG = "#15151a";
const BEAT_LINE = "#34343c";
const DOWNBEAT_LINE = "#5a5a66";
const PLAYHEAD = "#e6e6ea";

export interface RendererOptions {
  width: number;
  height: number;
}

export interface TimeWindow {
  start: number;
  end: number;
}

/**
 * Canvas2D renderer for the MIDI-native piano roll. Reads transport state;
 * never advances the clock. Notes/sections/wait-mode are added in later
 * tasks; this skeleton draws background, beat grid, and playhead.
 */
export class PianoRollRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly transport: Transport;
  private width: number;
  private height: number;
  private viewport: TimeWindow = { start: 0, end: 1 };

  constructor(
    ctx: CanvasRenderingContext2D,
    transport: Transport,
    options: RendererOptions,
  ) {
    this.ctx = ctx;
    this.transport = transport;
    this.width = options.width;
    this.height = options.height;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  setViewport(window: TimeWindow): void {
    this.viewport = window;
  }

  renderFrame(): void {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, this.width, this.height);

    this.drawBeatGrid();
    this.drawPlayhead();
  }

  private timeToX(t: number): number {
    const w = this.viewport.end - this.viewport.start;
    return ((t - this.viewport.start) / w) * this.width;
  }

  private drawBeatGrid(): void {
    const { ctx } = this;
    const measures = this.transport.score.measures;
    const ts = this.transport.score.timeSignatures[0];
    const beatsPerMeasure = ts?.numerator ?? 4;
    for (const m of measures) {
      if (m.end < this.viewport.start) continue;
      if (m.start > this.viewport.end) break;
      const beatSec = (m.end - m.start) / beatsPerMeasure;
      // Downbeat
      const xd = this.timeToX(m.start);
      ctx.strokeStyle = DOWNBEAT_LINE;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xd, 0);
      ctx.lineTo(xd, this.height);
      ctx.stroke();
      // Mid-measure beats
      ctx.strokeStyle = BEAT_LINE;
      ctx.lineWidth = 1;
      for (let b = 1; b < beatsPerMeasure; b += 1) {
        const xb = this.timeToX(m.start + b * beatSec);
        ctx.beginPath();
        ctx.moveTo(xb, 0);
        ctx.lineTo(xb, this.height);
        ctx.stroke();
      }
    }
  }

  private drawPlayhead(): void {
    const { ctx } = this;
    const t = this.transport.clock.position;
    if (t < this.viewport.start || t > this.viewport.end) return;
    const x = this.timeToX(t);
    ctx.strokeStyle = PLAYHEAD;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, this.height);
    ctx.stroke();
  }
}
```

- [ ] **Step 4: Run test (expect PASS)**

Run: `npm test -- src/piano-roll/PianoRollRenderer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/piano-roll/PianoRollRenderer.ts src/piano-roll/PianoRollRenderer.test.ts
git commit -m "piano-roll(renderer): skeleton — background, beat grid, playhead"
```

---

## Task 8: `PianoRollRenderer` — notes + pitch range

**Files:**
- Modify: `src/piano-roll/PianoRollRenderer.ts`
- Modify: `src/piano-roll/PianoRollRenderer.test.ts`

- [ ] **Step 1: Append failing test**

Append to `src/piano-roll/PianoRollRenderer.test.ts`:

```ts
describe("PianoRollRenderer notes", () => {
  it("draws a rect per note inside the viewport, hand-coloured", () => {
    const score = {
      ...baseScore,
      notes: [
        { midi: 64, start: 0, duration: 0.5, velocity: 1, hand: "right" as const },
        { midi: 60, start: 0.5, duration: 0.5, velocity: 1, hand: "left" as const },
      ],
    };
    const transport = new Transport(score);
    const { ctx, calls } = fakeCtx();
    const r = new PianoRollRenderer(ctx, transport, { width: 200, height: 100 });
    r.setViewport({ start: 0, end: 2 });
    r.renderFrame();
    // Two filled rects from notes (plus the BG rect — 3 total).
    const fillRectCalls = calls.filter((c) => c.startsWith("fillRect"));
    expect(fillRectCalls.length).toBeGreaterThanOrEqual(3);
  });

  it("skips notes whose end is before the viewport start", () => {
    const score = {
      ...baseScore,
      notes: [
        { midi: 60, start: -1, duration: 0.5, velocity: 1, hand: "right" as const },
      ],
    };
    const transport = new Transport(score);
    const { ctx, calls } = fakeCtx();
    const r = new PianoRollRenderer(ctx, transport, { width: 200, height: 100 });
    r.setViewport({ start: 0, end: 2 });
    r.renderFrame();
    // Only BG rect; no note rects.
    const fillRectCalls = calls.filter((c) => c.startsWith("fillRect"));
    expect(fillRectCalls.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run (expect FAIL on the first test)**

Run: `npm test -- src/piano-roll/PianoRollRenderer.test.ts`

- [ ] **Step 3: Implement**

Edit `src/piano-roll/PianoRollRenderer.ts`. Add imports at the top:

```ts
import { noteRectsInWindow } from "./noteRectsInWindow";
import { pitchAutoFit } from "./pitchAutoFit";
```

Add constants:

```ts
const RIGHT = "#4a90d9";
const LEFT = "#e08a3c";
const MIN_NOTE_ALPHA = 0.5;
const GLOW_BLUR = 12;
```

Add a private method:

```ts
private drawNotes(): void {
  const { ctx } = this;
  const notes = this.transport.score.notes;
  const range = pitchAutoFit(notes, { minSpan: 24, maxSpan: 88 });
  const t = this.transport.clock.position;
  const rects = noteRectsInWindow(notes, {
    viewport: { left: 0, top: 0, width: this.width, height: this.height },
    timeWindow: this.viewport,
    pitchRange: range,
    rightColor: RIGHT,
    leftColor: LEFT,
  });
  for (const rect of rects) {
    ctx.save();
    ctx.globalAlpha = MIN_NOTE_ALPHA + (1 - MIN_NOTE_ALPHA) * rect.velocity;
    const sounding = rect.start <= t && rect.end > t;
    if (sounding) {
      ctx.shadowColor = rect.color;
      ctx.shadowBlur = GLOW_BLUR;
    }
    ctx.fillStyle = rect.color;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.restore();
  }
}
```

In `renderFrame`, call `this.drawNotes()` between `drawBeatGrid()` and `drawPlayhead()`.

- [ ] **Step 4: Run (expect PASS)**

Run: `npm test -- src/piano-roll/PianoRollRenderer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/piano-roll/PianoRollRenderer.ts src/piano-roll/PianoRollRenderer.test.ts
git commit -m "piano-roll(renderer): draw hand-coloured note rects with velocity opacity"
```

---

## Task 9: `PianoRollRenderer` — sections + wait-mode highlight + loop band

**Files:**
- Modify: `src/piano-roll/PianoRollRenderer.ts`
- Modify: `src/piano-roll/PianoRollRenderer.test.ts`

- [ ] **Step 1: Append tests**

Append to `src/piano-roll/PianoRollRenderer.test.ts`:

```ts
describe("PianoRollRenderer extras", () => {
  it("draws a section label at the section's x", () => {
    const score = { ...baseScore, sections: [{ start: 1, label: "Verse" }] };
    const transport = new Transport(score);
    const { ctx, calls } = fakeCtx();
    const r = new PianoRollRenderer(ctx, transport, { width: 200, height: 100 });
    r.setViewport({ start: 0, end: 2 });
    r.renderFrame();
    expect(calls.some((c) => c.startsWith("fillText(Verse"))).toBe(true);
  });

  it("draws a red loop band when a loop is set inside the viewport", () => {
    const transport = new Transport(baseScore);
    transport.loopMeasures(0, 1);
    const { ctx, calls } = fakeCtx();
    const r = new PianoRollRenderer(ctx, transport, { width: 200, height: 100 });
    r.setViewport({ start: 0, end: 4 });
    r.renderFrame();
    // Some fillRect spanning the loop region with the loop colour.
    expect(calls.some((c) => c.startsWith("fillRect"))).toBe(true);
  });

  it("draws a green vertical band at a wait-mode hold time", () => {
    const transport = new Transport(baseScore);
    transport.clock.setHold(1.5);
    const { ctx, calls } = fakeCtx();
    const r = new PianoRollRenderer(ctx, transport, { width: 200, height: 100 });
    r.setViewport({ start: 0, end: 2 });
    r.renderFrame();
    // Vertical line moved to x=150.
    expect(calls.some((c) => c === "moveTo(150,0)")).toBe(true);
  });
});
```

- [ ] **Step 2: Run (expect FAIL)**

Run: `npm test -- src/piano-roll/PianoRollRenderer.test.ts`

- [ ] **Step 3: Implement**

Edit `src/piano-roll/PianoRollRenderer.ts`. Add constants:

```ts
const LOOP_FILL = "rgba(217, 83, 79, 0.16)";
const WAIT_HOLD = "rgba(68, 170, 136, 0.45)";
const SECTION_LABEL = "#e6e6ea";
```

Add three private methods:

```ts
private drawLoopBand(): void {
  const loop = this.transport.clock.loop;
  if (!loop) return;
  const x0 = this.timeToX(loop.start);
  const x1 = this.timeToX(loop.end);
  this.ctx.fillStyle = LOOP_FILL;
  this.ctx.fillRect(x0, 0, x1 - x0, this.height);
}

private drawSections(): void {
  const { ctx } = this;
  ctx.fillStyle = SECTION_LABEL;
  ctx.font = "10px sans-serif";
  ctx.textAlign = "left";
  for (const s of this.transport.score.sections) {
    if (s.start < this.viewport.start) continue;
    if (s.start > this.viewport.end) break;
    const x = this.timeToX(s.start);
    ctx.fillText(s.label, x + 2, 12);
  }
}

private drawWaitHold(): void {
  const hold = this.transport.clock.holdAt;
  if (hold === null || hold === undefined) return;
  if (hold < this.viewport.start || hold > this.viewport.end) return;
  const x = this.timeToX(hold);
  this.ctx.strokeStyle = WAIT_HOLD;
  this.ctx.lineWidth = 3;
  this.ctx.beginPath();
  this.ctx.moveTo(x, 0);
  this.ctx.lineTo(x, this.height);
  this.ctx.stroke();
}
```

In `renderFrame`, call them in this order between `drawBeatGrid()` and `drawNotes()`:

```ts
this.drawBeatGrid();
this.drawLoopBand();
this.drawWaitHold();
this.drawNotes();
this.drawSections();
this.drawPlayhead();
```

If `Transport.clock.holdAt` is private, expose a public getter (or already exists — read `src/transport/clock.ts` to confirm; if missing, add a `get holdAt(): number | null { return this._holdAt; }`).

- [ ] **Step 4: Run (expect PASS)**

Run: `npm test -- src/piano-roll/PianoRollRenderer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/piano-roll/PianoRollRenderer.ts src/piano-roll/PianoRollRenderer.test.ts src/transport/clock.ts
git commit -m "piano-roll(renderer): loop band, wait-hold marker, section labels"
```

---

## Task 10: `PianoRollLane` — pagination + canvas mount

**Files:**
- Create: `src/piano-roll/PianoRollLane.ts`
- Test: `src/piano-roll/PianoRollLane.test.ts`

- [ ] **Step 1: Test**

Create `src/piano-roll/PianoRollLane.test.ts`:

```ts
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
```

- [ ] **Step 2: Run (expect FAIL)**

Run: `npm test -- src/piano-roll/PianoRollLane.test.ts`

- [ ] **Step 3: Implement**

Create `src/piano-roll/PianoRollLane.ts`:

```ts
import type { Transport } from "../transport/transport";
import { PianoRollRenderer } from "./PianoRollRenderer";
import { pageForMeasure } from "./measurePaging";
import { currentMeasureIndex } from "../score-view/sync";

export interface LaneOptions {
  measuresPerPage: number;
}

/**
 * Paginated piano-roll lane: mounts a canvas, picks the page containing the
 * playhead, and discrete-jumps to the next page when the playhead crosses
 * the boundary. Mirrors ReadingLaneView's behaviour for MIDI-source scores.
 */
export class PianoRollLane {
  private readonly container: HTMLElement;
  private readonly transport: Transport;
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: PianoRollRenderer;
  private readonly measuresPerPage: number;
  private _currentPage: { first: number; last: number } = { first: 0, last: -1 };

  constructor(container: HTMLElement, transport: Transport, opts: LaneOptions) {
    this.container = container;
    this.transport = transport;
    this.measuresPerPage = opts.measuresPerPage;

    container.innerHTML = "";
    const canvas = document.createElement("canvas");
    canvas.className = "piano-roll-canvas";
    canvas.width = container.clientWidth || 800;
    canvas.height = container.clientHeight || 100;
    container.appendChild(canvas);
    this.canvas = canvas;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("piano-roll: 2d context unavailable");
    this.renderer = new PianoRollRenderer(ctx, transport, {
      width: canvas.width,
      height: canvas.height,
    });
  }

  get currentPage(): { first: number; last: number } {
    return this._currentPage;
  }

  renderFrame(): void {
    const measures = this.transport.score.measures;
    if (measures.length === 0) return;

    const idx = currentMeasureIndex(this.transport.score, this.transport.clock.position);
    const page = pageForMeasure(idx, this.measuresPerPage);
    if (page.first !== this._currentPage.first) {
      this._currentPage = page;
      this.applyViewport();
    } else if (this._currentPage.last === -1) {
      this._currentPage = page;
      this.applyViewport();
    }
    this.renderer.renderFrame();
  }

  private applyViewport(): void {
    const measures = this.transport.score.measures;
    const first = measures[this._currentPage.first];
    const lastIdx = Math.min(this._currentPage.last, measures.length - 1);
    const last = measures[lastIdx];
    this.renderer.setViewport({ start: first.start, end: last.end });
  }

  destroy(): void {
    this.container.innerHTML = "";
  }
}
```

- [ ] **Step 4: Run (expect PASS)**

Run: `npm test -- src/piano-roll/PianoRollLane.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/piano-roll/PianoRollLane.ts src/piano-roll/PianoRollLane.test.ts
git commit -m "piano-roll: PianoRollLane mounts canvas + paginates by measure"
```

---

## Task 11: `PianoRollLane` — click = seek, drag = loop, overlays

**Files:**
- Modify: `src/piano-roll/PianoRollLane.ts`
- Modify: `src/piano-roll/PianoRollLane.test.ts`

- [ ] **Step 1: Append tests**

```ts
describe("PianoRollLane interactions", () => {
  it("seeks to a measure on click", () => {
    const { lane, container, transport } = makeLane();
    lane.renderFrame();
    const canvas = container.querySelector("canvas")!;
    Object.defineProperty(canvas, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, right: 400, bottom: 100, width: 400, height: 100, x: 0, y: 0, toJSON: () => "" }),
    });
    // page [0..3] spans 0..8s; canvas width 400px → 50px per second.
    // Click at x=150 → t=3 → inside measure 1 (2..4s) → seek to 2.
    canvas.dispatchEvent(new MouseEvent("mousedown", { clientX: 150, clientY: 50 }));
    canvas.dispatchEvent(new MouseEvent("mouseup", { clientX: 150, clientY: 50 }));
    expect(transport.clock.position).toBe(2);
  });

  it("loops a measure range on drag", () => {
    const { lane, container, transport } = makeLane();
    lane.renderFrame();
    const canvas = container.querySelector("canvas")!;
    Object.defineProperty(canvas, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, right: 400, bottom: 100, width: 400, height: 100, x: 0, y: 0, toJSON: () => "" }),
    });
    canvas.dispatchEvent(new MouseEvent("mousedown", { clientX: 50, clientY: 50 })); // m0
    canvas.dispatchEvent(new MouseEvent("mouseup", { clientX: 250, clientY: 50 })); // m2
    expect(transport.clock.loop).toEqual({ start: 0, end: 6 });
  });
});
```

- [ ] **Step 2: Run (expect FAIL)**

- [ ] **Step 3: Implement**

Edit `src/piano-roll/PianoRollLane.ts`. Inside the class, add fields:

```ts
private dragStart: number | null = null;
private readonly onMouseDown: (e: MouseEvent) => void;
private readonly onMouseUp: (e: MouseEvent) => void;
```

In the constructor, wire listeners:

```ts
this.onMouseDown = (e) => {
  this.dragStart = this.measureIndexAt(e);
};
this.onMouseUp = (e) => {
  const end = this.measureIndexAt(e);
  if (this.dragStart === null || end === null) {
    this.dragStart = null;
    return;
  }
  if (this.dragStart === end) {
    const m = this.transport.score.measures[end];
    if (m) this.transport.clock.seek(m.start);
  } else {
    const first = Math.min(this.dragStart, end);
    const last = Math.max(this.dragStart, end);
    this.transport.loopMeasures(first, last);
  }
  this.dragStart = null;
};
this.canvas.addEventListener("mousedown", this.onMouseDown);
this.canvas.addEventListener("mouseup", this.onMouseUp);
```

Add method:

```ts
private measureIndexAt(e: MouseEvent): number | null {
  const rect = this.canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const measures = this.transport.score.measures;
  const first = measures[this._currentPage.first];
  const lastIdx = Math.min(this._currentPage.last, measures.length - 1);
  const last = measures[lastIdx];
  const t = first.start + (x / rect.width) * (last.end - first.start);
  for (let i = this._currentPage.first; i <= lastIdx; i += 1) {
    const m = measures[i];
    if (t >= m.start && t < m.end) return i;
  }
  return null;
}
```

Update `destroy`:

```ts
destroy(): void {
  this.canvas.removeEventListener("mousedown", this.onMouseDown);
  this.canvas.removeEventListener("mouseup", this.onMouseUp);
  this.container.innerHTML = "";
}
```

- [ ] **Step 4: Run (expect PASS)**

Run: `npm test -- src/piano-roll/PianoRollLane.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/piano-roll/PianoRollLane.ts src/piano-roll/PianoRollLane.test.ts
git commit -m "piano-roll(lane): click → seek, drag → loop"
```

---

## Task 12: `PianoRollPanel` — split-view variant

**Files:**
- Create: `src/piano-roll/PianoRollPanel.ts`
- Test: `src/piano-roll/PianoRollPanel.test.ts`

- [ ] **Step 1: Test**

```ts
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
    Object.defineProperty(container, "clientWidth", { value: 800 });
    Object.defineProperty(container, "clientHeight", { value: 400 });
    const transport = new Transport(score);
    const panel = new PianoRollPanel(container, transport);
    transport.clock.seek(9);
    panel.renderFrame();
    expect(panel.currentPage).toEqual({ first: 0, last: 7 });
  });
});
```

- [ ] **Step 2: Run (FAIL)**

- [ ] **Step 3: Implement**

Create `src/piano-roll/PianoRollPanel.ts`:

```ts
import type { Transport } from "../transport/transport";
import { PianoRollLane } from "./PianoRollLane";

const PANEL_MEASURES_PER_PAGE = 8;

/** Split-view variant of the MIDI piano-roll. Same renderer + paging as the
 *  lane, with a larger page size. No reading-lane chrome. */
export class PianoRollPanel extends PianoRollLane {
  constructor(container: HTMLElement, transport: Transport) {
    super(container, transport, { measuresPerPage: PANEL_MEASURES_PER_PAGE });
    const canvas = container.querySelector("canvas");
    if (canvas) canvas.className = "piano-roll-panel-canvas";
  }
}
```

- [ ] **Step 4: Run (PASS)**

- [ ] **Step 5: Commit**

```bash
git add src/piano-roll/PianoRollPanel.ts src/piano-roll/PianoRollPanel.test.ts
git commit -m "piano-roll: PianoRollPanel — split-view variant (8 measures/page)"
```

---

## Task 13: `MeasureProgressBar` React component

**Files:**
- Create: `src/ui/MeasureProgressBar.tsx`
- Test: `src/ui/MeasureProgressBar.test.tsx`

- [ ] **Step 1: Test**

Create `src/ui/MeasureProgressBar.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run (FAIL)**

- [ ] **Step 3: Implement**

Create `src/ui/MeasureProgressBar.tsx`:

```tsx
import { useEffect, useReducer, useRef } from "react";
import type { Transport } from "../transport/transport";

interface Props { transport: Transport }

/** Per-measure progress bar replacing the TopBar scrubber. Cell widths are
 *  proportional to measure duration; click → seek, drag → loop. */
export function MeasureProgressBar({ transport }: Props): React.JSX.Element {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => transport.clock.onChange(() => force()), [transport]);

  const dragStart = useRef<number | null>(null);
  const dragEnd = useRef<number | null>(null);

  const measures = transport.score.measures;
  const total = measures.length > 0 ? measures[measures.length - 1].end - measures[0].start : 1;
  const t = transport.clock.position;
  const loop = transport.clock.loop;

  function commitDrag(): void {
    const a = dragStart.current;
    const b = dragEnd.current;
    if (a === null) return;
    if (b === null || a === b) {
      const m = measures[a];
      if (m) transport.clock.seek(m.start);
    } else {
      transport.loopMeasures(Math.min(a, b), Math.max(a, b));
    }
    dragStart.current = null;
    dragEnd.current = null;
  }

  return (
    <div className="measure-progress-bar" data-testid="measure-progress-bar"
         onMouseUp={commitDrag} onMouseLeave={() => { dragStart.current = null; dragEnd.current = null; }}>
      {measures.map((m, i) => {
        const flex = (m.end - m.start) / total;
        const current = t >= m.start && t < m.end;
        const inLoop = !!loop && loop.start <= m.start && loop.end >= m.end;
        return (
          <div key={i} className={[
              "measure-cell",
              current ? "measure-cell--current" : "",
              inLoop ? "measure-cell--in-loop" : "",
            ].filter(Boolean).join(" ")}
            style={{ flexGrow: flex }}
            onMouseDown={() => { dragStart.current = i; dragEnd.current = i; }}
            onMouseEnter={() => { if (dragStart.current !== null) dragEnd.current = i; }}
          />
        );
      })}
      {transport.score.sections.map((s, i) => {
        const left = ((s.start - measures[0].start) / total) * 100;
        return (
          <span key={`s-${i}`} className="section-label" style={{ left: `${left}%` }}>
            {s.label}
          </span>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run (PASS)**

Run: `npm test -- src/ui/MeasureProgressBar.test.tsx`

- [ ] **Step 5: Commit**

```bash
git add src/ui/MeasureProgressBar.tsx src/ui/MeasureProgressBar.test.tsx
git commit -m "ui: MeasureProgressBar — per-measure cells with click/drag and section labels"
```

---

## Task 14: `Minimap` React component

**Files:**
- Create: `src/ui/Minimap.tsx`
- Test: `src/ui/Minimap.test.tsx`

- [ ] **Step 1: Test**

```tsx
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
```

- [ ] **Step 2: Run (FAIL)**

- [ ] **Step 3: Implement**

Create `src/ui/Minimap.tsx`:

```tsx
import { useEffect, useReducer, useRef } from "react";
import type { Transport } from "../transport/transport";

interface Props {
  transport: Transport;
  /** Time range currently visible in the piano-roll lane / engraved lane. */
  viewportWindow: { start: number; end: number };
}

/** Whole-piece minimap strip: per-measure density, playhead caret, viewport
 *  box, and section ticks. Click → seek, drag → loop. */
export function Minimap({ transport, viewportWindow }: Props): React.JSX.Element {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => transport.clock.onChange(() => force()), [transport]);

  const stripRef = useRef<HTMLDivElement>(null);
  const dragFromT = useRef<number | null>(null);

  const measures = transport.score.measures;
  const total = measures.length > 0 ? measures[measures.length - 1].end - measures[0].start : 1;
  const t0 = measures.length > 0 ? measures[0].start : 0;
  const t = transport.clock.position;
  const loop = transport.clock.loop;

  function timeFromX(clientX: number): number {
    const rect = stripRef.current!.getBoundingClientRect();
    const f = (clientX - rect.left) / rect.width;
    return t0 + f * total;
  }

  const noteCounts = measures.map((m) =>
    transport.score.notes.reduce((acc, n) => (n.start >= m.start && n.start < m.end ? acc + 1 : acc), 0),
  );
  const maxCount = Math.max(1, ...noteCounts);

  return (
    <div
      ref={stripRef}
      className="minimap"
      data-testid="minimap"
      onMouseDown={(e) => { dragFromT.current = timeFromX(e.clientX); }}
      onMouseMove={(e) => { if (dragFromT.current !== null) force(); /* repaint for live loop */ }}
      onMouseUp={(e) => {
        const start = dragFromT.current;
        const end = timeFromX(e.clientX);
        if (start === null) return;
        if (Math.abs(end - start) < 0.05) transport.clock.seek(start);
        else {
          const first = measures.findIndex((m) => Math.min(start, end) < m.end);
          const last  = measures.findIndex((m) => Math.max(start, end) <= m.end);
          if (first !== -1 && last !== -1) transport.loopMeasures(first, last);
        }
        dragFromT.current = null;
      }}
    >
      {measures.map((m, i) => {
        const left = ((m.start - t0) / total) * 100;
        const width = ((m.end - m.start) / total) * 100;
        const opacity = 0.2 + 0.8 * (noteCounts[i] / maxCount);
        return <span key={i} className="minimap-density" style={{ left: `${left}%`, width: `${width}%`, opacity }} />;
      })}
      {transport.score.sections.map((s, i) => {
        const left = ((s.start - t0) / total) * 100;
        return <span key={`s-${i}`} className="minimap-section" style={{ left: `${left}%` }} title={s.label} />;
      })}
      <span
        className="minimap-viewport"
        style={{
          left: `${((viewportWindow.start - t0) / total) * 100}%`,
          width: `${((viewportWindow.end - viewportWindow.start) / total) * 100}%`,
        }}
      />
      {loop && (
        <span
          className="minimap-loop"
          style={{
            left: `${((loop.start - t0) / total) * 100}%`,
            width: `${((loop.end - loop.start) / total) * 100}%`,
          }}
        />
      )}
      <span className="minimap-caret" style={{ left: `${((t - t0) / total) * 100}%` }} />
    </div>
  );
}
```

- [ ] **Step 4: Run (PASS)**

- [ ] **Step 5: Commit**

```bash
git add src/ui/Minimap.tsx src/ui/Minimap.test.tsx
git commit -m "ui: Minimap — density + caret + viewport box + sections, click/drag nav"
```

---

## Task 15: Persist `minimapVisible`

**Files:**
- Modify: `src/library/db.ts`
- Modify: `src/library/practiceState.ts`

- [ ] **Step 1: Add field to StoredPracticeState**

Edit `src/library/db.ts`. In `StoredPracticeState`, add:

```ts
  /** Whether the minimap strip is visible. Defaults to true. */
  minimapVisible?: boolean;
```

- [ ] **Step 2: Capture and apply**

Edit `src/library/practiceState.ts`. In `capturePracticeState`, accept a `minimapVisible: boolean` argument (default true) and include it in the returned object. In `applyPracticeState`, no-op for this field (the caller initialises React state from `state.minimapVisible ?? true`).

Exact diff hints:
- `capturePracticeState(..., flags: { mode: TabMode; tabs?: ...; minimapVisible?: boolean })` — extend the signature, write `minimapVisible: flags.minimapVisible ?? true` into the returned literal.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/library/db.ts src/library/practiceState.ts
git commit -m "practice-state: persist minimapVisible (default true)"
```

---

## Task 16: TopBar — swap scrubber for MeasureProgressBar + minimap toggle

**Files:**
- Modify: `src/ui/TopBar.tsx`
- Modify: `src/ui/TopBar.test.tsx` (if present; otherwise create a small smoke test inline)

- [ ] **Step 1: Failing test (or update existing)**

If `TopBar.test.tsx` exists, add a test that asserts the rendered output contains `.measure-progress-bar` (and no `.hud-scrubber`). If it doesn't exist, skip — the visual surface is covered by the e2e test.

- [ ] **Step 2: Implement**

Edit `src/ui/TopBar.tsx`. Add import:

```ts
import { MeasureProgressBar } from "./MeasureProgressBar";
```

Find the JSX containing `className="hud-scrubber"` (around `:165`). Replace the `<input type="range" className="hud-scrubber" ... />` block with:

```tsx
<MeasureProgressBar transport={transport} />
```

Add a new toggle button next to the view-mode chips (right side of the bar). Accept two new props:

```ts
minimapVisible: boolean;
onMinimapVisibleChange: (v: boolean) => void;
```

Add a button:

```tsx
<button
  type="button"
  className={`minimap-toggle ${minimapVisible ? "minimap-toggle--on" : ""}`}
  aria-pressed={minimapVisible}
  aria-label={minimapVisible ? "Hide minimap" : "Show minimap"}
  onClick={() => onMinimapVisibleChange(!minimapVisible)}
>
  Map
</button>
```

- [ ] **Step 3: Run lint/typecheck/test**

Run: `npm run lint && npm run typecheck && npm test`
Expected: clean (modulo the missing wiring in PracticeView — fixed next task).

- [ ] **Step 4: Commit**

```bash
git add src/ui/TopBar.tsx
git commit -m "ui(top-bar): replace scrubber with MeasureProgressBar; add minimap toggle"
```

---

## Task 17: `PracticeView` — source branch, render minimap, wire props

**Files:**
- Modify: `src/app/PracticeView.tsx`

- [ ] **Step 1: Add refs and state**

Edit `src/app/PracticeView.tsx`.

Add imports:

```ts
import { PianoRollLane } from "../piano-roll/PianoRollLane";
import { PianoRollPanel } from "../piano-roll/PianoRollPanel";
import { Minimap } from "../ui/Minimap";
```

Add refs and state:

```ts
const pianoRollLaneRef = useRef<HTMLDivElement>(null);
const pianoRollPanelRef = useRef<HTMLDivElement>(null);
const pianoRollLaneInstance = useRef<PianoRollLane | null>(null);
const pianoRollPanelInstance = useRef<PianoRollPanel | null>(null);
const [minimapVisible, setMinimapVisible] = useState(true);
```

- [ ] **Step 2: Source-branch the mount effect**

Inside the mount `useEffect`, wrap the existing engraved-score paths in `if (score.source === "musicxml") { ... }`. Add a parallel branch:

```ts
if (score.source === "midi") {
  const laneEl = pianoRollLaneRef.current;
  if (laneEl) {
    const inst = new PianoRollLane(laneEl, transport, { measuresPerPage: 4 });
    pianoRollLaneInstance.current = inst;
    loop.onFrame(() => inst.renderFrame());
  }
  const panelEl = pianoRollPanelRef.current;
  if (panelEl) {
    const inst = new PianoRollPanel(panelEl, transport);
    pianoRollPanelInstance.current = inst;
    loop.onFrame(() => inst.renderFrame());
  }
}
```

In the cleanup, call `destroy()` on both.

Initialize `minimapVisible` from stored state:

```ts
setMinimapVisible(state?.minimapVisible ?? true);
```

Pass it to `capturePracticeState`'s flags arg on unmount.

- [ ] **Step 3: Render new DOM slots**

In the returned JSX, after the existing `practice-lane-panel`, add:

```tsx
<div className="piano-roll-lane-panel" ref={pianoRollLaneRef} data-testid="piano-roll-lane" />
<div className="piano-roll-panel" ref={pianoRollPanelRef} />
```

Add a `Minimap` outside `practice-content`, between TopBar and the content area:

```tsx
{minimapVisible && (
  <Minimap
    transport={transport}
    viewportWindow={getViewportWindow()}
  />
)}
```

Add a helper:

```ts
function getViewportWindow(): { start: number; end: number } {
  if (score.source === "midi") {
    const page = pianoRollLaneInstance.current?.currentPage;
    const measures = score.measures;
    if (page && measures.length > 0) {
      const first = measures[page.first];
      const last = measures[Math.min(page.last, measures.length - 1)];
      return { start: first.start, end: last.end };
    }
  }
  // XML fallback: 4-measure window around the playhead.
  const t = transport.clock.position;
  const idx = score.measures.findIndex((m) => t < m.end);
  const start = Math.max(0, idx - 0);
  const measures = score.measures.slice(start, start + 4);
  if (measures.length === 0) return { start: 0, end: 1 };
  return { start: measures[0].start, end: measures[measures.length - 1].end };
}
```

Add a class to `practice-content` to drive visibility:

```ts
const contentClass = [
  "practice-content",
  `practice-content--${mode}`,
  isMidi ? `layout-${practiceLayout}` : "",
  isMidi ? `practice-content--midi-${score.source === "midi" ? "roll" : "engrave"}` : "",
].filter(Boolean).join(" ");
```

Pass `minimapVisible` and `setMinimapVisible` to `<TopBar>` props.

- [ ] **Step 4: Run lint/typecheck/test**

Run: `npm run lint && npm run typecheck && npm test`
Expected: clean. If tests for `PracticeView` exist, they may need updated mocks for the new refs — fix as needed.

- [ ] **Step 5: Commit**

```bash
git add src/app/PracticeView.tsx
git commit -m "practice-view: source-branch — mount piano-roll for MIDI imports; render Minimap"
```

---

## Task 18: CSS — new components + remove `.hud-scrubber`

**Files:**
- Modify: `src/styles/theme.css`

- [ ] **Step 1: Remove the old scrubber rules**

Delete these rule blocks (verify line numbers — they may shift): lines ~184, ~188, ~325-360 (the `.hud-scrubber` rules + thumb selectors). Use `grep -n hud-scrubber src/styles/theme.css` to locate them.

- [ ] **Step 2: Add the new styles**

Append to `src/styles/theme.css`:

```css
/* --- Measure progress bar (replaces scrubber) --- */
.measure-progress-bar {
  position: relative;
  flex: 1;
  display: flex;
  align-items: stretch;
  height: 18px;
  gap: 1px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.18);
  overflow: hidden;
  cursor: pointer;
  user-select: none;
}
.measure-cell { background: #34343c; border-radius: 1px; min-width: 0; }
.measure-cell:hover { background: #44444c; }
.measure-cell--current { background: var(--accent); }
.measure-cell--in-loop { background: rgba(217, 83, 79, 0.4); }
.measure-progress-bar .section-label {
  position: absolute; top: -14px; transform: translateX(-50%);
  font-size: 9px; color: var(--text-dim);
  pointer-events: none; white-space: nowrap;
}

/* --- Minimap strip --- */
.minimap {
  position: relative;
  width: 100%;
  height: 16px;
  background: rgba(21, 21, 26, 0.6);
  border-bottom: 1px solid var(--glass-border);
  user-select: none;
  cursor: crosshair;
  z-index: 8;
}
.minimap-density { position: absolute; top: 0; bottom: 0; background: var(--text-dim); }
.minimap-section { position: absolute; top: 0; width: 2px; height: 100%; background: var(--accent); }
.minimap-viewport {
  position: absolute; top: 0; bottom: 0;
  background: rgba(255, 255, 255, 0.08);
  border-left: 1px solid rgba(255, 255, 255, 0.4);
  border-right: 1px solid rgba(255, 255, 255, 0.4);
  pointer-events: none;
}
.minimap-loop { position: absolute; top: 0; bottom: 0; background: rgba(217, 83, 79, 0.25); pointer-events: none; }
.minimap-caret { position: absolute; top: 0; bottom: 0; width: 1px; background: #e6e6ea; pointer-events: none; }

/* --- Piano-roll lane / panel --- */
.piano-roll-lane-panel,
.piano-roll-panel { display: none; }
.practice-content--midi-roll.layout-lane .piano-roll-lane-panel {
  display: block; position: absolute; top: 68px; left: 0; right: 0; height: 400px;
  z-index: 4; overflow: hidden;
}
.practice-content--midi-roll.layout-split .piano-roll-panel {
  display: block; flex: 1; min-width: 0; position: relative;
}
.practice-content--midi-roll.layout-lane .practice-lane-panel,
.practice-content--midi-roll.layout-split .practice-score-panel {
  display: none;
}
.piano-roll-canvas, .piano-roll-panel-canvas {
  display: block; width: 100%; height: 100%;
  background: #15151a;
}

/* --- Minimap toggle button --- */
.minimap-toggle {
  height: 24px; padding: 0 8px; font-size: 11px;
  color: var(--text-dim); background: transparent;
  border: 1px solid var(--glass-border); border-radius: 4px; cursor: pointer;
}
.minimap-toggle--on { color: var(--accent); border-color: var(--accent); }
```

- [ ] **Step 3: Build + dev server check**

Run: `npm run build`
Expected: clean. Open the dev server (if running) and verify CSS loads without console errors.

- [ ] **Step 4: Commit**

```bash
git add src/styles/theme.css
git commit -m "styles: piano-roll, measure progress bar, minimap; remove .hud-scrubber"
```

---

## Task 19: LibraryBrowser — source label

**Files:**
- Modify: `src/library/LibraryBrowser.tsx`

- [ ] **Step 1: Find the row render**

Grep for the row JSX in `LibraryBrowser.tsx` (the listing of pieces). Identify where a piece's name is shown.

- [ ] **Step 2: Add the label**

Render next to the name:

```tsx
<span className="library-source-label" aria-label={piece.source === "midi" ? "MIDI source" : "Sheet music source"}>
  {piece.source === "midi" ? "♪ Notes only" : "𝄞 Sheet music"}
</span>
```

If the row's piece object doesn't carry `source`, follow the field up to `db.ts` and surface it from the stored record (the importers already write `score.source`; check whether `db.ts` persists it).

- [ ] **Step 3: Add minimal CSS**

Append to `src/styles/theme.css`:

```css
.library-source-label {
  display: inline-block; margin-left: 8px;
  font-size: 11px; color: var(--text-dim);
}
```

- [ ] **Step 4: Run lint/typecheck/test**

- [ ] **Step 5: Commit**

```bash
git add src/library/LibraryBrowser.tsx src/styles/theme.css
git commit -m "library: source label on each row (♪ Notes only / 𝄞 Sheet music)"
```

---

## Task 20: E2E — Playwright test for the MIDI piano-roll path

**Files:**
- Create: `tests/e2e/piano-roll.spec.ts`

- [ ] **Step 1: Identify a MIDI fixture**

Confirm which MIDI fixture the existing e2e tests use for the MIDI Practice tab (likely `src/test/fixtures/clean.mid`). The e2e harness should already have a way to seed a piece — follow the pattern from `tests/e2e/midi-practice.spec.ts` or similar.

- [ ] **Step 2: Write the test**

Create `tests/e2e/piano-roll.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("MIDI imports show the piano-roll lane, not the engraved one", async ({ page }) => {
  await page.goto("/");
  // Reuse whatever upload helper the other e2e tests use to land on the Practice view
  // with the clean.mid fixture loaded and the MIDI tab active.
  // ...existing pattern...
  await expect(page.getByTestId("piano-roll-lane")).toBeVisible();
  await expect(page.getByTestId("reading-lane")).toBeHidden();
});

test("clicking the measure progress bar seeks", async ({ page }) => {
  await page.goto("/");
  // ...seed midi fixture, land in Practice...
  const bar = page.getByTestId("measure-progress-bar");
  const cells = bar.locator(".measure-cell");
  await cells.nth(1).click();
  // No public stable hook on the clock from outside; use a UI signal — the
  // current-measure cell should now be the second cell.
  await expect(cells.nth(1)).toHaveClass(/measure-cell--current/);
});
```

If no shared fixture-loading helper exists in `tests/e2e/`, write one inline in this spec only and refactor later — do not block the test on a refactor.

- [ ] **Step 3: Run the e2e tests**

Run: `npm run e2e`
Expected: 12 tests pass (11 previous + 1 new). The minimap test from MeasureProgressBar's component test covers click behaviour at the unit level; this e2e is the smoke test for source branching.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/piano-roll.spec.ts
git commit -m "e2e: MIDI imports show piano-roll lane; progress bar click seeks"
```

---

## Task 21: Final verify gate + HANDOVER update

**Files:**
- Modify: `HANDOVER.md`

- [ ] **Step 1: Run the full gate**

Run: `npm run lint && npm run typecheck && npm test && npm run build && npm run e2e`
Expected: all green.

- [ ] **Step 2: Update HANDOVER.md**

Edit `HANDOVER.md`. Replace the "Backlog" entry for "Spec 2 — MIDI-native visualizer" with a "Latest round" section summarising what shipped. Move "Spec 2" out of the backlog.

Text to add at the top "Latest round" section:

```markdown
## Latest round — "Spec 2: MIDI-native visualizer" (merged to main)

For MIDI imports, the engraved ReadingLaneView and ScoreView are replaced by
a Canvas2D piano roll (paginated, hand-coloured rects, velocity opacity).
Source-agnostic additions: a per-measure progress bar replaces the TopBar
scrubber, and a 16px minimap strip below the bar gives a whole-piece
overview. Section markers carry through from MIDI marker meta events and
MusicXML <rehearsal> tags into a new `Score.sections` field; labels render
on the progress bar, the minimap, and the piano-roll lane. Engraved
ScoreView for MIDI imports stays silent on sections in v1 — deferred.

Plan: `docs/superpowers/plans/2026-05-20-midi-native-visualizer.md`.
Spec:  `docs/superpowers/specs/2026-05-20-midi-visualizer-design.md`.
```

- [ ] **Step 3: Commit + push**

```bash
git add HANDOVER.md
git commit -m "docs: HANDOVER — Spec 2 MIDI-native visualizer landed"
git push origin main
```

Vercel auto-deploys in ~1-2 min.

---

## Self-review

**Spec coverage:**

| Spec section | Task(s) |
|---|---|
| §"Goals" — piano-roll replaces engraved for MIDI | 7-12, 17 |
| §"Goals" — measure progress bar + minimap (both sources) | 13, 14, 16, 17 |
| §"Goals" — section markers extracted + rendered | 1-3, 9, 13, 14 |
| §"Source gating" table | 17 (PracticeView branch) + 18 (CSS) + 19 (label) |
| §"PianoRollRenderer" component | 7-9 |
| §"PianoRollLane" | 10-11 |
| §"PianoRollPanel" | 12 |
| §"pitchAutoFit" / "measurePaging" pure helpers | 4, 5 |
| §"MeasureProgressBar" | 13 |
| §"Minimap" | 14, 17 |
| §"Section markers — Data model" | 1 |
| §"Section markers — Importer changes" MIDI | 2 |
| §"Section markers — Importer changes" XML | 3 |
| §"Data flow" subscriptions | 13 (bar), 14 (minimap), 10 (lane RAF) |
| §"PracticeView wiring" stable mount | 17 |
| §"Testing" unit | 1-14 (each has tests) |
| §"Testing" e2e | 20 |
| §"Files changed" all rows | 1-19 covered; 20 tests; 21 docs |

**Placeholder scan:** Searched for "TODO", "TBD", "implement later", "similar to" — none present. The XML test step in Task 3 references a `MINIMAL_XML` constant **as a guide** — instructions explicitly say to reuse whichever minimal XML the file already uses, so this is a deliberate point-of-customization not a placeholder.

**Type consistency:** `Section` (Task 1) is referenced in tasks 2/3/9/13/14. `PitchRange` (Task 4) is used in tasks 6/7/8. `PianoRollLane` (Task 10) is the parent class in Task 12 (`PianoRollPanel`). `MeasureProgressBar` (Task 13) is imported in Task 16. `Minimap` (Task 14) is imported in Task 17. All consistent.

**One gap noted:** Task 9 references `transport.clock.holdAt` and notes it may need a public getter. The plan handles this inline ("If `Transport.clock.holdAt` is private, expose a public getter") rather than as a separate task — acceptable because it's a one-line change in the same commit.
