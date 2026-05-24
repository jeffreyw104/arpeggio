# Feature G: Layout & View Modes

**Status:** Done
**Owner:** subagent
**Detailed plan:** docs/superpowers/plans/2026-05-18-feature-g-layout-view-modes.md

## Scope

Side-by-side layout (falldown+piano column left, score panel right); resizable
divider with a piano-favoring default split; view toggle Both / Falldown-only /
Score-only with single-view modes expanding to full width.

## Dependencies

E (Falldown View), F (Score View).

## Changes log

- 2026-05-17 — Feature defined.
- 2026-05-18 — Built (Tasks 1-8): `viewMode` (Both/Falldown/Score state);
  `FrameLoop` (the single rAF clock-tick + consumer loop, with a clamped delta);
  `Divider` (draggable resize); `Layout` (side-by-side + view modes);
  `TransportBar` (play/pause, seek, time, view toggle); `ImportView` (file
  drop/picker → importFile); `startAudioContext` audio-resume helper;
  `PracticeView` + `App` wiring + layout/highlight styles. This is the
  integration milestone — the app now loads a file and plays falldown + score
  synced to one clock. Also raised the Workbox precache limit (vite.config.ts)
  so the ~8 MB Verovio WASM precaches for offline use.
- 2026-05-23 — For MIDI source files only, the view-mode toggle in the top
  bar is hidden — the engraved score panel and reading lane are replaced by
  Feature J's section navigator strip. The falldown takes the full width.
  The strip wraps in a measured `section-strip-wrapper` whose height is
  exposed as `--section-strip-height` so the Tools popover can anchor
  below it when the strip is top-docked. CSS flex-order on the wrapper
  swaps strip top↔bottom without unmounting (preserves strip internal state
  across toggle).
- 2026-05-24 — Studio Dark refresh, view selectors consolidated. The Play-tab
  View buttons (Both / Falldown only / Score only) collapse into a single
  TopBarSelect pill ("View: Both" / etc.). The MIDI Practice Layout buttons
  (Reading lane / Split) plus the conditional Paper/Dark theme toggle collapse
  into a single multi-section TopBarSelect pill — picking a Lane theme
  auto-switches to Reading lane.
- 2026-05-24 — MIDI Practice tab Layout pill gains **Falldown only** and
  **Score only** options (full parity with the Play tab View pill). The
  `PracticeLayout` union widens to `"lane" | "split" | "falldown" | "score"`;
  new CSS rule blocks `.practice-content--midi.layout-falldown` and
  `.layout-score` drive the visibility. Lane theme picker behavior is
  unchanged. `practiceLayout` remains in-memory state (not persisted).

## Keywords

src/layout/viewMode.ts, src/layout/Divider.tsx, src/layout/Layout.tsx,
src/layout/practiceMode.ts, src/ui/TransportBar.tsx, src/ui/ImportView.tsx,
src/app/frameLoop.ts, src/app/PracticeView.tsx, src/App.tsx, FrameLoop,
PracticeView, resizable divider, view modes.

## Testing

Test files (Vitest + RTL; run `npm test`):

- `src/layout/viewMode.test.ts` — view-mode cycling.
- `src/app/frameLoop.test.ts` — clock tick by delta, clamp, consumers, stop.
- `src/layout/Divider.test.tsx` — drag reports a fraction, cleanup after drag.
- `src/layout/Layout.test.tsx` — panels shown per view mode.
- `src/ui/TransportBar.test.tsx` — play/pause, seek, view-mode toggle.
- `src/ui/ImportView.test.tsx` — file import + error handling.
- `src/app/PracticeView.test.tsx` — mounts the transport bar + canvas
  (Verovio/Tone mocked).
- `tests/e2e/practice.spec.ts` — Playwright: import `clean.mid` → practice view
  appears (real Verovio WASM in-browser).

Automated status (verified 2026-05-18): `npm run lint`, `npm run typecheck`,
`npm test` (138/138 total), `npm run build`, `npm run e2e` all pass.

Manual checklist:

- [ ] Import a real MIDI file: falldown notes fall, the score engraves;
      pressing play animates both in sync and audio sounds.
- [ ] Seeking via the slider or a measure click moves everything together.
- [ ] The divider drags; the Both/Falldown/Score toggle switches layouts.

Known v1 notes: `.current-measure` styling is minimal (the scroll-into-view +
`current-note` accent fill are the primary cues); audio-context resume relies on
the synchronous clock `onChange` dispatch — both are backlog polish.
