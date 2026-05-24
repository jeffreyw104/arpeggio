# Mid-Piece Time Signatures — Design Spec

**Date:** 2026-05-24
**Status:** draft
**Scope:** runtime audio (metronome), falldown beat grid, top-bar readout chip, and MIDI→MusicXML export.

## Background

Both parsers (MusicXML and MIDI) already capture every time-signature change into `score.timeSignatures: TimeSignature[]` with absolute `start` times. The data is correct. Three downstream consumers use only `score.timeSignatures[0]`:

- `src/audio/metronome.ts:55` caches a single `beatsPerBar` for the whole piece — the click grid never shifts when the score does.
- `src/falldown/renderer.ts:85` caches a single `beatMeter` — the visual hit-line pulse and beat-grid lines stay locked to the opening signature.
- `src/import/midi/midiToMusicXml.ts:230` emits only the first `<time>` element when exporting to MusicXML — round-tripped scores lose every later change.
- `src/ui/TopBarReadout.tsx:95` reads through `metronome.timeSignature`, which inherits the metronome's single-value model.

Repro: Chopin's Ballade in G minor (4/4 → 6/4 partway through) clicks 4/4 throughout, and the falldown's beat lines stay at 4 per measure even after the score shifts to 6.

## Goals

1. Metronome clicks follow every time-signature change in the score.
2. Falldown's visual beat grid and hit-line pulse match the active signature at the playhead.
3. Top-bar time-sig chip shows the active signature for the playhead position.
4. MIDI→MusicXML export emits every captured `<time>` element, not just the first.
5. Manual time-signature override in the Tools popover keeps working with a clear, simple semantic.

## Non-goals

- No new UI for editing the segment list. Manual override stays a single picker.
- No re-detection of time signatures from note data. The parsers' output is the source of truth.
- No backfill for already-exported MusicXML files. Re-export to pick up the new emission.

## UX call: what does manual override mean?

**Decision:** Manual override replaces all segments with a single user-chosen signature for the whole piece.

Rationale: it's the simplest model to explain ("I don't trust the score; use this everywhere") and matches the existing Tools popover affordance, which is a single picker. Per-segment editing would require a new UI surface that isn't justified by the use case.

Implementation: `Metronome.setTimeSignature(num, den)` replaces `segments` with `[{ start: 0, numerator: num, denominator: den }]` and sets `manualOverride = true`.

## Architecture

### New helper

`src/audio/timeSignatureAt.ts`

```ts
export function timeSignatureAt(
  sigs: TimeSignature[],
  time: number,
): TimeSignature
```

Returns the last entry in `sigs` whose `start <= time`. Falls back to `{ start: 0, numerator: 4, denominator: 4 }` when `sigs` is empty. Pure function; assumes `sigs` is sorted by `start` (matches both parsers' output).

### `src/audio/beats.ts`

- `metronomeBeats(measures, timeSignatures, subdivision)` replaces the `beatsPerBar: number` parameter with `timeSignatures: TimeSignature[]`. Per measure, look up the segment via `timeSignatureAt(timeSignatures, measure.start)` and use that numerator for the beat count.
- `beatPulse(measures, timeSignatures, t, decay)` takes the same change.

### `src/audio/metronome.ts`

- Replace `private beatsPerBar` and `private denominator` with `private segments: TimeSignature[]`.
- Add `private manualOverride = false`.
- Constructor reads `score.timeSignatures` (full array) into `segments`; falls back to `[{ start: 0, numerator: 4, denominator: 4 }]` when empty.
- `get timeSignature()` returns `timeSignatureAt(segments, curPosition)` — position-aware, no caching.
- `setTimeSignature(num, den)`: replace `segments` with single-entry array, set `manualOverride = true`, recompute, resync.
- `setScore(newScore)`: if `manualOverride` is true, keep current `segments`; else adopt `newScore.timeSignatures`. Recompute. Reason: a tempo-mode toggle swaps the score with a rescaled copy; the user's override must survive that.
- `recompute()`: pass `segments` instead of `beatsPerBar` to `metronomeBeats`.

### `src/falldown/renderer.ts`

- Replace `beatMeter: { numerator, denominator }` with `timeSignatures: TimeSignature[]`.
- Constructor reads `transport.score.timeSignatures` (full array).
- Update the `beatPulse` and `beatGridLines` calls to pass `this.timeSignatures` instead of `this.beatMeter.numerator`.
- `PracticeView`'s saved-state restore (`src/app/PracticeView.tsx:268-274`): when restoring a single-sig override, set `renderer.timeSignatures = [{ start: 0, numerator: state.numerator, denominator: state.denominator }]`.

### `src/falldown/beatGrid.ts`

`beatGridLines(measures, beatsPerBar, t, opts)` takes the same parameter change as `metronomeBeats`: `beatsPerBar: number` → `timeSignatures: TimeSignature[]`, and looks up each measure's numerator via `timeSignatureAt`.

### `src/ui/TopBarReadout.tsx`

No code change. It already reads `audioEngine.metronome.timeSignature`, which is now position-aware. The component re-renders every transport tick (it already displays `currentMeasure` which is position-derived), so the chip updates naturally.

### `src/import/midi/midiToMusicXml.ts`

`midiToMusicXml(score)` currently emits a single `firstMeasureAttributes` block on `i === 0`. Change to:

- Track `activeSig: TimeSignature | null` while walking measures.
- For each measure `i`, compute `nextSig = timeSignatureAt(score.timeSignatures, measure.start)`.
- If `i === 0` → emit the full attributes block (divisions, key, time, staves, clefs) and set `activeSig = nextSig`.
- Else if `nextSig.numerator !== activeSig.numerator || nextSig.denominator !== activeSig.denominator` → emit a slim `<attributes><time><beats>…</beats><beat-type>…</beat-type></time></attributes>` block at the start of that measure and update `activeSig`.
- Else → no extra attributes block.

The slim block contains only the `<time>` element — divisions/key/clefs/staves don't change mid-piece in this exporter.

## Testing

- `src/audio/timeSignatureAt.test.ts` (new): empty array → fallback; single entry; multi-entry boundary cases (exactly on `start`, just before, just after); time before all segments returns the first segment.
- `src/audio/beats.test.ts` (extend): `metronomeBeats` over a 4/4 → 3/4 score across four measures yields 4 + 4 + 3 + 3 main beats.
- `src/audio/metronome.test.ts` (extend):
  - 4/4 → 6/4 score: beats inside the second segment are spaced into 6 per measure.
  - `setTimeSignature(3, 4)` on a multi-segment score collapses to a single segment everywhere.
  - `setScore(newScore)` with `manualOverride = true` keeps the override; without it adopts the new score's segments.
- `src/import/midi/midiToMusicXml.test.ts` (extend): fixture score with a 4/4 → 6/4 change at measure 5 produces output containing exactly two `<time>` elements at the expected positions.
- `src/falldown/renderer.test.ts` (extend): assert `beatGridLines` is called with a position-appropriate numerator when `t` falls inside the second segment.

Manual checklist: open a piece with a mid-piece time-signature change (Chopin Ballade in G minor), enable the metronome, scrub past the 4/4 → 6/4 boundary, and verify (a) the click pattern shifts to 6 beats per bar, (b) the falldown beat lines change density, (c) the TopBarReadout chip flips from `4/4` to `6/4`.

## Documentation updates

- Remove the **Mid-piece time-signature changes not followed at runtime** bullet from `HANDOVER.md` "Backlog / not yet built".
- Append dated changes-log bullets to:
  - `docs/features/D-audio-metronome.md` (segment-aware grid + manual-override semantics).
  - `docs/features/E-falldown-view.md` (segment-aware visual beat grid + hit-line pulse).
  - `docs/features/B-import-score-model.md` (MIDI→MusicXML emits every `<time>` change).

## Out of scope / follow-ups

- Per-segment editing UI.
- Recomputing the score's `timeSignatures` from note data.
- MusicXML export from non-MIDI sources (none exists today).
- Mid-piece tempo-map handling already works; this spec does not touch tempo.
