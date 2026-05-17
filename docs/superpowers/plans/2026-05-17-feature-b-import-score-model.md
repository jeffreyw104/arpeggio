# Feature B — Import & Score Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn an uploaded MIDI or MusicXML file into one canonical, in-memory `Score` model that every later feature reads from.

**Architecture:** A pure-function import pipeline. `importFile()` detects the file type, dispatches to the MIDI or MusicXML parser, and returns a `Score`. MIDI parsing keeps exact note timing (for the falldown) and also runs an approximate MIDI→MusicXML conversion (for the engraved score) plus a source-quality heuristic. MusicXML parsing reads timing directly and keeps the original XML. No rendering, no audio, no storage — those are later features.

**Tech Stack:** TypeScript, `@tonejs/midi` (MIDI parsing/writing), the browser `DOMParser`/`XMLSerializer` (MusicXML, available in the `jsdom` test environment), Vitest.

**Branch:** `feature/b-import-score-model`

---

## Notes for the implementer

- Repo root and working directory: `/Users/jeffreywan/Desktop/arpeggio`. Run all commands from there.
- Work on branch `feature/b-import-score-model` (the controller creates it before Task 1).
- Feature A is merged into `main`: Vite + TS + React 19, Vitest (`npm test`), ESLint (`npm run lint`), `tsc -b` typecheck (`npm run typecheck`), all green.
- `strict` TypeScript is on, plus `noUnusedLocals`/`noUnusedParameters`. Keep code clean or the build fails.
- Vitest runs in `jsdom`, so `DOMParser`, `XMLSerializer`, and `Uint8Array` are all available in tests.
- Pitch convention used throughout: MIDI note number, middle C = C4 = 60. Conversion: `midi = (octave + 1) * 12 + semitone + alter`, where semitone is `{C:0,D:2,E:4,F:5,G:7,A:9,B:11}`.
- All times in the `Score` model are in **seconds** from the start of the piece.
- Commit after every task. Use the exact commit messages given.

---

## File / Folder Structure

```
src/
  model/
    score.ts                     # Score, Note, Measure, etc. type definitions
  import/
    detectType.ts                # bytes/filename -> "midi" | "musicxml" | "unknown"
    importFile.ts                # public entry point: File -> Promise<Score>
    midi/
      parseMidi.ts               # ArrayBuffer -> Score (source: "midi")
      midiToMusicXml.ts          # MIDI-derived Score data -> approximate MusicXML string
      quality.ts                 # Note[] + tempo -> live-performance heuristic
    musicxml/
      parseMusicXml.ts           # MusicXML string -> Score (source: "musicxml")
  test/
    fixtures/
      generateFixtures.ts        # one-off script: writes the .mid fixtures
      clean.mid                  # cleanly-sequenced fixture (generated, committed)
      performance.mid            # live-performance fixture (generated, committed)
      polyrhythm.mid             # 3-against-2 fixture (generated, committed)
      simple.musicxml            # hand-written 2-measure piano fixture (committed)
```

---

## Task 1: Score model types and dependency

**Files:**

- Create: `src/model/score.ts`
- Modify: `package.json`, `package-lock.json` (add `@tonejs/midi`)

- [ ] **Step 1: Install `@tonejs/midi`**

Run: `npm install @tonejs/midi`
Expected: added under `dependencies`.

- [ ] **Step 2: Create `src/model/score.ts`**

```ts
/** Which hand plays a note. */
export type Hand = "left" | "right";

/** The file format a Score was imported from. */
export type SourceFormat = "midi" | "musicxml";

/** A single played note. All times are seconds from the start of the piece. */
export interface Note {
  /** MIDI pitch number, 0-127. Middle C (C4) = 60. */
  midi: number;
  /** Onset time, seconds. */
  start: number;
  /** Sounding length, seconds. Always > 0. */
  duration: number;
  /** Normalized velocity, 0-1. */
  velocity: number;
  /** Which hand plays this note. */
  hand: Hand;
}

/** A sustain-pedal press, as a closed [start, end] interval in seconds. */
export interface PedalEvent {
  start: number;
  end: number;
}

/** A time-signature change effective from `start` seconds. */
export interface TimeSignature {
  start: number;
  numerator: number;
  denominator: number;
}

/** A tempo change effective from `start` seconds. */
export interface TempoEvent {
  start: number;
  bpm: number;
}

/** One notated measure (bar). */
export interface Measure {
  /** 0-based position in the piece. */
  index: number;
  /** Measure start time, seconds. */
  start: number;
  /** Measure end time, seconds (== next measure's start, or piece end). */
  end: number;
  numerator: number;
  denominator: number;
}

/** The canonical, in-memory representation of an imported piece. */
export interface Score {
  source: SourceFormat;
  /** All notes, sorted ascending by `start`. */
  notes: Note[];
  /** All measures, sorted ascending by `index`/`start`. */
  measures: Measure[];
  /** Sustain-pedal intervals, sorted by `start`. */
  pedalEvents: PedalEvent[];
  /** Time-signature changes, sorted by `start`; at least one entry. */
  timeSignatures: TimeSignature[];
  /** Tempo changes, sorted by `start`; at least one entry. */
  tempoMap: TempoEvent[];
  /** Total length of the piece, seconds. */
  durationSeconds: number;
  /** MusicXML for the engraved score view — original (MusicXML import) or
   *  approximate (MIDI import). */
  musicXml: string;
  /** Non-null when the source MIDI looks like a live performance. */
  qualityWarning: string | null;
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/model/score.ts package.json package-lock.json
git commit -m "feat: add Score model types and @tonejs/midi dependency"
```

`score.ts` is type-only — there is no runtime behavior to unit-test; `typecheck` is its verification.

---

## Task 2: File-type detection

**Files:**

- Create: `src/import/detectType.ts`, `src/import/detectType.test.ts`

- [ ] **Step 1: Write the failing test — `src/import/detectType.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { detectType } from "./detectType";

const bytesOf = (s: string) => new TextEncoder().encode(s);

describe("detectType", () => {
  it("detects MIDI from the MThd magic bytes", () => {
    const midi = new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0x00, 0x00]);
    expect(detectType("song.mid", midi)).toBe("midi");
  });

  it("detects MusicXML from score-partwise content", () => {
    const xml = bytesOf('<?xml version="1.0"?><score-partwise version="4.0">');
    expect(detectType("song.musicxml", xml)).toBe("musicxml");
  });

  it("detects MusicXML from score-timewise content", () => {
    const xml = bytesOf('<?xml version="1.0"?><score-timewise>');
    expect(detectType("song.xml", xml)).toBe("musicxml");
  });

  it("returns unknown for unrecognized content", () => {
    expect(detectType("notes.txt", bytesOf("hello world"))).toBe("unknown");
  });

  it("returns unknown for a compressed .mxl (zip) file", () => {
    // .mxl support is out of scope for v1; PK zip header must not misdetect.
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    expect(detectType("song.mxl", zip)).toBe("unknown");
  });
});
```

- [ ] **Step 2: Run it — confirm it fails**

Run: `npm test -- detectType`
Expected: FAIL (`detectType` not defined).

- [ ] **Step 3: Implement `src/import/detectType.ts`**

```ts
export type FileFormat = "midi" | "musicxml" | "unknown";

/**
 * Detect a file's format from its leading bytes.
 * - MIDI: the file begins with the ASCII header chunk "MThd".
 * - MusicXML (uncompressed): the text contains a <score-partwise> or
 *   <score-timewise> root element.
 * Compressed MusicXML (.mxl, a zip) is out of scope for v1 and returns "unknown".
 */
export function detectType(_filename: string, bytes: Uint8Array): FileFormat {
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x4d && // M
    bytes[1] === 0x54 && // T
    bytes[2] === 0x68 && // h
    bytes[3] === 0x64 // d
  ) {
    return "midi";
  }
  // Decode at most the first 2 KB as UTF-8 text for cheap content sniffing.
  const head = new TextDecoder("utf-8", { fatal: false }).decode(
    bytes.subarray(0, 2048),
  );
  if (head.includes("score-partwise") || head.includes("score-timewise")) {
    return "musicxml";
  }
  return "unknown";
}
```

`_filename` is currently unused (kept for a stable signature and possible future
extension-based hints); the leading underscore satisfies `noUnusedParameters`.

- [ ] **Step 4: Run the tests — confirm they pass**

Run: `npm test -- detectType`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/import/detectType.ts src/import/detectType.test.ts
git commit -m "feat: add MIDI/MusicXML file-type detection"
```

---

## Task 3: Test fixtures

**Files:**

- Create: `src/test/fixtures/generateFixtures.ts`, `src/test/fixtures/simple.musicxml`
- Create (generated, committed): `src/test/fixtures/clean.mid`, `performance.mid`, `polyrhythm.mid`

- [ ] **Step 1: Create `src/test/fixtures/simple.musicxml`**

A hand-written 2-measure, 2-staff piano piece in 4/4 at 120 BPM. `divisions` is 4
(so a quarter note = 4 duration units). Right hand (staff 1): four quarter notes
C5 D5 E5 F5 in measure 1, two half notes G5 A5 in measure 2. Left hand (staff 2):
whole notes C3 then G2.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>F</sign><line>4</line></clef>
      </attributes>
      <direction placement="above">
        <direction-type>
          <metronome><beat-unit>quarter</beat-unit><per-minute>120</per-minute></metronome>
        </direction-type>
        <sound tempo="120"/>
      </direction>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>5</octave></pitch><duration>4</duration><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>5</octave></pitch><duration>4</duration><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>F</step><octave>5</octave></pitch><duration>4</duration><type>quarter</type><staff>1</staff></note>
      <backup><duration>16</duration></backup>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>16</duration><type>whole</type><staff>2</staff></note>
    </measure>
    <measure number="2">
      <note><pitch><step>G</step><octave>5</octave></pitch><duration>8</duration><type>half</type><staff>1</staff></note>
      <note><pitch><step>A</step><octave>5</octave></pitch><duration>8</duration><type>half</type><staff>1</staff></note>
      <backup><duration>16</duration></backup>
      <note><pitch><step>G</step><octave>2</octave></pitch><duration>16</duration><type>whole</type><staff>2</staff></note>
    </measure>
  </part>
</score-partwise>
```

Expected parse (used by Task 5's tests): **8 notes** — measure 1 has 4 RH + 1 LH,
measure 2 has 2 RH + 1 LH. Staff-1 notes are right hand, staff-2 are left. At
120 BPM a quarter = 0.5 s. Right hand: C5=72@0.0 d0.5, D5=74@0.5 d0.5,
E5=76@1.0 d0.5, F5=77@1.5 d0.5, G5=79@2.0 d1.0, A5=81@3.0 d1.0. Left hand:
C3=48@0.0 d2.0, G2=43@2.0 d2.0. `durationSeconds` 4.0; 2 measures, both 4/4.

- [ ] **Step 2: Create the fixture generator — `src/test/fixtures/generateFixtures.ts`**

This one-off script uses `@tonejs/midi` to write three `.mid` files. It is run
once (Step 3) and the resulting `.mid` files are committed; it is not imported by
any test.

```ts
/**
 * Generates the binary MIDI fixtures. Run once with:
 *   npx tsx src/test/fixtures/generateFixtures.ts
 * The emitted .mid files are committed; this script is kept for reproducibility.
 */
import { Midi } from "@tonejs/midi";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = new URL(".", import.meta.url).pathname;

/** clean.mid — cleanly sequenced: two tracks (RH/LH), notes exactly on the
 *  grid, one constant velocity. A C-major scale RH over held LH chords. */
function buildClean(): Midi {
  const midi = new Midi();
  midi.header.setTempo(120);
  const rh = midi.addTrack();
  const scale = [60, 62, 64, 65, 67, 69, 71, 72];
  scale.forEach((n, i) => {
    rh.addNote({ midi: n, time: i * 0.5, duration: 0.5, velocity: 0.7 });
  });
  const lh = midi.addTrack();
  [48, 55].forEach((n, i) => {
    lh.addNote({ midi: n, time: i * 2, duration: 2, velocity: 0.7 });
  });
  return midi;
}

/** performance.mid — same notes as clean, but starts jittered off-grid and
 *  velocities widely varied: should be flagged as a live performance. */
function buildPerformance(): Midi {
  const midi = new Midi();
  midi.header.setTempo(120);
  const rh = midi.addTrack();
  const scale = [60, 62, 64, 65, 67, 69, 71, 72];
  const jitter = [0.03, -0.02, 0.05, -0.04, 0.02, 0.06, -0.03, 0.01];
  const vel = [0.41, 0.83, 0.55, 0.92, 0.38, 0.74, 0.61, 0.88];
  scale.forEach((n, i) => {
    rh.addNote({
      midi: n,
      time: i * 0.5 + jitter[i],
      duration: 0.45,
      velocity: vel[i],
    });
  });
  return midi;
}

/** polyrhythm.mid — 3-against-2: RH triplets vs LH duplets over one bar. */
function buildPolyrhythm(): Midi {
  const midi = new Midi();
  midi.header.setTempo(120);
  const rh = midi.addTrack();
  for (let i = 0; i < 3; i++) {
    rh.addNote({ midi: 72, time: i * (2 / 3), duration: 0.3, velocity: 0.7 });
  }
  const lh = midi.addTrack();
  for (let i = 0; i < 2; i++) {
    lh.addNote({ midi: 48, time: i * 1.0, duration: 0.5, velocity: 0.7 });
  }
  return midi;
}

const out: Array<[string, Midi]> = [
  ["clean.mid", buildClean()],
  ["performance.mid", buildPerformance()],
  ["polyrhythm.mid", buildPolyrhythm()],
];
for (const [name, midi] of out) {
  writeFileSync(join(dir, name), Buffer.from(midi.toArray()));
  console.log("wrote", name);
}
```

- [ ] **Step 3: Generate the `.mid` fixtures**

Run: `npx tsx src/test/fixtures/generateFixtures.ts`
Expected: prints `wrote clean.mid`, `wrote performance.mid`, `wrote polyrhythm.mid`;
the three files exist in `src/test/fixtures/`.
(`tsx` is fetched on demand by `npx`; if offline, install it with
`npm install -D tsx` first and report that as a deviation.)

- [ ] **Step 4: Sanity-check a fixture loads**

Run:

```bash
node -e "const {Midi}=require('@tonejs/midi'); const fs=require('fs'); const m=new Midi(fs.readFileSync('src/test/fixtures/clean.mid')); console.log('tracks', m.tracks.length, 'notes', m.tracks.reduce((s,t)=>s+t.notes.length,0));"
```

Expected: `tracks 2 notes 10`.

- [ ] **Step 5: Commit**

```bash
git add src/test/fixtures/
git commit -m "test: add MIDI and MusicXML import fixtures"
```

---

## Task 4: MIDI parser

**Files:**

- Create: `src/import/midi/parseMidi.ts`, `src/import/midi/parseMidi.test.ts`

This task produces a `Score` from MIDI **without** the `musicXml` or
`qualityWarning` fields filled meaningfully — `parseMidi` returns the timing data
and sets `musicXml: ""` and `qualityWarning: null` as placeholders; Task 8's
orchestrator fills them in using Tasks 6 and 7. Keep `parseMidi` focused on
timing extraction.

- [ ] **Step 1: Write the failing test — `src/import/midi/parseMidi.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseMidi } from "./parseMidi";

// Node's readFileSync returns a Buffer that may share a larger pooled
// ArrayBuffer — slice to the exact file bytes before handing it to parseMidi.
const load = (name: string): ArrayBuffer => {
  const b = readFileSync(`src/test/fixtures/${name}`);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

describe("parseMidi", () => {
  it("extracts all notes from the clean fixture", () => {
    const score = parseMidi(load("clean.mid"));
    expect(score.source).toBe("midi");
    expect(score.notes).toHaveLength(10);
  });

  it("keeps notes sorted by start time", () => {
    const score = parseMidi(load("clean.mid"));
    const starts = score.notes.map((n) => n.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it("assigns the higher track to the right hand, lower to the left", () => {
    const score = parseMidi(load("clean.mid"));
    const right = score.notes.filter((n) => n.hand === "right");
    const left = score.notes.filter((n) => n.hand === "left");
    expect(right).toHaveLength(8); // the scale
    expect(left).toHaveLength(2); // the bass notes
    expect(Math.min(...right.map((n) => n.midi))).toBeGreaterThan(
      Math.max(...left.map((n) => n.midi)),
    );
  });

  it("reads the tempo and computes piece duration", () => {
    const score = parseMidi(load("clean.mid"));
    expect(score.tempoMap[0].bpm).toBeCloseTo(120, 0);
    // last RH note starts at 3.5 s, lasts 0.5 s.
    expect(score.durationSeconds).toBeCloseTo(4, 1);
  });

  it("produces at least one measure and one time signature", () => {
    const score = parseMidi(load("clean.mid"));
    expect(score.measures.length).toBeGreaterThan(0);
    expect(score.timeSignatures.length).toBeGreaterThan(0);
    expect(score.measures[0].start).toBe(0);
  });
});
```

- [ ] **Step 2: Run it — confirm it fails**

Run: `npm test -- parseMidi`
Expected: FAIL (`parseMidi` not defined).

- [ ] **Step 3: Implement `src/import/midi/parseMidi.ts`**

Approach:

1. `const midi = new Midi(arrayBuffer)`.
2. Notes: flatten every track's `.notes`. Each `@tonejs/midi` note already has
   `.midi`, `.time` (seconds), `.duration` (seconds), `.velocity` (0-1).
3. Hand assignment:
   - Collect tracks that have ≥1 note. If there are ≥2 such tracks, rank them by
     mean pitch; notes from the highest-mean track are `"right"`, all others
     `"left"`. If there is exactly 1 such track, split per-note by pitch:
     `midi >= 60` → `"right"`, else `"left"`.
4. Pedal: scan every track's `controlChanges` for controller number 64. Walking
   in time order, a value `>= 64` opens an interval, the next value `< 64` (or
   the end of the piece) closes it. Emit `PedalEvent` pairs.
5. Tempo map: `midi.header.tempos` → `{ start: t.time ?? header.ticksToSeconds(t.ticks), bpm: t.bpm }`. If empty, default to `[{ start: 0, bpm: 120 }]`.
6. Time signatures: `midi.header.timeSignatures` → `{ start, numerator, denominator }` where `timeSignature` is `[num, den]`. If empty, default `[{ start: 0, numerator: 4, denominator: 4 }]`.
7. Measures: compute boundaries in ticks then convert with
   `midi.header.ticksToSeconds()`. Start at tick 0; for each bar, advance by
   `ticksPerBar = ppq * 4 * numerator / denominator` (`ppq = midi.header.ppq`),
   switching `numerator/denominator` when a time-signature change is reached.
   Stop once the bar start passes the last note's end. Each `Measure` gets
   `index`, `start`, `end`, and the active `numerator/denominator`.
8. `durationSeconds = max(midi.duration, last note end, last measure end)`.
9. Return `{ source: "midi", notes (sorted by start), measures, pedalEvents,
timeSignatures, tempoMap, durationSeconds, musicXml: "", qualityWarning: null }`.

Write `parseMidi(buffer: ArrayBuffer): Score` implementing the above. Add a small
private `assignHands(tracks)` helper and a private `buildMeasures(...)` helper so
each piece is independently readable. Keep the file focused on these.

- [ ] **Step 4: Run the tests — confirm they pass**

Run: `npm test -- parseMidi`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/import/midi/parseMidi.ts src/import/midi/parseMidi.test.ts
git commit -m "feat: add MIDI parser producing the Score timing model"
```

---

## Task 5: MusicXML parser

**Files:**

- Create: `src/import/musicxml/parseMusicXml.ts`, `src/import/musicxml/parseMusicXml.test.ts`

`parseMusicXml(xml: string): Score` parses uncompressed MusicXML
(`score-partwise`) into a `Score`. The original `xml` string is stored verbatim
in `Score.musicXml` (the score view renders it directly). `qualityWarning` is
always `null` for MusicXML (the engraving quality lives in the file).

- [ ] **Step 1: Write the failing test — `src/import/musicxml/parseMusicXml.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseMusicXml } from "./parseMusicXml";

const xml = readFileSync("src/test/fixtures/simple.musicxml", "utf-8");

describe("parseMusicXml", () => {
  it("parses every note", () => {
    const score = parseMusicXml(xml);
    expect(score.source).toBe("musicxml");
    expect(score.notes).toHaveLength(8);
  });

  it("converts pitches and timing of the right-hand line", () => {
    const score = parseMusicXml(xml);
    const right = score.notes
      .filter((n) => n.hand === "right")
      .sort((a, b) => a.start - b.start);
    expect(right.map((n) => n.midi)).toEqual([72, 74, 76, 77, 79, 81]);
    expect(right[0].start).toBeCloseTo(0, 3);
    expect(right[1].start).toBeCloseTo(0.5, 3);
    expect(right[0].duration).toBeCloseTo(0.5, 3);
    expect(right[4].start).toBeCloseTo(2.0, 3); // G5, measure 2
    expect(right[4].duration).toBeCloseTo(1.0, 3); // half note
  });

  it("assigns staff 2 to the left hand", () => {
    const score = parseMusicXml(xml);
    const left = score.notes.filter((n) => n.hand === "left");
    expect(left.map((n) => n.midi).sort((a, b) => a - b)).toEqual([43, 48]);
  });

  it("reads time signature, tempo, and measures", () => {
    const score = parseMusicXml(xml);
    expect(score.timeSignatures[0]).toMatchObject({
      numerator: 4,
      denominator: 4,
    });
    expect(score.tempoMap[0].bpm).toBeCloseTo(120, 0);
    expect(score.measures).toHaveLength(2);
    expect(score.durationSeconds).toBeCloseTo(4, 1);
  });

  it("stores the original XML verbatim", () => {
    const score = parseMusicXml(xml);
    expect(score.musicXml).toBe(xml);
    expect(score.qualityWarning).toBeNull();
  });
});
```

- [ ] **Step 2: Run it — confirm it fails**

Run: `npm test -- parseMusicXml`
Expected: FAIL (`parseMusicXml` not defined).

- [ ] **Step 3: Implement `src/import/musicxml/parseMusicXml.ts`**

Algorithm (single `score-partwise` part; multiple parts: process each the same
way and merge):

1. `const doc = new DOMParser().parseFromString(xml, "application/xml")`.
   If `doc.querySelector("parsererror")` exists, throw `Error("invalid MusicXML")`.
2. Maintain mutable state: `divisions` (default 1), `tempoBpm` (default 120),
   `numerator`/`denominator` (default 4/4).
3. Helper `pitchToMidi(pitchEl)`: read `<step>` (`{C:0,D:2,E:4,F:5,G:7,A:9,B:11}`),
   `<octave>`, optional `<alter>`; return `(octave + 1) * 12 + semitone + alter`.
4. Helper `divisionsToSeconds(d)`: `d / divisions` quarter notes ×
   `60 / tempoBpm` seconds per quarter → `(d / divisions) * (60 / tempoBpm)`.
5. For each `<part>`: a running `cursor` (in divisions, reset to 0 at each
   measure) and a running `elapsedSeconds` accumulator that tracks the absolute
   start of the current measure.
   - For each `<measure>` in order:
     - Record the measure's start = `elapsedSeconds`.
     - Read `<attributes><divisions>` if present (update `divisions`).
     - Read `<attributes><time>` if present (update numerator/denominator, push a
       `TimeSignature` at the measure start).
     - Read any `<sound tempo="...">` (or `<metronome>` → per-minute) and update
       `tempoBpm`, pushing a `TempoEvent` at the appropriate time.
     - Walk child elements in document order:
       - `<note>`: let `dur = <duration>` (divisions). If it has `<chord/>`, its
         start is `cursorBeforePreviousNote` (the previous note's start, i.e.
         do NOT advance the cursor before placing it, and do not advance after).
         Otherwise its start is `cursor`. If it is a `<rest>`, just advance the
         cursor by `dur`. If it is pitched: compute midi; `staff` element (`1`→
         right, `2`→left; default by pitch if absent). Handle ties: if the note
         has `<tie type="stop">`, extend the matching still-open tied note's
         duration instead of adding a new note; if `<tie type="start">`, keep it
         open keyed by `(midi, staff)`. Advance `cursor` by `dur` for non-chord
         notes.
       - `<backup>`: `cursor -= <duration>`.
       - `<forward>`: `cursor += <duration>`.
     - Measure length = max cursor reached. `elapsedSeconds += divisionsToSeconds(measureLengthDivisions)`. Append a `Measure`.
6. `durationSeconds` = max note end and last measure end.
7. Sort notes by `start`. Return the `Score` with `source: "musicxml"`,
   `musicXml: xml`, `qualityWarning: null`.

Convert note start/duration to seconds **at emit time** using the tempo active
then. For the v1 fixture tempo is constant; a single constant tempo is the
required correctness bar — handle a mid-piece tempo change if it falls out
naturally, but do not block on it.

Write the implementation with small private helpers (`pitchToMidi`,
`parseMeasure`) so the file stays readable.

- [ ] **Step 4: Run the tests — confirm they pass**

Run: `npm test -- parseMusicXml`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/import/musicxml/parseMusicXml.ts src/import/musicxml/parseMusicXml.test.ts
git commit -m "feat: add MusicXML parser producing the Score model"
```

---

## Task 6: MIDI→MusicXML converter

**Files:**

- Create: `src/import/midi/midiToMusicXml.ts`, `src/import/midi/midiToMusicXml.test.ts`

`midiToMusicXml(score: Score): string` builds an **approximate** `score-partwise`
MusicXML string from a MIDI-derived `Score` so the score view has something to
engrave. Approximate is acceptable and expected (see design spec §3).

- [ ] **Step 1: Write the failing test — `src/import/midi/midiToMusicXml.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseMidi } from "./parseMidi";
import { midiToMusicXml } from "./midiToMusicXml";

const cleanBuf = readFileSync("src/test/fixtures/clean.mid");
const score = parseMidi(
  cleanBuf.buffer.slice(
    cleanBuf.byteOffset,
    cleanBuf.byteOffset + cleanBuf.byteLength,
  ),
);

describe("midiToMusicXml", () => {
  it("produces well-formed XML with a score-partwise root", () => {
    const xml = midiToMusicXml(score);
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    expect(doc.querySelector("parsererror")).toBeNull();
    expect(doc.documentElement.nodeName).toBe("score-partwise");
  });

  it("emits two staves and a measure per bar of the score", () => {
    const xml = midiToMusicXml(score);
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    expect(doc.querySelector("staves")?.textContent).toBe("2");
    expect(doc.querySelectorAll("measure").length).toBe(score.measures.length);
  });

  it("emits at least one pitched note for every distinct MIDI pitch", () => {
    const xml = midiToMusicXml(score);
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const octaves = new Set(
      [...doc.querySelectorAll("note > pitch > octave")].map(
        (e) => e.textContent,
      ),
    );
    expect(octaves.size).toBeGreaterThan(0);
  });

  it("round-trips through the MusicXML parser without throwing", () => {
    // The converter output must be parseable by our own MusicXML parser.
    const xml = midiToMusicXml(score);
    expect(() => {
      new DOMParser().parseFromString(xml, "application/xml");
    }).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it — confirm it fails**

Run: `npm test -- midiToMusicXml`
Expected: FAIL (`midiToMusicXml` not defined).

- [ ] **Step 3: Implement `src/import/midi/midiToMusicXml.ts`**

Approach (approximate engraving):

1. `divisions = 4` (sixteenth-note grid). For each measure, for each staff
   (staff 1 = right-hand notes, staff 2 = left-hand notes):
   - Quantize each note's start and duration to the grid: convert seconds → beats
     using the tempo active at the note (`beats = seconds / (60/bpm)`), then
     `gridUnits = round(beats * divisions)`.
   - Within the measure, walk the grid: emit `<note>` elements for notes whose
     quantized start falls in this measure (notes sharing a start become a
     `<chord/>`), and `<rest>` elements to fill gaps. Clamp note durations so a
     note does not overflow its measure (split/clip — clipping is acceptable for
     v1).
   - Derive `<type>` from quantized duration (`16th`/`eighth`/`quarter`/`half`/
     `whole`); a duration with no exact type maps to the nearest smaller type.
2. Helper `midiToPitch(midi)`: inverse of `pitchToMidi` — choose a spelling using
   sharps (`["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"]`); emit
   `<step>`, `<alter>` (1 for `#`), `<octave>`.
3. Emit a single `<part id="P1">` with `<staves>2</staves>`, a treble `<clef>` for
   staff 1 and bass for staff 2, the `<time>` from `score.timeSignatures[0]`, and
   one `<measure>` per `score.measures` entry.
4. Build the XML as a string (or via `document.implementation` + `XMLSerializer`).
   String building is fine; ensure elements are well-formed and the root is
   `<score-partwise version="4.0">`.

Keep the converter pragmatic: the bar that must pass is "valid, well-formed
MusicXML that our parser and (later) Verovio can consume" — not engraving
perfection. Use small private helpers (`midiToPitch`, `durationToType`,
`buildMeasureXml`).

- [ ] **Step 4: Run the tests — confirm they pass**

Run: `npm test -- midiToMusicXml`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/import/midi/midiToMusicXml.ts src/import/midi/midiToMusicXml.test.ts
git commit -m "feat: add approximate MIDI-to-MusicXML converter"
```

---

## Task 7: MIDI quality detection

**Files:**

- Create: `src/import/midi/quality.ts`, `src/import/midi/quality.test.ts`

`detectMidiQuality(score: Score)` heuristically decides whether a MIDI source
looks like a live human performance (versus clean step-sequenced MIDI) and
returns a user-facing warning string when it does.

- [ ] **Step 1: Write the failing test — `src/import/midi/quality.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseMidi } from "./parseMidi";
import { detectMidiQuality } from "./quality";

const load = (name: string) => {
  const b = readFileSync(`src/test/fixtures/${name}`);
  return parseMidi(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};

describe("detectMidiQuality", () => {
  it("does not flag cleanly-sequenced MIDI", () => {
    const result = detectMidiQuality(load("clean.mid"));
    expect(result.isLivePerformance).toBe(false);
    expect(result.warning).toBeNull();
  });

  it("flags a jittery, dynamically varied performance", () => {
    const result = detectMidiQuality(load("performance.mid"));
    expect(result.isLivePerformance).toBe(true);
    expect(result.warning).toBeTypeOf("string");
    expect(result.warning).toMatch(/performance/i);
  });
});
```

- [ ] **Step 2: Run it — confirm it fails**

Run: `npm test -- quality`
Expected: FAIL (`detectMidiQuality` not defined).

- [ ] **Step 3: Implement `src/import/midi/quality.ts`**

```ts
import type { Score } from "../../model/score";

export interface MidiQualityResult {
  isLivePerformance: boolean;
  warning: string | null;
}

const LIVE_WARNING =
  "This MIDI looks like a live performance — the engraved score is " +
  "auto-generated and approximate. The falldown view is still exact.";

/**
 * Heuristic: live performances have note onsets that sit off the rhythmic grid
 * and a wide spread of velocities. Cleanly step-sequenced MIDI is near-perfectly
 * quantized with few distinct velocities.
 */
export function detectMidiQuality(score: Score): MidiQualityResult {
  const notes = score.notes;
  if (notes.length < 4) return { isLivePerformance: false, warning: null };

  const bpm = score.tempoMap[0]?.bpm ?? 120;
  const sixteenth = 60 / bpm / 4; // seconds per 1/16 note

  // Mean distance of each onset from the nearest 1/16 grid line, as a fraction
  // of a 1/16 (0 = perfectly quantized, ~0.5 = maximally off-grid).
  let offGrid = 0;
  for (const n of notes) {
    const phase = n.start / sixteenth;
    const frac = Math.abs(phase - Math.round(phase));
    offGrid += frac;
  }
  offGrid /= notes.length;

  const distinctVelocities = new Set(
    notes.map((n) => Math.round(n.velocity * 127)),
  ).size;

  const isLivePerformance = offGrid > 0.12 || distinctVelocities > 8;
  return {
    isLivePerformance,
    warning: isLivePerformance ? LIVE_WARNING : null,
  };
}
```

- [ ] **Step 4: Run the tests — confirm they pass**

Run: `npm test -- quality`
Expected: PASS (2 tests). If the thresholds misclassify either fixture, adjust
the constants (`0.12`, `8`) so `clean.mid` is not flagged and `performance.mid`
is — the fixtures in Task 3 are designed with a clear separation.

- [ ] **Step 5: Commit**

```bash
git add src/import/midi/quality.ts src/import/midi/quality.test.ts
git commit -m "feat: add MIDI live-performance quality detection"
```

---

## Task 8: Import orchestrator

**Files:**

- Create: `src/import/importFile.ts`, `src/import/importFile.test.ts`

`importFile(file: File): Promise<Score>` is the single public entry point later
features use. It reads the file, detects the type, dispatches to the right
parser, and — for MIDI — fills in `musicXml` (Task 6) and `qualityWarning`
(Task 7).

- [ ] **Step 1: Write the failing test — `src/import/importFile.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { importFile } from "./importFile";

const fileOf = (name: string, type = "") =>
  new File([readFileSync(`src/test/fixtures/${name}`)], name, { type });

describe("importFile", () => {
  it("imports a MIDI file into a Score with an engraved MusicXML", async () => {
    const score = await importFile(fileOf("clean.mid"));
    expect(score.source).toBe("midi");
    expect(score.notes).toHaveLength(10);
    expect(score.musicXml).toContain("score-partwise");
    expect(score.qualityWarning).toBeNull(); // clean fixture
  });

  it("flags a live-performance MIDI", async () => {
    const score = await importFile(fileOf("performance.mid"));
    expect(score.qualityWarning).toMatch(/performance/i);
  });

  it("imports a MusicXML file directly", async () => {
    const score = await importFile(fileOf("simple.musicxml"));
    expect(score.source).toBe("musicxml");
    expect(score.notes).toHaveLength(8);
    expect(score.musicXml).toContain("score-partwise");
  });

  it("rejects an unrecognized file", async () => {
    const junk = new File(["not a song"], "notes.txt", { type: "text/plain" });
    await expect(importFile(junk)).rejects.toThrow(/unsupported|unrecognized/i);
  });
});
```

- [ ] **Step 2: Run it — confirm it fails**

Run: `npm test -- importFile`
Expected: FAIL (`importFile` not defined).

- [ ] **Step 3: Implement `src/import/importFile.ts`**

```ts
import type { Score } from "../model/score";
import { detectType } from "./detectType";
import { parseMidi } from "./midi/parseMidi";
import { midiToMusicXml } from "./midi/midiToMusicXml";
import { detectMidiQuality } from "./midi/quality";
import { parseMusicXml } from "./musicxml/parseMusicXml";

/**
 * Read an uploaded file and produce the canonical Score model.
 * MIDI imports also get an approximate engraved score and a quality warning.
 */
export async function importFile(file: File): Promise<Score> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const format = detectType(file.name, bytes);

  if (format === "midi") {
    const score = parseMidi(buffer);
    const quality = detectMidiQuality(score);
    score.musicXml = midiToMusicXml(score);
    score.qualityWarning = quality.warning;
    return score;
  }
  if (format === "musicxml") {
    return parseMusicXml(new TextDecoder("utf-8").decode(bytes));
  }
  throw new Error(`Unsupported or unrecognized file: ${file.name}`);
}
```

- [ ] **Step 4: Run the tests — confirm they pass**

Run: `npm test -- importFile`
Expected: PASS (4 tests).

- [ ] **Step 5: Full verification**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/import/importFile.ts src/import/importFile.test.ts
git commit -m "feat: add import orchestrator unifying MIDI and MusicXML"
```

---

## Feature B — Definition of Done

- `importFile(file)` returns a `Score` for both MIDI and MusicXML inputs and
  throws for unrecognized files.
- MIDI imports carry exact note timing, an approximate `musicXml`, and a quality
  warning when the source looks like a live performance.
- MusicXML imports carry parsed timing and the verbatim original XML.
- All unit tests pass; `npm run lint`, `npm run typecheck`, `npm test`,
  `npm run build` all green.
- `docs/features/B-import-score-model.md` updated: status Done, changes log and
  testing section filled.

## Manual-test checklist (for the feature doc)

- Converted score from `clean.mid` is readable when later rendered by Verovio
  (re-verify during Feature F).
- The live-performance warning copy reads sensibly to a user.
