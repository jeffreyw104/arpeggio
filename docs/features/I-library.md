# Feature I: Library

**Status:** Not started
**Owner:** subagent
**Detailed plan:** _(write before build)_

## Scope

IndexedDB storage of uploaded files; searchable library browser UI; per-piece
practice state remembered across sessions (last tempo, loop points, hand
mute/hide settings). Does NOT include progress/time tracking.

## Dependencies

B (Import & Score Model), H (Practice Controls).

## Changes log

- 2026-05-17 — Feature defined.

## Keywords

src/library/db.ts, src/library/practiceState.ts, src/library/LibraryBrowser.tsx,
IndexedDB, per-piece state, search.

## Testing

- Unit: IndexedDB store round-trip (save/load file + practice state);
  search filtering.
- Component: LibraryBrowser lists and selects pieces.
- Manual checklist: file persists across reload; practice state restored on
  reopening a piece.
- Current status: not started.
