# Arpeggio — Practice-Tab View Options

_Design spec. Date: 2026-05-24. Status: draft, awaiting user review._

## Goal

On the **MIDI Practice tab**, expose two new layout options that already exist
on the Play tab: **Falldown only** and **Score only**. Today the Practice
tab's layout pill (`TopBar.tsx:240-269`) offers only **Reading lane** and
**Split**. The two new options give the user the same "remove what I'm not
using" affordances the Play tab has:

- *Falldown only* — paper sheet music in front of you; screen shows just the
  falling notes.
- *Score only* — no paper; screen shows just the engraved score.

This change ships on **both desktop and tablet** (no responsive gating).

## Non-goals

- No change to the Play tab's View pill.
- No change for MIDI **source** files — those still hide the View/Layout pill
  entirely (Feature G, 2026-05-23). This spec only affects MusicXML files on
  the MIDI Practice tab.
- No change to the lane-theme section in the Layout pill.

## Current structure

`src/ui/TopBar.tsx:240-269` renders:

```tsx
{!isMidiSource && (
  mode === "play"
    ? <TopBarSelect label="View:" options=[Both, Falldown only, Score only] />
    : <TopBarSelect label="Layout:" sections=[
        { section: "Layout", items: [Reading lane, Split] },
        { section: "Lane theme", items: [Light, Dark] },
      ] />
)}
```

`PracticeView.tsx` already routes `viewMode` through `<Layout/>` for the Play
tab. For the MIDI Practice tab it currently consults `practiceLayout`
("lane" | "split") instead.

## Target structure

The MIDI Practice tab's Layout pill becomes a 4-option layout section + the
existing lane-theme section:

```
Layout:
  Reading lane
  Split
  Falldown only   ← new
  Score only      ← new
Lane theme:
  Light
  Dark
```

### Data model

`PracticeLayout` (`src/layout/practiceMode.ts`) gains two new values:

```ts
export type PracticeLayout = "lane" | "split" | "falldown" | "score";
```

`practiceLayout` is in-memory React state in `PracticeView` (line 131,
`useState<PracticeLayout>("lane")`) — it is **not** persisted today.
Widening the union is the only data change; no migration or
backwards-compatibility shim is required.

### Rendering rule

`PracticeView` already renders one of: section-strip + reading lane,
section-strip + split panes, etc. Extend the render branch around the
existing `mode === "midi"` block to handle the two new layouts:

- `practiceLayout === "falldown"` → render only the falldown canvas
  full-bleed (mirrors Play tab's `viewMode === "falldown"`).
- `practiceLayout === "score"` → render only the engraved score panel
  full-bleed (mirrors Play tab's `viewMode === "score"`).

For MusicXML files in MIDI Practice mode, the section strip is not mounted
(`stripMounted = isMidiSource && sectionState !== null` —
`PracticeView.tsx:178`), so the new layouts simply fill the
`practice-content` area without any strip interaction.

### TopBar pill

`TopBar.tsx` extends the `mode === "midi"` `TopBarSelect` so the Layout
section lists all four options:

```tsx
sections=[
  { section: "Layout", items: [
    { value: "lane",     label: "Reading lane" },
    { value: "split",    label: "Split" },
    { value: "falldown", label: "Falldown only" },  // new
    { value: "score",    label: "Score only" },     // new
  ]},
  { section: "Lane theme", items: [...] },
]
```

Lane-theme behavior is unchanged: picking a theme still auto-switches to
Reading lane (Feature G 2026-05-24 changelog).

## Testing

- `TopBar.test.tsx` — the MIDI-mode pill renders all four options; selecting
  each fires `onPracticeLayoutChange` with the right value.
- `PracticeView.test.tsx` — when `practiceLayout` is `"falldown"`, the
  falldown canvas is mounted and the score panel is hidden; reverse for
  `"score"`. Existing `lane`/`split` assertions stay green.
- Full gate: `npm run lint && npm run typecheck && npm test && npm run build`.

Manual checklist:

- [ ] Import a MusicXML file, switch to MIDI Practice tab. The Layout pill
      shows four options.
- [ ] Pick **Falldown only** — only the falldown is visible; the engraved
      score is gone; transport still works.
- [ ] Pick **Score only** — only the engraved score is visible; the falldown
      is gone.
- [ ] Lane-theme picker still auto-switches to Reading lane.
- [ ] Reload the page — the layout resets to "Reading lane" (default).
      `practiceLayout` is in-memory state and is not persisted.

## Conventions

Follow the repo's existing flow: a just-in-time bite-sized plan, TDD per
task, strict TypeScript, commit per step. Update `docs/features/G-layout-view-modes.md`
Changes log on the final commit per CLAUDE.md's feature-doc self-check.
