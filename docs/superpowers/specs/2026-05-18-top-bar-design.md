# Arpeggio — Top Bar Design

_Spec date: 2026-05-18. Builds on the post-v1 UI-polish round._

## 1. Purpose

Add a semi-transparent **top bar** to the practice screen — a fixed
navigation/features strip across the top, modelled on the bar in
`aayushdutt/midee`. It moves navigation and feature controls off the floating
HUD so the HUD can stay a slim, transport-only overlay.

This is the **first** of two sessions. This session builds the bar. A later
session builds a switchable Play/Practice mode (the mode switcher, the expanded
Practice HUD, metronome-as-Practice-only, and adjustable Listen-mode playback
speed) — all explicitly **out of scope** here (see §8).

## 2. Scope

### In scope

- A new `TopBar` component: fixed, semi-transparent, always visible.
- Move three controls off `FloatingHud` into the bar: the **Library** button,
  the **view-mode** switch (Both / Falldown / Score), and the **⚙ settings**
  gear.
- A new **"now playing"** piece-name label in the bar.
- Slim `FloatingHud` down to transport only (play/pause, seek, time, metronome)
  and move its default position to bottom-center so it clears the bar.
- Fix the font: the bar's controls use the Rubik UI font (the current
  Library/view buttons do not — see §6).

### Out of scope

- The Play/Practice **mode switcher** — deferred to the Practice-mode session.
  A switcher with no second HUD to switch to would be half-built. The bar's
  layout reserves horizontal room for it (a flex spacer) but renders nothing.
- The expanded Practice-mode HUD; metronome becoming Practice-only; adjustable
  playback speed for Listen mode; splitting the settings drawer vs. a Practice
  HUD. All deferred.
- No Learn mode (the user treats Practice as their Learn mode).

## 3. Placement & behavior

- The `TopBar` is an **overlay**, not a layout band: `position: absolute;
  top: 0; left: 0; right: 0`. The falldown + score stage stays full-viewport;
  notes scroll behind the bar. This matches the existing approach where the HUD
  and settings drawer are absolute overlays over a full-viewport stage.
- **Always visible** (no auto-fade, no hover-reveal). It is navigation, so it
  should be dependable. The viewport-reclaiming job is already done by the
  HUD's idle-fade.
- Semi-transparent background (e.g. `rgba(28,28,34,~0.74)`) with a backdrop
  blur and a thin bottom border. Thin (~42px tall).
- z-order: stage < floating HUD < top bar. The bar sits above the HUD so its
  controls stay clickable even if the HUD is dragged near the top. The settings
  drawer's existing behavior is unchanged.

## 4. Contents (left → right)

1. **Library** button — text label "Library" (not an icon). Calls the existing
   `onExit` callback, which returns to the landing screen (Library + Import).
2. **Now playing** — the loaded piece's name. Source: the imported file name
   with its extension stripped. Truncates with an ellipsis if too long. A piece
   is always loaded in the practice view, so there is no empty-name state.
3. **Flex spacer** — reserves horizontal room where the future mode switcher
   will sit. Renders nothing this session.
4. **View-mode switch** — a segmented control: Both / Falldown / Score. Same
   three `ViewMode` values as today; `aria-pressed` marks the active one.
5. **⚙ Settings** gear — toggles the settings drawer; `aria-pressed` reflects
   `settingsOpen`.

No brand wordmark (the user declined it).

## 5. Components & data flow

### New: `src/ui/TopBar.tsx`

Props:

- `pieceName: string`
- `viewMode: ViewMode`
- `onViewModeChange: (m: ViewMode) => void`
- `onOpenLibrary: () => void`
- `settingsOpen: boolean`
- `onToggleSettings: () => void`

Pure presentational component — no internal state. A small helper strips the
file extension from `pieceName` for display.

### `src/App.tsx`

Add `pieceName: string` to the `Session` interface. Both load paths already
have the name: `handleImported` has `file.name`; `handleOpen` has
`piece.name`. Pass `pieceName` through to `PracticeView`.

### `src/app/PracticeView.tsx`

- Accept a new `pieceName` prop.
- Render `<TopBar>` as a sibling overlay inside `.practice-view`.
- Route to `TopBar`: `viewMode`/`setViewMode`, `onExit` (as `onOpenLibrary`),
  `settingsOpen`/`setSettingsOpen` (as `onToggleSettings`).

### `src/ui/FloatingHud.tsx`

- Remove the Library button, the `VIEW_MODE_OPTIONS` rendering, and the ⚙
  settings button (and the `VIEW_MODE_OPTIONS` constant if now unused).
- Drop the now-unused props `viewMode`, `onViewModeChange`,
  `onToggleSettings`, and `onExit` (the Library button was `onExit`'s only
  consumer).
- **Keep** the `settingsOpen` prop: `useIdleFade(settingsOpen)` still uses it
  to suppress the HUD's idle-fade while the settings drawer is open.
- Move the HUD's **default position to bottom-center**: in `useDraggable`'s
  initial-position `useLayoutEffect`, place it near the bottom of the parent
  instead of `y: 16`. Drag and resize-clamp behavior are otherwise unchanged.

## 6. The Rubik font fix

Native `<button>` elements do not inherit `font-family` from `body`, so the
current `.floating-hud button` rule (which sets background/border/padding but
not `font-family`) leaves buttons in the browser default font. This is why the
Library and view-mode buttons are not Rubik.

- The new `.top-bar button` / segmented-control rules set
  `font-family: inherit`.
- Add the same one-line `font-family: inherit` to `.floating-hud button` so the
  remaining HUD buttons (play/pause, metronome caret) are consistent too.

## 7. Styling

- New `.top-bar` block in `src/styles/theme.css`: the semi-transparent
  background, blur, bottom border, flex layout, fixed height.
- The view-mode control is styled as a segmented control consistent with the
  app's dark chrome and the existing `--accent` active-state color.
- `user-select: none` is inherited from `body`.

### Edge cases

- **Long piece names** — `max-width` + `text-overflow: ellipsis`.
- **Score-zoom controls** — the score panel's zoom −/+ buttons are overlaid
  top-right and fade in on hover. They must be offset downward so they clear
  the bar and do not collide with the gear.

## 8. Deferred — the Practice-mode session

Recorded so the next session has context. NOT built here:

- A **mode switcher** in the bar (Play / Practice), sitting in the reserved
  spacer.
- An **expanded Practice-mode HUD** surfacing loop, gradual speed-up, tempo,
  and hands (show/dim/hide + mute) as first-class controls.
- **Metronome** becomes Practice-mode-only.
- **Adjustable playback speed** for Listen/Play mode.
- Re-dividing the settings drawer vs. the Practice HUD.

The switcher should be designed so a third mode could slot in later, though no
third mode is planned.

## 9. Testing

- **New `src/ui/TopBar.test.tsx`** — piece name renders (extension stripped);
  view-mode buttons reflect `aria-pressed` and emit `onViewModeChange`; the
  Library button fires `onOpenLibrary`; the gear fires `onToggleSettings` and
  reflects `settingsOpen`.
- **Update `src/ui/FloatingHud.test.tsx`** — assert the Library, view-mode, and
  gear controls are no longer rendered; transport controls remain.
- **Update `src/app/PracticeView.test.tsx`** — pass the new `pieceName` prop.
  The existing "Settings" and "play" button lookups are role/text-based; the
  Settings button is still rendered by `PracticeView` (now via `TopBar`), so
  those tests continue to pass.
- **Update `src/App.tsx` tests** if any assert the `Session` shape.
- **Playwright e2e** — selectors for Library, view modes, and Settings are
  role/text-based and unchanged; they are only relocated in the DOM. Verify the
  existing specs still pass; adjust only if a selector was position-dependent.

## 10. Verification

`npm run lint && npm run typecheck && npm test && npm run build && npm run e2e`
all clean. Manual check in `npm run dev`: bar always visible and
semi-transparent; Library/view/gear work from the bar; piece name shown; HUD
sits at the bottom and no longer carries those controls; all bar text in Rubik.
