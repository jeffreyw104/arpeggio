# Feature F: Score View

**Status:** Done
**Owner:** subagent
**Detailed plan:** docs/superpowers/plans/2026-05-18-feature-f-score-view.md

## Scope

Verovio WASM engraving of the score; continuous scroll tracking the current
measure; live current-note highlight; click-measure-to-jump; drag-select across
measures to set the A-B loop on the notation. Does NOT cover layout (Feature G).

## Dependencies

B (Score Model), C (Transport), D (Audio).

## Changes log

- 2026-05-17 — Feature defined.
- 2026-05-18 — Built (Tasks 1-4): `verovio` (WASM toolkit load + MusicXML→SVG +
  timemap); `sync` (clock-time→measure index, `notesAtTime`); `interactions`
  (DOM target→measure index, drag-range ordering); `ScoreView` (injects SVG,
  tags measures, highlights current measure + sounding notes, scrolls into
  view, click-to-seek, drag-to-loop). Added `src/verovio.d.ts` (verovio ships
  no types) and a global `afterEach` DOM cleanup in `src/test/setup.ts` for
  test isolation.

## Keywords

src/score-view/verovio.ts, src/score-view/sync.ts,
src/score-view/interactions.ts, src/score-view/scoreView.ts, ScoreView,
loadVerovioToolkit, renderScore, currentMeasureIndex, notesAtTime,
measureIndexFromTarget, Verovio, timemap, measure click, drag-select loop.

## Testing

Test files (Vitest; run `npm test`):

- `src/score-view/verovio.test.ts` — `measureElementCount` SVG parsing.
- `src/score-view/sync.test.ts` — measure-index lookup, range, `notesAtTime`.
- `src/score-view/interactions.test.ts` — DOM-target→measure index, drag order.
- `src/score-view/scoreView.test.ts` — SVG injection + measure tagging,
  current-measure / current-note highlight, click-to-seek, drag-to-loop,
  `destroy` cleanup (all via fake SVG + jsdom DOM).

The Verovio WASM load (`loadVerovioToolkit`/`renderScore`) is not unit-tested —
it is exercised manually / by Feature G integration.

Automated status (verified 2026-05-18): `npm run lint`, `npm run typecheck`,
`npm test` (119/119 total), `npm run build` all pass.

Manual checklist (revisit when the score panel is mounted in Feature G):

- [ ] Score engraves and scrolls; current measure highlights and stays in view.
- [ ] Currently sounding notes highlight live.
- [ ] Clicking a measure jumps playback (and the falldown follows).
- [ ] Dragging across measures sets the A-B loop.
