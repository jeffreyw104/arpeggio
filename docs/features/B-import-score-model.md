# Feature B: Import & Score Model

**Status:** Not started
**Owner:** subagent
**Detailed plan:** _(write before build)_

## Scope

The canonical `Score` model types; file-type detection (MIDI vs MusicXML);
MusicXML parser; MIDI parser (`@tonejs/midi`); MIDI→MusicXML converter
(approximate notation); MIDI source-quality detection and warning.
Does NOT cover playback, rendering, or storage.

## Dependencies

A (Scaffold & Deploy).

## Changes log

- 2026-05-17 — Feature defined.

## Keywords

src/model/score.ts, src/import/detectType.ts, src/import/musicxml/parseMusicXml.ts,
src/import/midi/parseMidi.ts, src/import/midi/midiToMusicXml.ts,
src/import/midi/quality.ts, Score, Measure, Note, PedalEvent, TempoMap.

## Testing

- Unit: parse fixture MusicXML and MIDI; assert Score model contents.
- Unit: MIDI→MusicXML on cleanly-sequenced fixture; MIDI quality detection on
  clean vs performance fixtures.
- Manual checklist: converted score is readable for a clean MIDI.
- Current status: not started.
