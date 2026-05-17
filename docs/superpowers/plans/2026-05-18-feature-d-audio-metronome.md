# Feature D — Audio & Metronome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Play the imported piece's notes as a sampled piano synced to the master clock, and provide a metronome (audible click on/off, subdivisions, visual pulse).

**Architecture:** The hard, testable part is _scheduling_ — "given the clock advanced from A to B, which notes/clicks fire?" That logic is pure functions and pure classes, fully unit-tested with no audio. The Tone.js layer (a sampled piano, a click synth) is a thin sink the engine drives; it is created lazily via a dynamic `import("tone")` so test files never load an AudioContext. `AudioEngine` takes injectable `PianoSink`/`ClickSink` interfaces, so its wiring is tested with fakes; `createAudioEngine()` wires the real Tone.js sinks.

**Tech Stack:** TypeScript, `tone` (Tone.js — sampled piano + click), Vitest. Reads the `Transport`/`Clock` from Feature C and the `Score` from Feature B.

**Branch:** `feature/d-audio-metronome`

---

## Notes for the implementer

- Repo root and working directory: `/Users/jeffreywan/Desktop/arpeggio`. Run all commands from there.
- Work on branch `feature/d-audio-metronome` (the controller creates it before Task 1).
- Features A, B, C are merged into `main`. `npm test` (56 tests), lint, typecheck, build all green.
- Read `src/model/score.ts` (the `Score`/`Note` types) and `src/transport/transport.ts` + `src/transport/clock.ts` (the `Transport` and `Clock`).
- `strict` TypeScript + `noUnusedLocals`/`noUnusedParameters` on.
- **Do not** add a top-level `import ... from "tone"` to any file imported by a test. Tone.js needs an `AudioContext` jsdom lacks. The ONLY place Tone is referenced is inside `createAudioEngine()`, via `await import("tone")` (a dynamic import). The unit-tested `AudioEngine` class must not reference Tone at all.
- Commit after every task with the exact messages given.

---

## File / Folder Structure

```
src/audio/
  scheduler.ts     # pure: which notes/times fall in a clock advance window
  beats.ts         # pure: metronome click times across the piece
  metronome.ts     # Metronome: beat detection, on/off, subdivision, visual pulse
  engine.ts        # AudioEngine (testable, sink-injected) + createAudioEngine (Tone.js)
```

---

## Task 1: Scheduling window — `scheduler.ts`

**Files:** Create `src/audio/scheduler.ts`, `src/audio/scheduler.test.ts`; modify `package.json`/`package-lock.json` (add `tone`).

- [ ] **Step 1: Install Tone.js**

Run: `npm install tone`
Expected: `tone` added under `dependencies`.

- [ ] **Step 2: Write the failing test — `src/audio/scheduler.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { notesToTrigger, timesInWindow } from "./scheduler";
import type { Note } from "../model/score";

const notes: Note[] = [
  { midi: 60, start: 0.0, duration: 0.5, velocity: 0.7, hand: "right" },
  { midi: 62, start: 0.5, duration: 0.5, velocity: 0.7, hand: "right" },
  { midi: 64, start: 1.0, duration: 0.5, velocity: 0.7, hand: "right" },
];

describe("notesToTrigger", () => {
  it("returns notes whose start is in (prev, cur]", () => {
    expect(notesToTrigger(notes, 0.4, 0.6).map((n) => n.midi)).toEqual([62]);
  });

  it("includes a note starting exactly at cur, excludes one exactly at prev", () => {
    expect(notesToTrigger(notes, 0.0, 0.5).map((n) => n.midi)).toEqual([62]);
  });

  it("returns nothing when the clock does not advance", () => {
    expect(notesToTrigger(notes, 1.0, 1.0)).toEqual([]);
    expect(notesToTrigger(notes, 1.0, 0.5)).toEqual([]);
  });

  it("can return several notes in a wide window", () => {
    expect(notesToTrigger(notes, -0.1, 1.0).map((n) => n.midi)).toEqual([
      60, 62, 64,
    ]);
  });
});

describe("timesInWindow", () => {
  it("returns sorted times in (prev, cur]", () => {
    expect(timesInWindow([0, 0.5, 1, 1.5], 0.25, 1.0)).toEqual([0.5, 1]);
  });

  it("returns nothing when prev >= cur", () => {
    expect(timesInWindow([0, 1, 2], 2, 1)).toEqual([]);
  });
});
```

- [ ] **Step 3: Implement `src/audio/scheduler.ts`**

```ts
import type { Note } from "../model/score";

/**
 * Notes whose onset falls in the half-open window (prevPosition, curPosition].
 * Empty when the clock did not advance forward. The caller is responsible for
 * not passing a huge window after a seek (see AudioEngine's seek guard).
 */
export function notesToTrigger(
  notes: Note[],
  prevPosition: number,
  curPosition: number,
): Note[] {
  if (curPosition <= prevPosition) return [];
  return notes.filter((n) => n.start > prevPosition && n.start <= curPosition);
}

/** Sorted subset of `times` lying in the half-open window (prev, cur]. */
export function timesInWindow(
  times: number[],
  prevPosition: number,
  curPosition: number,
): number[] {
  if (curPosition <= prevPosition) return [];
  return times
    .filter((t) => t > prevPosition && t <= curPosition)
    .sort((a, b) => a - b);
}
```

- [ ] **Step 4: Run the tests — confirm they pass**

Run: `npm test -- audio/scheduler`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/audio/scheduler.ts src/audio/scheduler.test.ts package.json package-lock.json
git commit -m "feat: add note/time scheduling window helpers and Tone.js dep"
```

---

## Task 2: Metronome beat times — `beats.ts`

**Files:** Create `src/audio/beats.ts`, `src/audio/beats.test.ts`

`metronomeBeats` produces every click time across the piece for a given
subdivision. Beat length comes from each measure's time signature and the score
tempo: a beat is `(60 / bpm) * (4 / denominator)` seconds.

- [ ] **Step 1: Write the failing test — `src/audio/beats.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { metronomeBeats } from "./beats";
import type { Score } from "../model/score";

// 2 measures, 4/4, 120 BPM: each measure 2 s, each beat 0.5 s.
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

describe("metronomeBeats", () => {
  it("emits one click per beat at subdivision 1", () => {
    expect(metronomeBeats(score, 1)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
  });

  it("emits subdivided clicks at subdivision 2", () => {
    const beats = metronomeBeats(score, 2);
    expect(beats.length).toBe(16); // 8 beats x 2
    expect(beats.slice(0, 4)).toEqual([0, 0.25, 0.5, 0.75]);
  });

  it("clamps subdivision to at least 1", () => {
    expect(metronomeBeats(score, 0)).toEqual(metronomeBeats(score, 1));
  });
});
```

- [ ] **Step 2: Run it — confirm it fails**

Run: `npm test -- audio/beats`
Expected: FAIL.

- [ ] **Step 3: Implement `src/audio/beats.ts`**

Algorithm: `subdivision = Math.max(1, Math.floor(subdivision))`. `bpm =
score.tempoMap[0]?.bpm ?? 120`. For each measure: `beatLen = (60 / bpm) *
(4 / measure.denominator)`; for `beat` in `0..numerator-1` and `s` in
`0..subdivision-1`, push `measure.start + beat * beatLen + s * (beatLen /
subdivision)`. Return the flat array (already ascending). Use a tolerance-free
build — the test expects exact values for the 120-BPM 4/4 case.

```ts
import type { Score } from "../model/score";

/**
 * Every metronome click time (seconds) across the piece. `subdivision` divides
 * each beat: 1 = on the beat, 2 = eighths, 3 = triplets, 4 = sixteenths.
 */
export function metronomeBeats(score: Score, subdivision: number): number[] {
  const sub = Math.max(1, Math.floor(subdivision));
  const bpm = score.tempoMap[0]?.bpm ?? 120;
  const times: number[] = [];
  for (const m of score.measures) {
    const beatLen = (60 / bpm) * (4 / m.denominator);
    for (let beat = 0; beat < m.numerator; beat++) {
      for (let s = 0; s < sub; s++) {
        times.push(m.start + beat * beatLen + s * (beatLen / sub));
      }
    }
  }
  return times;
}
```

- [ ] **Step 4: Run the tests — confirm they pass**

Run: `npm test -- audio/beats`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/audio/beats.ts src/audio/beats.test.ts
git commit -m "feat: add metronome beat-time computation"
```

---

## Task 3: The Metronome — `metronome.ts`

**Files:** Create `src/audio/metronome.ts`, `src/audio/metronome.test.ts`

`Metronome` tracks which beats have been crossed as the clock advances, exposes
an on/off toggle and a subdivision setting, drives a click via a callback, and
exposes a 0-1 `pulse` value (1 right after a beat, decaying) for a visual pulse.

- [ ] **Step 1: Write the failing test — `src/audio/metronome.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { Metronome } from "./metronome";
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

describe("Metronome", () => {
  it("is disabled by default and fires no clicks", () => {
    const m = new Metronome(score);
    const click = vi.fn();
    m.onClick(click);
    expect(m.enabled).toBe(false);
    m.update(0, 1);
    expect(click).not.toHaveBeenCalled();
  });

  it("fires a click for each beat crossed while enabled", () => {
    const m = new Metronome(score);
    m.enabled = true;
    const click = vi.fn();
    m.onClick(click);
    m.update(0, 1.1); // beats at 0, 0.5, 1.0 fall in (0, 1.1]
    expect(click).toHaveBeenCalledTimes(3);
  });

  it("marks the first beat of a measure as accented", () => {
    const m = new Metronome(score);
    m.enabled = true;
    const accents: boolean[] = [];
    m.onClick((_time, accent) => accents.push(accent));
    m.update(-0.01, 0.6); // beats 0.0 (accent) and 0.5 (not)
    expect(accents).toEqual([true, false]);
  });

  it("respects the subdivision setting", () => {
    const m = new Metronome(score);
    m.enabled = true;
    m.subdivision = 2;
    const click = vi.fn();
    m.onClick(click);
    m.update(-0.01, 1.0); // 0,0.25,0.5,0.75,1.0 -> 5 clicks
    expect(click).toHaveBeenCalledTimes(5);
  });

  it("pulse is high right after a beat and lower later", () => {
    const m = new Metronome(score);
    m.enabled = true;
    m.update(-0.01, 0.0); // crosses the beat at 0
    const right = m.pulse;
    m.update(0.0, 0.3); // 0.3 s later, no beat until 0.5
    expect(m.pulse).toBeLessThan(right);
  });
});
```

- [ ] **Step 2: Run it — confirm it fails**

Run: `npm test -- audio/metronome`
Expected: FAIL.

- [ ] **Step 3: Implement `src/audio/metronome.ts`**

Design:

- Constructor `(score: Score)` — store the score; compute and cache the beat
  times for the current subdivision via `metronomeBeats`. Also cache, per beat
  time, whether it is a measure's first beat (an _accent_): a beat time equals a
  measure start (within a small epsilon, e.g. `1e-6`).
- `enabled: boolean` — public field, default `false`.
- `subdivision: number` — getter/setter; setting it (clamped `>= 1`) recomputes
  the cached beat times. Default 1.
- `update(prevPosition, curPosition): void` — if `enabled`, find beat times in
  `(prevPosition, curPosition]` via `timesInWindow` (from `scheduler.ts`); for
  each, call every `onClick` listener with `(time, accent)`. Always record
  `lastBeatTime` = the most recent beat time `<= curPosition` and store
  `curPosition` (needed for `pulse`), regardless of `enabled`.
- `get pulse(): number` — `1 - clamp((curPosition - lastBeatTime) / 0.15, 0, 1)`
  (a 150 ms linear decay). If no beat has been crossed yet, return 0.
- `onClick(fn: (time: number, accent: boolean) => void): () => void` — register
  a listener; return an unsubscribe function.

Recompute the accent set whenever beat times are (re)computed: a beat at time `t`
is accented if some `measure.start` is within `1e-6` of `t`.

- [ ] **Step 4: Run the tests — confirm they pass**

Run: `npm test -- audio/metronome`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/audio/metronome.ts src/audio/metronome.test.ts
git commit -m "feat: add metronome with subdivisions and visual pulse"
```

---

## Task 4: The AudioEngine — `engine.ts`

**Files:** Create `src/audio/engine.ts`, `src/audio/engine.test.ts`

`AudioEngine` wires the `Clock` to the note scheduler and the metronome, driving
two injectable sinks. `createAudioEngine()` builds the real Tone.js sinks.

- [ ] **Step 1: Write the failing test — `src/audio/engine.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { AudioEngine, type PianoSink, type ClickSink } from "./engine";
import { Transport } from "../transport/transport";
import type { Score } from "../model/score";

const score = {
  source: "midi",
  notes: [
    { midi: 60, start: 0.1, duration: 0.5, velocity: 0.7, hand: "right" },
    { midi: 64, start: 0.6, duration: 0.5, velocity: 0.8, hand: "left" },
  ],
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

function fakes() {
  const piano: PianoSink & { calls: number[] } = {
    calls: [],
    playNote(midi) {
      this.calls.push(midi);
    },
  };
  const click: ClickSink & { count: number } = {
    count: 0,
    playClick() {
      this.count++;
    },
  };
  return { piano, click };
}

describe("AudioEngine", () => {
  it("triggers piano notes as the clock advances past their onsets", () => {
    const t = new Transport(score);
    const { piano, click } = fakes();
    const engine = new AudioEngine(t, piano, click);
    t.clock.play();
    t.clock.tick(0.3); // 0 -> 0.3 : note at 0.1 fires
    engine.update();
    expect(piano.calls).toEqual([60]);
    t.clock.tick(0.5); // 0.3 -> 0.8 : note at 0.6 fires
    engine.update();
    expect(piano.calls).toEqual([60, 64]);
  });

  it("does not trigger a burst of notes after a large seek", () => {
    const t = new Transport(score);
    const { piano, click } = fakes();
    const engine = new AudioEngine(t, piano, click);
    t.clock.play();
    t.clock.seek(3.5); // jump past both notes
    engine.update();
    expect(piano.calls).toEqual([]); // seek is not playback
  });

  it("drives metronome clicks when the metronome is enabled", () => {
    const t = new Transport(score);
    const { piano, click } = fakes();
    const engine = new AudioEngine(t, piano, click);
    engine.metronome.enabled = true;
    t.clock.play();
    t.clock.tick(1.1); // beats at 0,0.5,1.0
    engine.update();
    expect(click.count).toBe(3);
  });

  it("plays a note sitting exactly at the playback start position", () => {
    // A note at time 0 must sound when playback starts from 0, even though
    // the trigger window (prev, cur] would otherwise exclude the boundary.
    const withStartNote = {
      ...score,
      notes: [
        { midi: 48, start: 0, duration: 0.5, velocity: 0.7, hand: "left" },
        ...score.notes,
      ],
    } satisfies Score;
    const t = new Transport(withStartNote);
    const { piano, click } = fakes();
    const engine = new AudioEngine(t, piano, click);
    t.clock.play();
    t.clock.tick(0.2); // 0 -> 0.2 : the note at 0 and the note at 0.1 both fire
    engine.update();
    expect(piano.calls.sort((a, b) => a - b)).toEqual([48, 60]);
  });
});
```

- [ ] **Step 2: Run it — confirm it fails**

Run: `npm test -- audio/engine`
Expected: FAIL.

- [ ] **Step 3: Implement `src/audio/engine.ts`**

```ts
import type { Transport } from "../transport/transport";
import { notesToTrigger } from "./scheduler";
import { Metronome } from "./metronome";

/** Plays piano notes. Real implementation uses a Tone.js sampler. */
export interface PianoSink {
  playNote(midi: number, durationSeconds: number, velocity: number): void;
}

/** Plays metronome clicks. Real implementation uses a Tone.js synth. */
export interface ClickSink {
  playClick(accent: boolean): void;
}

/** Largest clock advance (seconds) still treated as normal playback; a bigger
 *  jump is a seek and must not trigger every note in between. */
const SEEK_THRESHOLD = 0.5;

/**
 * Drives audio output from the transport clock. Call `update()` once per frame,
 * after the clock has been ticked. Pure wiring — the two sinks do the sound.
 */
export class AudioEngine {
  readonly metronome: Metronome;
  private prevPosition: number;
  private wasPlaying = false;

  constructor(
    private readonly transport: Transport,
    private readonly piano: PianoSink,
    private readonly click: ClickSink,
  ) {
    this.metronome = new Metronome(transport.score);
    this.prevPosition = transport.clock.position;
    this.metronome.onClick((_t, accent) => this.click.playClick(accent));
  }

  /** Trigger notes and metronome clicks for the clock advance since last call. */
  update(): void {
    const cur = this.transport.clock.position;
    const prev = this.prevPosition;
    const playing = this.transport.clock.playing;
    const advance = cur - prev;

    // Backward or large jumps are seeks, not playback: resync silently.
    if (advance <= 0 || advance > SEEK_THRESHOLD) {
      this.prevPosition = cur;
      this.wasPlaying = playing;
      return;
    }

    const notes = this.transport.score.notes;
    for (const note of notesToTrigger(notes, prev, cur)) {
      this.piano.playNote(note.midi, note.duration, note.velocity);
    }
    // notesToTrigger's window is half-open (prev, cur]; on the first frame after
    // playback starts, also fire any note sitting exactly on the start point so
    // the very first note of a piece (or a seek target) is not skipped.
    if (playing && !this.wasPlaying) {
      for (const note of notes) {
        if (note.start === prev) {
          this.piano.playNote(note.midi, note.duration, note.velocity);
        }
      }
    }
    this.metronome.update(prev, cur);

    this.prevPosition = cur;
    this.wasPlaying = playing;
  }
}

/**
 * Build an AudioEngine wired to real Tone.js output: a sampled acoustic piano
 * and a click synth. Tone.js is imported dynamically so test code never loads
 * an AudioContext. The audio context is suspended until `Tone.start()` is
 * called from a user gesture (the UI layer does that).
 */
export async function createAudioEngine(
  transport: Transport,
): Promise<AudioEngine> {
  const Tone = await import("tone");

  // Sampled acoustic piano — Salamander grand, the Tone.js reference sample set.
  const sampler = new Tone.Sampler({
    urls: {
      A0: "A0.mp3",
      C1: "C1.mp3",
      "D#1": "Ds1.mp3",
      "F#1": "Fs1.mp3",
      A1: "A1.mp3",
      C2: "C2.mp3",
      "D#2": "Ds2.mp3",
      "F#2": "Fs2.mp3",
      A2: "A2.mp3",
      C3: "C3.mp3",
      "D#3": "Ds3.mp3",
      "F#3": "Fs3.mp3",
      A3: "A3.mp3",
      C4: "C4.mp3",
      "D#4": "Ds4.mp3",
      "F#4": "Fs4.mp3",
      A4: "A4.mp3",
      C5: "C5.mp3",
      "D#5": "Ds5.mp3",
      "F#5": "Fs5.mp3",
      A5: "A5.mp3",
      C6: "C6.mp3",
      "D#6": "Ds6.mp3",
      "F#6": "Fs6.mp3",
      A6: "A6.mp3",
      C7: "C7.mp3",
      "D#7": "Ds7.mp3",
      "F#7": "Fs7.mp3",
      A7: "A7.mp3",
      C8: "C8.mp3",
    },
    baseUrl: "https://tonejs.github.io/audio/salamander/",
  }).toDestination();

  // Click: a short pitched blip; accented beats a perfect fifth higher.
  const clickSynth = new Tone.MembraneSynth({
    volume: -6,
    envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.02 },
  }).toDestination();

  const piano: PianoSink = {
    playNote(midi, durationSeconds, velocity) {
      sampler.triggerAttackRelease(
        Tone.Frequency(midi, "midi").toNote(),
        Math.max(durationSeconds, 0.05),
        undefined,
        velocity,
      );
    },
  };
  const click: ClickSink = {
    playClick(accent) {
      clickSynth.triggerAttackRelease(accent ? "C5" : "C4", 0.05);
    },
  };

  return new AudioEngine(transport, piano, click);
}
```

NOTE: `createAudioEngine` is NOT unit-tested (it needs an AudioContext and
network samples). It is exercised manually. The `AudioEngine` class IS tested,
via the fake sinks in the test above. Do not try to test `createAudioEngine`.

- [ ] **Step 4: Run the tests — confirm they pass**

Run: `npm test -- audio/engine`
Expected: PASS (3 tests).

- [ ] **Step 5: Full verification**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: all pass. (`npm run build` must bundle `tone` without error — this
confirms the dynamic import resolves.)

- [ ] **Step 6: Commit**

```bash
git add src/audio/engine.ts src/audio/engine.test.ts
git commit -m "feat: add AudioEngine with Tone.js sampled piano and metronome"
```

---

## Feature D — Definition of Done

- `notesToTrigger` / `timesInWindow` select the right events for a clock window.
- `metronomeBeats` computes click times with subdivisions.
- `Metronome` fires accented/unaccented clicks per beat, supports on/off and
  subdivision, and exposes a decaying `pulse`.
- `AudioEngine` triggers piano notes and clicks from clock advances and ignores
  seeks; `createAudioEngine` wires a real Tone.js sampled piano + click synth.
- All unit tests pass; `npm run lint`, `npm run typecheck`, `npm test`,
  `npm run build` all green.
- `docs/features/D-audio-metronome.md` updated: status Done, changes log + testing.

## Manual-test checklist (for the feature doc)

- After Feature G wires audio into the UI: piano notes sound in time with the
  clock; the sampled piano loads (online) and notes have correct pitch.
- Metronome click toggles on/off; subdivisions add intermediate clicks; the
  first beat of each measure is accented; the visual pulse flashes on the beat.
- Known v1 limitation: the Salamander samples load from a CDN, so first-load
  audio needs network; offline audio is a backlog item.
