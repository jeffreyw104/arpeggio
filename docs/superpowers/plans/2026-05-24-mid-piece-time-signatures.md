# Mid-Piece Time Signatures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the metronome, falldown beat grid, top-bar time-sig chip, and MIDI→MusicXML export follow every time-signature change in the score (today they all read `score.timeSignatures[0]` only).

**Architecture:** Add one pure helper `timeSignatureAt(sigs, time)`. Change `metronomeBeats`, `beatPulse`, and `beatGridLines` to take `TimeSignature[]` instead of `beatsPerBar: number`; each looks up the active segment per measure. The `Metronome` class stores `segments: TimeSignature[]` and exposes a position-aware `timeSignature` getter. Manual override collapses all segments to a single user-chosen entry and is preserved across `setScore`. The MIDI→MusicXML exporter emits a slim `<attributes><time>…</time></attributes>` block at every measure where the active signature changes.

**Tech Stack:** TypeScript, Vitest, Vite, React. Existing patterns followed — small focused files, pure functions tested in isolation, TDD with a failing test first.

**Spec:** `docs/superpowers/specs/2026-05-24-mid-piece-time-signatures-design.md`

---

## File map

- Create: `src/audio/timeSignatureAt.ts` + `src/audio/timeSignatureAt.test.ts`
- Modify: `src/audio/beats.ts` + `src/audio/beats.test.ts`
- Modify: `src/audio/metronome.ts` + `src/audio/metronome.test.ts`
- Modify: `src/falldown/beatGrid.ts` + `src/falldown/beatGrid.test.ts`
- Modify: `src/falldown/renderer.ts` + `src/falldown/renderer.test.ts`
- Modify: `src/app/PracticeView.tsx`
- Modify: `src/import/midi/midiToMusicXml.ts` + `src/import/midi/midiToMusicXml.test.ts`
- Modify: `HANDOVER.md`
- Modify: `docs/features/D-audio-metronome.md`, `docs/features/E-falldown-view.md`, `docs/features/B-import-score-model.md`

---

### Task 1: `timeSignatureAt` helper

**Files:**
- Create: `src/audio/timeSignatureAt.ts`
- Create: `src/audio/timeSignatureAt.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/audio/timeSignatureAt.test.ts
import { describe, it, expect } from "vitest";
import { timeSignatureAt } from "./timeSignatureAt";
import type { TimeSignature } from "../model/score";

describe("timeSignatureAt", () => {
  it("returns the 4/4 fallback when the list is empty", () => {
    expect(timeSignatureAt([], 0)).toEqual({
      start: 0,
      numerator: 4,
      denominator: 4,
    });
    expect(timeSignatureAt([], 99)).toEqual({
      start: 0,
      numerator: 4,
      denominator: 4,
    });
  });

  it("returns the only entry when there is just one", () => {
    const sigs: TimeSignature[] = [
      { start: 0, numerator: 3, denominator: 4 },
    ];
    expect(timeSignatureAt(sigs, 0)).toBe(sigs[0]);
    expect(timeSignatureAt(sigs, 10)).toBe(sigs[0]);
  });

  it("returns the last entry whose start <= time", () => {
    const sigs: TimeSignature[] = [
      { start: 0, numerator: 4, denominator: 4 },
      { start: 8, numerator: 6, denominator: 4 },
      { start: 20, numerator: 3, denominator: 4 },
    ];
    expect(timeSignatureAt(sigs, 0)).toBe(sigs[0]);
    expect(timeSignatureAt(sigs, 7.99)).toBe(sigs[0]);
    expect(timeSignatureAt(sigs, 8)).toBe(sigs[1]); // exactly on boundary
    expect(timeSignatureAt(sigs, 15)).toBe(sigs[1]);
    expect(timeSignatureAt(sigs, 20)).toBe(sigs[2]);
    expect(timeSignatureAt(sigs, 999)).toBe(sigs[2]);
  });

  it("returns the first entry when time is before all starts", () => {
    const sigs: TimeSignature[] = [
      { start: 5, numerator: 4, denominator: 4 },
      { start: 10, numerator: 3, denominator: 4 },
    ];
    expect(timeSignatureAt(sigs, 0)).toBe(sigs[0]);
    expect(timeSignatureAt(sigs, -1)).toBe(sigs[0]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/audio/timeSignatureAt.test.ts`
Expected: FAIL with "Cannot find module './timeSignatureAt'"

- [ ] **Step 3: Write minimal implementation**

```ts
// src/audio/timeSignatureAt.ts
import type { TimeSignature } from "../model/score";

const FALLBACK: TimeSignature = { start: 0, numerator: 4, denominator: 4 };

/**
 * Return the time signature active at clock time `time` — the last entry in
 * `sigs` whose `start <= time`. Assumes `sigs` is sorted by `start` (matches
 * both parsers' output). If `sigs` is empty or every entry starts after
 * `time`, returns the first entry or a 4/4 fallback.
 */
export function timeSignatureAt(
  sigs: TimeSignature[],
  time: number,
): TimeSignature {
  if (sigs.length === 0) return FALLBACK;
  let active = sigs[0];
  for (const sig of sigs) {
    if (sig.start <= time) active = sig;
    else break;
  }
  return active;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/audio/timeSignatureAt.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/audio/timeSignatureAt.ts src/audio/timeSignatureAt.test.ts
git commit -m "feat(audio): add timeSignatureAt helper

Pure lookup that returns the active TimeSignature for a clock time —
basis for the segment-aware metronome, falldown beat grid, and top-bar
chip."
```

---

### Task 2: `metronomeBeats` and `beatPulse` take `TimeSignature[]`

**Files:**
- Modify: `src/audio/beats.ts`
- Modify: `src/audio/beats.test.ts`

- [ ] **Step 1: Update existing tests and add multi-segment cases**

Replace the entire contents of `src/audio/beats.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { metronomeBeats, beatPulse } from "./beats";
import type { Measure, TimeSignature } from "../model/score";

// Two 4/4 measures spanning [0,2] and [2,4].
const measures: Measure[] = [
  { index: 0, start: 0, end: 2, numerator: 4, denominator: 4 },
  { index: 1, start: 2, end: 4, numerator: 4, denominator: 4 },
];
const SIGS_44: TimeSignature[] = [{ start: 0, numerator: 4, denominator: 4 }];

describe("metronomeBeats", () => {
  it("emits a 4/4 grid from the measures at subdivision 1", () => {
    const beats = metronomeBeats(measures, SIGS_44, 1);
    expect(beats.map((b) => b.time)).toEqual([
      0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5,
    ]);
    expect(beats.every((b) => b.mainBeat)).toBe(true);
    expect(beats.filter((b) => b.accent).map((b) => b.time)).toEqual([0, 2]);
    expect(beats.find((b) => b.time === 0.5)!.accent).toBe(false);
    expect(beats.find((b) => b.time === 1)!.accent).toBe(false);
    expect(beats.find((b) => b.time === 1.5)!.accent).toBe(false);
  });

  it("splits each beat into subdivision ticks", () => {
    const beats = metronomeBeats(measures, SIGS_44, 2);
    expect(beats.length).toBe(16);
    expect(beats.slice(0, 5).map((b) => b.time)).toEqual([
      0, 0.25, 0.5, 0.75, 1,
    ]);
    expect(beats.find((b) => b.time === 0.25)!.mainBeat).toBe(false);
    expect(beats.find((b) => b.time === 0.5)!.mainBeat).toBe(true);
    expect(beats.filter((b) => b.accent).map((b) => b.time)).toEqual([0, 2]);
  });

  it("divides a measure of a different length evenly", () => {
    const longMeasure: Measure[] = [
      { index: 0, start: 0, end: 3, numerator: 6, denominator: 8 },
    ];
    const sigs68: TimeSignature[] = [
      { start: 0, numerator: 6, denominator: 8 },
    ];
    const beats = metronomeBeats(longMeasure, sigs68, 1);
    // beatLen = 3 / 6 = 0.5
    expect(beats.map((b) => b.time)).toEqual([0, 0.5, 1, 1.5, 2, 2.5]);
  });

  it("uses the active segment's numerator per measure", () => {
    // Four 2-second measures; 4/4 for the first two, 3/4 starting at t=4.
    const ms: Measure[] = [
      { index: 0, start: 0, end: 2, numerator: 4, denominator: 4 },
      { index: 1, start: 2, end: 4, numerator: 4, denominator: 4 },
      { index: 2, start: 4, end: 6, numerator: 3, denominator: 4 },
      { index: 3, start: 6, end: 8, numerator: 3, denominator: 4 },
    ];
    const sigs: TimeSignature[] = [
      { start: 0, numerator: 4, denominator: 4 },
      { start: 4, numerator: 3, denominator: 4 },
    ];
    const beats = metronomeBeats(ms, sigs, 1);
    // 4 + 4 + 3 + 3 = 14 main beats.
    expect(beats.length).toBe(14);
    // Measures 0 and 1: 4 beats spaced 0.5 apart starting at 0 and 2.
    expect(beats.slice(0, 4).map((b) => b.time)).toEqual([0, 0.5, 1, 1.5]);
    expect(beats.slice(4, 8).map((b) => b.time)).toEqual([2, 2.5, 3, 3.5]);
    // Measure 2: 3 beats spread across [4, 6] -> beatLen 2/3.
    expect(beats.slice(8, 11).map((b) => b.time)).toEqual([
      4,
      4 + 2 / 3,
      4 + 4 / 3,
    ]);
    // Accents on every measure start (4, 4, 3, 3 grids → accents at 0, 2, 4, 6).
    expect(beats.filter((b) => b.accent).map((b) => b.time)).toEqual([
      0, 2, 4, 6,
    ]);
  });

  it("falls back to 4/4 when the signature list is empty", () => {
    const beats = metronomeBeats(measures, [], 1);
    expect(beats.map((b) => b.time)).toEqual([
      0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5,
    ]);
  });

  it("clamps a 0 subdivision to 1", () => {
    const a = metronomeBeats(measures, SIGS_44, 0);
    const b = metronomeBeats(measures, SIGS_44, 1);
    expect(a).toEqual(b);
  });
});

describe("beatPulse", () => {
  it("is 1 on a beat and decays linearly to 0 over the decay window", () => {
    expect(beatPulse(measures, SIGS_44, 1, 0.2)).toBe(1);
    expect(beatPulse(measures, SIGS_44, 1.1, 0.2)).toBeCloseTo(0.5, 6);
    expect(beatPulse(measures, SIGS_44, 1.3, 0.2)).toBe(0);
  });

  it("is 0 before the first beat", () => {
    expect(beatPulse(measures, SIGS_44, -1, 0.2)).toBe(0);
  });

  it("uses the active segment's numerator at time t", () => {
    // Same 4/4 → 3/4 score as above. A pulse query at t=4 should fire (the
    // 3/4 segment starts with a beat at exactly t=4).
    const ms: Measure[] = [
      { index: 0, start: 0, end: 2, numerator: 4, denominator: 4 },
      { index: 1, start: 2, end: 4, numerator: 4, denominator: 4 },
      { index: 2, start: 4, end: 6, numerator: 3, denominator: 4 },
    ];
    const sigs: TimeSignature[] = [
      { start: 0, numerator: 4, denominator: 4 },
      { start: 4, numerator: 3, denominator: 4 },
    ];
    expect(beatPulse(ms, sigs, 4, 0.2)).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/audio/beats.test.ts`
Expected: FAIL — type errors on `metronomeBeats(measures, SIGS_44, 1)` (current signature takes `beatsPerBar: number`).

- [ ] **Step 3: Update the implementation**

Replace the entire contents of `src/audio/beats.ts` with:

```ts
import type { Measure, TimeSignature } from "../model/score";
import { timeSignatureAt } from "./timeSignatureAt";

/** One position on the metric grid. */
export interface MetronomeBeat {
  /** Time in seconds from the start of the piece. */
  time: number;
  /** True on the first beat of a measure (the downbeat). */
  accent: boolean;
  /** True on a counted beat (not an in-between subdivision tick). */
  mainBeat: boolean;
}

/**
 * The metronome/beat grid for a piece. For each measure, the active time
 * signature (looked up by measure start time) determines how many beats fit
 * in the measure; each beat is split into `subdivision` ticks. Beats are
 * phase-locked to the measure's [start, end] span so downbeats land exactly
 * on barlines.
 */
export function metronomeBeats(
  measures: Measure[],
  timeSignatures: TimeSignature[],
  subdivision: number,
): MetronomeBeat[] {
  const sub = Math.max(1, Math.floor(subdivision));

  const beats: MetronomeBeat[] = [];
  for (const m of measures) {
    if (m.end <= m.start) continue;
    const sig = timeSignatureAt(timeSignatures, m.start);
    const bpb = Math.max(1, Math.floor(sig.numerator));
    const beatLen = (m.end - m.start) / bpb;
    const tick = beatLen / sub;
    for (let b = 0; b < bpb; b++) {
      for (let s = 0; s < sub; s++) {
        const time = m.start + b * beatLen + s * tick;
        const mainBeat = s === 0;
        const accent = b === 0 && s === 0;
        beats.push({ time, accent, mainBeat });
      }
    }
  }
  return beats;
}

/**
 * A 0-1 visual pulse of the beat at clock time `t`: 1 exactly on a beat,
 * decaying linearly to 0 over `decay` seconds. Beats come from the same
 * segment-aware grid that drives the metronome.
 */
export function beatPulse(
  measures: Measure[],
  timeSignatures: TimeSignature[],
  t: number,
  decay: number,
): number {
  const beats = metronomeBeats(measures, timeSignatures, 1);
  let last = -Infinity;
  for (const b of beats) {
    if (b.time <= t && b.time > last) last = b.time;
  }
  if (last === -Infinity) return 0;
  return Math.max(0, 1 - (t - last) / decay);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/audio/beats.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/audio/beats.ts src/audio/beats.test.ts
git commit -m "feat(audio): metronomeBeats/beatPulse take TimeSignature[]

Per-measure segment lookup so the grid follows mid-piece time-sig
changes. Callers must be updated; metronome/beatGrid/renderer follow in
the next commits."
```

---

### Task 3: `beatGridLines` takes `TimeSignature[]`

**Files:**
- Modify: `src/falldown/beatGrid.ts`
- Modify: `src/falldown/beatGrid.test.ts`

- [ ] **Step 1: Update existing tests and add multi-segment case**

Replace the entire contents of `src/falldown/beatGrid.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { beatGridLines } from "./beatGrid";
import type { Measure, TimeSignature } from "../model/score";

const measures: Measure[] = [
  { index: 0, start: 0, end: 2, numerator: 4, denominator: 4 },
  { index: 1, start: 2, end: 4, numerator: 4, denominator: 4 },
];
const SIGS_44: TimeSignature[] = [{ start: 0, numerator: 4, denominator: 4 }];

describe("beatGridLines", () => {
  it("places the beat at the current time on the hit line", () => {
    const lines = beatGridLines(measures, SIGS_44, 0, {
      hitLineY: 400,
      pixelsPerSecond: 100,
    });
    const atZero = lines.find((l) => Math.abs(l.y - 400) < 1e-6);
    expect(atZero).toBeDefined();
  });

  it("marks measure downbeats distinctly from ordinary beats", () => {
    const lines = beatGridLines(measures, SIGS_44, 0, {
      hitLineY: 400,
      pixelsPerSecond: 100,
    });
    const downbeat = lines.find((l) => Math.abs(l.y - 400) < 1e-6);
    expect(downbeat!.downbeat).toBe(true);
    const ordinary = lines.find((l) => Math.abs(l.y - 350) < 1e-6);
    expect(ordinary!.downbeat).toBe(false);
  });

  it("only returns lines within the falldown area", () => {
    const lines = beatGridLines(measures, SIGS_44, 0, {
      hitLineY: 400,
      pixelsPerSecond: 100,
    });
    for (const l of lines) {
      expect(l.y).toBeGreaterThanOrEqual(0);
      expect(l.y).toBeLessThanOrEqual(400);
    }
  });

  it("uses the active segment's beat density per measure", () => {
    // Measure 0: 4/4 (4 beats over [0,2] -> every 0.5 s).
    // Measure 1: 2/4 (2 beats over [2,4] -> every 1 s).
    const ms: Measure[] = [
      { index: 0, start: 0, end: 2, numerator: 4, denominator: 4 },
      { index: 1, start: 2, end: 4, numerator: 2, denominator: 4 },
    ];
    const sigs: TimeSignature[] = [
      { start: 0, numerator: 4, denominator: 4 },
      { start: 2, numerator: 2, denominator: 4 },
    ];
    // hitLineY=1000, pps=100 -> visible window covers t in [0, 10]
    const lines = beatGridLines(ms, sigs, 0, {
      hitLineY: 1000,
      pixelsPerSecond: 100,
    });
    // Expect beats at: 0, 0.5, 1, 1.5 (4/4) + 2, 3 (2/4) = 6 lines.
    expect(lines.length).toBe(6);
    // The beat at t=3 is mid-measure for 2/4, so not a downbeat.
    const atT3 = lines.find((l) => Math.abs(l.y - (1000 - 3 * 100)) < 1e-6);
    expect(atT3!.downbeat).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/falldown/beatGrid.test.ts`
Expected: FAIL — type errors on the `beatGridLines(measures, SIGS_44, ...)` call.

- [ ] **Step 3: Update the implementation**

Replace the entire contents of `src/falldown/beatGrid.ts` with:

```ts
import { metronomeBeats } from "../audio/beats";
import type { Measure, TimeSignature } from "../model/score";

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
 * Y positions of every beat line visible in the falldown at clock time `t`,
 * derived from the score's measures and segment-aware time signatures so
 * downbeats land exactly on the actual barlines. A beat at time `b` sits at
 * `y = hitLineY - (b - t) * pixelsPerSecond`; lines outside `[0, hitLineY]`
 * are dropped. A line is a `downbeat` when it is a measure start.
 */
export function beatGridLines(
  measures: Measure[],
  timeSignatures: TimeSignature[],
  t: number,
  config: BeatGridConfig,
): BeatLine[] {
  const beats = metronomeBeats(measures, timeSignatures, 1);
  const lines: BeatLine[] = [];
  for (const beat of beats) {
    const y = config.hitLineY - (beat.time - t) * config.pixelsPerSecond;
    if (y < 0 || y > config.hitLineY) continue;
    lines.push({ y, downbeat: beat.accent });
  }
  return lines;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/falldown/beatGrid.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/falldown/beatGrid.ts src/falldown/beatGrid.test.ts
git commit -m "feat(falldown): beatGridLines takes TimeSignature[]

Visual beat-grid density follows the segment active at each measure."
```

---

### Task 4: Metronome stores segments, position-aware getter, manual override

**Files:**
- Modify: `src/audio/metronome.ts`
- Modify: `src/audio/metronome.test.ts`

- [ ] **Step 1: Add failing tests for the new behaviors**

Append these tests to `src/audio/metronome.test.ts` *inside* the `describe("Metronome", …)` block (just before the closing `});` on the last line). Keep all existing tests.

```ts
  it("follows mid-piece time-signature changes when clicking", () => {
    // Four 2-second measures: 4/4 for measures 0-1, 6/4 starting at t=4.
    const multiSig = {
      ...score,
      measures: [
        { index: 0, start: 0, end: 2, numerator: 4, denominator: 4 },
        { index: 1, start: 2, end: 4, numerator: 4, denominator: 4 },
        { index: 2, start: 4, end: 6, numerator: 6, denominator: 4 },
        { index: 3, start: 6, end: 8, numerator: 6, denominator: 4 },
      ],
      timeSignatures: [
        { start: 0, numerator: 4, denominator: 4 },
        { start: 4, numerator: 6, denominator: 4 },
      ],
      durationSeconds: 8,
    } satisfies Score;
    const m = new Metronome(multiSig);
    m.enabled = true;
    const times: number[] = [];
    m.onClick((time) => times.push(time));
    m.update(-0.01, 8);
    // First two measures (4/4): 8 beats every 0.5 s -> 0..3.5.
    // Last two measures (6/4): 12 beats every 2/6 ≈ 0.333 s over [4,8].
    expect(times.length).toBe(8 + 12);
    expect(times.slice(0, 8)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
    expect(times[8]).toBeCloseTo(4, 6);
    expect(times[9]).toBeCloseTo(4 + 2 / 6, 6);
  });

  it("timeSignature getter is position-aware", () => {
    const multiSig = {
      ...score,
      measures: [
        { index: 0, start: 0, end: 2, numerator: 4, denominator: 4 },
        { index: 1, start: 2, end: 4, numerator: 6, denominator: 4 },
      ],
      timeSignatures: [
        { start: 0, numerator: 4, denominator: 4 },
        { start: 2, numerator: 6, denominator: 4 },
      ],
      durationSeconds: 4,
    } satisfies Score;
    const m = new Metronome(multiSig);
    m.update(0, 0); // position = 0
    expect(m.timeSignature).toEqual({ numerator: 4, denominator: 4 });
    m.update(0, 3); // position = 3, inside the 6/4 segment
    expect(m.timeSignature).toEqual({ numerator: 6, denominator: 4 });
  });

  it("setTimeSignature collapses a multi-segment score to a single segment", () => {
    const multiSig = {
      ...score,
      measures: [
        { index: 0, start: 0, end: 2, numerator: 4, denominator: 4 },
        { index: 1, start: 2, end: 4, numerator: 6, denominator: 4 },
      ],
      timeSignatures: [
        { start: 0, numerator: 4, denominator: 4 },
        { start: 2, numerator: 6, denominator: 4 },
      ],
      durationSeconds: 4,
    } satisfies Score;
    const m = new Metronome(multiSig);
    m.setTimeSignature(3, 4);
    // The previously-6/4 segment now reports 3/4 (single sig everywhere).
    m.update(0, 3);
    expect(m.timeSignature).toEqual({ numerator: 3, denominator: 4 });
    m.update(0, 0);
    expect(m.timeSignature).toEqual({ numerator: 3, denominator: 4 });
  });

  it("setScore preserves a manual override", () => {
    const m = new Metronome(score); // score is 4/4 throughout
    m.setTimeSignature(3, 4); // manual override active
    const swapped = {
      ...score,
      timeSignatures: [{ start: 0, numerator: 6, denominator: 8 }],
    } satisfies Score;
    m.setScore(swapped);
    // The 6/8 from the new score is ignored — manual override wins.
    m.update(0, 0);
    expect(m.timeSignature).toEqual({ numerator: 3, denominator: 4 });
  });

  it("setScore without an active override adopts the new score's segments", () => {
    const m = new Metronome(score); // 4/4 throughout, no override
    const swapped = {
      ...score,
      timeSignatures: [{ start: 0, numerator: 6, denominator: 8 }],
    } satisfies Score;
    m.setScore(swapped);
    m.update(0, 0);
    expect(m.timeSignature).toEqual({ numerator: 6, denominator: 8 });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/audio/metronome.test.ts`
Expected: FAIL — at least the multi-segment click test fails (current metronome uses `timeSignatures[0]` only).

- [ ] **Step 3: Update the metronome implementation**

Replace the entire contents of `src/audio/metronome.ts` with:

```ts
import { metronomeBeats, type MetronomeBeat } from "./beats";
import { timeSignatureAt } from "./timeSignatureAt";
import type { Measure, Score, TimeSignature } from "../model/score";

/** A metronome click listener: receives the beat time and whether it's accented. */
export type ClickListener = (time: number, accent: boolean) => void;

/** Linear pulse decay time (seconds) after a beat. */
const PULSE_DECAY = 0.15;

const DEFAULT_SIG: TimeSignature = {
  start: 0,
  numerator: 4,
  denominator: 4,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Tracks which metronome beats have been crossed as the clock advances. Drives
 * clicks via registered listeners and exposes a 0-1 `pulse` for a visual cue.
 * The beat grid is phase-locked to `score.measures`; each measure uses the
 * time signature active at its start (via `score.timeSignatures`), so mid-piece
 * time-signature changes shift the click pattern at the right barline.
 * Pure logic — the actual click sound is wired by the AudioEngine.
 */
export class Metronome {
  /** Whether the metronome fires clicks. */
  enabled = false;

  /**
   * Whether the first beat of a measure reports `accent: true` (a distinct
   * downbeat sound). OFF by default — all clicks sound the same.
   */
  accentDownbeat = false;

  /** Free-run mode — see updateFree. */
  freeRun = false;

  private measures: Measure[];
  /** The active time-signature segments. When `manualOverride` is true, this
   *  is a single-entry array of the user's chosen signature. */
  private segments: TimeSignature[];
  /** True once the user has called `setTimeSignature`; `setScore` then keeps
   *  the override instead of adopting the new score's segments. */
  private manualOverride = false;
  private subdivisionValue: number;
  private beats: MetronomeBeat[] = [];
  private readonly listeners = new Set<ClickListener>();
  private curPosition = 0;
  private lastBeatTime: number | null = null;
  /** Largest beat time already fired; prevents double-counting at boundaries. */
  private lastFiredTime = -Infinity;
  /** Wall-clock ms of the next free-run beat; -1 means "not yet armed". */
  private nextFreeBeatMs = -1;

  constructor(score: Score) {
    this.measures = score.measures;
    this.segments = score.timeSignatures.length > 0
      ? score.timeSignatures
      : [DEFAULT_SIG];
    this.subdivisionValue = 1;
    this.recompute();
  }

  /** Beat subdivision: 1 = on the beat, 2 = eighths, 4 = sixteenths. */
  get subdivision(): number {
    return this.subdivisionValue;
  }

  set subdivision(value: number) {
    this.subdivisionValue = Math.max(1, Math.floor(value));
    this.recompute();
  }

  /** The time signature at the current clock position. */
  get timeSignature(): { numerator: number; denominator: number } {
    const sig = timeSignatureAt(this.segments, this.curPosition);
    return { numerator: sig.numerator, denominator: sig.denominator };
  }

  /**
   * Override the score's time signatures with a single user-chosen value for
   * the whole piece. Survives `setScore` (e.g. tempo-mode toggle) until a
   * fresh `Metronome` is constructed for a different piece.
   */
  setTimeSignature(numerator: number, denominator: number): void {
    this.segments = [{ start: 0, numerator, denominator }];
    this.manualOverride = true;
    this.recompute();
    this.resync();
  }

  /**
   * Swap to a new score and re-grid. A tempo-mode toggle replaces the
   * transport's score with one whose measures sit at different second-times;
   * without this the metronome would keep clicking at the old measure times.
   * Adopts the new score's `timeSignatures` unless the user has set a manual
   * override, in which case the override is preserved.
   */
  setScore(score: Score): void {
    this.measures = score.measures;
    if (!this.manualOverride) {
      this.segments = score.timeSignatures.length > 0
        ? score.timeSignatures
        : [DEFAULT_SIG];
    }
    this.recompute();
  }

  /** Recompute the cached beat grid for the current settings. */
  private recompute(): void {
    this.beats = metronomeBeats(
      this.measures,
      this.segments,
      this.subdivisionValue,
    );
  }

  /**
   * Advance the clock from `prevPosition` to `curPosition`. Fires a click for
   * each beat crossed (when enabled) and updates the pulse state. While
   * `freeRun` is on, the score-locked grid is silenced; the caller drives
   * `updateFree` instead.
   */
  update(prevPosition: number, curPosition: number): void {
    if (this.freeRun) return;
    if (this.enabled && curPosition >= prevPosition) {
      const crossed = this.beats
        .filter(
          (b) =>
            b.time >= prevPosition &&
            b.time <= curPosition &&
            b.time > this.lastFiredTime,
        )
        .sort((a, b) => a.time - b.time);
      for (const beat of crossed) {
        const accent = beat.accent && this.accentDownbeat;
        for (const listener of this.listeners) listener(beat.time, accent);
        this.lastFiredTime = beat.time;
      }
    }

    this.curPosition = curPosition;
    let last: number | null = null;
    for (const beat of this.beats) {
      if (
        beat.mainBeat &&
        beat.time <= curPosition &&
        (last === null || beat.time > last)
      ) {
        last = beat.time;
      }
    }
    if (last !== null) this.lastBeatTime = last;
  }

  /** A 0-1 visual pulse: 1 right after a beat, decaying linearly over 150 ms. */
  get pulse(): number {
    if (this.lastBeatTime === null) return 0;
    const elapsed = this.curPosition - this.lastBeatTime;
    return 1 - clamp(elapsed / PULSE_DECAY, 0, 1);
  }

  /**
   * Reset the high-water mark so beats can fire again after a loop wrap or
   * seek. Leaves `lastBeatTime` alone so the visual pulse keeps working.
   */
  resync(): void {
    this.lastFiredTime = -Infinity;
  }

  /**
   * Free-run tick: fire one click per `60000/bpm` ms of wall-clock time, no
   * matter where the score's clock is parked. See file header for usage.
   */
  updateFree(bpm: number, nowMs: number): void {
    if (!this.enabled || !this.freeRun) return;
    const interval = 60000 / Math.max(1, bpm);
    if (this.nextFreeBeatMs < 0) {
      this.fireFreeBeat(nowMs);
      this.nextFreeBeatMs = nowMs + interval;
      return;
    }
    while (nowMs >= this.nextFreeBeatMs) {
      this.fireFreeBeat(this.nextFreeBeatMs);
      this.nextFreeBeatMs += interval;
    }
    this.curPosition = nowMs / 1000;
  }

  /** Re-arm the free-run grid (e.g. when toggling freeRun off and back on). */
  resetFreeRun(): void {
    this.nextFreeBeatMs = -1;
  }

  private fireFreeBeat(atMs: number): void {
    const atSec = atMs / 1000;
    this.lastBeatTime = atSec;
    this.curPosition = atSec;
    for (const listener of this.listeners) listener(atSec, false);
  }

  /** Register a click listener; returns an unsubscribe function. */
  onClick(fn: ClickListener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/audio/metronome.test.ts`
Expected: PASS — all original tests plus the 5 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/audio/metronome.ts src/audio/metronome.test.ts
git commit -m "feat(metronome): segment-aware grid + manual override semantics

- Store TimeSignature[] segments instead of single beatsPerBar.
- timeSignature getter is position-aware.
- setTimeSignature collapses to one sig and sets manualOverride.
- setScore preserves manualOverride; otherwise adopts the new score's
  segments (e.g. tempo-mode swaps)."
```

---

### Task 5: Falldown renderer adopts segment-aware time signatures

**Files:**
- Modify: `src/falldown/renderer.ts`
- Modify: `src/falldown/renderer.test.ts`
- Modify: `src/app/PracticeView.tsx`

- [ ] **Step 1: Inspect the renderer field used by callers**

Run: `grep -rn "beatMeter" src --include="*.ts" --include="*.tsx"`
Expected: matches in `src/falldown/renderer.ts` (the field + 3 usages) and `src/app/PracticeView.tsx:270-273`.

- [ ] **Step 2: Update the renderer implementation**

In `src/falldown/renderer.ts`:

Replace the field declaration. Find:

```ts
  beatMeter: { numerator: number; denominator: number };
```

Replace with:

```ts
  timeSignatures: TimeSignature[];
```

Add the import. Find the existing model import line (around the top of the file). It currently imports types from `"../model/score"`; extend it to include `TimeSignature`:

```ts
import type { /* existing imports */, TimeSignature } from "../model/score";
```

(If the file uses a separate import for score types, extend that one instead. Don't introduce a duplicate import.)

Replace the constructor initialization. Find:

```ts
    const ts = transport.score.timeSignatures[0];
    this.beatMeter = {
      numerator: ts?.numerator ?? 4,
      denominator: ts?.denominator ?? 4,
    };
```

Replace with:

```ts
    this.timeSignatures = transport.score.timeSignatures.length > 0
      ? transport.score.timeSignatures
      : [{ start: 0, numerator: 4, denominator: 4 }];
```

Replace the `beatPulse` call. Find:

```ts
        ? beatPulse(
            this.transport.score.measures,
            this.beatMeter.numerator,
            t,
            BEAT_PULSE_DECAY,
          )
```

Replace with:

```ts
        ? beatPulse(
            this.transport.score.measures,
            this.timeSignatures,
            t,
            BEAT_PULSE_DECAY,
          )
```

Replace the `beatGridLines` call. Find:

```ts
    const lines = beatGridLines(
      this.transport.score.measures,
      this.beatMeter.numerator,
      t,
      {
```

Replace with:

```ts
    const lines = beatGridLines(
      this.transport.score.measures,
      this.timeSignatures,
      t,
      {
```

- [ ] **Step 3: Update the PracticeView saved-state restore**

In `src/app/PracticeView.tsx`, around lines 268-274, find:

```ts
          if (renderer) {
            renderer.beatMeter = {
              numerator: state.numerator,
              denominator: state.denominator,
            };
          }
```

Replace with:

```ts
          if (renderer) {
            renderer.timeSignatures = [
              {
                start: 0,
                numerator: state.numerator,
                denominator: state.denominator,
              },
            ];
          }
```

- [ ] **Step 4: Run renderer & PracticeView tests to verify**

Run: `npx vitest run src/falldown/renderer.test.ts src/app/PracticeView.test.tsx`
Expected: PASS — the existing tests don't touch `beatMeter` directly (PracticeView's test stubs `setTimeSignature` only).

- [ ] **Step 5: Add a multi-segment renderer test**

In `src/falldown/renderer.test.ts`, find the describe block and add a test that constructs the renderer with a multi-segment score and asserts `timeSignatures` is initialized to the full array. Append after the last existing test (inside the closing `});`):

```ts
  it("initializes timeSignatures from the full score.timeSignatures array", () => {
    const multiSig = {
      ...score,
      timeSignatures: [
        { start: 0, numerator: 4, denominator: 4 },
        { start: 8, numerator: 6, denominator: 4 },
      ],
    };
    const transport = makeTransport(multiSig);
    const renderer = new FalldownRenderer(ctx, transport, {
      width: 800,
      height: 600,
    });
    expect(renderer.timeSignatures).toEqual([
      { start: 0, numerator: 4, denominator: 4 },
      { start: 8, numerator: 6, denominator: 4 },
    ]);
  });
```

Note: the names `score`, `makeTransport`, `ctx`, and `FalldownRenderer` should already exist in the file — match what's there. If `makeTransport` doesn't exist, construct a minimal `Transport` the way the existing tests do; if no test in the file builds a renderer, skip Step 5 and rely on the type checker + manual checklist to validate the renderer change.

- [ ] **Step 6: Run all touched tests**

Run: `npx vitest run src/falldown src/app/PracticeView.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/falldown/renderer.ts src/falldown/renderer.test.ts src/app/PracticeView.tsx
git commit -m "feat(falldown): renderer stores segment-aware time signatures

- Replace beatMeter with timeSignatures: TimeSignature[].
- PracticeView restore writes a single-segment array for saved overrides."
```

---

### Task 6: MIDI→MusicXML emits every time-signature change

**Files:**
- Modify: `src/import/midi/midiToMusicXml.ts`
- Modify: `src/import/midi/midiToMusicXml.test.ts`

- [ ] **Step 1: Add a failing test for the multi-segment emission**

Append to `src/import/midi/midiToMusicXml.test.ts` (inside the `describe("midiToMusicXml", …)` block, before its closing `});`):

```ts
  it("emits a new <time> element at every time-signature change", () => {
    // Build a small fixture Score directly (avoids needing a custom MIDI file).
    const fixtureScore = {
      source: "midi" as const,
      notes: [],
      measures: [
        { index: 0, start: 0, end: 2, numerator: 4, denominator: 4 },
        { index: 1, start: 2, end: 4, numerator: 4, denominator: 4 },
        { index: 2, start: 4, end: 7, numerator: 6, denominator: 4 },
        { index: 3, start: 7, end: 10, numerator: 6, denominator: 4 },
      ],
      pedalEvents: [],
      timeSignatures: [
        { start: 0, numerator: 4, denominator: 4 },
        { start: 4, numerator: 6, denominator: 4 },
      ],
      tempoMap: [{ start: 0, bpm: 120 }],
      durationSeconds: 10,
      musicXml: "",
      qualityWarning: null,
    };
    const xml = midiToMusicXml(fixtureScore);
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const times = Array.from(doc.querySelectorAll("time"));
    expect(times.length).toBe(2);
    // First time element: 4/4 in measure 1.
    expect(times[0].querySelector("beats")?.textContent).toBe("4");
    expect(times[0].querySelector("beat-type")?.textContent).toBe("4");
    // Second time element: 6/4, attached to measure 3 (the first 6/4 measure).
    expect(times[1].querySelector("beats")?.textContent).toBe("6");
    expect(times[1].querySelector("beat-type")?.textContent).toBe("4");
    const measure3 = doc.querySelector('measure[number="3"]');
    expect(measure3?.querySelector("time")).not.toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/import/midi/midiToMusicXml.test.ts`
Expected: FAIL — only one `<time>` element in the output today.

- [ ] **Step 3: Update the exporter**

In `src/import/midi/midiToMusicXml.ts`:

Add the helper import at the top (near the existing `Score` import):

```ts
import { timeSignatureAt } from "../../audio/timeSignatureAt";
import type { TimeSignature } from "../../model/score";
```

(Combine with the existing `../../model/score` import if it already exists; don't duplicate.)

Replace the body of `midiToMusicXml` (starting at the `const timeSig = …` line) with the segment-aware version. Find:

```ts
export function midiToMusicXml(score: Score): string {
  const bpm = score.tempoMap[0]?.bpm ?? 120;
  const timeSig = score.timeSignatures[0] ?? {
    start: 0,
    numerator: 4,
    denominator: 4,
  };

  const firstMeasureAttributes =
    `<attributes>` +
    `<divisions>${DIVISIONS}</divisions>` +
    `<key><fifths>0</fifths></key>` +
    `<time><beats>${timeSig.numerator}</beats>` +
    `<beat-type>${timeSig.denominator}</beat-type></time>` +
    `<staves>2</staves>` +
    `<clef number="1"><sign>G</sign><line>2</line></clef>` +
    `<clef number="2"><sign>F</sign><line>4</line></clef>` +
    `</attributes>`;

  let measuresXml = "";
  score.measures.forEach((measure, i) => {
    measuresXml += buildMeasureXml(
      measure,
      bpm,
      score.notes,
      i === 0 ? firstMeasureAttributes : "",
    );
  });

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<score-partwise version="4.0">` +
    `<part-list>` +
    `<score-part id="P1"><part-name>Piano</part-name></score-part>` +
    `</part-list>` +
    `<part id="P1">${measuresXml}</part>` +
    `</score-partwise>`
  );
}
```

Replace with:

```ts
export function midiToMusicXml(score: Score): string {
  const bpm = score.tempoMap[0]?.bpm ?? 120;
  const firstSig = timeSignatureAt(score.timeSignatures, 0);

  const firstMeasureAttributes =
    `<attributes>` +
    `<divisions>${DIVISIONS}</divisions>` +
    `<key><fifths>0</fifths></key>` +
    `<time><beats>${firstSig.numerator}</beats>` +
    `<beat-type>${firstSig.denominator}</beat-type></time>` +
    `<staves>2</staves>` +
    `<clef number="1"><sign>G</sign><line>2</line></clef>` +
    `<clef number="2"><sign>F</sign><line>4</line></clef>` +
    `</attributes>`;

  let measuresXml = "";
  let activeSig: TimeSignature = firstSig;
  score.measures.forEach((measure, i) => {
    let attrs = "";
    if (i === 0) {
      attrs = firstMeasureAttributes;
    } else {
      const sig = timeSignatureAt(score.timeSignatures, measure.start);
      if (
        sig.numerator !== activeSig.numerator ||
        sig.denominator !== activeSig.denominator
      ) {
        attrs =
          `<attributes>` +
          `<time><beats>${sig.numerator}</beats>` +
          `<beat-type>${sig.denominator}</beat-type></time>` +
          `</attributes>`;
        activeSig = sig;
      }
    }
    measuresXml += buildMeasureXml(measure, bpm, score.notes, attrs);
  });

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<score-partwise version="4.0">` +
    `<part-list>` +
    `<score-part id="P1"><part-name>Piano</part-name></score-part>` +
    `</part-list>` +
    `<part id="P1">${measuresXml}</part>` +
    `</score-partwise>`
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/import/midi/midiToMusicXml.test.ts`
Expected: PASS — original tests plus the new multi-segment test.

- [ ] **Step 5: Commit**

```bash
git add src/import/midi/midiToMusicXml.ts src/import/midi/midiToMusicXml.test.ts
git commit -m "feat(import): MIDI->MusicXML emits every time-signature change

A slim <attributes><time>...</time></attributes> block is injected at
the start of any measure where the active signature differs from the
previous one."
```

---

### Task 7: Documentation updates

**Files:**
- Modify: `HANDOVER.md`
- Modify: `docs/features/D-audio-metronome.md`
- Modify: `docs/features/E-falldown-view.md`
- Modify: `docs/features/B-import-score-model.md`

- [ ] **Step 1: Remove the known-issue bullet from `HANDOVER.md`**

Find this bullet (around line 372) and delete it entirely (the whole bullet, all 13 lines through "mean in pieces with multiple sigs).":

```markdown
- **Mid-piece time-signature changes not followed at runtime.** Both parsers
  (MusicXML and MIDI) correctly capture every `<time>` / time-sig meta event
  into `score.timeSignatures: TimeSignature[]` with `start` times, so the data
  is there. But the metronome (`src/audio/metronome.ts`) reads only
  `score.timeSignatures[0]` and precomputes the beat grid with a single
  `beatsPerBar` for the whole piece — clicks keep firing at the opening time
  signature even after the score has shifted. The TopBarReadout's time-sig
  chip and the MIDI→MusicXML conversion (`midiToMusicXml.ts:230`) have the
  same first-only limitation. Example: Chopin's Ballade in G minor (4/4 → 6/4
  partway through) clicks at 4/4 throughout. Fix is its own feature (compute
  the grid per time-sig segment + position-driven chip + emit all `<time>`
  elements at MIDI→MusicXML; needs a UX call on what manual time-sig edits
  mean in pieces with multiple sigs).
```

- [ ] **Step 2: Append a dated bullet to `docs/features/D-audio-metronome.md`**

Find the `## Changes log` section and add (with today's date):

```markdown
- **2026-05-24** — Metronome follows mid-piece time-signature changes. Stores `segments: TimeSignature[]` instead of a single `beatsPerBar`; the click grid uses `timeSignatureAt(segments, measure.start)` per measure. `timeSignature` getter is position-aware. `setTimeSignature(num, den)` collapses to a single segment for the whole piece and sets `manualOverride`; `setScore` preserves the override (e.g. across a tempo-mode swap) and otherwise adopts the new score's segments.
```

- [ ] **Step 3: Append a dated bullet to `docs/features/E-falldown-view.md`**

Find the `## Changes log` section and add:

```markdown
- **2026-05-24** — Visual beat grid and hit-line pulse follow mid-piece time-signature changes. `FalldownRenderer.timeSignatures: TimeSignature[]` replaces `beatMeter`; `beatGridLines` and `beatPulse` look up the active signature per measure. Saved per-piece overrides in `PracticeView` write a single-segment array.
```

- [ ] **Step 4: Append a dated bullet to `docs/features/B-import-score-model.md`**

Find the `## Changes log` section and add:

```markdown
- **2026-05-24** — `midiToMusicXml` emits a slim `<attributes><time>…</time></attributes>` block at every measure whose active time signature differs from the previous one (was: first segment only).
```

- [ ] **Step 5: Commit**

```bash
git add HANDOVER.md docs/features/D-audio-metronome.md docs/features/E-falldown-view.md docs/features/B-import-score-model.md
git commit -m "docs: log mid-piece time-signature support across the affected features"
```

---

### Task 8: Run the verify gate

**Files:** none modified — this is the final gate before claiming done.

- [ ] **Step 1: Run lint + typecheck + test + build + e2e**

Run: `npm run lint && npm run typecheck && npm test && npm run build && npm run e2e`
Expected: all pass with zero errors.

- [ ] **Step 2: Manual checklist (when a multi-sig fixture is available)**

Open a piece with a mid-piece time-signature change (e.g. Chopin Ballade in G minor):
- Enable the metronome.
- Scrub past the 4/4 → 6/4 boundary.
- Verify: click pattern shifts to 6 beats per bar.
- Verify: falldown beat lines change density at the boundary.
- Verify: TopBarReadout chip flips from `4/4` to `6/4`.

If no multi-sig fixture is available locally, document that the manual check is deferred and rely on the multi-segment unit tests for now.

- [ ] **Step 3: (No commit — the verify gate produces no file changes.)**

---

## Self-review (already done; for the executor's reference)

- **Spec coverage:**
  - "Metronome clicks follow segment changes" → Task 4.
  - "Falldown visual beat grid + pulse follow segments" → Tasks 3, 5.
  - "Top-bar chip is position-aware" → Task 4 (the getter), no code change in `TopBarReadout` because it already reads through the getter.
  - "MIDI→MusicXML emits every change" → Task 6.
  - "Manual override = single sig for whole piece, survives setScore" → Task 4 (`setTimeSignature` + `setScore`).
  - "New `timeSignatureAt` helper" → Task 1.
  - "Doc updates (HANDOVER + feature docs)" → Task 7.
  - "Verify gate" → Task 8.
- **No placeholders:** every code step shows the exact code; every test step asserts concrete expectations.
- **Type consistency:** `segments: TimeSignature[]`, `manualOverride: boolean`, `timeSignatureAt(sigs, time): TimeSignature`, and `MetronomeBeat` shape are consistent across tasks.
