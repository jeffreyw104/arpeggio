# Feature I: Library

**Status:** Done
**Owner:** subagent
**Detailed plan:** docs/superpowers/plans/2026-05-18-feature-i-library.md

## Scope

IndexedDB storage of uploaded files; searchable library browser UI; per-piece
practice state remembered across sessions (last tempo, loop points, hand
mute/hide settings). Does NOT include progress/time tracking.

## Dependencies

B (Import & Score Model), H (Practice Controls).

## Changes log

- 2026-05-17 — Feature defined.
- 2026-05-18 — Built (Tasks 1-4): `db.ts` (IndexedDB wrapper — `pieces` and
  `practiceState` stores, transaction-awaited writes); `practiceState.ts`
  (capture/apply tempo + loop + hand settings); `LibraryBrowser` (searchable
  saved-pieces list with delete); app wiring — the landing combines the import
  view and the library, importing saves the piece, opening a library entry
  re-parses its bytes and restores its practice state, and `PracticeView` saves
  practice state when the session ends. Added `fake-indexeddb` (dev) for tests.
- **2026-05-24** — Post-review fix: `StoredPracticeState` gained an optional `manualOverride?: boolean` field (and `capturePracticeState` plumbs it through the `beat` parameter). Old records without the flag are treated as "no override" on load, preventing pre-branch saves from silently flattening multi-sig pieces when restored.
- 2026-05-23 — `StoredPracticeState` gained an optional `sectionState`
  field used by Feature J (MIDI Section Navigator) — present only for MIDI
  source files; written on every section edit and read on piece open. Also
  bumped `DB_VERSION` from 1 → 2 to recover from a now-reverted earlier
  feature that had created the DB at v2 in some browsers (opening at v1
  would otherwise throw `VersionError` and break the import flow). The
  `onupgradeneeded` block is unchanged — the existing PIECES/PRACTICE
  stores are re-asserted on the v1→v2 upgrade and no new stores are
  introduced.
- 2026-05-26 — Visual revamp. The library now leads with a "Continue
  practicing" hero card driven by a new optional `lastOpenedAt` field on
  `StoredPiece` (`touchPiece(id)` is called on every entry into
  `PracticeView`). Rows are denser, with file-type chips, relative-time
  metadata, and accent pills for loop / sections / hand-mute. Rename and
  Delete moved into a per-row kebab menu. A new shared `FormatCompare`
  component is rendered inline in the empty state and inside a header
  `ⓘ MIDI vs MusicXML` popover. CSS lives in `src/styles/theme.css`
  (`--- Library browser ---` block, fully replaced). New `relativeTime`
  utility for relative dates. No DB version bump.
- 2026-05-26 — Library/landing page now sits on a graphite `#181820`
  surface (was inheriting the app `--bg` of `#0b0b0d`) so it reads as a
  distinct space from the practice view. Added to `.landing` in
  `theme.css` with `min-height: 100vh`. Same graphite tone is used as
  the logo background — see Feature A.
- 2026-05-26 — The app icon (`/icons/icon.svg`) is now rendered above
  the "Arpeggio" wordmark inside the landing import card via an
  `<img class="import-logo">` element, forming a stacked
  logo + wordmark lockup at the top of the page. 72×72 with a subtle
  drop shadow; `margin-bottom: -4px` tightens the gap to the wordmark.

## Keywords

src/library/db.ts, src/library/practiceState.ts,
src/library/LibraryBrowser.tsx, src/library/relativeTime.ts,
savePiece, getPiece, listPieces, touchPiece, lastOpenedAt,
capturePracticeState, applyPracticeState, IndexedDB, per-piece state,
search, Hero, Row, KebabMenu, FormatCompare, FormatInfoPill, EmptyState.

## Testing

Test files (Vitest + RTL; run `npm test`):

- `src/library/db.test.ts` — save/list/get/delete pieces, practice-state
  round-trip (real `fake-indexeddb`).
- `src/library/practiceState.test.ts` — capture, apply, round-trip.
- `src/library/LibraryBrowser.test.tsx` — list, search filter, open, delete.
- `tests/e2e/library.spec.ts` — Playwright: import a piece, reload, confirm it
  is listed in the library (proves cross-session persistence).

Automated status (verified 2026-05-18): `npm run lint`, `npm run typecheck`,
`npm test` (164/164 total), `npm run build`, `npm run e2e` (3 specs) all pass.

Manual checklist:

- [ ] Import a piece, change tempo / set a loop / mute a hand, return to the
      library; reopening the piece restores those settings.
- [ ] The library persists across a full page reload; search filters the list;
      delete removes a piece.
- [ ] After opening any saved piece, returning to the library shows it in
      the hero with the "Continue practicing" eyebrow.
- [ ] The `ⓘ MIDI vs MusicXML` header pill toggles a popover with the
      comparison. The same comparison appears inline when the library is
      empty.
