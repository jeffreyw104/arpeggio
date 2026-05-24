# Feature J: MIDI Section Navigator

**Status:** Done
**Owner:** subagent
**Detailed spec:** docs/superpowers/specs/2026-05-23-midi-section-navigator-design.md
**Detailed plan:** docs/superpowers/plans/2026-05-23-midi-section-navigator.md

## Scope

A horizontal section-navigator strip that replaces the auto-engraved sheet
music for MIDI-source files. Auto-detected named sections (with smart labels
when the source has no markers), user-editable boundaries and names, user
bookmarks anchored on measure starts, drill-down click-to-seek within a
section, drag-to-resize with snap-back to the original auto break point, and
loop integration. The strip is dockable at the top or bottom of the page, the
preference persists across pieces (localStorage), and the per-piece
`sectionState` persists in IndexedDB. MusicXML imports are completely
unaffected — they keep the engraved score panel + slim scrubber UX.

## Dependencies

B (Import & Score Model — for `midiMarkers`), C (Transport), G (Layout —
practice-content wrapper), H (Practice Controls — Tools popover), I (Library
— `StoredPracticeState`).

## What it ships

- A pure section/bookmark data model (`Section`, `Bookmark`, `SectionState`)
  with a `normalize()` invariant guard.
- A 4-pass auto-detect pipeline:
  - Pass 1 (hard): MIDI markers → tempo Δ ≥ 8% → time-signature change.
  - Pass 2 (soft): long rest / density jump / register shift, cluster of ≥ 2.
  - Pass 3 (smoothing): merge sections < 2 measures, cap total at 12.
  - Pass 4 (smart labels): Intro / Outro / Climax / Melody / Bass line / Slow
    intro / etc. — *gated off* whenever the file has any MIDI marker so
    composer-authored labels are not mixed with heuristics.
- A `SectionStrip` React component (DOM, not canvas) hosting the bookmark
  lane, sections row, toolbar, playhead + measure pill, drag-snap line, and
  loop indicator. Strip mirrors itself vertically when docked at the top.
- Drill-down navigation: clicking a section "activates" it; subsequent hover
  shows a vertical line snapped to the nearest measure start; clicking again
  seeks to that exact point. Active sections lift; siblings dim.
- Drag-to-resize boundaries with a dotted "ORIGINAL" snap line at the
  auto-detected break point.
- Right-click affordances: section blocks → Rename / Merge-with-right /
  Merge-with-left / Clear loop. Bookmarks → Rename / Loop-to-next-mark /
  Delete. Strip background → create bookmark (jumps to rename).
- A shared liquid-glass `ContextMenu` component with viewport clamping; also
  used by the new sheet-music "Clear loop" right-click menu in PracticeView.
- Undo with a 50-snapshot history; ⌘Z / Ctrl+Z plus an inline "Undo" link.
- Escape closes context menus and exits drill-in; closes the Tools popover.
- Strip-position toggle moved into both PlayTools and MidiTools (top of the
  panel) for MIDI source files; the strip itself no longer carries a ↕ button.
- ResizeObserver-measured strip height fed as a CSS variable so the Tools
  popover stays just below a top-docked strip regardless of strip content.

## Keywords

src/model/sections.ts, src/section-strip/autoDetect.ts,
src/section-strip/auto-detect/{thresholds,helpers,pass1,pass2,pass3,pass4,types}.ts,
src/section-strip/edits.ts, src/section-strip/SectionStrip.tsx,
src/section-strip/ContextMenu.tsx, src/section-strip/usePlayheadIndicators.ts,
src/section-strip/stripPosition.ts, src/styles/section-strip.css,
src/app/PracticeView.tsx (strip wiring + clear-loop menu),
src/ui/PlayTools.tsx, src/ui/MidiTools.tsx (strip-position controls),
src/ui/ToolsPopover.tsx (below-strip placement), Section, Bookmark,
SectionState, normalize, autoDetect, applySmartLabels, midiMarkers, autoEnd,
ContextMenu, usePlayheadIndicators, snapTimeToNearestMeasure,
StripPosition.

## Testing

Test files (Vitest + RTL; run `npm test`):

- `src/model/sections.test.ts` — `normalize` invariants on adversarial input.
- `src/section-strip/edits.test.ts` — every edit op preserves invariants;
  rename / split / merge-left / merge-right / resize / delete / bookmark ops.
- `src/section-strip/autoDetect.test.ts` — all four passes, smart labels with
  and without markers, smoothing, cap behavior, edge cases.
- `src/section-strip/stripPosition.test.ts` — localStorage round-trip + default.
- `src/section-strip/SectionStrip.test.tsx` — rendering, click-seek, scrub,
  S/B keys, drill-down, section right-click menu, bookmark right-click menu,
  rename via menu, double-click creates bookmark, snap-to-measure, undo
  button enabled/disabled + click.
- `src/library/practiceState.test.ts` — `sectionState` plumbed through.
- `src/import/midi/parseMidi.test.ts` — marker meta-events extracted into
  `score.midiMarkers`.

Playwright (`tests/e2e/midi-section-navigator.spec.ts`):

- Strip appears for MIDI uploads; engraved score + slim scrubber hidden.
- Click a section block → playhead moves.
- Rename a section → reload → name persists.
- Toggle strip position via the Tools popover → survives reload.
- MusicXML upload does NOT show the strip.

Automated status: `npm run lint`, `npm run typecheck`, `npm test` (449
total), `npm run build`, `npm run e2e` (16 specs) all pass.

## Changes log

- 2026-05-23 — Feature built (see "What it ships" above).
- 2026-05-24 — Studio Dark retheme. Section strip background swapped from cream
  #ebe5d4 to dark translucent (linear-gradient + backdrop-filter blur+saturate).
  Block palette swapped for moody saturated tones: slate-blue #3a5a78, deep
  teal #2f6e63, plum #7a3a4a, burnt amber #7a5a2e, indigo #4a3a6a. Hover line
  + playhead inverted (light line on dark, dark halo). Strip toolbar text color
  updated for dark; toolbar links became hover-only underlined.
- 2026-05-25 — Touch tablets get long-press equivalents for bookmark-create
  and context-menu actions on the SectionStrip via `useLongPress`
  (`src/responsive/useLongPress.ts`). Wired in `SectionStrip`, `BookmarkPin`,
  and `SectionBlock`; gated by `useIsTouchDevice()` so desktop
  right-click / double-click paths run unchanged.
  `.section-strip--touch` modifier class adds `-webkit-touch-callout: none`
  / `user-select: none` to suppress iOS native callouts on interactive
  strip elements.

## Locked design decisions

- Scope: **MIDI source only** (`score.source === "midi"`). MusicXML keeps the
  existing engraved + slim scrubber UX.
- Removed for MIDI sources: engraved score panel, reading-lane ribbon,
  practice-layout toggle, lane-theme picker, slim TopBar scrubber.
- Section/bookmark primitives are distinct (Section is a range, Bookmark is a
  point); they cannot be merged.
- Bookmarks always snap to the nearest measure start at creation time.
- Boundary resize snaps to the section's `autoEnd` (original auto-detect
  break point) within ±1.5% of duration.
- Strip position preference: `localStorage` key `arpeggio.stripPosition`
  (`"top" | "bottom"`, default `"bottom"`), shared across all MIDI pieces.
- Persistence: `StoredPracticeState.sectionState?` added; auto-detect runs
  once on first open, never overwrites user edits afterward.
- DB_VERSION bumped to 2 alongside this work so the per-piece store works
  for users who had an earlier reverted feature that opened the DB at v2.

## Manual checklist

- [ ] Upload a MIDI file → strip appears (default at bottom); engraved score
      and slim scrubber are gone.
- [ ] Click a section → playhead jumps to its start; click again → drill-down
      activates; hover shows snapped measure pill; click to seek there.
- [ ] Right-click a section → Rename / Merge-with-right / Merge-with-left
      (Clear loop appears only when a loop is active).
- [ ] Double-click anywhere on the strip → 📌 bookmark created with rename
      input open.
- [ ] Drag a boundary → dotted "ORIGINAL" snap line appears; release near it
      snaps back to the auto break point.
- [ ] B at the playhead → bookmark created on the nearest measure start.
- [ ] Set a loop via "Loop to next mark" → red bracket + "LOOPING" label
      visible; right-click anywhere (strip section, falldown, lane) → Clear
      loop option appears.
- [ ] Undo button + ⌘Z / Ctrl+Z reverts the last edit (up to 50 deep).
- [ ] Escape closes menus / exits drill-in / closes Tools popover.
- [ ] Tools popover: strip-position radio appears at the top of both Play
      and MIDI Practice panels; switching docks the strip top/bottom and the
      popover follows; preference survives reload.
- [ ] Upload a MusicXML file → strip absent; engraved score + slim scrubber
      render as before.

## Known notes

- Auto-detect Pass 2 uses a 2-measure density/register window (the spec's
  4-measure window over-triggered against the spec's own "long rest alone"
  test). All thresholds are named constants in
  `src/section-strip/auto-detect/thresholds.ts` for easy tuning.
- @tonejs/midi only surfaces marker meta-events from the conductor (track 0);
  markers on other tracks are silently ignored (documented on `Score.midiMarkers`).
- Undo history is in-memory only — it does NOT survive a page reload.
