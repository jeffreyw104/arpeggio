# Feature C — Transport & Playback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the single master clock and the playback logic on top of it — play/pause/seek, absolute-BPM tempo, A-B looping (including a single-beat loop), gradual speed-up, and the preserve/flatten tempo-map toggle.

**Architecture:** One `Clock` object holds the canonical playback position (the one "where are we now"). It is a pure, frame-driven object: a render loop calls `clock.tick(elapsedSeconds)` each frame; everything else only reads from it. Loop wrapping, end-of-piece stop, and rate are all clock operations. `loop.ts`, `speedUp.ts`, and `tempoMap.ts` are pure helper modules. `Transport` composes them into the public playback API. No audio, no rendering — Feature D wires audio to this clock; D/E/F render from it.

**Tech Stack:** Pure TypeScript, Vitest. No Tone.js yet (the clock is deliberately a plain object so it is fully unit-testable; Feature D drives it from a real time source).

**Branch:** `feature/c-transport-playback`

---

## Notes for the implementer

- Repo root and working directory: `/Users/jeffreywan/Desktop/arpeggio`. Run all commands from there.
- Work on branch `feature/c-transport-playback` (the controller creates it before Task 1).
- Features A and B are merged into `main`. `npm test` (31 tests), `npm run lint`, `npm run typecheck`, `npm run build` are all green.
- The `Score` model is `src/model/score.ts` — Feature C reads `Score`, `Measure`, `TempoEvent`, `Note`, `TimeSignature` from it. Read that file.
- `strict` TypeScript + `noUnusedLocals`/`noUnusedParameters` are on.
- All times are **seconds** of score time unless noted. "Score time" = position in the imported piece's timeline. "Real time" = wall-clock seconds. `rate` maps one to the other: `scoreΔ = realΔ * rate`.
- Commit after every task with the exact messages given.

---

## File / Folder Structure

```
src/transport/
  clock.ts         # the master Clock: position, play/pause/seek, rate, loop wrap
  loop.ts          # Loop builders: measure-range loop, single-beat loop
  speedUp.ts       # gradual speed-up controller
  tempoMap.ts      # seconds<->beats conversion, preserve/flatten tempo mode
  transport.ts     # Transport: composes the above into the public playback API
```

---

## Task 1: The master Clock

**Files:** Create `src/transport/clock.ts`, `src/transport/clock.test.ts`

The `Clock` is the single source of truth for playback position. It is advanced
by `tick(realElapsedSeconds)` (a render loop calls this each frame). It supports
play/pause, seek, a playback `rate`, an optional A-B loop, and change/loop
listeners.

- [ ] **Step 1: Write the failing test — `src/transport/clock.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { Clock } from "./clock";

describe("Clock", () => {
  it("starts paused at position 0", () => {
    const c = new Clock(10);
    expect(c.position).toBe(0);
    expect(c.playing).toBe(false);
    expect(c.rate).toBe(1);
  });

  it("does not advance while paused", () => {
    const c = new Clock(10);
    c.tick(1);
    expect(c.position).toBe(0);
  });

  it("advances by real elapsed time times rate while playing", () => {
    const c = new Clock(10);
    c.play();
    c.tick(1);
    expect(c.position).toBeCloseTo(1, 6);
    c.setRate(2);
    c.tick(1);
    expect(c.position).toBeCloseTo(3, 6);
  });

  it("seek clamps to [0, duration]", () => {
    const c = new Clock(10);
    c.seek(-5);
    expect(c.position).toBe(0);
    c.seek(99);
    expect(c.position).toBe(10);
  });

  it("stops at the end of the piece", () => {
    const c = new Clock(10);
    c.play();
    c.tick(99);
    expect(c.position).toBe(10);
    expect(c.playing).toBe(false);
  });

  it("wraps within an A-B loop and fires onLoop", () => {
    const c = new Clock(100);
    c.setLoop({ start: 2, end: 4 });
    c.seek(2);
    c.play();
    const looped = vi.fn();
    c.onLoop(looped);
    c.tick(2.5); // 2 -> 4.5, wraps: 4.5-4=0.5 past loop.start
    expect(c.position).toBeCloseTo(2.5, 6);
    expect(looped).toHaveBeenCalledTimes(1);
  });

  it("notifies change listeners and supports unsubscribe", () => {
    const c = new Clock(10);
    const fn = vi.fn();
    const off = c.onChange(fn);
    c.play();
    expect(fn).toHaveBeenCalled();
    off();
    const before = fn.mock.calls.length;
    c.pause();
    expect(fn.mock.calls.length).toBe(before);
  });
});
```

- [ ] **Step 2: Run it — confirm it fails**

Run: `npm test -- clock`
Expected: FAIL (`Clock` not defined).

- [ ] **Step 3: Implement `src/transport/clock.ts`**

```ts
/** An A-B loop region, in score-time seconds. */
export interface Loop {
  start: number;
  end: number;
}

/**
 * The single master playback clock. Holds the canonical position; a render loop
 * advances it via tick(). Everything else only reads from it.
 */
export class Clock {
  private _position = 0;
  private _playing = false;
  private _rate = 1;
  private _loop: Loop | null = null;
  private changeListeners = new Set<() => void>();
  private loopListeners = new Set<() => void>();

  constructor(public readonly duration: number) {}

  get position(): number {
    return this._position;
  }
  get playing(): boolean {
    return this._playing;
  }
  get rate(): number {
    return this._rate;
  }
  get loop(): Loop | null {
    return this._loop;
  }

  play(): void {
    if (this._playing) return;
    this._playing = true;
    this.emitChange();
  }

  pause(): void {
    if (!this._playing) return;
    this._playing = false;
    this.emitChange();
  }

  toggle(): void {
    this._playing ? this.pause() : this.play();
  }

  seek(seconds: number): void {
    this._position = Math.min(Math.max(seconds, 0), this.duration);
    this.emitChange();
  }

  setRate(rate: number): void {
    this._rate = Math.max(rate, 0.01);
    this.emitChange();
  }

  setLoop(loop: Loop | null): void {
    this._loop = loop;
    this.emitChange();
  }

  /**
   * Advance the clock by real elapsed seconds. No-op while paused. Applies rate,
   * wraps inside an active loop (firing onLoop), and stops at the piece end.
   */
  tick(realElapsedSeconds: number): void {
    if (!this._playing || realElapsedSeconds <= 0) return;
    let next = this._position + realElapsedSeconds * this._rate;

    const loop = this._loop;
    if (loop && loop.end > loop.start && next >= loop.end) {
      const span = loop.end - loop.start;
      next = loop.start + ((next - loop.start) % span);
      this._position = next;
      this.emitChange();
      this.loopListeners.forEach((fn) => fn());
      return;
    }

    if (next >= this.duration) {
      this._position = this.duration;
      this._playing = false;
      this.emitChange();
      return;
    }

    this._position = next;
    this.emitChange();
  }

  /** Subscribe to any state change. Returns an unsubscribe function. */
  onChange(fn: () => void): () => void {
    this.changeListeners.add(fn);
    return () => this.changeListeners.delete(fn);
  }

  /** Subscribe to loop-wrap events. Returns an unsubscribe function. */
  onLoop(fn: () => void): () => void {
    this.loopListeners.add(fn);
    return () => this.loopListeners.delete(fn);
  }

  private emitChange(): void {
    this.changeListeners.forEach((fn) => fn());
  }
}
```

- [ ] **Step 4: Run the tests — confirm they pass**

Run: `npm test -- clock`
Expected: PASS (7 tests).

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/transport/clock.ts src/transport/clock.test.ts
git commit -m "feat: add the master transport Clock"
```

---

## Task 2: A-B loop builders

**Files:** Create `src/transport/loop.ts`, `src/transport/loop.test.ts`

`loop.ts` builds `Loop` objects (`{start, end}` seconds) from musical positions:
a measure range, or a single beat. The `Clock` consumes these via `setLoop`.

- [ ] **Step 1: Write the failing test — `src/transport/loop.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { measureLoop, beatLoop, clampLoop } from "./loop";
import type { Score } from "../model/score";

// A minimal 2-measure 4/4 score at 120 BPM: each measure is 2 s, each beat 0.5 s.
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

describe("measureLoop", () => {
  it("spans the start of the first measure to the end of the last", () => {
    expect(measureLoop(score, 0, 1)).toEqual({ start: 0, end: 4 });
    expect(measureLoop(score, 1, 1)).toEqual({ start: 2, end: 4 });
  });

  it("orders a reversed measure range", () => {
    expect(measureLoop(score, 1, 0)).toEqual({ start: 0, end: 4 });
  });
});

describe("beatLoop", () => {
  it("returns the single beat containing the given position", () => {
    // position 1.2 s is inside beat 2 of measure 0: [1.0, 1.5)
    expect(beatLoop(score, 1.2)).toEqual({ start: 1.0, end: 1.5 });
  });

  it("works in the second measure", () => {
    // position 2.6 s -> beat starting at 2.5 s
    expect(beatLoop(score, 2.6)).toEqual({ start: 2.5, end: 3.0 });
  });
});

describe("clampLoop", () => {
  it("clamps to [0, duration] and keeps start < end", () => {
    expect(clampLoop({ start: -1, end: 99 }, 4)).toEqual({ start: 0, end: 4 });
  });
});
```

- [ ] **Step 2: Run it — confirm it fails**

Run: `npm test -- transport/loop`
Expected: FAIL (`measureLoop` not defined).

- [ ] **Step 3: Implement `src/transport/loop.ts`**

```ts
import type { Score } from "../model/score";
import type { Loop } from "./clock";

/** A-B loop spanning measures [firstIndex, lastIndex] inclusive (any order). */
export function measureLoop(
  score: Score,
  firstIndex: number,
  lastIndex: number,
): Loop {
  const lo = Math.min(firstIndex, lastIndex);
  const hi = Math.max(firstIndex, lastIndex);
  const first = score.measures[lo];
  const last = score.measures[hi];
  return { start: first.start, end: last.end };
}

/**
 * The single-beat loop containing `positionSeconds`. Beat length is derived from
 * the containing measure's time signature: a beat is one denominator-unit, i.e.
 * (60 / bpm) * (4 / denominator) seconds.
 */
export function beatLoop(score: Score, positionSeconds: number): Loop {
  const measure =
    score.measures.find(
      (m) => positionSeconds >= m.start && positionSeconds < m.end,
    ) ?? score.measures[score.measures.length - 1];
  const bpm = score.tempoMap[0]?.bpm ?? 120;
  const beatLen = (60 / bpm) * (4 / measure.denominator);
  const beatIndex = Math.floor((positionSeconds - measure.start) / beatLen);
  const start = measure.start + beatIndex * beatLen;
  return { start, end: start + beatLen };
}

/** Clamp a loop to [0, duration]; guarantee start < end. */
export function clampLoop(loop: Loop, duration: number): Loop {
  const start = Math.min(Math.max(loop.start, 0), duration);
  const end = Math.min(Math.max(loop.end, 0), duration);
  return start < end ? { start, end } : { start, end: duration };
}
```

- [ ] **Step 4: Run the tests — confirm they pass**

Run: `npm test -- transport/loop`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/transport/loop.ts src/transport/loop.test.ts
git commit -m "feat: add A-B and single-beat loop builders"
```

---

## Task 3: Gradual speed-up controller

**Files:** Create `src/transport/speedUp.ts`, `src/transport/speedUp.test.ts`

`SpeedUp` ramps the playback rate upward across loop passes: it starts slow and
increases a fixed step each completed pass until it reaches the target.

- [ ] **Step 1: Write the failing test — `src/transport/speedUp.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { SpeedUp } from "./speedUp";

describe("SpeedUp", () => {
  it("begins at the start rate", () => {
    const s = new SpeedUp({ startRate: 0.5, targetRate: 1, step: 0.1 });
    expect(s.rate).toBe(0.5);
    expect(s.done).toBe(false);
  });

  it("ramps by step on each advance, clamped at the target", () => {
    const s = new SpeedUp({ startRate: 0.5, targetRate: 1, step: 0.2 });
    s.advance(); // 0.7
    expect(s.rate).toBeCloseTo(0.7, 6);
    s.advance(); // 0.9
    s.advance(); // 1.0 (clamped, not 1.1)
    expect(s.rate).toBeCloseTo(1, 6);
    expect(s.done).toBe(true);
    s.advance(); // stays at target
    expect(s.rate).toBeCloseTo(1, 6);
  });

  it("reset returns to the start rate", () => {
    const s = new SpeedUp({ startRate: 0.6, targetRate: 1, step: 0.1 });
    s.advance();
    s.reset();
    expect(s.rate).toBe(0.6);
  });
});
```

- [ ] **Step 2: Run it — confirm it fails**

Run: `npm test -- speedUp`
Expected: FAIL.

- [ ] **Step 3: Implement `src/transport/speedUp.ts`**

```ts
/** Configures a gradual loop speed-up. Rates are clock playback-rate multipliers. */
export interface SpeedUpConfig {
  /** Rate for the first loop pass (e.g. 0.5 = half speed). */
  startRate: number;
  /** Rate to ramp up to (e.g. 1 = full speed). */
  targetRate: number;
  /** Increment added to the rate after each completed loop pass. */
  step: number;
}

/**
 * Ramps a playback rate from startRate to targetRate, one `step` per loop pass.
 * The owner calls advance() each time the clock completes a loop.
 */
export class SpeedUp {
  private _rate: number;

  constructor(private readonly config: SpeedUpConfig) {
    this._rate = config.startRate;
  }

  get rate(): number {
    return this._rate;
  }

  get done(): boolean {
    return this._rate >= this.config.targetRate;
  }

  /** Advance one loop pass: raise the rate by `step`, clamped to the target. */
  advance(): void {
    this._rate = Math.min(
      this._rate + this.config.step,
      this.config.targetRate,
    );
  }

  /** Restore the rate to the configured start. */
  reset(): void {
    this._rate = this.config.startRate;
  }
}
```

- [ ] **Step 4: Run the tests — confirm they pass**

Run: `npm test -- speedUp`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/transport/speedUp.ts src/transport/speedUp.test.ts
git commit -m "feat: add gradual speed-up controller"
```

---

## Task 4: Tempo-map conversions and preserve/flatten mode

**Files:** Create `src/transport/tempoMap.ts`, `src/transport/tempoMap.test.ts`

`tempoMap.ts` converts between score-time seconds and musical beats over a tempo
map, and implements the **preserve vs. flatten** toggle. "Preserve" keeps the
file's internal tempo changes; "flatten" re-times the piece onto one constant
tempo (the duration-weighted average BPM).

- [ ] **Step 1: Write the failing test — `src/transport/tempoMap.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import {
  secondsToBeats,
  beatsToSeconds,
  averageBpm,
  applyTempoMode,
} from "./tempoMap";
import type { Score } from "../model/score";

const constant = [{ start: 0, bpm: 120 }]; // 2 beats/sec

describe("secondsToBeats / beatsToSeconds", () => {
  it("convert at a constant tempo", () => {
    expect(secondsToBeats(constant, 3)).toBeCloseTo(6, 6);
    expect(beatsToSeconds(constant, 6)).toBeCloseTo(3, 6);
  });

  it("integrate across a tempo change", () => {
    // 120 BPM (2 beats/s) for [0,2)s, then 60 BPM (1 beat/s) from 2s.
    const map = [
      { start: 0, bpm: 120 },
      { start: 2, bpm: 60 },
    ];
    // 4 beats in the first 2 s, then 3 beats over the next 3 s = 7 beats @ 5 s
    expect(secondsToBeats(map, 5)).toBeCloseTo(7, 6);
    expect(beatsToSeconds(map, 7)).toBeCloseTo(5, 6);
  });
});

const variableScore = {
  source: "midi",
  notes: [
    { midi: 60, start: 0, duration: 1, velocity: 0.7, hand: "right" },
    { midi: 62, start: 2, duration: 1, velocity: 0.7, hand: "right" },
  ],
  measures: [{ index: 0, start: 0, end: 5, numerator: 4, denominator: 4 }],
  pedalEvents: [],
  timeSignatures: [{ start: 0, numerator: 4, denominator: 4 }],
  tempoMap: [
    { start: 0, bpm: 120 },
    { start: 2, bpm: 60 },
  ],
  durationSeconds: 5,
  musicXml: "",
  qualityWarning: null,
} satisfies Score;

describe("applyTempoMode", () => {
  it("preserve returns the score unchanged", () => {
    expect(applyTempoMode(variableScore, "preserve")).toEqual(variableScore);
  });

  it("flatten re-times notes onto a single constant tempo", () => {
    const flat = applyTempoMode(variableScore, "flatten");
    expect(flat.tempoMap).toHaveLength(1);
    // note 2 is at beat 4 (end of the 120-BPM section); under the flattened
    // constant tempo its start time changes but its beat position is preserved.
    const beatBefore = secondsToBeats(variableScore.tempoMap, 2);
    const beatAfter = secondsToBeats(flat.tempoMap, flat.notes[1].start);
    expect(beatAfter).toBeCloseTo(beatBefore, 6);
  });
});
```

- [ ] **Step 2: Run it — confirm it fails**

Run: `npm test -- tempoMap`
Expected: FAIL.

- [ ] **Step 3: Implement `src/transport/tempoMap.ts`**

Algorithm:

- `secondsToBeats(tempoMap, seconds)`: walk the sorted tempo segments. For each
  segment `[t_i, t_{i+1})` at `bpm_i`, beats accrue at `bpm_i / 60` per second.
  Sum whole segments before `seconds`, then add the partial segment.
- `beatsToSeconds(tempoMap, beats)`: the inverse — walk segments accumulating
  beats (`segmentBeats = (segmentSeconds) * bpm/60`); when the target beat count
  falls inside a segment, interpolate.
- `averageBpm(score)`: total beats over the piece (`secondsToBeats(tempoMap,
durationSeconds)`) divided by `durationSeconds`, times 60. Guard duration 0.
- `applyTempoMode(score, "preserve")`: return `score` unchanged (same reference
  is fine — the test uses `toEqual`).
- `applyTempoMode(score, "flatten")`: compute `avg = averageBpm(score)`. Build a
  flat tempo map `[{ start: 0, bpm: avg }]`. Re-time every time-valued field by
  converting through beats: `flatSeconds(t) = beatsToSeconds(flatMap,
secondsToBeats(score.tempoMap, t))`. Apply to each note's `start` (and recompute
  `duration` as `flatSeconds(start+duration) - flatSeconds(start)`), each
  measure's `start`/`end`, each pedal event's `start`/`end`, `durationSeconds`,
  and each time-signature's `start`. Return a NEW `Score` object (do not mutate
  the input). For a constant-tempo input, flatten is a near-identity.

Write the implementation with a small private helper for the segment walk shared
by `secondsToBeats`/`beatsToSeconds` if it reads cleanly.

- [ ] **Step 4: Run the tests — confirm they pass**

Run: `npm test -- tempoMap`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/transport/tempoMap.ts src/transport/tempoMap.test.ts
git commit -m "feat: add tempo-map conversion and preserve/flatten mode"
```

---

## Task 5: Transport — the public playback API

**Files:** Create `src/transport/transport.ts`, `src/transport/transport.test.ts`

`Transport` composes the Clock, loop builders, SpeedUp, and tempo mode into the
single object later features (audio, falldown, score view, UI) use. It owns the
score, exposes absolute-BPM tempo, and wires speed-up to the clock's loop event.

- [ ] **Step 1: Write the failing test — `src/transport/transport.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { Transport } from "./transport";
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

describe("Transport", () => {
  it("exposes a clock and the score's reference BPM", () => {
    const t = new Transport(score);
    expect(t.referenceBpm).toBeCloseTo(120, 0);
    expect(t.bpm).toBeCloseTo(120, 0);
    expect(t.clock.position).toBe(0);
  });

  it("setBpm scales the clock rate against the reference tempo", () => {
    const t = new Transport(score);
    t.setBpm(60); // half the reference 120
    expect(t.clock.rate).toBeCloseTo(0.5, 6);
    t.setBpm(180);
    expect(t.clock.rate).toBeCloseTo(1.5, 6);
  });

  it("loops a measure range via the clock", () => {
    const t = new Transport(score);
    t.loopMeasures(1, 1);
    expect(t.clock.loop).toEqual({ start: 2, end: 4 });
    t.clearLoop();
    expect(t.clock.loop).toBeNull();
  });

  it("applies gradual speed-up on each loop pass", () => {
    const t = new Transport(score);
    t.loopMeasures(0, 0); // loop [0,2]
    t.enableSpeedUp({ startRate: 0.5, targetRate: 1, step: 0.25 });
    expect(t.clock.rate).toBeCloseTo(0.5, 6); // start slow
    t.clock.seek(0);
    t.clock.play();
    t.clock.tick(5); // long tick -> crosses loop end at least once
    expect(t.clock.rate).toBeGreaterThan(0.5); // sped up after the pass
  });

  it("flatten mode swaps in a re-timed score", () => {
    const t = new Transport(score);
    t.setTempoMode("flatten");
    expect(t.tempoMode).toBe("flatten");
    // constant-tempo score: flattening keeps the duration
    expect(t.score.durationSeconds).toBeCloseTo(4, 3);
  });
});
```

- [ ] **Step 2: Run it — confirm it fails**

Run: `npm test -- transport/transport`
Expected: FAIL.

- [ ] **Step 3: Implement `src/transport/transport.ts`**

```ts
import type { Score } from "../model/score";
import { Clock } from "./clock";
import { measureLoop } from "./loop";
import { SpeedUp, type SpeedUpConfig } from "./speedUp";
import { applyTempoMode, averageBpm, type TempoMode } from "./tempoMap";

/**
 * The public playback API. Composes the master Clock with loop building,
 * absolute-BPM tempo, gradual speed-up, and the tempo-map mode. Later features
 * read `transport.clock` and `transport.score`.
 */
export class Transport {
  readonly clock: Clock;
  private _score: Score;
  private _baseScore: Score;
  private _tempoMode: TempoMode = "preserve";
  private _bpm: number;
  private _speedUp: SpeedUp | null = null;
  private offLoop: (() => void) | null = null;

  constructor(score: Score, tempoMode: TempoMode = "preserve") {
    this._baseScore = score;
    this._score = applyTempoMode(score, tempoMode);
    this._tempoMode = tempoMode;
    this.clock = new Clock(this._score.durationSeconds);
    this._bpm = this.referenceBpm;
  }

  get score(): Score {
    return this._score;
  }

  /** The piece's own average tempo — the 1.0-rate reference. */
  get referenceBpm(): number {
    return averageBpm(this._score);
  }

  /** The current absolute playback tempo in BPM. */
  get bpm(): number {
    return this._bpm;
  }

  get tempoMode(): TempoMode {
    return this._tempoMode;
  }

  /** Set the absolute playback tempo; translates to a clock rate. */
  setBpm(bpm: number): void {
    this._bpm = bpm;
    if (!this._speedUp) this.clock.setRate(bpm / this.referenceBpm);
  }

  /** Loop measures [first, last] inclusive. */
  loopMeasures(first: number, last: number): void {
    this.clock.setLoop(measureLoop(this._score, first, last));
  }

  clearLoop(): void {
    this.clock.setLoop(null);
  }

  /** Start ramping the clock rate up across loop passes. */
  enableSpeedUp(config: SpeedUpConfig): void {
    this._speedUp = new SpeedUp(config);
    this.clock.setRate(this._speedUp.rate);
    this.offLoop?.();
    this.offLoop = this.clock.onLoop(() => {
      this._speedUp?.advance();
      if (this._speedUp) this.clock.setRate(this._speedUp.rate);
    });
  }

  disableSpeedUp(): void {
    this._speedUp = null;
    this.offLoop?.();
    this.offLoop = null;
    this.clock.setRate(this._bpm / this.referenceBpm);
  }

  /** Switch preserve/flatten; rebuilds the score and resets the clock duration. */
  setTempoMode(mode: TempoMode): void {
    this._tempoMode = mode;
    this._score = applyTempoMode(this._baseScore, mode);
    const pos = this.clock.position;
    // Clock.duration is readonly — replace via a fresh clock would drop
    // listeners; instead, the score swap is observed by consumers. Keep the
    // existing clock and seek to clamp. (Duration change across modes is small.)
    this.clock.seek(Math.min(pos, this._score.durationSeconds));
  }
}
```

NOTE on `setTempoMode`: `Clock.duration` is `readonly`. For v1, tempo mode is
chosen before serious playback and constant-tempo pieces keep the same duration,
so keeping the same `Clock` is acceptable. If the implementer finds this too
limiting, an acceptable refinement is to make `Clock.duration` settable via a
`setDuration(d)` method — if you do that, add it to `clock.ts` with a test and
note it as a deviation. Do not block on it.

- [ ] **Step 4: Run the tests — confirm they pass**

Run: `npm test -- transport/transport`
Expected: PASS (5 tests).

- [ ] **Step 5: Full verification**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/transport/transport.ts src/transport/transport.test.ts
git commit -m "feat: add Transport composing clock, loop, speed-up, tempo mode"
```

---

## Feature C — Definition of Done

- A `Clock` advances on `tick()`, supports play/pause/seek, rate, A-B loop with
  wrap, end-of-piece stop, and change/loop listeners.
- `Transport` exposes absolute-BPM tempo, measure looping, single-beat looping
  (via `beatLoop`), gradual speed-up wired to loop passes, and preserve/flatten
  tempo mode.
- All unit tests pass; `npm run lint`, `npm run typecheck`, `npm test`,
  `npm run build` all green.
- `docs/features/C-transport-playback.md` updated: status Done, changes log and
  testing section filled.

## Manual-test checklist (for the feature doc)

- During Feature D/E integration: confirm playback position advances smoothly at
  a real frame rate and seeking is instant.
- Confirm a single-beat loop is audible/visible as a tight repeat once audio and
  falldown exist.
