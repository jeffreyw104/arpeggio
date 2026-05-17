# Feature F: Score View

**Status:** Not started
**Owner:** subagent
**Detailed plan:** _(write before build)_

## Scope

Verovio WASM engraving of the score; continuous scroll tracking the current
measure; live current-note highlight; click-measure-to-jump; drag-select across
measures to set the A-B loop on the notation. Does NOT cover layout (Feature G).

## Dependencies

B (Score Model), C (Transport), D (Audio).

## Changes log

- 2026-05-17 — Feature defined.

## Keywords

src/score-view/verovio.ts, src/score-view/sync.ts, src/score-view/interactions.ts,
Verovio, timemap, SVG element IDs, measure click, drag-select loop.

## Testing

- Unit: clock-time <-> measure/note mapping via timemap; SVG element -> clock
  time resolution.
- Manual checklist: score renders; scroll follows playback; current note
  highlights; clicking a measure jumps; drag sets loop.
- Current status: not started.
