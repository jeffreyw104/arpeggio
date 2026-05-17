# Feature E: Falldown View

**Status:** Not started
**Owner:** subagent
**Detailed plan:** _(write before build)_

## Scope

Canvas2D falling-notes renderer with hand color-coding; piano keyboard with
auto-fit key range (renders only used keys) plus a full-88 toggle; beat-grid
overlay; toggleable note-name labels; live key highlighting. Does NOT cover
layout/view modes (Feature G).

## Dependencies

B (Score Model), C (Transport), D (Audio).

## Keywords

src/falldown/renderer.ts, src/falldown/piano.ts, src/falldown/keyRange.ts,
src/falldown/beatGrid.ts, Canvas2D, requestAnimationFrame, key highlight.

## Changes log

- 2026-05-17 — Feature defined.

## Testing

- Unit: auto-fit key-range computation; note-to-x-position mapping;
  beat-grid line positions.
- Manual checklist: notes fall onto correct keys; alignment with piano exact;
  hand colors; labels toggle; beat grid toggle.
- Current status: not started.
