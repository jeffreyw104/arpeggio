# Arpeggio — iPad / Touch-Tablet Polish

_Design spec. Date: 2026-05-24. Status: draft, awaiting user review._

## Goal

Make Arpeggio usable on iPad (and other touch tablets) without changing the
desktop experience at all. Today the app has zero `@media` queries, no touch
gesture fallbacks for right-click / double-tap, and no Apple PWA metadata.
On a tablet:

1. The side-by-side Split (falldown left + engraved score right) crushes each
   pane to ~380pt on portrait — the engraved score is illegible.
2. The SectionStrip's bookmark-create and context-menu gestures
   (right-click, double-tap) don't fire under touch.
3. The TopBar packs >10 controls in a single row and overflows or wraps
   awkwardly below ~900pt.
4. PWA install mode lacks Apple-specific meta tags, so the home-screen
   launch isn't as polished as it could be.
5. MIDI status messaging doesn't tell iPad users why nothing connects on
   iPadOS < 17.4.

## Non-goals

- **Desktop is untouched.** Every behavior in this spec is gated on a
  touch-device check; a desktop browser resized to tablet width does **not**
  change. Existing desktop assumptions (wide viewport, hover, right-click)
  are preserved.
- No native-app wrapping (Capacitor, etc.). PWA + Apple meta tags is the
  ceiling.
- No new layout primitives — we reuse the existing `Layout`/`Divider`/
  `SectionStrip` components.
- No change to the engraved-score rendering pipeline; only how it's framed.
- The Practice-tab View options (Falldown only / Score only) are covered by
  a sibling spec (`2026-05-24-practice-view-options-design.md`) and are
  **not** part of this iPad pass.

## Detection

Two hooks, both in a new `src/responsive/` directory. They are the **only**
gates new behavior depends on, so desktop code never runs anything new.

### `useIsTouchDevice()` — `src/responsive/useIsTouchDevice.ts`

```ts
export function useIsTouchDevice(): boolean { /* see below */ }
```

Returns `true` iff `navigator.maxTouchPoints > 1`. Stable per session — no
listener; reads once on mount. Covers every iPad (mini → Pro 13") regardless
of orientation. Returns `false` on desktop Safari/Chrome/Firefox.

Why `maxTouchPoints > 1` rather than UA sniff: iPadOS Safari spoofs as
desktop macOS by default, so a UA test misses most iPads. `maxTouchPoints`
is the canonical robust signal.

### `useIsNarrowViewport(threshold = 1024)` — `src/responsive/useIsNarrowViewport.ts`

```ts
export function useIsNarrowViewport(threshold?: number): boolean;
```

Returns `true` when `window.innerWidth < threshold`. Subscribes to `resize`
to handle orientation changes. Default threshold 1024px — catches all iPad
sizes in portrait and the smaller iPads (mini, 10.2", 10.9", Pro 11") in
landscape; lets iPad Pro 12.9/13" landscape (1366pt) keep the desktop-style
side-by-side Split.

### Combined gate

Everywhere a behavior is "tablet only," it gates on `useIsTouchDevice()`.
Layout-specific narrowing additionally gates on `useIsNarrowViewport()`.

A desktop browser resized to 800pt: `useIsTouchDevice()` → `false`. No
tablet behavior fires. Layout, gestures, copy: all unchanged.

## Part A — Column-stack layout on narrow tablets

### A1. Current state

`src/layout/Layout.tsx:33-49` renders `.layout` as a horizontal flex row
with `.layout-panel` children. In `viewMode === "both"`, the falldown
column gets `flexBasis: split * 100%` and the score panel gets `flex: 1`,
separated by a draggable vertical `Divider`.

### A2. Target state

When `useIsTouchDevice() && useIsNarrowViewport()` (i.e., a touch tablet
narrower than 1024pt):

- `.layout` switches to `flex-direction: column`. The falldown pane stacks
  on top, the score pane below.
- The `Divider` rotates: drag axis becomes vertical, resizing pane heights
  via the same `fraction` 0–1 stored in `split`.
- Default `split` on first tablet load: `0.5` (equal halves). Existing
  saved-state values still load — they just apply to height instead of
  width.

`Layout` accepts a new optional prop `orientation: "row" | "column"`,
defaulting to `"row"`. `PracticeView` passes `"column"` when both hooks
return true; `"row"` otherwise. The component itself stays orientation-
agnostic.

### A3. Divider changes

`src/layout/Divider.tsx` gets the same `orientation` prop. Existing
behavior (pointer drag → `fraction`) is preserved; only the cursor, hit
strip dimensions, and which clientX/Y axis is read flip with the prop.

### A4. CSS

A small new section in `src/styles/theme.css` keyed off a `.layout--column`
class (set by `Layout` based on `orientation`):

```css
.layout--column { flex-direction: column; }
.layout--column .layout-panel { flex-basis: auto; }
/* row defaults stay unchanged */
```

No new `@media` queries — the gate is JS-driven so we can combine
`maxTouchPoints` with width. (A pure media query can't.)

### A5. Split-warning toast

The first time a user on a touch tablet picks the **Split** layout (Play
tab View pill or MIDI Practice Layout pill), a transient toast appears:

> "Split view stacks vertically on tablets — pinch out / use Falldown only
> if the score panel feels cramped."

Implementation: a small `useFirstTimeToast(key)` hook backed by
`localStorage`. Key: `arpeggio:tablet:split-warning-seen`. Toast dismisses
after 6 seconds or on tap. Once dismissed (manually or via timeout) it
never reappears.

Lives in a new `src/responsive/SplitWarningToast.tsx`. Mounted by
`PracticeView` only when `useIsTouchDevice()` is true; therefore desktop
code never executes the toast logic and the localStorage key is never set
on desktop.

## Part B — Long-press for SectionStrip touch gestures

### B1. Current state

`src/section-strip/SectionStrip.tsx`:

- `bookmarkOnRightClickAtEvent` (line 300) — on right-click in empty strip
  area, creates a bookmark.
- `bookmarkOnDoubleClickAtEvent` (line 309) — same action via double-click
  (redundant fallback).
- `onContextMenu` per bookmark pin / section block (lines 339, 373) —
  opens the `ContextMenu` (Rename / Merge / Delete / Loop-to-next-mark /
  Clear loop).

None of these fire reliably under touch on iPad.

### B2. `useLongPress` hook — `src/responsive/useLongPress.ts`

```ts
export function useLongPress(
  onLongPress: (e: { clientX: number; clientY: number; target: EventTarget }) => void,
  options?: { thresholdMs?: number; moveTolerancePx?: number },
): {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp:   (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
};
```

Defaults: `thresholdMs: 500`, `moveTolerancePx: 8`. Starts a timer on
`pointerdown`; cancels on `pointermove` beyond tolerance, `pointerup`
before threshold, or `pointercancel`. Fires `onLongPress` with the
original pointer-down coordinates if the timer elapses.

### B3. Wiring in SectionStrip

`SectionStrip.tsx` consumes `useIsTouchDevice()` and:

- When `false` (desktop): renders exactly as today. **No new code runs.**
- When `true` (tablet): attaches `useLongPress` to:
  - the strip background → call the existing `createBookmarkAtClientX`
    helper with the long-press clientX (matches today's right-click /
    double-click behavior on empty area);
  - each `BookmarkPin` and `SectionBlock` → call the existing
    `setMenu(...)` to open the context menu at the long-press
    coordinates.

The `onContextMenu` and `onDoubleClick` handlers stay on the elements
unchanged so the desktop path is untouched.

Rename on bookmark pins is triggered by double-click today
(`SectionStrip.tsx:668-670`). Under touch, the user reaches rename via the
long-press → context menu → "Rename" path (already wired). The double-click
handler stays in place on desktop; no separate touch wiring is needed.

### B4. iOS Safari long-press selection menu

iPadOS Safari's default long-press shows a text-selection / share menu on
text. To prevent that on interactive strip elements, the existing
`.section-strip__bookmark` / `.section-strip__block` /
`.section-strip__sections` rules in `src/styles/section-strip.css` get
`-webkit-touch-callout: none;` and `-webkit-user-select: none;` only inside
a new `.section-strip--touch` modifier class. `SectionStrip` adds that
class when `useIsTouchDevice()` is true.

## Part C — Apple PWA polish

### C1. Meta tags in `index.html`

Add to `<head>`:

```html
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="Arpeggio" />
<link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
```

Update the existing viewport meta:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

`viewport-fit=cover` enables CSS `env(safe-area-inset-*)`. Under the
`.app--touch` body class, apply safe-area insets to the TopBar and any
fixed/absolute chrome so notch/home-indicator areas don't clip content
in installed-PWA fullscreen mode. Concretely, in `src/styles/theme.css`:

```css
.app--touch .top-bar {
  padding-left: max(12px, env(safe-area-inset-left));
  padding-right: max(12px, env(safe-area-inset-right));
  padding-top: max(0px, env(safe-area-inset-top));
}
.app--touch .practice-content { padding-bottom: env(safe-area-inset-bottom); }
```

(Exact selectors get reconciled with what exists in `theme.css` during
implementation.) Desktop body never has `.app--touch`, so these rules are
dormant on desktop.

### C2. Apple touch icon

A new `public/icons/apple-touch-icon.png` (180×180 PNG) — iOS ignores the
existing SVG icon. Asset can be exported from the existing `icon.svg`.

These additions are inert on non-Apple browsers, so they ship
unconditionally (no JS gate). No desktop behavior changes — desktop just
silently ignores the meta tags.

## Part D — TopBar single-row guarantee on touch devices

### D1. The problem

`TopBar.tsx:75+` lays out ~10–12 controls in a single flex row: logo,
Library, Tools toggle, play/pause, seek scrubber, time text, ModeSwitch,
piece-name center, TopBarReadout, MIDI chip, View/Layout pill. On an
iPad mini portrait (744pt) these don't fit. The worst outcome is wrap-
to-two-rows or clip-off-the-right; either is unacceptable.

### D2. Invariant

On touch devices the TopBar **must never wrap and must never clip**. It
fits on one row at every iPad width down to iPad mini portrait (744pt).

### D3. Approach

Three layered techniques, all gated under `.app--touch`:

1. **Forbid wrap.** `.app--touch .top-bar { flex-wrap: nowrap; }`. The
   browser is not allowed to wrap — overflow would have to clip, which
   technique (2) prevents.
2. **One absorbing element.** The piece-name container is the only
   flex-shrinkable item (`min-width: 0; flex-shrink: 1`); every other
   control gets `flex-shrink: 0` and a fixed/min width. When the bar is
   tight, the piece-name title ellipsizes — but the bar still fits.
3. **Width budget that holds at 744pt.** With the compactions below, the
   fixed-width controls sum to ~580pt, leaving ~150pt+ for the piece name
   at iPad mini portrait. Concretely:

| Element | Touch state | Width |
|---|---|---|
| Library button | icon-only (no "Library" text) | 44pt |
| Tools toggle | icon-only (already) | 44pt |
| Play/pause | icon-only (already) | 44pt |
| Seek scrubber | unchanged | 120pt min |
| Time `m:ss / m:ss` | hidden when `useIsNarrowViewport(900)` | 0 |
| ModeSwitch | unchanged, two short labels | 120pt |
| Piece name | absorbs remainder, ellipsizes | flex-shrink: 1 |
| TopBarReadout (BPM/key) | **moved into Tools popover** on touch | 0 |
| MIDI chip | dot-only when narrow, full when wide | 24pt narrow / ~140pt wide |
| View/Layout pill | unchanged labels | ~100pt |
| Gaps (~7 × 8pt) | — | 56pt |
| **Total fixed (narrow case)** | | **~552pt** |
| **Available for piece name at 744pt** | | **~190pt** |

The TopBarReadout move is the only structural shift — it's a moderately
heavy widget (BPM display, key signature) and the popover is where users
already go to change those values. On desktop the readout stays in the
top bar unchanged.

4. **Hit-target floor.** Every interactive element gets `min-height: 44px`
   under `.app--touch`. Visible sizing stays the same; tap-target padding
   grows. Matches Apple's HIG.

### D4. Implementation

- `App.tsx` adds an effect that toggles a `app--touch` class on the body
  (or root `.app` element) based on `useIsTouchDevice()`. All Part D CSS
  is scoped under that class. Desktop body never has the class.
- `TopBar.tsx` conditionally hides text labels on touch (Library label),
  hides the TopBarReadout under touch (it's instead rendered inside
  `ToolsPopover` under touch), and applies the narrow-width hidings via
  `useIsNarrowViewport(900)`.
- `ToolsPopover` (or one of `PlayTools` / `MidiTools` per the
  practice-state context) gains a "Now playing" section at the top when
  `useIsTouchDevice()` is true, hosting the TopBarReadout. Desktop popover
  layout is unchanged.
- CSS lives in `src/styles/theme.css` under `.app--touch .top-bar` rules.
  No `@media` queries used.

### D5. Why this beats the alternatives

- Horizontal scroll: hides controls off-screen — bad discoverability.
- `flex-wrap: wrap` with row-2: doubles top-bar height, eats viewport.
- Hiding random elements: doesn't bound the worst case; one new control
  reintroduces the overflow.

The width budget is a documented invariant. Any future TopBar control
addition has to fit inside it or it goes in the popover under touch.

## Part E — MIDI status messaging on tablets

### E1. WebMIDI on iPadOS

- Safari on iPadOS gained WebMIDI in **Safari 17.4** (early 2024). Earlier
  iPadOS: `navigator.requestMIDIAccess` is `undefined`; `MidiInput.start()`
  already sets status to `"unsupported"` (`src/midi/MidiInput.ts:47-49`).
- All iOS/iPadOS browsers use WebKit, so Chrome/Firefox/Edge on iPad
  inherit Safari's WebMIDI status — there is no "try a different browser"
  workaround.

### E2. Copy change

In the MIDI chip (`TopBar.tsx`, around the `midi-status-chip` block),
when `useIsTouchDevice()` is true:

- `status === "unsupported"`: show "Update iPadOS to 17.4+ for MIDI" (or
  equivalent) instead of the generic "Connect keyboard."
- `status === "denied"`: show "Allow MIDI access in Safari Settings."

Desktop copy is unchanged.

## Part F — Architecture summary

New files:

- `src/responsive/useIsTouchDevice.ts` + test
- `src/responsive/useIsNarrowViewport.ts` + test
- `src/responsive/useLongPress.ts` + test
- `src/responsive/SplitWarningToast.tsx` + test
- `public/icons/apple-touch-icon.png` (built asset)

Modified files (all changes gated by the hooks above, so desktop bundles
run no new code paths):

- `src/layout/Layout.tsx` — new `orientation` prop.
- `src/layout/Divider.tsx` — new `orientation` prop.
- `src/section-strip/SectionStrip.tsx` — opt-in touch wiring.
- `src/styles/section-strip.css` — `.section-strip--touch` rules.
- `src/styles/theme.css` — `.layout--column` + `.app--touch` rules.
- `src/ui/TopBar.tsx` — copy variants under `useIsTouchDevice()`,
  conditionally hide TopBarReadout and Library text label on touch,
  enforce single-row layout via `.app--touch` class.
- `src/ui/ToolsPopover.tsx` (or `PlayTools.tsx` / `MidiTools.tsx` per
  current popover composition) — host a "Now playing" section with
  the TopBarReadout when `useIsTouchDevice()`.
- `src/app/PracticeView.tsx` — pass `orientation`, mount toast.
- `src/App.tsx` — add `.app--touch` body class.
- `index.html` — Apple meta tags + `viewport-fit=cover`.

## Testing

Automated:

- `useIsTouchDevice` test — true with `maxTouchPoints=5`; false with `0`.
- `useIsNarrowViewport` test — toggles on resize past threshold.
- `useLongPress` test — fires after threshold; cancels on move/up/cancel
  before threshold.
- `Layout.test.tsx` — `orientation="column"` applies the modifier class;
  Divider receives the same orientation prop.
- `Divider.test.tsx` — horizontal axis updates `fraction` from clientY.
- `SectionStrip.test.tsx` — under `useIsTouchDevice()=true` (mocked),
  long-press on bookmark opens the context menu; long-press on empty area
  creates a bookmark. Existing right-click/double-click tests still pass.
- `SplitWarningToast.test.tsx` — shows once, persists dismissal in
  localStorage.
- `TopBar.test.tsx` — under touch + narrow: time text hidden, MIDI chip
  shows dot only, Library label hidden, TopBarReadout not rendered in
  the bar, piece name has `flex-shrink: 1` and ellipsizes; the bar has
  `flex-wrap: nowrap`. Under desktop default, everything renders as
  today (TopBarReadout present, labels visible).
- `ToolsPopover.test.tsx` (or per-tab variant) — under `useIsTouchDevice()`,
  a "Now playing" section renders the TopBarReadout; desktop popover
  unchanged.
- Full gate: `npm run lint && npm run typecheck && npm test && npm run build`.

Manual checklist (requires physical iPad — call out in PR description if
unverified):

- [ ] iPad mini portrait: Split shows falldown stacked on engraved score,
      both readable. Divider drags vertically.
- [ ] iPad Pro 12.9 landscape: Split stays side-by-side (no column-stack).
      Long-press still works on the section strip.
- [ ] First Split selection on iPad shows the warning toast; reload, pick
      Split again — toast does not reappear.
- [ ] Long-press on empty SectionStrip area creates a bookmark.
- [ ] Long-press on a bookmark / section block opens the context menu.
- [ ] Long-press selection menu (system) does NOT appear on strip elements.
- [ ] "Add to Home Screen" launches the app fullscreen with no Safari
      chrome; status bar respects safe-area; home-indicator area is not
      clipped.
- [ ] MIDI: USB-C keyboard plugged via USB-C cable → device shows in chip
      (Safari prompts for permission first).
- [ ] MIDI: Bluetooth MIDI keyboard paired through iPadOS Settings →
      device appears in Web MIDI.
- [ ] On iPadOS < 17.4 (if available to test): chip reads "Update
      iPadOS…" instead of "Connect keyboard."

## Conventions

Follow the repo's existing flow: a just-in-time bite-sized plan, TDD per
task, strict TypeScript, commit per step. Update `docs/features/G-layout-view-modes.md`,
`docs/features/H-practice-controls.md`, `docs/features/J-midi-section-navigator.md`,
and `docs/features/A-scaffold-deploy.md` Changes logs as relevant per
CLAUDE.md's feature-doc self-check.
