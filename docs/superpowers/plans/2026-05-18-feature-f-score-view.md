# Feature F — Score View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An interactive MuseScore-style engraved score: Verovio renders the piece's MusicXML to SVG; the current measure is highlighted and kept in view as the clock advances; clicking a measure jumps playback there; dragging across measures sets the A-B loop.

**Architecture:** Verovio (a WASM music-engraving toolkit) renders the `Score.musicXml` to an SVG string. The thin Verovio wrapper (`verovio.ts`) is not unit-tested — WASM engraving is verified by build + manual/e2e. Everything else is testable: `sync.ts` is pure clock-time ↔ measure mapping; `interactions.ts` is pure DOM-target → measure-index resolution (jsdom has a DOM); `ScoreView` is the orchestrator — it injects the SVG, tags each measure element with its index, highlights/scrolls the current measure each frame, and wires click→seek and drag→loop. `ScoreView` only READS the clock; it calls `transport.seek`/`loopMeasures` in response to user input.

**Tech Stack:** TypeScript, `verovio` (WASM engraving), Canvas/SVG DOM, Vitest. Reads `Score` (Feature B) and `Transport` (Feature C), reuses `measureLoop` (Feature C).

**Branch:** `feature/f-score-view`

---

## Notes for the implementer

- Repo root and working directory: `/Users/jeffreywan/Desktop/arpeggio`. Run all commands from there.
- Work on branch `feature/f-score-view` (the controller creates it before Task 1).
- Features A-E are merged into `main`. `npm test` (101 tests), lint, typecheck, build all green.
- Read `src/model/score.ts`, `src/transport/transport.ts`, `src/transport/loop.ts` (`measureLoop`), `src/transport/clock.ts`.
- `strict` TypeScript + `noUnusedLocals`/`noUnusedParameters` on.
- Vitest runs in `jsdom` — a real DOM is available (`document`, elements, events), but **no Verovio WASM in unit tests**: the WASM toolkit is loaded only by `loadVerovioToolkit()`, which is not unit-tested.
- Tests construct DOM nodes directly (`document.createElement`, `innerHTML`) — no Verovio needed; a hand-written SVG string stands in for Verovio output.
- Commit after every task with the exact messages given.

---

## File / Folder Structure

```
src/score-view/
  verovio.ts        # Verovio WASM load + MusicXML -> SVG (thin, not unit-tested)
  sync.ts           # pure: clock-time <-> measure-index mapping
  interactions.ts   # pure: DOM target -> measure index; drag-range ordering
  scoreView.ts      # ScoreView: injects SVG, highlights/scrolls, wires events
```

---

## Task 1: Verovio wrapper — `verovio.ts`

**Files:** Create `src/score-view/verovio.ts`, `src/score-view/verovio.test.ts`; modify `package.json`/`package-lock.json` (add `verovio`).

`verovio.ts` loads the Verovio WASM toolkit and renders MusicXML to an SVG
string. The WASM load is not unit-testable; the only unit-tested part is the
pure `measureElementCount` helper.

- [ ] **Step 1: Install Verovio**

Run: `npm install verovio`
Expected: `verovio` added under `dependencies`.

- [ ] **Step 2: Write the failing test — `src/score-view/verovio.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { measureElementCount } from "./verovio";

describe("measureElementCount", () => {
  it("counts <g> elements with class 'measure' in an SVG string", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <g class="measure" id="m1"></g>
      <g class="staff"></g>
      <g class="measure" id="m2"></g>
    </svg>`;
    expect(measureElementCount(svg)).toBe(2);
  });

  it("returns 0 when there are no measures", () => {
    expect(measureElementCount("<svg></svg>")).toBe(0);
  });
});
```

- [ ] **Step 3: Implement `src/score-view/verovio.ts`**

```ts
/**
 * Verovio renders MusicXML to an engraved SVG. The WASM toolkit is loaded
 * lazily and is not unit-tested (engraving is verified by build + manual checks);
 * `measureElementCount` is a pure helper that IS tested.
 */

/** One entry of Verovio's timemap: at `tstamp` ms, notes in `on` start
 *  sounding and notes in `off` stop. */
export interface TimemapEntry {
  tstamp: number;
  on?: string[];
  off?: string[];
}

/** A loaded Verovio toolkit, narrowed to the methods this app uses. */
export interface VerovioToolkit {
  loadData(data: string): boolean;
  renderToSVG(page: number): string;
  renderToTimemap(options?: object): TimemapEntry[];
  getPageCount(): number;
}

/** A rendered score: the engraved SVG plus the note on/off timemap. */
export interface RenderedScore {
  svg: string;
  timemap: TimemapEntry[];
}

let toolkitPromise: Promise<VerovioToolkit> | null = null;

/**
 * Load the Verovio WASM toolkit (once; subsequent calls reuse the instance).
 * Verovio is imported dynamically so the heavy WASM is only fetched when the
 * score view is actually used.
 */
export async function loadVerovioToolkit(): Promise<VerovioToolkit> {
  if (!toolkitPromise) {
    toolkitPromise = (async () => {
      const createVerovioModule = (await import("verovio/wasm")).default;
      const { VerovioToolkit } = await import("verovio/esm");
      const mod = await createVerovioModule();
      return new VerovioToolkit(mod) as unknown as VerovioToolkit;
    })();
  }
  return toolkitPromise;
}

/**
 * Render a MusicXML string to an engraved SVG plus a note on/off timemap. The
 * SVG is page 1 (Verovio is configured for one tall page so the score scrolls
 * as a strip); the timemap drives live note highlighting.
 */
export async function renderScore(musicXml: string): Promise<RenderedScore> {
  const toolkit = await loadVerovioToolkit();
  toolkit.loadData(musicXml);
  return {
    svg: toolkit.renderToSVG(1),
    timemap: toolkit.renderToTimemap({ includeMeasures: true }),
  };
}

/** Count engraved measures in a Verovio SVG string (the `g.measure` elements). */
export function measureElementCount(svg: string): number {
  const matches = svg.match(/class="[^"]*\bmeasure\b[^"]*"/g);
  return matches ? matches.length : 0;
}
```

- [ ] **Step 4: Run the tests — confirm they pass**

Run: `npm test -- score-view/verovio`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck, lint, build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass. The build must bundle `verovio` without error. If the build
fails on Verovio's WASM/worker imports, report it as a concern with the exact
error — do NOT hack around it silently; the controller will advise.

- [ ] **Step 6: Commit**

```bash
git add src/score-view/verovio.ts src/score-view/verovio.test.ts package.json package-lock.json
git commit -m "feat: add Verovio MusicXML-to-SVG wrapper"
```

---

## Task 2: Clock-time ↔ measure sync — `sync.ts`

**Files:** Create `src/score-view/sync.ts`, `src/score-view/sync.test.ts`

`sync.ts` maps the master clock's position to a measure index and back. The
score view highlights and scrolls by measure (robust, exact for both MIDI and
MusicXML imports — it uses `Score.measures` directly).

- [ ] **Step 1: Write the failing test — `src/score-view/sync.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { currentMeasureIndex, measureRange, notesAtTime } from "./sync";
import type { TimemapEntry } from "./verovio";
import type { Score } from "../model/score";

const score = {
  source: "midi",
  notes: [],
  measures: [
    { index: 0, start: 0, end: 2, numerator: 4, denominator: 4 },
    { index: 1, start: 2, end: 4, numerator: 4, denominator: 4 },
    { index: 2, start: 4, end: 6, numerator: 4, denominator: 4 },
  ],
  pedalEvents: [],
  timeSignatures: [{ start: 0, numerator: 4, denominator: 4 }],
  tempoMap: [{ start: 0, bpm: 120 }],
  durationSeconds: 6,
  musicXml: "",
  qualityWarning: null,
} satisfies Score;

describe("currentMeasureIndex", () => {
  it("finds the measure containing a time", () => {
    expect(currentMeasureIndex(score, 0)).toBe(0);
    expect(currentMeasureIndex(score, 1.9)).toBe(0);
    expect(currentMeasureIndex(score, 2)).toBe(1);
    expect(currentMeasureIndex(score, 5.5)).toBe(2);
  });

  it("clamps before the start and after the end", () => {
    expect(currentMeasureIndex(score, -5)).toBe(0);
    expect(currentMeasureIndex(score, 999)).toBe(2);
  });
});

describe("measureRange", () => {
  it("returns the [start, end] of a measure index", () => {
    expect(measureRange(score, 1)).toEqual({ start: 2, end: 4 });
  });

  it("clamps an out-of-bounds index", () => {
    expect(measureRange(score, 99)).toEqual({ start: 4, end: 6 });
    expect(measureRange(score, -1)).toEqual({ start: 0, end: 2 });
  });
});

describe("notesAtTime", () => {
  // n1 sounds [0,1000)ms, n2 [500,1500)ms, n3 from 1000ms on.
  const timemap: TimemapEntry[] = [
    { tstamp: 0, on: ["n1"] },
    { tstamp: 500, on: ["n2"] },
    { tstamp: 1000, on: ["n3"], off: ["n1"] },
    { tstamp: 1500, off: ["n2"] },
  ];

  it("accumulates notes that are on and not yet off at a time", () => {
    expect(notesAtTime(timemap, 250)).toEqual(new Set(["n1"]));
    expect(notesAtTime(timemap, 700)).toEqual(new Set(["n1", "n2"]));
    expect(notesAtTime(timemap, 1200)).toEqual(new Set(["n2", "n3"]));
    expect(notesAtTime(timemap, 1800)).toEqual(new Set(["n3"]));
  });

  it("is empty before the first entry", () => {
    expect(notesAtTime(timemap, -10)).toEqual(new Set());
  });
});
```

- [ ] **Step 2: Run it — confirm it fails**

Run: `npm test -- score-view/sync`
Expected: FAIL.

- [ ] **Step 3: Implement `src/score-view/sync.ts`**

```ts
import type { Score } from "../model/score";
import type { TimemapEntry } from "./verovio";

/**
 * Index of the measure containing clock time `seconds`. Clamps to the first
 * measure before the piece starts and the last measure after it ends.
 */
export function currentMeasureIndex(score: Score, seconds: number): number {
  const measures = score.measures;
  if (measures.length === 0) return 0;
  for (let i = 0; i < measures.length; i++) {
    if (seconds < measures[i].end) return Math.max(0, i);
  }
  return measures.length - 1;
}

/** The [start, end] seconds of a measure index, clamped to valid indices. */
export function measureRange(
  score: Score,
  index: number,
): { start: number; end: number } {
  const measures = score.measures;
  const i = Math.min(Math.max(index, 0), measures.length - 1);
  return { start: measures[i].start, end: measures[i].end };
}

/**
 * The set of Verovio element IDs sounding at `ms`. Walks the timemap in order,
 * adding each entry's `on` IDs and removing its `off` IDs, for every entry with
 * `tstamp <= ms`.
 */
export function notesAtTime(timemap: TimemapEntry[], ms: number): Set<string> {
  const sounding = new Set<string>();
  for (const entry of timemap) {
    if (entry.tstamp > ms) break;
    for (const id of entry.off ?? []) sounding.delete(id);
    for (const id of entry.on ?? []) sounding.add(id);
  }
  return sounding;
}
```

The timemap is in milliseconds of the score's own tempo; the clock is in
seconds. The score view converts with `ms = clock.position * 1000` — exact for
MusicXML imports and a close approximation for MIDI imports (the engraved score
is approximate for MIDI by design).

- [ ] **Step 4: Run the tests — confirm they pass**

Run: `npm test -- score-view/sync`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/score-view/sync.ts src/score-view/sync.test.ts
git commit -m "feat: add clock-time to measure-index sync"
```

---

## Task 3: Score interactions — `interactions.ts`

**Files:** Create `src/score-view/interactions.ts`, `src/score-view/interactions.test.ts`

`interactions.ts` resolves a DOM event target to a measure index (walking up to
the nearest element tagged `data-measure-index`) and orders a drag range.

- [ ] **Step 1: Write the failing test — `src/score-view/interactions.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { measureIndexFromTarget, orderedRange } from "./interactions";

describe("measureIndexFromTarget", () => {
  it("reads data-measure-index from the target itself", () => {
    const el = document.createElement("div");
    el.setAttribute("data-measure-index", "3");
    expect(measureIndexFromTarget(el)).toBe(3);
  });

  it("walks up to the nearest tagged ancestor", () => {
    const measure = document.createElement("g");
    measure.setAttribute("data-measure-index", "5");
    const note = document.createElement("g");
    measure.appendChild(note);
    const head = document.createElement("path");
    note.appendChild(head);
    expect(measureIndexFromTarget(head)).toBe(5);
  });

  it("returns null when no ancestor is a measure", () => {
    const el = document.createElement("div");
    expect(measureIndexFromTarget(el)).toBeNull();
    expect(measureIndexFromTarget(null)).toBeNull();
  });
});

describe("orderedRange", () => {
  it("orders a forward or backward drag into [first, last]", () => {
    expect(orderedRange(2, 5)).toEqual({ first: 2, last: 5 });
    expect(orderedRange(5, 2)).toEqual({ first: 2, last: 5 });
    expect(orderedRange(3, 3)).toEqual({ first: 3, last: 3 });
  });
});
```

- [ ] **Step 2: Run it — confirm it fails**

Run: `npm test -- interactions`
Expected: FAIL.

- [ ] **Step 3: Implement `src/score-view/interactions.ts`**

```ts
/**
 * The measure index for a clicked/hovered element: the `data-measure-index` of
 * the element or its nearest ancestor carrying that attribute. `null` when the
 * target is outside any measure.
 */
export function measureIndexFromTarget(
  target: EventTarget | null,
): number | null {
  let el = target instanceof Element ? target : null;
  while (el) {
    const attr = el.getAttribute("data-measure-index");
    if (attr !== null) {
      const n = Number(attr);
      return Number.isFinite(n) ? n : null;
    }
    el = el.parentElement;
  }
  return null;
}

/** Order two measure indices (from a drag) into `{ first, last }`. */
export function orderedRange(
  a: number,
  b: number,
): { first: number; last: number } {
  return { first: Math.min(a, b), last: Math.max(a, b) };
}
```

- [ ] **Step 4: Run the tests — confirm they pass**

Run: `npm test -- interactions`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/score-view/interactions.ts src/score-view/interactions.test.ts
git commit -m "feat: add score interaction helpers"
```

---

## Task 4: The ScoreView orchestrator — `scoreView.ts`

**Files:** Create `src/score-view/scoreView.ts`, `src/score-view/scoreView.test.ts`

`ScoreView` injects the engraved SVG into a container, tags each measure element
with its index, highlights and scrolls to the current measure each frame, and
wires click-to-seek and drag-to-loop. It only READS the clock.

- [ ] **Step 1: Write the failing test — `src/score-view/scoreView.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { ScoreView } from "./scoreView";
import { Transport } from "../transport/transport";
import type { TimemapEntry } from "./verovio";
import type { Score } from "../model/score";

const score = {
  source: "midi",
  notes: [],
  measures: [
    { index: 0, start: 0, end: 2, numerator: 4, denominator: 4 },
    { index: 1, start: 2, end: 4, numerator: 4, denominator: 4 },
    { index: 2, start: 4, end: 6, numerator: 4, denominator: 4 },
  ],
  pedalEvents: [],
  timeSignatures: [{ start: 0, numerator: 4, denominator: 4 }],
  tempoMap: [{ start: 0, bpm: 120 }],
  durationSeconds: 6,
  musicXml: "",
  qualityWarning: null,
} satisfies Score;

// A stand-in for Verovio output: three measures, each with one identified note.
const svg = `<svg xmlns="http://www.w3.org/2000/svg">
  <g class="measure" id="m0"><g class="note" id="n0"><rect/></g></g>
  <g class="measure" id="m1"><g class="note" id="n1"><rect/></g></g>
  <g class="measure" id="m2"><g class="note" id="n2"><rect/></g></g>
</svg>`;

// n0 sounds in measure 0 (0-2 s), n1 in measure 1, n2 in measure 2.
const timemap: TimemapEntry[] = [
  { tstamp: 0, on: ["n0"] },
  { tstamp: 2000, on: ["n1"], off: ["n0"] },
  { tstamp: 4000, on: ["n2"], off: ["n1"] },
];

function setup() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const transport = new Transport(score);
  const view = new ScoreView(container, transport, svg, timemap);
  return { container, transport, view };
}

describe("ScoreView", () => {
  it("injects the SVG and tags every measure with its index", () => {
    const { container } = setup();
    const measures = container.querySelectorAll("[data-measure-index]");
    expect(measures).toHaveLength(3);
    expect(measures[0].getAttribute("data-measure-index")).toBe("0");
    expect(measures[2].getAttribute("data-measure-index")).toBe("2");
  });

  it("highlights the measure under the clock on renderFrame", () => {
    const { container, transport, view } = setup();
    transport.clock.seek(2.5); // measure index 1
    view.renderFrame();
    const m1 = container.querySelector('[data-measure-index="1"]')!;
    expect(m1.classList.contains("current-measure")).toBe(true);
    const m0 = container.querySelector('[data-measure-index="0"]')!;
    expect(m0.classList.contains("current-measure")).toBe(false);
  });

  it("highlights the note sounding under the clock on renderFrame", () => {
    const { container, transport, view } = setup();
    transport.clock.seek(2.5); // 2500 ms -> note n1 sounding
    view.renderFrame();
    expect(
      container.querySelector("#n1")!.classList.contains("current-note"),
    ).toBe(true);
    expect(
      container.querySelector("#n0")!.classList.contains("current-note"),
    ).toBe(false);
  });

  it("clicking a measure seeks the clock to that measure's start", () => {
    const { container, transport } = setup();
    const m2 = container.querySelector('[data-measure-index="2"]')!;
    m2.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    m2.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(transport.clock.position).toBe(4); // measure 2 starts at 4 s
  });

  it("dragging across measures sets the A-B loop", () => {
    const { container, transport } = setup();
    const m0 = container.querySelector('[data-measure-index="0"]')!;
    const m2 = container.querySelector('[data-measure-index="2"]')!;
    m0.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    m2.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(transport.clock.loop).toEqual({ start: 0, end: 6 });
  });

  it("destroy() removes the injected content and listeners", () => {
    const { container, view } = setup();
    view.destroy();
    expect(container.querySelectorAll("[data-measure-index]")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it — confirm it fails**

Run: `npm test -- scoreView`
Expected: FAIL.

- [ ] **Step 3: Implement `src/score-view/scoreView.ts`**

Design:

- Imports: `type Transport` from `../transport/transport`; `currentMeasureIndex`,
  `notesAtTime` from `./sync`; `measureIndexFromTarget`, `orderedRange` from
  `./interactions`; `type TimemapEntry` from `./verovio`.
- `export class ScoreView`:
  - Constructor `(container: HTMLElement, transport: Transport, svg: string,
timemap: TimemapEntry[])`:
    - Store `container`, `transport`, `timemap`.
    - Inject the SVG: `container.innerHTML = svg`.
    - Tag measures: `container.querySelectorAll("g.measure")` in document order;
      for each at index `i`, `el.setAttribute("data-measure-index", String(i))`.
    - Install a `mousedown` listener and a `mouseup` listener on `container`
      (store bound references so `destroy` can remove them):
      - `mousedown`: record `dragStart = measureIndexFromTarget(e.target)`.
      - `mouseup`: `end = measureIndexFromTarget(e.target)`. If `dragStart` and
        `end` are both non-null:
        - If they are the SAME measure → a click: `transport.clock.seek(start
of that measure)` — use the measure's start time. Get it from
          `transport.score.measures[index].start`.
        - If DIFFERENT → a drag: `const { first, last } = orderedRange(dragStart,
end); transport.loopMeasures(first, last);`.
        - Reset `dragStart` to null.
  - `renderFrame(): void`:
    - `t = transport.clock.position`.
    - Measure highlight: `idx = currentMeasureIndex(transport.score, t)`. Remove
      the `current-measure` class from any element that has it; add it to the
      element with `data-measure-index === String(idx)`.
    - Note highlight: `ids = notesAtTime(this.timemap, t * 1000)`. Remove the
      `current-note` class from any element that has it; for each id in `ids`,
      `container.querySelector("#" + CSS.escape(id))` and add `current-note`
      (skip ids with no matching element). Use `CSS.escape` so ids with special
      characters are safe; jsdom provides `CSS.escape`.
    - Scroll the current measure into view if it has `scrollIntoView`
      (`el.scrollIntoView?.({ block: "nearest" })` — jsdom defines it as a
      no-op, real browsers scroll; guard with optional chaining).
  - `destroy(): void`: remove the `mousedown`/`mouseup` listeners and clear
    `container.innerHTML`.

Notes for the implementer:

- `transport.loopMeasures(first, last)` already exists (Feature C) — it sets the
  clock loop from a measure range.
- A click and a drag are distinguished purely by whether mousedown and mouseup
  land on the same measure index. That is sufficient for v1.
- Keep `ScoreView` focused; small private helpers are fine.

- [ ] **Step 4: Run the tests — confirm they pass**

Run: `npm test -- scoreView`
Expected: PASS (6 tests).

- [ ] **Step 5: Full verification**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/score-view/scoreView.ts src/score-view/scoreView.test.ts
git commit -m "feat: add ScoreView with highlight, click-to-seek, drag-to-loop"
```

---

## Feature F — Definition of Done

- `verovio.ts` loads the Verovio WASM toolkit and renders MusicXML to an SVG
  plus a note on/off timemap.
- `sync.ts` maps clock time to a measure index and back, and to sounding notes.
- `interactions.ts` resolves a DOM target to a measure index and orders a drag.
- `ScoreView` injects the SVG, tags measures, highlights + scrolls to the current
  measure each frame, highlights the currently sounding notes, seeks on a measure
  click, and sets the loop on a drag.
- All unit tests pass; `npm run lint`, `npm run typecheck`, `npm test`,
  `npm run build` all green.
- `docs/features/F-score-view.md` updated: status Done, changes log + testing.

## Manual-test checklist (for the feature doc)

- After Feature G mounts the score panel with a loaded piece: the score engraves
  and scrolls; the current measure highlights and stays in view; the currently
  sounding notes highlight live; clicking a measure jumps playback (and the
  falldown follows); dragging across measures sets the A-B loop.
- The `current-measure` / `current-note` CSS classes are styled in Feature G's
  stylesheet; Feature F only adds/removes the classes.
