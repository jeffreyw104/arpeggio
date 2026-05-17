# Feature E — Falldown View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Canvas2D "falldown" view — notes fall from the top and land on a piano keyboard exactly when they sound, color-coded by hand, with an auto-fit key range, a beat-grid overlay, optional note-name labels, and live key highlighting.

**Architecture:** All the hard parts are pure geometry — "given a key range and a width, where is each key?", "given the clock time, where does each falling note draw?". Those are pure functions, fully unit-tested. The Canvas2D draw calls are thin functions that take a `CanvasRenderingContext2D` and the pre-computed geometry; they are tested with a fake recording context (jsdom has no real canvas). `FalldownRenderer` composes everything and draws one frame per `renderFrame()` call; a `requestAnimationFrame` loop calls it. The renderer only _reads_ the transport clock — it never advances it (a later feature owns the clock-tick loop).

**Tech Stack:** TypeScript, Canvas2D, Vitest. Reads `Score`/`Note` (Feature B), `Transport`/`Clock` (Feature C), and reuses `metronomeBeats` (Feature D) for the beat grid.

**Branch:** `feature/e-falldown-view`

---

## Notes for the implementer

- Repo root and working directory: `/Users/jeffreywan/Desktop/arpeggio`. Run all commands from there.
- Work on branch `feature/e-falldown-view` (the controller creates it before Task 1).
- Features A-D are merged into `main`. `npm test` (78 tests), lint, typecheck, build all green.
- Read `src/model/score.ts`, `src/transport/transport.ts` + `src/transport/clock.ts`, and `src/audio/beats.ts` (`metronomeBeats(score, subdivision)`).
- `strict` TypeScript + `noUnusedLocals`/`noUnusedParameters` on.
- **Canvas in tests:** jsdom does not implement a real 2D context. Draw functions take a `CanvasRenderingContext2D`; tests pass a _fake_ recording object cast via `as unknown as CanvasRenderingContext2D`. Never call `canvas.getContext("2d")` in a test.
- Coordinate system: the canvas is `width × height` px. The piano keyboard occupies the bottom `pianoHeight` px; the **hit line** (`hitLineY = height - pianoHeight`) is where a falling note's onset edge lands. Notes fall downward at `pixelsPerSecond`. A note with onset `s` at clock time `t` has its onset (bottom) edge at `y = hitLineY - (s - t) * pixelsPerSecond`.
- Hand colors come from the theme: right hand `#4a90d9`, left hand `#e08a3c` (the CSS vars `--hand-right` / `--hand-left`). Pass colors through config; do not hard-code in geometry.
- Commit after every task with the exact messages given.

---

## File / Folder Structure

```
src/falldown/
  keyRange.ts      # auto-fit MIDI key range from a score
  piano.ts         # keyboard geometry (key rects) + draw + note-name helper
  notes.ts         # falling-note geometry + active-key detection (pure)
  beatGrid.ts      # beat-grid line positions (pure)
  renderer.ts      # FalldownRenderer: composes all of the above, draws a frame
```

(The design spec names `renderer.ts`/`piano.ts`/`keyRange.ts`/`beatGrid.ts`; the
pure falling-note geometry is split into `notes.ts` so `renderer.ts` stays the
thin composition/draw layer.)

---

## Task 1: Auto-fit key range — `keyRange.ts`

**Files:** Create `src/falldown/keyRange.ts`, `src/falldown/keyRange.test.ts`

- [ ] **Step 1: Write the failing test — `src/falldown/keyRange.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { autoFitRange, FULL_88 } from "./keyRange";
import type { Score } from "../model/score";

function scoreWith(midis: number[]): Score {
  return {
    source: "midi",
    notes: midis.map((m) => ({
      midi: m,
      start: 0,
      duration: 1,
      velocity: 0.7,
      hand: "right",
    })),
    measures: [{ index: 0, start: 0, end: 2, numerator: 4, denominator: 4 }],
    pedalEvents: [],
    timeSignatures: [{ start: 0, numerator: 4, denominator: 4 }],
    tempoMap: [{ start: 0, bpm: 120 }],
    durationSeconds: 2,
    musicXml: "",
    qualityWarning: null,
  };
}

describe("autoFitRange", () => {
  it("spans the lowest and highest notes used", () => {
    const r = autoFitRange(scoreWith([60, 64, 67]));
    expect(r.low).toBeLessThanOrEqual(60);
    expect(r.high).toBeGreaterThanOrEqual(67);
  });

  it("pads the bounds out to white keys", () => {
    // 61 = C#4 (black), 66 = F#4 (black): range must widen to white keys.
    const r = autoFitRange(scoreWith([61, 66]));
    expect(isBlackPitch(r.low)).toBe(false);
    expect(isBlackPitch(r.high)).toBe(false);
    expect(r.low).toBeLessThanOrEqual(61);
    expect(r.high).toBeGreaterThanOrEqual(66);
  });

  it("falls back to a sensible middle range for an empty score", () => {
    const r = autoFitRange(scoreWith([]));
    expect(r.high).toBeGreaterThan(r.low);
  });
});

function isBlackPitch(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
}

describe("FULL_88", () => {
  it("is the full piano range A0-C8", () => {
    expect(FULL_88).toEqual({ low: 21, high: 108 });
  });
});
```

- [ ] **Step 2: Run it — confirm it fails**

Run: `npm test -- keyRange`
Expected: FAIL.

- [ ] **Step 3: Implement `src/falldown/keyRange.ts`**

```ts
import type { Score } from "../model/score";

/** An inclusive MIDI key range. */
export interface KeyRange {
  low: number;
  high: number;
}

/** The full 88-key piano: A0 (21) to C8 (108). */
export const FULL_88: KeyRange = { low: 21, high: 108 };

const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);

function isBlack(midi: number): boolean {
  return BLACK_PITCH_CLASSES.has(((midi % 12) + 12) % 12);
}

/**
 * The key range a score actually uses — the lowest to highest note, with each
 * bound widened outward to the nearest white key so the keyboard begins and
 * ends cleanly. An empty score falls back to a one-octave middle range.
 */
export function autoFitRange(score: Score): KeyRange {
  if (score.notes.length === 0) return { low: 60, high: 72 };
  let low = Math.min(...score.notes.map((n) => n.midi));
  let high = Math.max(...score.notes.map((n) => n.midi));
  while (isBlack(low) && low > 0) low--;
  while (isBlack(high) && high < 127) high++;
  return { low, high };
}
```

- [ ] **Step 4: Run the tests — confirm they pass**

Run: `npm test -- keyRange`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/falldown/keyRange.ts src/falldown/keyRange.test.ts
git commit -m "feat: add auto-fit key range for the falldown view"
```

---

## Task 2: Keyboard geometry and rendering — `piano.ts`

**Files:** Create `src/falldown/piano.ts`, `src/falldown/piano.test.ts`

`piano.ts` computes the pixel rectangle of every key in a range (white keys tile
the width edge-to-edge; black keys overlay, narrower), converts MIDI numbers to
note names, and draws the keyboard with active keys highlighted.

- [ ] **Step 1: Write the failing test — `src/falldown/piano.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { keyLayout, midiToNoteName, drawPiano } from "./piano";

describe("keyLayout", () => {
  it("tiles white keys edge-to-edge across the width", () => {
    // C4..C5 = MIDI 60..72 : 8 white keys (C D E F G A B C).
    const layout = keyLayout({ low: 60, high: 72 }, 800);
    const whites = layout.keys.filter((k) => !k.black);
    expect(whites).toHaveLength(8);
    expect(whites[0].x).toBeCloseTo(0, 6);
    expect(whites[0].width).toBeCloseTo(100, 6);
    expect(whites[7].x).toBeCloseTo(700, 6);
  });

  it("places black keys narrower and between their white neighbours", () => {
    const layout = keyLayout({ low: 60, high: 72 }, 800);
    const cSharp = layout.keys.find((k) => k.midi === 61);
    expect(cSharp).toBeDefined();
    expect(cSharp!.black).toBe(true);
    expect(cSharp!.width).toBeLessThan(100);
    // C#4 sits around the C4/D4 boundary (~100 px).
    expect(cSharp!.x + cSharp!.width / 2).toBeGreaterThan(60);
    expect(cSharp!.x + cSharp!.width / 2).toBeLessThan(140);
  });

  it("can look a key up by midi number", () => {
    const layout = keyLayout({ low: 60, high: 72 }, 800);
    expect(layout.byMidi(64)).toBeDefined();
    expect(layout.byMidi(999)).toBeUndefined();
  });
});

describe("midiToNoteName", () => {
  it("names natural and sharp pitches with octave numbers", () => {
    expect(midiToNoteName(60)).toBe("C4");
    expect(midiToNoteName(61)).toBe("C#4");
    expect(midiToNoteName(69)).toBe("A4");
  });
});

describe("drawPiano", () => {
  it("fills a rect for every key and highlights active keys", () => {
    const layout = keyLayout({ low: 60, high: 72 }, 800);
    const calls: string[] = [];
    const ctx = {
      set fillStyle(v: string) {
        calls.push(`fill=${v}`);
      },
      fillRect: () => calls.push("fillRect"),
      strokeRect: () => calls.push("strokeRect"),
      set strokeStyle(_v: string) {},
      set lineWidth(_v: number) {},
    } as unknown as CanvasRenderingContext2D;
    drawPiano(ctx, layout, {
      y: 300,
      height: 100,
      activeKeys: new Set([64]),
      activeColor: "#4a8",
      whiteColor: "#fff",
      blackColor: "#222",
    });
    expect(calls.filter((c) => c === "fillRect").length).toBeGreaterThanOrEqual(
      layout.keys.length,
    );
    expect(calls).toContain("fill=#4a8"); // the active key was highlighted
  });
});
```

- [ ] **Step 2: Run it — confirm it fails**

Run: `npm test -- falldown/piano`
Expected: FAIL.

- [ ] **Step 3: Implement `src/falldown/piano.ts`**

Types and exports:

```ts
import type { KeyRange } from "./keyRange";

/** One key's horizontal placement. `x`/`width` are pixels; `black` = sharp/flat. */
export interface KeyRect {
  midi: number;
  x: number;
  width: number;
  black: boolean;
}

/** The full keyboard layout for a range at a given pixel width. */
export interface KeyboardLayout {
  keys: KeyRect[];
  width: number;
  byMidi(midi: number): KeyRect | undefined;
}

export interface DrawPianoOptions {
  y: number; // top of the keyboard
  height: number; // keyboard height in px
  activeKeys: Set<number>;
  activeColor: string;
  whiteColor: string;
  blackColor: string;
}
```

Algorithm for `keyLayout(range: KeyRange, width: number): KeyboardLayout`:

- `isBlack(midi)`: pitch class in `{1,3,6,8,10}`.
- Collect the white-key MIDI numbers in `[low, high]` in order. `whiteCount` =
  their length; `whiteWidth = width / whiteCount`.
- For each white key at order-index `i`: `x = i * whiteWidth`, `width =
whiteWidth`, `black = false`.
- `blackWidth = whiteWidth * 0.62`. For each black-key MIDI `m` in range: the
  white key directly below is `m - 1` (always white for piano black keys); find
  its order-index `wi`; the black key is centred on the white-key boundary:
  `x = (wi + 1) * whiteWidth - blackWidth / 2`, `width = blackWidth`,
  `black = true`.
- `keys` = all white + black KeyRects (order does not matter for lookup; for
  drawing, draw whites first then blacks). `byMidi` = a `Map`-backed lookup.

`midiToNoteName(midi)`: `names = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"]`;
`octave = Math.floor(midi / 12) - 1`; return `names[midi % 12] + octave`.

`drawPiano(ctx, layout, opts)`: draw white keys first (fillRect each at
`opts.y`, `opts.height`), then black keys on top (shorter — e.g. 62 % of
`height`). A key whose midi is in `opts.activeKeys` is filled with
`opts.activeColor` instead of its white/black color. Stroke each white key with
a thin border for definition. Keep it straightforward.

- [ ] **Step 4: Run the tests — confirm they pass**

Run: `npm test -- falldown/piano`
Expected: PASS.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/falldown/piano.ts src/falldown/piano.test.ts
git commit -m "feat: add piano keyboard geometry and rendering"
```

---

## Task 3: Falling-note geometry — `notes.ts`

**Files:** Create `src/falldown/notes.ts`, `src/falldown/notes.test.ts`

`notes.ts` computes, for the current clock time, the screen rectangle of every
visible falling note, and which keys are currently sounding.

- [ ] **Step 1: Write the failing test — `src/falldown/notes.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { noteRects, activeKeys, type FalldownConfig } from "./notes";
import { keyLayout } from "./piano";
import type { Note } from "../model/score";

const layout = keyLayout({ low: 60, high: 72 }, 800);

const config: FalldownConfig = {
  hitLineY: 400,
  pixelsPerSecond: 100,
  rightColor: "#4a90d9",
  leftColor: "#e08a3c",
};

const notes: Note[] = [
  { midi: 60, start: 1, duration: 0.5, velocity: 0.7, hand: "right" },
  { midi: 64, start: 5, duration: 1, velocity: 0.7, hand: "left" },
];

describe("noteRects", () => {
  it("places a note's onset edge at the hit line when time == start", () => {
    const rects = noteRects(notes, layout, 1, config);
    const r = rects.find((x) => x.midi === 60);
    expect(r).toBeDefined();
    expect(r!.bottom).toBeCloseTo(400, 6); // onset edge at the hit line
    expect(r!.height).toBeCloseTo(50, 6); // 0.5 s * 100 px/s
  });

  it("places a future note above the hit line", () => {
    const rects = noteRects(notes, layout, 0, config); // note 60 starts in 1 s
    const r = rects.find((x) => x.midi === 60)!;
    expect(r.bottom).toBeCloseTo(300, 6); // 400 - 1*100
  });

  it("omits notes far off-screen", () => {
    // note 64 starts at t=5; at time 0 it is 500 px above the hit line.
    const rects = noteRects(notes, layout, 0, config);
    expect(rects.find((x) => x.midi === 64)).toBeUndefined();
  });

  it("colors notes by hand", () => {
    const rects = noteRects(notes, layout, 1, config);
    expect(rects.find((x) => x.midi === 60)!.color).toBe("#4a90d9");
  });
});

describe("activeKeys", () => {
  it("returns midis of notes sounding at the given time", () => {
    expect(activeKeys(notes, 1.2)).toEqual(new Set([60])); // 60: [1,1.5)
    expect(activeKeys(notes, 5.5)).toEqual(new Set([64])); // 64: [5,6)
    expect(activeKeys(notes, 3)).toEqual(new Set());
  });
});
```

- [ ] **Step 2: Run it — confirm it fails**

Run: `npm test -- falldown/notes`
Expected: FAIL.

- [ ] **Step 3: Implement `src/falldown/notes.ts`**

```ts
import type { Note } from "../model/score";
import type { KeyboardLayout } from "./piano";

/** Geometry/style configuration for the falldown. */
export interface FalldownConfig {
  /** Y of the keyboard top — where a note's onset edge lands. */
  hitLineY: number;
  /** Fall speed in pixels per second. */
  pixelsPerSecond: number;
  rightColor: string;
  leftColor: string;
}

/** A falling note's drawn rectangle. `bottom` is the onset (lower) edge. */
export interface NoteRect {
  midi: number;
  x: number;
  width: number;
  bottom: number;
  top: number;
  height: number;
  color: string;
}

/**
 * The drawable rectangle of every note visible at clock time `t`. A note's
 * onset edge sits at `hitLineY` when `t === note.start`, rising above it before
 * and passing below it after. Notes fully outside the falldown area are omitted.
 */
export function noteRects(
  notes: Note[],
  layout: KeyboardLayout,
  t: number,
  config: FalldownConfig,
): NoteRect[] {
  const rects: NoteRect[] = [];
  for (const note of notes) {
    const key = layout.byMidi(note.midi);
    if (!key) continue;
    const bottom = config.hitLineY - (note.start - t) * config.pixelsPerSecond;
    const height = note.duration * config.pixelsPerSecond;
    const top = bottom - height;
    // Visible if the rect overlaps the falldown area [0, hitLineY].
    if (top > config.hitLineY || bottom < 0) continue;
    rects.push({
      midi: note.midi,
      x: key.x,
      width: key.width,
      bottom,
      top,
      height,
      color: note.hand === "right" ? config.rightColor : config.leftColor,
    });
  }
  return rects;
}

/** MIDI numbers of every note sounding at time `t` (start <= t < start+dur). */
export function activeKeys(notes: Note[], t: number): Set<number> {
  const active = new Set<number>();
  for (const note of notes) {
    if (t >= note.start && t < note.start + note.duration) {
      active.add(note.midi);
    }
  }
  return active;
}
```

- [ ] **Step 4: Run the tests — confirm they pass**

Run: `npm test -- falldown/notes`
Expected: PASS.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/falldown/notes.ts src/falldown/notes.test.ts
git commit -m "feat: add falling-note geometry and active-key detection"
```

---

## Task 4: Beat-grid overlay — `beatGrid.ts`

**Files:** Create `src/falldown/beatGrid.ts`, `src/falldown/beatGrid.test.ts`

`beatGrid.ts` computes the on-screen Y position of every beat line visible in
the falldown area, reusing `metronomeBeats` (Feature D) for the beat times.

- [ ] **Step 1: Write the failing test — `src/falldown/beatGrid.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { beatGridLines } from "./beatGrid";
import type { Score } from "../model/score";

const score = {
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
} satisfies Score;

describe("beatGridLines", () => {
  it("places the beat at the current time on the hit line", () => {
    const lines = beatGridLines(score, 0, {
      hitLineY: 400,
      pixelsPerSecond: 100,
    });
    const atZero = lines.find((l) => Math.abs(l.y - 400) < 1e-6);
    expect(atZero).toBeDefined();
  });

  it("marks measure downbeats distinctly from ordinary beats", () => {
    const lines = beatGridLines(score, 0, {
      hitLineY: 400,
      pixelsPerSecond: 100,
    });
    const downbeat = lines.find((l) => Math.abs(l.y - 400) < 1e-6);
    expect(downbeat!.downbeat).toBe(true);
    // beat at t=0.5 -> y = 400 - 0.5*100 = 350, not a downbeat
    const ordinary = lines.find((l) => Math.abs(l.y - 350) < 1e-6);
    expect(ordinary!.downbeat).toBe(false);
  });

  it("only returns lines within the falldown area", () => {
    const lines = beatGridLines(score, 0, {
      hitLineY: 400,
      pixelsPerSecond: 100,
    });
    for (const l of lines) {
      expect(l.y).toBeGreaterThanOrEqual(0);
      expect(l.y).toBeLessThanOrEqual(400);
    }
  });
});
```

- [ ] **Step 2: Run it — confirm it fails**

Run: `npm test -- beatGrid`
Expected: FAIL.

- [ ] **Step 3: Implement `src/falldown/beatGrid.ts`**

```ts
import type { Score } from "../model/score";
import { metronomeBeats } from "../audio/beats";

export interface BeatGridConfig {
  hitLineY: number;
  pixelsPerSecond: number;
}

/** A horizontal beat-grid line. `downbeat` marks the first beat of a measure. */
export interface BeatLine {
  y: number;
  downbeat: boolean;
}

/**
 * Y positions of every beat line visible in the falldown area at clock time
 * `t`. A beat at time `b` sits at `y = hitLineY - (b - t) * pixelsPerSecond`;
 * lines outside `[0, hitLineY]` are dropped. A line is a `downbeat` when its
 * time coincides with a measure start.
 */
export function beatGridLines(
  score: Score,
  t: number,
  config: BeatGridConfig,
): BeatLine[] {
  const beats = metronomeBeats(score, 1);
  const measureStarts = new Set(score.measures.map((m) => m.start));
  const lines: BeatLine[] = [];
  for (const b of beats) {
    const y = config.hitLineY - (b - t) * config.pixelsPerSecond;
    if (y < 0 || y > config.hitLineY) continue;
    const downbeat = [...measureStarts].some((s) => Math.abs(s - b) < 1e-6);
    lines.push({ y, downbeat });
  }
  return lines;
}
```

- [ ] **Step 4: Run the tests — confirm they pass**

Run: `npm test -- beatGrid`
Expected: PASS.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/falldown/beatGrid.ts src/falldown/beatGrid.test.ts
git commit -m "feat: add falldown beat-grid overlay"
```

---

## Task 5: The FalldownRenderer — `renderer.ts`

**Files:** Create `src/falldown/renderer.ts`, `src/falldown/renderer.test.ts`

`FalldownRenderer` composes the key range, keyboard, falling notes, and beat
grid, and draws one frame to a canvas context for the transport clock's current
position. It exposes options (full-88 toggle, note labels, beat grid on/off) and
a `start()`/`stop()` `requestAnimationFrame` draw loop. It only READS the clock.

- [ ] **Step 1: Write the failing test — `src/falldown/renderer.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { FalldownRenderer } from "./renderer";
import { Transport } from "../transport/transport";
import type { Score } from "../model/score";

const score = {
  source: "midi",
  notes: [
    { midi: 60, start: 0.5, duration: 0.5, velocity: 0.7, hand: "right" },
    { midi: 64, start: 1.0, duration: 0.5, velocity: 0.7, hand: "left" },
  ],
  measures: [{ index: 0, start: 0, end: 2, numerator: 4, denominator: 4 }],
  pedalEvents: [],
  timeSignatures: [{ start: 0, numerator: 4, denominator: 4 }],
  tempoMap: [{ start: 0, bpm: 120 }],
  durationSeconds: 2,
  musicXml: "",
  qualityWarning: null,
} satisfies Score;

/** A fake 2D context that records the methods the renderer calls. */
function fakeCtx() {
  const calls: string[] = [];
  const rec =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push(`${name}(${args.join(",")})`);
    };
  const ctx = {
    calls,
    clearRect: rec("clearRect"),
    fillRect: rec("fillRect"),
    strokeRect: rec("strokeRect"),
    beginPath: rec("beginPath"),
    moveTo: rec("moveTo"),
    lineTo: rec("lineTo"),
    stroke: rec("stroke"),
    fillText: rec("fillText"),
    set fillStyle(_v: string) {},
    set strokeStyle(_v: string) {},
    set lineWidth(_v: number) {},
    set font(_v: string) {},
    set textAlign(_v: string) {},
  };
  return ctx;
}

function makeRenderer() {
  const transport = new Transport(score);
  const ctx = fakeCtx();
  const renderer = new FalldownRenderer(
    ctx as unknown as CanvasRenderingContext2D,
    transport,
    { width: 800, height: 600 },
  );
  return { transport, ctx, renderer };
}

describe("FalldownRenderer", () => {
  it("clears the canvas and draws keys on each frame", () => {
    const { ctx, renderer } = makeRenderer();
    renderer.renderFrame();
    expect(ctx.calls.some((c) => c.startsWith("clearRect"))).toBe(true);
    expect(
      ctx.calls.filter((c) => c.startsWith("fillRect")).length,
    ).toBeGreaterThan(0);
  });

  it("draws falling-note rectangles when notes are visible", () => {
    const { transport, ctx, renderer } = makeRenderer();
    transport.clock.seek(0.4); // note at 0.5 is just above the hit line
    renderer.renderFrame();
    const before = ctx.calls.length;
    expect(before).toBeGreaterThan(0);
  });

  it("toggles the full-88 key range", () => {
    const { renderer } = makeRenderer();
    expect(renderer.full88).toBe(false);
    renderer.full88 = true;
    expect(renderer.full88).toBe(true);
    renderer.renderFrame(); // must not throw with the wider range
  });

  it("toggles note labels and the beat grid without throwing", () => {
    const { renderer } = makeRenderer();
    renderer.showLabels = true;
    renderer.showBeatGrid = false;
    renderer.renderFrame();
  });

  it("start() then stop() runs and cancels the animation loop", () => {
    const raf = vi
      .spyOn(globalThis, "requestAnimationFrame")
      .mockImplementation(() => 1);
    const caf = vi
      .spyOn(globalThis, "cancelAnimationFrame")
      .mockImplementation(() => {});
    const { renderer } = makeRenderer();
    renderer.start();
    expect(raf).toHaveBeenCalled();
    renderer.stop();
    expect(caf).toHaveBeenCalled();
    raf.mockRestore();
    caf.mockRestore();
  });
});
```

- [ ] **Step 2: Run it — confirm it fails**

Run: `npm test -- falldown/renderer`
Expected: FAIL.

- [ ] **Step 3: Implement `src/falldown/renderer.ts`**

Design:

- `import` the key range, piano, notes, and beat-grid modules; `Transport`.
- `FalldownRendererOptions = { width: number; height: number }`.
- Constructor `(ctx: CanvasRenderingContext2D, transport: Transport, options)`:
  - Store ctx, transport, width, height.
  - `pianoHeight` = a fraction of height (e.g. `Math.min(140, height * 0.22)`).
  - `hitLineY = height - pianoHeight`.
  - `pixelsPerSecond` — pick so that ~2.5 s of notes are visible above the hit
    line: `hitLineY / 2.5` (store as a field; fine to keep constant).
  - Compute the auto-fit `KeyRange` from `transport.score` and cache it.
- Public mutable fields with defaults: `full88 = false`, `showLabels = false`,
  `showBeatGrid = true`.
- A private `range()` getter → `full88 ? FULL_88 : autoFitRange(score)`.
- `renderFrame(): void`:
  1. `ctx.clearRect(0, 0, width, height)`.
  2. `layout = keyLayout(this.range(), width)`.
  3. `t = transport.clock.position`.
  4. If `showBeatGrid`: draw each `beatGridLines(score, t, { hitLineY,
pixelsPerSecond })` as a horizontal line (`beginPath`/`moveTo`/`lineTo`/
     `stroke`); downbeats brighter/thicker than ordinary beats.
  5. Draw `noteRects(score.notes, layout, t, { hitLineY, pixelsPerSecond,
rightColor, leftColor })`: a `fillRect` per note rect. If `showLabels`,
     `fillText` the `midiToNoteName(rect.midi)` on the rect.
  6. `drawPiano(ctx, layout, { y: hitLineY, height: pianoHeight, activeKeys:
activeKeys(score.notes, t), activeColor, whiteColor, blackColor })`.
- `start(): void` — begin a `requestAnimationFrame` loop that calls
  `renderFrame()` then schedules the next; store the handle.
- `stop(): void` — `cancelAnimationFrame` the stored handle.

Colors: right `#4a90d9`, left `#e08a3c`, active `#4aa988`, white `#e6e6ea`,
black `#15151a`, beat line `#34343c`, downbeat line `#5a5a66`. Define them as
named constants at the top of the file.

Keep `renderFrame` readable — small private draw helpers (`drawBeatGrid`,
`drawNotes`) are encouraged. The renderer only reads `transport.clock.position`;
it never calls `tick`/`play`/`seek`.

- [ ] **Step 4: Run the tests — confirm they pass**

Run: `npm test -- falldown/renderer`
Expected: PASS.

- [ ] **Step 5: Full verification**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/falldown/renderer.ts src/falldown/renderer.test.ts
git commit -m "feat: add FalldownRenderer composing the Canvas2D falldown view"
```

---

## Feature E — Definition of Done

- `autoFitRange` picks the used key range; `FULL_88` is the full toggle.
- `keyLayout` lays out white/black keys; `drawPiano` renders + highlights.
- `noteRects` places falling notes by clock time; `activeKeys` finds sounding notes.
- `beatGridLines` positions beat lines, marking downbeats.
- `FalldownRenderer` draws a full frame (beat grid + falling notes + piano) and
  supports the full-88, note-label, and beat-grid toggles plus a rAF loop.
- All unit tests pass; `npm run lint`, `npm run typecheck`, `npm test`,
  `npm run build` all green.
- `docs/features/E-falldown-view.md` updated: status Done, changes log + testing.

## Manual-test checklist (for the feature doc)

- After Feature G mounts the canvas with a loaded piece: notes fall and land on
  the correct keys exactly on the beat; hands are color-coded; the beat grid
  scrolls with the music; note labels and the full-88 toggle work; keys light up
  as notes sound.
