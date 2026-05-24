# Feature B: Import & Score Model

**Status:** Done
**Owner:** subagent
**Detailed plan:** docs/superpowers/plans/2026-05-17-feature-b-import-score-model.md

## Scope

The canonical `Score` model types; file-type detection (MIDI vs MusicXML);
MusicXML parser; MIDI parser (`@tonejs/midi`); MIDI→MusicXML converter
(approximate notation); MIDI source-quality detection and warning.
Does NOT cover playback, rendering, or storage.

## Dependencies

A (Scaffold & Deploy).

## Changes log

- 2026-05-17 — Feature defined.
- 2026-05-18 — Built (Tasks 1-8): Score model types + `@tonejs/midi`; file-type
  detection; test fixtures (hand-written MusicXML + generated MIDI); MIDI parser;
  MusicXML parser; approximate MIDI→MusicXML converter; live-performance quality
  heuristic; `importFile` orchestrator.
- 2026-05-18 — Post-review fixes: `midiToMusicXml` reworked so a staff's emitted
  durations always sum to the bar length (overlapping notes in one hand no longer
  overflow the measure); added parseMidi tests for the polyrhythm fixture,
  single-track hand split, and sustain-pedal scan.
- 2026-05-23 — Added `midiMarkers?: ReadonlyArray<{ time, text }>` to `Score`
  and re-introduced marker meta-event extraction in `parseMidi` (sourced from
  the conductor track only per @tonejs/midi). Consumed by Feature J's
  auto-detect Pass 1 as hard boundaries.
- **2026-05-24** — `midiToMusicXml` emits a slim `<attributes><time>…</time></attributes>` block at every measure whose active time signature differs from the previous one (was: first segment only).

## Keywords

src/model/score.ts, src/import/detectType.ts, src/import/musicxml/parseMusicXml.ts,
src/import/midi/parseMidi.ts, src/import/midi/midiToMusicXml.ts,
src/import/midi/quality.ts, Score, Measure, Note, PedalEvent, TempoMap.

## Testing

Test files (Vitest, 31 tests across the feature; run `npm test`):

- `src/import/detectType.test.ts` — MIDI/MusicXML/unknown detection.
- `src/import/midi/parseMidi.test.ts` — MIDI → Score: notes, hands (2-track and
  single-track), tempo, measures, polyrhythm fixture, sustain-pedal pairing.
- `src/import/musicxml/parseMusicXml.test.ts` — MusicXML → Score: pitches,
  timing, staves/hands, time signature, tempo, verbatim XML.
- `src/import/midi/midiToMusicXml.test.ts` — well-formed `score-partwise` output,
  two staves, round-trips through `parseMusicXml`, never overflows a bar.
- `src/import/midi/quality.test.ts` — clean MIDI not flagged; performance flagged.
- `src/import/importFile.test.ts` — end-to-end MIDI + MusicXML import, rejection.

Manual checklist (revisit during Feature F):

- [ ] Converted score from `clean.mid` is readable when rendered by Verovio.
- [ ] The live-performance warning copy reads sensibly to a user.

Automated status (verified 2026-05-18): `npm run lint`, `npm run typecheck`,
`npm test` (31/31), `npm run build` all pass.
