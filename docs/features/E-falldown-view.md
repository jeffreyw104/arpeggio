# Feature E: Falldown View

**Status:** Done
**Owner:** subagent
**Detailed plan:** docs/superpowers/plans/2026-05-18-feature-e-falldown-view.md

## Scope

Canvas2D falling-notes renderer with hand color-coding; piano keyboard with
auto-fit key range (renders only used keys) plus a full-88 toggle; beat-grid
overlay; toggleable note-name labels; live key highlighting. Does NOT cover
layout/view modes (Feature G).

## Dependencies

B (Score Model), C (Transport), D (Audio).

## Keywords

src/falldown/keyRange.ts, src/falldown/piano.ts, src/falldown/notes.ts,
src/falldown/beatGrid.ts, src/falldown/renderer.ts, FalldownRenderer,
keyLayout, noteRects, activeKeys, beatGridLines, autoFitRange, Canvas2D,
requestAnimationFrame, key highlight.

## Changes log

- 2026-05-17 — Feature defined.
- 2026-05-18 — Built (Tasks 1-5): `keyRange` (auto-fit + FULL_88); `piano`
  (key-rect geometry, `midiToNoteName`, `drawPiano`); `notes` (falling-note
  geometry + `activeKeys`); `beatGrid` (beat-line positions, downbeats);
  `FalldownRenderer` composing all of it with full-88 / note-label / beat-grid
  toggles and a requestAnimationFrame draw loop. The renderer only reads the
  clock; a later feature owns the clock-tick loop.
- 2026-05-18 — Post-review fix: paint the falldown background explicitly
  (`clearRect` clears to transparent, so a `fillRect` was needed); hardened
  `keyLayout` against degenerate / black-key-bounded ranges; strengthened the
  note-rect render assertion and added a full-88 layout test.
- **2026-05-24** — Visual beat grid and hit-line pulse follow mid-piece time-signature changes. `FalldownRenderer.timeSignatures: TimeSignature[]` replaces `beatMeter`; `beatGridLines` and `beatPulse` look up the active signature per measure. Saved per-piece overrides in `PracticeView` write a single-segment array (and are now only emitted when `metronome.manualOverride` is true, to avoid silently flattening multi-sig pieces).
- **2026-05-24** — Post-review fix: `FalldownRenderer` no longer caches `score.timeSignatures` at construction. It now reads live from `transport.score.timeSignatures` in `drawBeatGrid` / `beatPulse` (matching the existing live-read of `score.measures`). Writing to `renderer.timeSignatures` flips an internal `manualOverride` flag and stores the value, so Tools-popover overrides are preserved while tempo-mode swaps (which retime the score) are picked up automatically when no override is set.

## Testing

Test files (Vitest; run `npm test`):

- `src/falldown/keyRange.test.ts` — auto-fit range, white-key padding, FULL_88.
- `src/falldown/piano.test.ts` — key tiling, black-key placement, note names,
  `drawPiano`, full-88 layout.
- `src/falldown/notes.test.ts` — falling-note geometry, culling, hand colors,
  active-key detection.
- `src/falldown/beatGrid.test.ts` — beat-line positions, downbeats, culling.
- `src/falldown/renderer.test.ts` — frame composition, note drawing, toggles,
  rAF loop start/stop (all via a fake recording canvas context).

Automated status (verified 2026-05-18): `npm run lint`, `npm run typecheck`,
`npm test` (101/101 total), `npm run build` all pass.

Manual checklist (revisit when the canvas is mounted with a loaded piece in
Feature G):

- [ ] Notes fall onto the correct keys exactly on the beat; piano alignment exact.
- [ ] Hands are color-coded; the beat grid scrolls with the music.
- [ ] Note labels and the full-88 toggle work; keys light up as notes sound.
