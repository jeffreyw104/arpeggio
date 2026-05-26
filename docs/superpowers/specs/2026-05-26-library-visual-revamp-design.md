# Library Visual Revamp — Design Spec

**Date:** 2026-05-26
**Status:** draft
**Scope:** the Library page only — `src/library/LibraryBrowser.tsx` and `src/styles/theme.css` (sections `--- Library browser ---` and adjacent). One additive field on `src/library/db.ts` (`lastOpenedAt`) and one new call site wherever a saved piece is opened. Tests in `src/library/LibraryBrowser.test.tsx`, `src/library/db.test.ts`, and `tests/e2e/library.spec.ts` are extended. No other surface, no schema migration of existing records, no feature additions to playback / score view / section navigator.

## Background

Today's Library page is a search input followed by a flat vertical list. Each row is `[name button] [Rename] [Delete]`. There is no metadata, no recency signal, no visual hierarchy, and no place that signals what each file format actually unlocks in the app. The page reads as utilitarian when the rest of the app has moved toward the "Studio Dark" aesthetic, and first-time users have no in-app way to learn the practical difference between uploading a MIDI vs a MusicXML file.

The user explicitly asked for a visual revamp with no new features. This spec respects that — the only logic addition is one optional timestamp field, used purely to drive the visual ordering and the hero card.

## Goals

1. **A "Continue practicing" hero** at the top of the library that surfaces the most recently opened piece with a single-click Resume CTA, so the most common action (pick up where you left off) is the page's primary affordance.
2. **Denser, more informative rows** — each saved piece shows its file-type chip, name, added-date, last tempo, and pills for any active loop / section count.
3. **In-page format guidance** — first-time users see an inline MIDI-vs-MusicXML comparison in the empty state; established users always have a header `ⓘ MIDI vs MusicXML` link that opens the same comparison as a popover.
4. **Match the Studio Dark aesthetic** — same palette, radial accent glow on the hero, hover-revealed action kebab, no warm cream surfaces.

## Non-goals

- No changes to `PracticeView`, the import dropzone, the top bar, or any non-library surface.
- No new IDB version bump. `lastOpenedAt` is optional; records without it sort and render correctly.
- No new sorting controls, no view-mode toggle (the rough mockup's `⊞ ≡` icons were dropped — there is one canonical view).
- No multi-select, no bulk delete, no folders / tagging / favourites.
- No "Open fresh" alternative to Resume — opening always restores per-piece practice state, as it does today.
- No skeleton loaders. IDB reads are fast enough that we render once data is in.
- No changes to the format comparison content beyond what's listed in §4 below.

## Direction

Option C from the brainstorm — hero + dense list. Final mockup is at `.superpowers/brainstorm/10497-1779785862/content/library-c-refined.html`.

## Locked design decisions

| Decision | Choice | Reason |
|---|---|---|
| Hero data source | New `lastOpenedAt?: number` on `StoredPiece` | "Continue practicing" must be truthful — relying on `addedAt` decays after one new import. |
| Sort order | `lastOpenedAt` desc, fallback `addedAt` desc | Matches the "pick up where you left off" framing of the hero. |
| Hero in list | Excluded | Header reads `All other pieces · N`. The hero piece reappears in the list only if the search filter matches it. |
| Hero CTA | Single button: `▶ Resume practice` | Open always restores practice state today. A second "Open fresh" button would require new logic — out of scope. |
| Chip labels | `MIDI` (teal) / `XML` (warm) — 36×36 rounded squares | Three-letter labels read better than initials; colors match the existing `--accent` and a sibling `--warm` introduced for this. |
| Actions | Hover-revealed kebab → popover with `Open` / `Rename` / `Delete` (red) | Removes Rename/Delete from the always-visible row. Inline rename is preserved — choosing Rename from the menu enters the same inline-edit state as today. |
| Format info — empty state | Inline side-by-side comparison inside the empty-state card | First-time users see it exactly when the decision matters. |
| Format info — non-empty state | `ⓘ MIDI vs MusicXML` pill in the library header → popover with the same comparison | Always one click away even after files are imported. |
| Loading state | No skeleton; render once IDB resolves | IDB reads complete in single-digit ms. A skeleton adds visual noise. |

## Visual changes

### 1. Page structure

```
┌────────────────────────────────────────────────────┐
│  Library                  ⓘ MIDI vs MusicXML  · 7  │
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │ CONTINUE PRACTICING                            │  │   ← hero card
│  │ Chopin · Nocturne Op.9 No.2                    │  │
│  │ MIDI · last opened 3d ago · ♩ 64 · [loop]      │  │
│  │                              [ ▶ Resume ]       │  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
│  ALL OTHER PIECES · 6                                │
│  ┌──────────────────────────────────────────────┐  │
│  │ 🔍 Search                                       │  │
│  └──────────────────────────────────────────────┘  │
│  [XML]  Bach · Invention No.1     ♩ 100  ⋯         │
│  [MIDI] Debussy · Clair de Lune   ♩ 72   ⋯         │
│  [MIDI] Scarlatti · Sonata K.466  ♩ 84   ⋯         │
└────────────────────────────────────────────────────┘
```

The header counter (`· 7`) reports the total count, not the post-hero count.

### 2. Hero card

A single panel directly under the page title.

| Property | Value |
|---|---|
| Background | `radial-gradient(ellipse 70% 100% at 100% 0%, var(--accent-soft), transparent 60%)` over `linear-gradient(180deg, #1a1a20, var(--panel))` |
| Border | `1px solid var(--border)` |
| Corner radius | `12px` |
| Padding | `22px 26px` |
| Eyebrow | `CONTINUE PRACTICING` — 10px / letter-spacing 0.14em / color `var(--accent)` / uppercase / weight 600. Prefixed by a 6px round dot in `var(--accent)` with `box-shadow: 0 0 8px var(--accent-glow)` (a quiet "live" indicator, no animation). |
| Title | The piece name. 24px / weight 600 / letter-spacing -0.015em / `var(--text)`. Truncates with `text-overflow: ellipsis` on a single line. |
| Meta-row | A flex-wrap row below the title at 13px / `var(--dim)`: `<format> · last opened <relative> · ♩ <bpm>` followed by zero-or-more accent pills (`loop`, `<n> sections`, `L muted`, `R muted`). The loop pill carries no range — the practice state stores loop in seconds and converting to measure numbers needs the score's `measureMap`, which is not loaded at library-render time. The detail is visible once the piece is opened. |
| Decorative glow | An absolutely positioned 200×200 `radial-gradient` blob in the top-right corner (`var(--accent-glow)`, opacity 0.45, overflow-hidden by the card). Pointer-events: none. |
| CTA | `▶ Resume practice` — primary button: `background: var(--accent)`, dark text, `padding: 11px 24px`, `border-radius: 8px`, weight 600, inset highlight (`box-shadow: 0 1px 0 rgba(255,255,255,0.1) inset`), drop glow (`0 4px 12px var(--accent-glow)`). Click → `onOpen(piece.id)`, same handler the row uses today. |

The hero is rendered whenever there is at least one piece. The eyebrow reads `CONTINUE PRACTICING` when the chosen piece has a `lastOpenedAt` value, and `MOST RECENT` otherwise — the latter case only arises for records saved before this feature shipped (per §9.2, the wire-up touches `lastOpenedAt` on every path that enters `PracticeView`, including import).

### 3. List rows

```
[chip 36×36]  Piece name                                ♩ 100   ⋯
              MusicXML · added 1 week ago               (pills…)
```

| Property | Value |
|---|---|
| Row grid | `36px 1fr auto auto`, gap 14px, padding `10px 12px`, border-radius 8px |
| Hover | `background: var(--panel)`, `border: 1px solid var(--border-soft)`, kebab fade-in (`opacity: 0 → 0.8`, 150ms) |
| Chip | 36×36 / radius 8px / `background: var(--accent-soft)` (MIDI) or `var(--warm-soft)` (XML) / label `MIDI` or `XML` in 10px / weight 700 / matching accent color |
| Title line | 14px / weight 500 / `var(--text)` |
| Subline | 12px / `var(--dim)`. Format: `<MIDI\|MusicXML> · added <relative>`. If a hand is muted, append ` · ` + a colored span (`color: var(--accent)`) with `L muted` / `R muted` / `L+R muted`. |
| Stats column | Right-aligned, 12px, `font-variant-numeric: tabular-nums`. Format: optional pills first (`loop`, `<n> sec`), then `♩ <bpm>`. The tempo number gets `color: var(--text)`; the rest is dim. Pills use `background: var(--accent-soft)` / `color: var(--accent)` / `padding: 2px 8px` / `border-radius: 10px` / 11px. |
| Kebab | A 24×24 hit-target with `⋯` glyph, `color: var(--dim)`. Hidden by default (opacity 0). On row hover or menu-open: opacity 1. Click opens the actions popover anchored to the kebab. |

The hero piece is filtered out of the rows when there is no active search query. When `query.trim().length > 0`, the filter matches **all** pieces (hero included). This means searching `chopin` shows the Chopin piece as a row even though it is also the hero.

### 4. Empty state

Rendered when `listPieces()` returns `[]`. Replaces the hero + list + search entirely.

```
┌────────────────────────────────────────────────────┐
│  Library                                          0 │
│                                                      │
│  ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓  │
│  ┃  ♪   Your library is empty                    ┃  │
│  ┃                                                ┃  │
│  ┃  Arpeggio accepts two formats — here's what    ┃  │
│  ┃  each unlocks:                                 ┃  │
│  ┃                                                ┃  │
│  ┃  ┌────────────────┐  ┌────────────────┐       ┃  │
│  ┃  │ [MIDI]          │  │ [MUSICXML]      │      ┃  │
│  ┃  │ Best for…       │  │ Best for…       │      ┃  │
│  ┃  │ • ...           │  │ • ...           │      ┃  │
│  ┃  └────────────────┘  └────────────────┘       ┃  │
│  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛  │
└────────────────────────────────────────────────────┘
```

Container: a dashed-border card (`1px dashed var(--border)`, radius 12px, padding `24px 22px`).

Inside:
- A 40×40 panel icon (♪) in `var(--accent)` over `var(--panel)`.
- Heading: `Your library is empty` (16px / weight 500).
- Lead: `Arpeggio accepts two formats — here's what each unlocks:` (13px / `var(--dim)`).
- A two-column grid (`grid-template-columns: 1fr 1fr`, gap 10px) holding the **shared `FormatCompare` component** (§5).

There is no search input and no import dropzone here — the import dropzone already lives elsewhere on the landing page (see `src/app/Landing` / the existing landing wiring). This card is purely informational + signposting.

### 5. Format comparison — shared component

A single `FormatCompare` component is rendered in two surfaces:

| Surface | Container | Content |
|---|---|---|
| Empty state | Inline inside the dashed empty-state card | Full version (description + bullets) |
| Header popover (`ⓘ` link) | Floating popover anchored to the link, 480px wide | Compact version (bullets only, no description) |

The component takes one prop: `variant: "full" | "compact"`.

Content (locked):

**MIDI column** (border `rgba(68,170,136,0.4)`, chip `MIDI` teal):
- *Best for playing along*
- *.mid / .midi files. Often exported from a DAW or downloaded as a performance.*
- ✓ Exact falldown view (note timing is the source of truth)
- ✓ Auto-detected practice sections
- ✓ Bookmarks & section navigator
- — Score notation is auto-generated & approximate

**MusicXML column** (border `rgba(217,165,90,0.4)`, chip `MUSICXML` warm):
- *Best for reading the score*
- *.xml / .musicxml files. Authored notation from sheet-music software.*
- ✓ Original engraved sheet music (verbatim)
- ✓ Accurate rhythms, articulations, accidentals
- ✓ Slim measure scrubber
- — No section navigator (uses engraved score instead)

The italicised "Best for …" + file-extension blurb show only in `full` variant. Both variants share the bullet lists. The factual claims above are derived from features B (Import & Score Model — file-type detection, `midiToMusicXml` approximate notation), F (Score View — Verovio engraving for MusicXML), and J (MIDI Section Navigator — MIDI-source-only).

### 6. Header `ⓘ MIDI vs MusicXML` link

Always rendered in the page header next to (and right of) the piece count, except in the empty state where the comparison is already inline.

Visual: `display: inline-flex; align-items: center; gap: 6px; color: var(--dim); font-size: 12px; border: 1px solid var(--border); padding: 5px 10px; border-radius: 6px`. The `ⓘ` glyph is in `var(--accent)` and weight 700. Hover: text and border shift to teal.

Click toggles a popover anchored to the link (right-aligned). The popover uses `position: absolute; top: 38px; right: 0; width: 480px; background: var(--panel-2); border: 1px solid var(--border); border-radius: 10px; box-shadow: 0 12px 32px rgba(0,0,0,0.6); padding: 16px`, holds a small uppercase label (`WHAT EACH FORMAT UNLOCKS`) and the `FormatCompare` component in `compact` mode.

Dismissal: click outside, Escape, or click the link again. State is `useState<boolean>` local to `LibraryBrowser` — no localStorage persistence, no global.

### 7. Search input

Visually polished but functionally unchanged from today.

- Style: `padding: 10px 14px`, `border-radius: 8px`, leading `⌕` icon (Unicode magnifier — same as `J` spec icons; no new icon dependency).
- Placement: below the `ALL OTHER PIECES · N` label, above the rows. Hidden in the empty state.
- Behaviour: same client-side filter as today (`pieces.filter(p => p.name.toLowerCase().includes(needle))`), with the change that when the query is non-empty the hero piece is included in the matched list.

### 8. Renaming

Inline edit, identical to today's behaviour. Triggered by selecting `Rename` in the kebab menu (instead of the always-visible Rename button). The keyboard handlers — Enter commits, Escape cancels, blur commits — are preserved verbatim.

### 9. Deleting

Selecting `Delete` from the kebab menu calls `deletePiece(p.id)` and refreshes, exactly as today. The destructive item is styled `color: #f08080` in the menu. **No confirmation dialog** — this matches today's behaviour, and adding one is out of scope.

## Implementation

### 9.1 `src/library/db.ts`

```ts
export interface StoredPiece {
  id: string;
  name: string;
  data: ArrayBuffer;
  addedAt: number;
  /** Wall-clock time of the most recent open. Optional — undefined for records
   *  saved before this field existed, and for pieces that have only been
   *  imported (not yet opened). Used to drive the hero card and sort order. */
  lastOpenedAt?: number;
}

/** Record that a piece was opened. No-op if the piece doesn't exist. */
export async function touchPiece(id: string): Promise<void> {
  await withStore(PIECES, "readwrite", async (s) => {
    const piece = (await promisify(s.get(id))) as StoredPiece | undefined;
    if (!piece) return;
    await promisify(s.put({ ...piece, lastOpenedAt: Date.now() }));
  });
}
```

`listPieces` sort changes:

```ts
return all.sort((a, b) => {
  const aKey = a.lastOpenedAt ?? a.addedAt;
  const bKey = b.lastOpenedAt ?? b.addedAt;
  return bKey - aKey;
});
```

No `DB_VERSION` bump — `lastOpenedAt` is an additive optional field on a record that already lives in an object store.

### 9.2 Call sites for `touchPiece`

The single wiring point is `src/App.tsx`, which has two handlers that both transition the app into `PracticeView`:

- `handleImported` (line 18–21 today) — fires after a fresh upload. Add `void touchPiece(id)` immediately after `await savePiece(...)`. An import counts as an "open" — the user is now actively working with the piece, and treating it as such keeps the hero eyebrow reading `CONTINUE PRACTICING` instead of `MOST RECENT` after a reload.
- `handleOpen` (line 23–28 today) — fires when the user picks a piece from the library. Add `void touchPiece(id)` immediately after the `getPiece` await.

Both calls are fire-and-forget; the `setSession(...)` call should not be blocked on the IDB write. A failed `touchPiece` is a no-op (just leaves `lastOpenedAt` stale by one open) — no error path needed in the UI.

### 9.3 `src/library/LibraryBrowser.tsx`

Decomposed into four colocated sub-components for clarity. All live in the same file; no public exports beyond `LibraryBrowser`.

| Sub-component | Responsibility |
|---|---|
| `LibraryBrowser` | Top-level: loads pieces, runs the filter, renders header + hero + list (or empty state). |
| `Hero` | The "Continue practicing" card. Props: `piece`, `practiceState`, `onResume`. |
| `Row` | A single piece row. Props: `piece`, `onOpen`, onto rename/delete handlers, `isEditing`, edit-state setters. |
| `KebabMenu` | The popover anchored to a row's `⋯`. Renders `Open`, `Rename`, `Delete`. Close on outside-click / Escape. |
| `FormatInfoPill` | The header `ⓘ MIDI vs MusicXML` link + its popover. |
| `FormatCompare` | The shared two-column comparison. Prop `variant: "full" \| "compact"`. |
| `EmptyState` | Dashed card hosting `FormatCompare` in `full` mode. |

Source-type detection (MIDI vs MusicXML) reuses `src/import/detectType.ts` — the existing function inspects the bytes. The Row and Hero call it once per piece via `useMemo` keyed on `piece.id`.

Hero meta-row data:
- Format label: from `detectType` ("MIDI" or "MusicXML").
- Last-opened relative time: `formatRelative(piece.lastOpenedAt ?? piece.addedAt)` — a small helper (`src/library/relativeTime.ts`) returning strings like `today`, `yesterday`, `3 days ago`, `1 week ago`, `2 weeks ago`, `1 month ago`. Single new utility, ~30 LOC, has its own test file.
- Last tempo: `practiceState?.bpm` (loaded via `getPracticeState(piece.id)`).
- Loop pill: rendered iff `practiceState?.loop != null`, label `loop` (no range — see §2's note on `measureMap` availability).
- Sections pill: rendered iff `practiceState?.sectionState?.sections.length > 0`, label `<n> sections`.
- Hand-mute spans: rendered iff `leftMuted` or `rightMuted` — same rules as the existing `applyPracticeState`.

Row stats column is the subset: tempo, optional loop pill, optional `<n> sec` pill. Hand-mute is shown in the subline, not the stats column, to keep the stats column scannable.

### 9.4 `src/styles/theme.css`

The existing `--- Library browser ---` block (lines 1139–1212) is replaced wholesale. New tokens added at the top of the file:

```css
:root {
  /* ...existing... */
  --border-soft: #1f1f25;     /* for hover row borders that don't compete with --border */
  --warm: #d9a55a;             /* MusicXML chip color */
  --warm-soft: rgba(217, 165, 90, 0.18);
}
```

The full library CSS block lands as `~250 LOC`. No CSS module / no Tailwind; matches the existing single-file theme convention.

### 9.5 Tests

**`src/library/db.test.ts`** — add:
- `touchPiece` updates `lastOpenedAt` to `> 0`.
- `touchPiece` on a non-existent id is a no-op (no throw).
- `listPieces` sorts by `lastOpenedAt` desc when present, falls back to `addedAt`.

**`src/library/LibraryBrowser.test.tsx`** — add:
- Hero renders the piece with the latest `lastOpenedAt`.
- Hero renders the piece with the latest `addedAt` when no piece has been opened.
- Hero piece is excluded from the list when search is empty.
- Hero piece is included in the list when search query matches it.
- Clicking the hero's `▶ Resume practice` calls `onOpen` with the hero piece id.
- Empty state renders when zero pieces, includes both `MIDI` and `MUSICXML` columns.
- `ⓘ MIDI vs MusicXML` link toggles the popover; Escape closes it; outside-click closes it.
- Kebab menu shows on row hover; Rename triggers the inline edit; Delete calls `deletePiece`.

**`src/library/relativeTime.test.ts`** — new file. Covers each band (today, yesterday, N days, N weeks, N months) with deterministic clock injection.

**`tests/e2e/library.spec.ts`** — extend the existing spec:
- After importing a piece and opening it once, reload the page and verify the piece appears in the hero (selector: `[data-testid="library-hero"]`).
- Import two pieces; open the older one; verify it moves to the hero and the newer one moves into the list.

### 9.6 HANDOVER.md

Append a one-paragraph note under the existing Library section: "The library now leads with a Continue Practicing hero (most recently opened piece) and a denser list. A new `lastOpenedAt` optional field on `StoredPiece` drives both. The hero card's `▶ Resume practice` restores per-piece tempo / loop / mute state via the same code path as opening any piece — there is no separate fresh-open mode."

### 9.7 Feature I changes log

Append a `2026-05-26` bullet to `docs/features/I-library.md` (per CLAUDE.md's feature-doc self-check rule), summarising the schema addition (`lastOpenedAt`) and the visual revamp. Update the Keywords section to include the new sub-components and `relativeTime.ts`. Update the Manual checklist to add: "After opening a piece, returning to the library shows it in the hero. The header `ⓘ MIDI vs MusicXML` popover appears when there are pieces, the inline comparison appears when there aren't."

## Open questions

None. All decisions were resolved during the brainstorm:

1. ~~What drives the hero?~~ → `lastOpenedAt` (new optional field).
2. ~~Sort order?~~ → Recent activity first.
3. ~~Hero in list?~~ → Excluded when search empty; included when search matches.
4. ~~Where does format info live?~~ → Inline in empty state, persistent header popover otherwise.

## Risks

- **Format-detection cost in render** — `detectType` reads the first ~16 bytes of an `ArrayBuffer`. Cheap, but called once per row. `useMemo` keyed on `piece.id` keeps it to one call per piece per render. Acceptable.
- **Practice-state IDB reads** — the hero needs `getPracticeState(piece.id)`. One extra IDB read on library load. Hero loads asynchronously; while pending, the hero meta-row renders only the format + last-opened-relative (omits tempo + pills). No skeleton.
- **`lastOpenedAt` write race** — if a user double-clicks Resume, two `touchPiece` calls run in parallel. The IDB `put`s land in arbitrary order; the second wins. Both write `Date.now()`, so the result is effectively the later timestamp. Acceptable.
- **Header `ⓘ` link in narrow viewports** — at iPad-portrait width the header row could wrap. The link drops to a new line below the title (flex-wrap). Verified visually fine in the mockup.

## Verify gate

Per CLAUDE.md, before claiming done:

```
npm run lint && npm run typecheck && npm test && npm run build && npm run e2e
```

Plus the manual checklist in §9.7.
