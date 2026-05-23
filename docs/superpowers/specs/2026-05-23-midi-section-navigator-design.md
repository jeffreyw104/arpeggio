# MIDI Section Navigator — Design Spec

**Date:** 2026-05-23
**Status:** draft
**Source format scope:** `score.source === "midi"` only — MusicXML imports are unchanged by this spec.

## Background

Arpeggio currently converts every imported MIDI file to MusicXML via `src/import/midi/midiToMusicXml.ts` and engraves the result with Verovio so the score panel and reading-lane ribbon can render. Auto-conversion is a lossy process and the engraved output is hard to read on most MIDI files. The user can technically navigate the piece by dragging the slim TopBar scrubber, but doing so gives no sense of structure — they don't know what they're seeking *to*.

This spec replaces the engraved score panel and reading-lane ribbon, **for MIDI source files only**, with a horizontal **section navigator strip**: a structural map of the piece that you can click, drag, edit, and decorate with personal bookmarks. The falldown becomes the sole reading aid for MIDI sources.

## Goals

1. Replace the lackluster auto-engraved sheet music for MIDI sources with a navigator that answers "where am I and what's around me?"
2. Make the navigator editable so users own the structure when auto-detection is wrong.
3. Pair naturally with practice features: clicking jumps the playhead, right-clicking can engage a loop.
4. Leave MusicXML imports completely alone.

## Non-goals

- Re-engraving MIDI files differently (the auto-MusicXML path stays in place but its output is no longer rendered).
- Replacing the scrubber for MusicXML files.
- Anything resembling a piano-roll or other literal note-shape visualizer in the side panel — the falldown already covers that.
- Auto-generated bookmarks. Bookmarks are 100% user-created.

## Scope summary

| Surface | MusicXML source | MIDI source |
|---|---|---|
| Falldown | unchanged | full-width (takes back the panel) |
| Engraved score panel | unchanged | hidden |
| Reading-lane ribbon | unchanged | hidden |
| Slim TopBar scrubber | unchanged | hidden (time text "0:48 / 2:36" stays) |
| Practice-layout toggle (split / lane) | unchanged | hidden |
| Lane-theme picker | unchanged | hidden |
| Section navigator strip | absent | present, top or bottom of screen |

## UX

### Layout

For MIDI sources, the practice screen is three vertical bands:

1. **TopBar** — logo · Library · ▶ play/pause · "0:48 / 2:36" text · piece name · Play/MIDI Practice tab toggle · Tools.
2. **Falldown** — full-width canvas, takes back the space the score panel used to consume.
3. **Section navigator strip** — full-width, ~88px tall. By default it sits below the falldown; the user can move it to sit above the falldown (below the TopBar) via a `↕` button on the strip itself or a mirror toggle in the Tools popover. Preference is stored in `localStorage` under `arpeggio.stripPosition` (`"top" | "bottom"`, default `"bottom"`), applies across all MIDI pieces.

Both the Play tab and MIDI Practice tab use this layout; the only thing that changes when you switch tabs is which inputs are wired to the clock (mouse vs. MIDI keyboard).

### Strip anatomy

Top-to-bottom inside the strip:

- **Bookmark lane** (≈18px) — 📌 icons at each bookmark's time offset, with a trailing short text label. Bookmarks that crowd each other stack with a small vertical offset.
- **Section row** (≈48px) — colored blocks left-to-right, widths proportional to duration. Each block: name (truncated to leading initial if too narrow) + measure range + duration. The block containing the current playhead is raised 3px, brighter, and outlined. Colors cycle through a fixed 5-color palette purely as visual distinguishers — color carries no data.
- **Editing toolbar** (≈22px) — `[＋ Section at playhead]   [📌 Bookmark at playhead]` buttons, a short hint line ("double-click to rename · drag boundary to resize · right-click for more"), and the `↕` position-toggle button.

A vertical playhead line spans the bookmark lane and section row, with a small dark `1:18` pill on top. It updates every frame via the existing `FrameLoop`.

### Interactions

| Gesture | Result |
|---|---|
| Click a section block | Seek to its start (`transport.clock.seek(section.start)`) |
| Click on the strip background between blocks | Scrub-seek to that time |
| Drag horizontally on the strip | Continuous scrubbing |
| Double-click a section block | Inline rename — block content becomes a text input, Enter / blur commits, Escape cancels |
| Drag a section boundary handle | Resize section; the adjacent sibling shrinks/grows to preserve the cover invariant. Minimum length on manual resize / split: 1 measure (auto-detection's smoothing pass is stricter — see below). |
| Right-click a section block | Context menu: Rename · Split here · Merge with right · Loop section · Delete |
| Click a 📌 bookmark | Seek to its time |
| Right-click a 📌 bookmark | Context menu: Rename · Loop to next mark · Delete |
| `S` key (no input focused) | Add a section boundary at the playhead |
| `B` key (no input focused) | Add a bookmark at the playhead |
| `↕` button (strip footer or Tools popover) | Cycle top ↔ bottom position; persist preference |

### Practice mode (MIDI Practice tab) changes

The MIDI Practice tab uses the same layout as Play. Compared to today:

- **Removed:** reading-lane ribbon, practice-layout toggle (`split` vs `lane`), lane-theme picker. They were all about positioning / styling the engraved reading lane, which is gone for MIDI sources.
- **Unchanged:** `MidiSession`, `WaitModeController`, all MIDI input behavior — device selection, hands-I-play, wait-mode toggle, monitor toggle, count-in. These continue to live in the Tools popover.
- **Reading aid:** the falldown is the only reading aid. Wait-mode still parks the falldown's playhead on the chord you owe; the section strip's playhead also stops moving while the clock is held.

Manual seek-via-strip respects the existing reset behavior: clicking a section outside an active loop clears the loop (already implemented as of commit `ed5bcb0`); wait-mode resets on manual seek (commit `15dc781`).

### Loop integration

- **Loop section.** Right-click a section → "Loop section" toggle. Sets `transport.clock.setLoop({ start: section.start, end: section.end })`. The looped span gets a dashed outline on the strip while active. Toggle off clears the loop.
- **Loop from bookmark to next mark.** Right-click a bookmark → "Loop to next mark." Sets the loop from this bookmark's time to the next bookmark by time order. If there is no next bookmark, falls back to the end of the section containing this bookmark.
- **Outside-the-loop seeking** clears the loop (existing behavior, applies unchanged).

### Edge cases

| Situation | Behavior |
|---|---|
| Score has 0 notes | Single section `"Whole piece"` covering `[0, duration]`; no bookmarks; strip renders normally |
| Score has 1 measure or very short duration | Single section covering the whole piece |
| Auto-detection produces 0 boundaries | Single section `"Whole piece"` |
| Section block too narrow to show its name | Render only its leading initial; full info on hover |
| Many bookmarks within a few pixels of each other | Stack labels with vertical offset |
| Tempo-mode toggle retimes the score | Existing `transport.onScoreChange` rescales `sectionState` times by the same factor — no re-detection |

## Data model

A new file `src/model/sections.ts`:

```ts
export interface Section {
  /** Stable UUID minted on creation; survives all edits. */
  id: string;
  /** Inclusive start time, seconds. */
  start: number;
  /** Inclusive end time, seconds. Equals the next section's start. */
  end: number;
  /** Display name. Editable. "Section N" when auto-generated. */
  name: string;
  /** True until the user edits this section (rename / resize / split / merge). */
  isAuto: boolean;
}

export interface Bookmark {
  id: string;
  /** Time in seconds. */
  time: number;
  /** Display name. Editable. "Mark N" if added empty. */
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
```

### Invariants (enforced by a single `normalize(state, duration)` helper after every edit)

- `sections` is sorted ascending by `start`.
- `sections` covers `[0, duration]` contiguously: `sections[0].start === 0`, `sections[i].end === sections[i+1].start`, `sections[last].end === duration`.
- No section has `end <= start`.
- `bookmarks` is sorted ascending by `time`; every `time` lies in `[0, duration]`.
- IDs are unique within their array and never reassigned.

`normalize` is the canonical re-anchor point: it sorts, repairs adjacency, clamps endpoints, and is called after every edit operation as a final pass.

## Auto-detection algorithm

Runs once, on the first open of a MIDI piece when no `sectionState` exists in storage. Pure function: `autoDetect(score: Score): SectionState`.

**Inputs:** `score.notes`, `score.measures`, `score.tempoEvents`, time-signature changes (derivable from `score.measures` — denominator/numerator change between adjacent measures), and `score.midiMarkers` if present.

### Pass 1 — Hard boundaries (always split)

For each of these signals, force a section boundary at the nearest measure start:

- **MIDI marker meta-events.** If `score.midiMarkers` has entries, each marker time becomes a boundary; the marker text becomes the section's `name`.
- **Tempo change** with ≥ 8% delta from the previous tempo (`|new - old| / old >= 0.08`).
- **Time-signature change** between adjacent measures.

### Pass 2 — Soft boundaries (cluster of signals)

For each measure boundary that's not already a hard boundary, count how many of these signals fire within ±1 measure of it:

- **Long rest.** Both hands silent (no note onset and no sustained note) for ≥ 2.0 seconds AND ≥ 1 measure.
- **Density shift.** notes/sec in the 4 measures after the boundary differs from the 4 measures before by ≥ 2× in either direction.
- **Register shift.** Mean MIDI pitch jumps ≥ 12 semitones between the 4-measure window before and after the boundary.

If 2 or more soft signals fire at the same boundary → mark it as a section boundary.

### Pass 3 — Smoothing

In order:

1. **Merge small sections.** Any resulting section shorter than 2 measures is merged into its neighbour (prefer merging into the shorter neighbour; tie → left).
2. **Cap total.** If `sections.length > 12`, drop the weakest soft boundaries until count is ≤ 12. Weakness order: fewest contributing soft signals first; tie-break by dropping the boundary that creates the shortest adjacent section. Hard boundaries are never dropped.
3. **Fallback.** If 0 boundaries survive, return a single section `"Whole piece"` spanning `[0, duration]`.

### Pass 4 — Naming (smart labels)

The first rule that matches wins; if no rule matches, fall through to the numbered fallback. **A label is only chosen when its signal is strong** — borderline cases fall through to `"Section N"` rather than risk a misleading label.

**Smart labels are gated on the file having no markers.** If `score.midiMarkers` has any entries — i.e., the MIDI declares its own sections — the author is trusted: sections with marker text (rule 1) keep that text, sections without a marker fall straight through to the numbered fallback (rule 8). Rules 2–7 are skipped entirely. The principle: don't mix the composer's labels with heuristic guesses on the same piece.

The full priority order:

1. **MIDI marker text** — if Pass 1 attached marker text to this section, use it verbatim.
2. **Position labels** *(only if `score.midiMarkers` is empty)* — high confidence, always apply when allowed:
   - First section → `"Intro"`.
   - Last section (only if there are ≥ 3 sections total) → `"Outro"`.
3. **Climax** *(only if `score.midiMarkers` is empty)* — at most one section in the entire piece can be labeled "Climax". Pick it as the section that simultaneously satisfies all three: density ≥ 1.8 × median, mean register ≥ median + 6 semitones, duration ≥ 4 measures. If multiple candidates qualify, pick the one with the highest density × register product. If none qualify, no section gets "Climax".
4. **Hand-isolated labels** *(only if `score.midiMarkers` is empty)* — if ≥ 95% of a section's notes belong to one hand:
   - Right hand only → `"Melody"`.
   - Left hand only → `"Bass line"`.
5. **Density-relative labels** *(only if `score.midiMarkers` is empty, and duration ≥ 4 measures)*:
   - Density ≤ 0.4 × median → `"Quiet section"`.
6. **Tempo-relative labels** *(only if `score.midiMarkers` is empty, and duration ≥ 4 measures, and tempo is consistent inside the section)*:
   - Section's mean tempo ≥ 1.2 × median tempo → `"Fast section"`.
   - Section's mean tempo ≤ 0.8 × median tempo → `"Slow section"`.
7. **Combination with position** *(only if `score.midiMarkers` is empty)* — apply position prefix when overlap occurs:
   - First section + matches rule 5 (quiet) → `"Quiet intro"` (overrides plain `"Intro"`).
   - First section + matches rule 6 (slow) → `"Slow intro"` (overrides plain `"Intro"`).
8. **Fallback** — `"Section 1"`, `"Section 2"`, ..., numbered in section order.

**Medians** are computed across the whole piece (density = notes/sec averaged per measure; register = mean MIDI pitch per measure; tempo = current BPM per measure).

**All smart labels are still editable.** The user can rename any auto-labeled section the same way they rename `"Section N"` — and the moment they do, `isAuto` flips to `false` and the label sticks.

**Thresholds** (1.8×, 0.4×, 1.2×, 0.8×, +6 semitones, 95%, ≥ 4 measures) are named constants in `autoDetect.ts`, sibling to the boundary-detection thresholds.

### Tuning

The thresholds (8%, 2.0s, 2×, 12 semitones, max 12 sections, min 2 measures, plus the smart-label thresholds in Pass 4) are calibrated guesses. They're all named constants in `autoDetect.ts` for easy iteration.

## Persistence

The existing per-piece IndexedDB `practice-state` store gains one field:

```ts
interface StoredPracticeState {
  // ... existing fields ...
  sectionState?: SectionState;
}
```

### Lifecycle

1. **First open** (MIDI source, no `sectionState`): call `autoDetect(score)`, store result, use.
2. **Subsequent opens:** load `sectionState` from storage, use as-is. `autoDetect` is **never** re-run automatically.
3. **On every edit** (rename, split, merge, resize, add, delete, bookmark op): mark affected sections `isAuto: false`, run `normalize`, persist the whole `SectionState`.
4. **Tempo-mode retime** (existing `transport.onScoreChange` hook): a sibling handler in `PracticeView` rescales every section's `start` and `end` and every bookmark's `time` by the same factor that retimed the score.

**Strip position preference** is separate from per-piece state. Stored in `localStorage` under `arpeggio.stripPosition`. Default `"bottom"`. Applies across all MIDI pieces.

## Code structure

### New files

```
src/
  model/
    sections.ts              — types, normalize(), invariant helpers
  section-strip/
    autoDetect.ts            — pure: (Score) => SectionState
    autoDetect.test.ts
    edits.ts                 — pure: rename / split / merge / resize / add / delete
    edits.test.ts
    SectionStrip.tsx         — React component (DOM, not canvas)
    SectionStrip.test.tsx
```

**Why DOM and not canvas:** the strip needs inline text inputs (rename), context menus, drag handles, and hover tooltips — all easier in DOM. Section count is capped at ~12 so render-perf is a non-issue. The only frequent update is the playhead, which is one absolutely-positioned `<div>` whose `left` style is updated each frame from the shared `FrameLoop` — same pattern the falldown uses for its own animation.

### Modified files

- **`src/app/PracticeView.tsx`** — branch on `score.source === "midi"`:
  - Render `<SectionStrip>` above or below the falldown depending on the persisted `stripPosition`.
  - Skip `renderScore` / `renderReadingLane` calls when source is midi (no engraving needed for a hidden panel).
  - Hide the score-container and reading-lane panels via CSS (`display: none`) — but keep them mounted, to preserve the stability constraint at lines 56–69.
  - Pull `sectionState` from `StoredPracticeState`; if absent and source is MIDI, call `autoDetect` and persist.
- **`src/ui/TopBar.tsx`** — when source is midi: hide the slim scrubber input (keep the time text), hide the practice-layout segmented control, hide the lane-theme picker.
- **`src/ui/MidiTools.tsx`** — add the "Strip position: Top / Bottom" mirror toggle.
- **`src/library/practiceState.ts`** + **`src/library/db.ts`** — extend `StoredPracticeState` with optional `sectionState`; `capturePracticeState` / `applyPracticeState` plumb it through.
- **`src/import/midi/parseMidi.ts`** — re-add MIDI marker meta-event extraction. The reverted Spec 2 commits (`8e27f39..d64dc34`, reverted by `c51766b`) already did this — cherry-pick the parser changes only, not the visualizer.
- **`src/model/score.ts`** — add `midiMarkers?: Array<{ time: number; text: string }>` to `Score`.

### Wire-up flow

1. `PracticeView` resolves `StoredPracticeState` (existing async load).
2. When `score.source === "midi"`:
   - If `sectionState` is missing → `setSectionState(autoDetect(score))`, persist.
   - Otherwise → `setSectionState(stored.sectionState)`.
3. `<SectionStrip>` receives `sectionState`, `transport`, `onChange(next: SectionState)`, `stripPosition`, `isMidiTab`. Every edit op is a pure `edits.*` call → `setSectionState(normalize(next, duration))` → persist via `savePracticeState`.
4. Playhead position is read from `transport.clock` on every frame; strip subscribes to the existing `FrameLoop` (same pattern as the falldown renderer).
5. Strip position toggle reads/writes `localStorage` directly; the value lives in `PracticeView` state seeded from storage at mount.

## Testing

### Vitest unit tests

- **`sections.test.ts`** — `normalize()` enforces invariants on adversarial inputs (unsorted, overlapping, gaps, out-of-range bookmarks, duplicate IDs).
- **`autoDetect.test.ts`** — synthetic scores covering each detection path:
  - Marker-only (uses marker text as names; smart labeling skipped where markers win).
  - Tempo-change only.
  - Time-signature change only.
  - Long-rest only — doesn't trigger alone (needs cluster of 2+).
  - Density + register shift cluster → boundary.
  - Silent file → single "Whole piece" section.
  - 50-boundary worst case → smoothing caps at 12.
  - Smart labels — position labels: first section gets "Intro" when ≥ 3 sections; last gets "Outro".
  - Smart labels — exactly one "Climax" when multiple candidates qualify (highest density × register wins).
  - Smart labels — hand-isolated section (≥ 95% one hand) gets "Melody" / "Bass line".
  - Smart labels — combination: slow first section becomes "Slow intro", not "Intro".
  - Smart labels — borderline density / tempo falls through to "Section N" rather than mislabeling.
  - Smart labels gated off — a score with even one MIDI marker: marker-bearing sections get marker text, all others get "Section N" (no "Intro", "Outro", "Climax", etc).
- **`edits.test.ts`** — every edit op preserves invariants, IDs stay stable, `isAuto` flips correctly:
  - `rename(section)` → name updated, `isAuto: false`, other fields unchanged.
  - `split(section, time)` → two sections summing to original; both inherit `isAuto: false`.
  - `merge(section, neighbour)` → combined range; left name retained; `isAuto: false`.
  - `resize(boundary, time)` → adjacent siblings adjust; cover preserved.
  - `addSection(time)` / `deleteSection(id)` → cover invariant preserved.
  - `addBookmark(time, name)` / `deleteBookmark(id)` / `renameBookmark(id, name)`.
- **`SectionStrip.test.tsx`** (React Testing Library):
  - Click a block → `transport.clock.seek` called with section.start.
  - Double-click → text input renders; Enter commits; Escape cancels.
  - `S` and `B` keys fire when no input is focused; suppressed when one is.
  - Right-click → context menu with the expected items.

### Playwright e2e (extend the existing MIDI suite)

- Upload a MIDI fixture → strip is visible, score-container has `display: none`, no reading-lane.
- Click a section block → time text updates; playhead element moves to the right position.
- Rename a section via double-click → reload page → name persists.
- Toggle strip position (↕) → strip moves DOM positions; survive reload.
- MIDI Practice tab: wait-mode and hands-I-play behave as today; reading-lane is gone.
- Upload a MusicXML fixture → strip does NOT appear; engraved score + slim scrubber render normally.

### Verify gate

Before declaring the implementation done:

```
npm run lint && npm run typecheck && npm test && npm run build && npm run e2e
```

## Out of scope (future work)

- A section-aware ScoreView for MusicXML (extending the strip to XML sources).
- Auto-bookmarks (suggesting "tricky" passages based on density / chord-spread heuristics).
- Multi-select on sections / bulk operations.
- Drag-to-reorder bookmarks (they're position-anchored, so reordering doesn't apply — but moving a bookmark by drag could be added later).
- Export of section/bookmark data alongside the piece (e.g., a side-car JSON for sharing).

## Open questions

None at spec time. Auto-detection threshold tuning is expected to iterate during implementation and after early use; the named constants in `autoDetect.ts` are the entry points.
