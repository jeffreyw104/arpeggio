# Spec 2 — MIDI-native visualizer

_Status: design accepted 2026-05-20. Implementation plan to follow._

## Background

For MIDI-imported pieces, the engraved score that drives `ReadingLaneView` and
`ScoreView` is auto-generated from the MIDI by `src/import/midi/midiToMusicXml.ts`
and rendered with Verovio. The output is **approximate sheet music** — beat
buckets, no slurs, no articulations — and misleads players who are reading
notation. The falldown gives the right time-and-pitch picture but only ever
shows ~2.5 seconds of the future; players can't preview by phrase, can't
navigate by landmark, and can't loop a region by clicking.

Spec 2 replaces the engraved views with **MIDI-native** ones for
`score.source === "midi"`, and adds two source-agnostic landmark-navigation
aids that also benefit the XML path.

## Goals

- For MIDI imports, replace the engraved `ReadingLaneView` and `ScoreView` with
  a **piano-roll** equivalent: horizontal time axis, vertical pitch axis,
  paginated by measure count, clickable per measure.
- For both sources, add a **measure progress bar** (the new scrubber) and a
  **whole-piece minimap** that surface measure-level structure.
- Surface **section markers** when the imported file carries them — on the
  progress bar, the minimap, and the piano-roll lane.
- Preserve every existing navigation gesture: click = seek, drag = loop,
  wait-mode hold, loop indicator.

## Non-goals

- Section labels on the engraved score view for MIDI imports (the
  auto-generated MusicXML round-trip is the messy part — deferred to a
  later "improve approximate engraving" pass).
- User control of page size (locked at 4 measures, matching the engraved
  lane).
- Pitch-axis key-letter labels on the piano-roll (left-side strip). Backlog.
- Per-measure flub heatmap on the minimap (waits for session-report feature).
- Live MIDI re-import (sections only extracted at import time).

## Layout — Option B

Vertical stack inside `PracticeView`:

```
TopBar  [≡ logo] [▶] [── measure progress bar ──] [time] [mode] [tools] [view]
         ─────────────── minimap strip (16px) ────────────────────
         ─────────────── piano-roll lane (~4 measures) ───────────
         ─────────────────────── falldown ─────────────────────────
```

The TopBar's `hud-scrubber` becomes the segmented `MeasureProgressBar` (same
vertical real estate, more information). The minimap is its own thin strip
below the TopBar; it defaults visible and is toggleable from PlayTools and
MidiTools. The piano-roll lane occupies the slot the engraved
`ReadingLaneView` used to fill, only when `source === "midi"`. The falldown
sits below, full-width, unchanged.

Layout reference mockup:
`.superpowers/brainstorm/81906-1779257578/content/00-layout-shape.html` (Option B).

## Source gating

| Surface             | XML score                          | MIDI score                                 |
|---------------------|------------------------------------|--------------------------------------------|
| Reading-lane strip  | engraved `ReadingLaneView` (kept)  | **`PianoRollLane`** (new)                  |
| Split-panel score   | engraved `ScoreView` (kept)        | **`PianoRollPanel`** (new — same renderer) |
| Progress bar        | `MeasureProgressBar` (new, source-agnostic)                                     |
| Minimap             | `Minimap` (new, source-agnostic)                                                |
| Section labels      | bar / minimap / piano-roll: read `score.sections`. Engraved XML: via Verovio rehearsal-mark rendering (already supported). Engraved MIDI: silent in v1. |
| Library label       | `𝄞 Sheet music`                    | `♪ Notes only`                             |

`PracticeView` branches on `score.source` to decide which lane/panel pair to
mount. Source is fixed for a session, so the branch is one-shot at mount; no
hot-swap path needed.

## Components

### `PianoRollRenderer` — Canvas2D, pure renderer

`src/piano-roll/PianoRollRenderer.ts`. Mirrors `FalldownRenderer`'s shape and
ownership rules: reads `transport.clock.position` and `transport.score.notes`,
never advances the clock.

- **Input per frame:** a `viewport = { startSec, endSec, lowMidi, highMidi }`
  computed by the caller.
- **Notes:** horizontal rects. `x = (note.start - startSec) * pxPerSec`,
  `width = note.duration * pxPerSec`, `y = pitchTrack(note.midi)`,
  `height = trackHeight`. Hand colours match the falldown:
  `RIGHT #4a90d9`, `LEFT #e08a3c`. Velocity → opacity, reusing
  `MIN_NOTE_ALPHA = 0.5` from `src/falldown/renderer.ts`.
- **Sounding notes** at time `t` get a `shadowBlur = GLOW_BLUR` halo, same
  treatment as the falldown.
- **Playhead:** a 1 px vertical line at `t`.
- **Beat grid:** vertical lines at downbeats (`DOWNBEAT_LINE`) and beats
  (`BEAT_LINE`) using the existing `beatGridLines` helper (it takes the
  meter from `transport.score.timeSignatures[0]`).
- **Wait-mode next step:** a thin green vertical band (`INPUT_CORRECT
  #44aa88`) at `controller.currentStep.startSec`, when the MIDI session is
  active and wait-mode is enabled.
- **Loop region:** a low-alpha red horizontal band over the rect area for the
  loop's measure range. Same colour token as the engraved lane's `.lane-loop`.
- **Section labels:** small label chips (`{ section.label }`) above the rect
  area at `x = (section.start - startSec) * pxPerSec`. Drawn only if
  `score.sections.length > 0`.

The renderer never owns the canvas element; callers pass a `ctx` and a
`{ width, height }`. Reused by `PianoRollLane` and `PianoRollPanel`.

### `PianoRollLane` — paginated reading-lane variant

`src/piano-roll/PianoRollLane.ts`. Mirrors `ReadingLaneView`'s role and
interaction model.

- **Pagination:** a page = N consecutive measures (default 4, capped to lane
  width so dense passages remain legible). Within a page, x is linear in
  time, so measures with tempo changes get proportionally different widths.
  Page is recomputed when the playhead crosses the page-boundary measure.
- **Auto-jump:** discrete page-turn on boundary crossing; identical UX to
  `ReadingLaneView`. No smooth scroll.
- **Manual scroll:** wheel/trackpad scrolls the lane freely (mirror's the
  engraved lane). Auto-jump still wins on every page change.
- **Click / drag:** mirrors `ReadingLaneView` — click a measure region =
  `transport.clock.seek(measure.start)`; drag across measures =
  `transport.loopMeasures(first, last)`. The shared `interactions.ts`
  helpers (`measureIndexFromTarget`, `orderedRange`) work as-is.
- **Overlays:** loop indicator (`.lane-loop` reused) and drag preview
  (`.lane-drag` reused) sit on top of the canvas; subscribe to
  `clock.onChange` to refresh. Hover marker (`.lane-hover` reused) tracks
  the pointer.
- **Hit-testing:** each measure's px-rectangle is recomputed when the page
  changes and stored on a `measureRects: Map<measureIndex, Rect>`. Pointer
  events hit-test against this map (no per-event `getBoundingClientRect`).

### `PianoRollPanel` — split-view variant

`src/piano-roll/PianoRollPanel.ts`. The split-panel "score panel" content
when `source === "midi"`.

- **Pagination:** identical to `PianoRollLane` but page size adapts to the
  panel's wider, taller dimensions (default 8 measures).
- **No reading-lane overlays** (no rounded background, no scrolling
  affordance). Just the canvas + a zoom row (the existing `.score-zoom`
  buttons) re-purposed to adjust **pitch-axis padding** (more vertical room
  per pitch row).

### `pitchAutoFit` — pure helper

`src/piano-roll/pitchAutoFit.ts`.

```ts
function pitchAutoFit(
  notes: Note[],          // notes visible in the current window + look-ahead
  cap: { minSpan: number; maxSpan: number }, // semitones; default { minSpan: 24, maxSpan: 88 }
): { lowMidi: number; highMidi: number };
```

Returns the [low, high] pitch range to render. Includes one-page-ahead and
one-page-behind notes in its window so adjacent pages share a stable range
and the keys don't jitter. Clamped to A0–C8.

### `measurePaging` — pure helper

`src/piano-roll/measurePaging.ts`.

```ts
function pageForMeasure(
  measureIndex: number,
  measuresPerPage: number,
): { first: number; last: number };
```

Trivial integer math, but expressed as a helper so the lane and panel
agree on page boundaries.

### `MeasureProgressBar` — React component

`src/ui/MeasureProgressBar.tsx`. Replaces the TopBar's `hud-scrubber`.

- **One flex cell per measure**, width proportional to
  `(measure.end - measure.start)` (time-linear, so the visual sweep matches
  play speed even across tempo changes).
- **Current measure:** highlighted in accent green (`#44aa88`); hover =
  brighter cell.
- **Click cell** = `transport.clock.seek(measure.start)`.
- **Drag across cells** = `transport.loopMeasures(first, last)`.
- **Loop band:** translucent red overlay covering the loop's measure cells,
  subscribed to `clock.onChange`.
- **Playhead:** a 1 px vertical line at the current time, drawn over the
  cells.
- **Section labels:** small label chip above each section's measure cell,
  drawn only if `score.sections.length > 0`.
- Component is source-agnostic — renders for both Play and MIDI tabs.

### `Minimap` — React component

`src/ui/Minimap.tsx`. New 16 px strip below the TopBar.

- **Density layer:** one column per measure, intensity = note count.
- **Playhead caret** at current time.
- **Viewport box:** a translucent box covering the measures currently
  visible in the lane (XML's system range or MIDI's page range). Source
  for the box comes from the active lane/panel via a callback or a shared
  state — `PracticeView` owns the "current window" state and passes it
  down.
- **Section ticks:** small marks above the strip at each section's x.
- **Click anywhere** = seek to that time; **drag** = loop sweep.
- Toggleable via a button in the TopBar's right-side controls, persisted
  to `practiceState.minimapVisible`. Defaults to true.

## Section markers

### Data model

Add to `src/model/score.ts`:

```ts
export interface Section {
  /** Onset of the section, seconds from the start of the piece. */
  start: number;
  /** Display label as written in the source file (e.g. "Verse 1", "A"). */
  label: string;
}

// Score gains:
sections: Section[]; // empty array if the source carried none. Sorted by start.
```

### Importer changes

**MIDI** (`src/import/midi/parseMidi.ts`):

```ts
const sections: Section[] = midi.header.meta
  .filter((e) => e.type === "marker")
  .map((e) => ({
    start: midi.header.ticksToSeconds(e.ticks),
    label: e.text,
  }))
  .sort((a, b) => a.start - b.start);
```

The `@tonejs/midi` package already exposes `header.meta: MetaEvent[]` —
each `{ text, type, ticks }`. Marker meta events (FF 06) come through as
`type === "marker"`.

**MusicXML** (`src/import/musicxml/parseMusicXml.ts`):

For each `<measure>`, walk `<direction>/<direction-type>/<rehearsal>`.
The `<rehearsal>` element's text content is the label; the section starts
at the measure's start time. Skip `<segno>` and `<coda>` for v1 (those
are jump-flow markers with different semantics).

Both importers emit empty arrays when no markers are present.

### Rendering

`MeasureProgressBar`, `Minimap`, `PianoRollLane`, and `PianoRollPanel` all
read `score.sections` directly and render labels at `section.start`. The
engraved `ScoreView` (XML) shows them automatically via Verovio's
rehearsal-mark rendering; we don't paint anything on top. The engraved
ScoreView for **MIDI imports** stays silent on sections in v1 — that needs
sections injected back into the auto-generated MusicXML in
`midiToMusicXml.ts`, which is out of scope here.

## Data flow

```
Transport (clock + score)
   │
   ├── MeasureProgressBar     subscribes to clock.onChange  → redraw bar + playhead
   ├── Minimap                subscribes to clock.onChange  → redraw caret + viewport box
   ├── PianoRollLane/Panel    RAF tick                       → redraw page, jump on boundary
   └── FalldownRenderer       unchanged
```

Every navigation gesture writes back to `transport.clock.seek` or
`transport.loopMeasures`; components don't talk to each other. Wait-mode
state is read through the existing `WaitModeController` (the lane and panel
read `controller.currentStep` once per frame; identical to how the falldown
will consume it once that integration lands).

## `PracticeView` wiring

The stable-mount constraint (`src/app/PracticeView.tsx:56-69`) is preserved.
Two new ref slots — `pianoRollLaneRef`, `pianoRollPanelRef` — render as
`<canvas>` elements at fixed React-tree positions next to (not replacing)
the existing `scoreContainerRef` and `laneContainerRef`. CSS reveals one
pair or the other.

Mount effect branches:

```ts
if (score.source === "midi") {
  // construct PianoRollLane against pianoRollLaneRef
  // construct PianoRollPanel against pianoRollPanelRef
  // do NOT construct ReadingLaneView / ScoreView
} else {
  // existing path: construct ReadingLaneView / ScoreView
}
```

CSS classes drive visibility:

```css
.practice-content--midi-roll .practice-lane-panel,        /* hide engraved lane */
.practice-content--midi-roll .practice-score-panel        /* hide engraved score panel */
  { display: none; }
.practice-content--midi-engrave .piano-roll-lane-panel,   /* hide piano-roll lane */
.practice-content--midi-engrave .piano-roll-panel         /* hide piano-roll panel */
  { display: none; }
```

The `practice-content--midi` class gets a `-roll` or `-engrave` suffix
chosen at mount based on `score.source`.

## Testing

**Unit (Vitest):**

- `pitchAutoFit` — range capping (minSpan, maxSpan), look-ahead inclusion,
  A0–C8 clamp.
- `pageForMeasure` — boundary integer math.
- `MeasureProgressBar` measure-from-x hit-testing (pure function).
- `Minimap` viewport-box position math.
- `parseMidi` — extracts markers; empty array when none present.
- `parseMusicXml` — extracts rehearsal marks; empty array when none.

**Component (Vitest + jsdom):**

- `MeasureProgressBar` — click → seek, drag → loop.
- `Minimap` — click → seek, drag → loop, toggle hide/show persists.
- `PracticeView` source-branching — mounts piano-roll components when
  `source === "midi"`, mounts engraved when `source === "musicxml"`. No
  remount across mode switches.

**E2E (Playwright):**

- One new test: load `tests/fixtures/clean.mid` (existing fixture), assert
  the piano-roll lane (`data-testid="piano-roll-lane"`) is visible and the
  engraved lane is not. Click measure 2 on the progress bar; assert
  playhead is at `transport.clock.position === measures[1].start`. Drag
  measures 2–4 on the progress bar; assert loop is set.
- Existing 11 e2e tests should pass unchanged.

**Drawing logic is not pixel-asserted** — same convention as the
`FalldownRenderer`.

## Files changed

| Path | Action | Size estimate |
|---|---|---|
| `src/piano-roll/PianoRollRenderer.ts` | new | ~250 LOC |
| `src/piano-roll/PianoRollLane.ts` | new | ~200 LOC |
| `src/piano-roll/PianoRollPanel.ts` | new | ~150 LOC |
| `src/piano-roll/pitchAutoFit.ts` | new | ~40 LOC pure |
| `src/piano-roll/measurePaging.ts` | new | ~30 LOC pure |
| `src/piano-roll/pitchAutoFit.test.ts` | new | ~50 LOC |
| `src/piano-roll/measurePaging.test.ts` | new | ~30 LOC |
| `src/ui/MeasureProgressBar.tsx` | new | ~120 LOC |
| `src/ui/MeasureProgressBar.test.tsx` | new | ~80 LOC |
| `src/ui/Minimap.tsx` | new | ~100 LOC |
| `src/ui/Minimap.test.tsx` | new | ~60 LOC |
| `src/ui/TopBar.tsx` | edit | swap `hud-scrubber` for `<MeasureProgressBar/>`, add minimap toggle button |
| `src/app/PracticeView.tsx` | edit | source-branch in mount effect; two new refs + canvases |
| `src/library/LibraryBrowser.tsx` | edit | source label in row |
| `src/import/midi/parseMidi.ts` | edit | extract markers → `Score.sections` |
| `src/import/midi/parseMidi.test.ts` | edit | one new test (marker MIDI fixture) |
| `src/import/musicxml/parseMusicXml.ts` | edit | extract `<rehearsal>` → `Score.sections` |
| `src/import/musicxml/parseMusicXml.test.ts` | edit | one new test (rehearsal XML fixture) |
| `src/model/score.ts` | edit | add `Section` type and `sections: Section[]` field |
| `src/styles/theme.css` | edit | add `.measure-progress-bar`, `.minimap`, `.piano-roll-*` styles; delete `.hud-scrubber` rules at lines ~184, ~188, ~325, ~343, ~356 (replaced by bar) |
| `src/library/practiceState.ts` | edit | persist `minimapVisible: boolean` (default true) |
| `src/library/db.ts` | edit | add `minimapVisible?: boolean` to `StoredPracticeState` |
| `tests/fixtures/sections.mid` | new | small fixture w/ marker events |
| `tests/fixtures/sections.musicxml` | new | small fixture w/ `<rehearsal>` |
| `tests/e2e/piano-roll.spec.ts` | new | one Playwright test |

No changes to `Transport`, `WaitModeController`, `MidiSession`, falldown
renderer, or audio engine — everything reads the existing shape.

## Open risks / things to watch in the plan

- **Auto-fit pitch jitter** between adjacent pages — the look-ahead in
  `pitchAutoFit` mitigates this; the test asserts a stable range across a
  page boundary where one extreme note triggers re-fit.
- **MIDI files with broken marker timings** (a marker placed mid-measure)
  — render the label at the marker's actual `start`, not snapped to the
  enclosing measure. The progress bar's label position handles non-aligned
  starts by aligning to the cell containing that time.
- **Performance:** the piano-roll renderer paints `O(notes_in_window)` per
  frame. For a 4-measure window the count is small (~tens to low hundreds).
  No concerns expected, but the renderer should be benchmarked against the
  largest fixture in `tests/fixtures/` before declaring the plan done.
- **`hud-scrubber` styles are referenced elsewhere** — verify by grep
  before deletion. If only `TopBar.tsx` references it, full removal; else
  rename and reuse.
