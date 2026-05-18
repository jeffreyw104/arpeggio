# Arpeggio — UI Polish & Floating HUD

_Design spec. Date: 2026-05-18. Status: approved, ready for implementation plan._

## Goal

Two themes, both "make the practice UI better", inspired by a study of
`aayushdutt/midee`:

1. **Reclaim space.** The practice chrome (header + control panel) currently
   occupies two full-width layout bands above the content. Move it to fading,
   draggable overlays so the falldown and engraved score fill the whole
   viewport.
2. **Renderer polish.** Make the Canvas2D falldown look less flat: rounded
   notes, velocity-driven opacity, a glow on sounding notes, keyboard depth, a
   tinted active-key halo, and a Dim option for hands-separate practice.

Non-goals: no PixiJS/WebGL migration; no particle system; no falldown zoom
control; no changes to the engraved score view.

## Part A — Floating HUD

### A1. Current structure

`src/app/PracticeView.tsx` renders:

```
.practice-view (column)
  .practice-header   — Library button, zoom −/+, <TransportBar/>
  <ControlPanel/>    — a <div class="control-panel"> of 4 fieldsets, ~14 controls
  <Layout/>          — falldown | divider | score
```

The header and control panel are flow children, so they consume vertical space
before `Layout` gets any.

### A2. Target structure

`Layout` fills the entire `.practice-view`. Chrome becomes two
`position: absolute` overlays stacked above it:

```
.practice-view (position: relative, fills viewport)
  <Layout/>          — absolutely fills the view
  <FloatingHud/>     — draggable transport pill (overlay)
  <ControlPanel/>    — overlay drawer, hidden unless toggled
```

### A3. FloatingHud component (`src/ui/FloatingHud.tsx`, new)

Replaces both `.practice-header` and the standalone `<TransportBar>` band.
`TransportBar.tsx` is absorbed — its play/seek/time/view-mode controls move
into the HUD; the old file is deleted.

Contents, left to right: Library button · play/pause · seek `<input
type=range>` · `m:ss / m:ss` time · the three view-mode buttons · zoom −/+ ·
a ⚙ settings-toggle button.

Props: `transport`, `viewMode`, `onViewModeChange`, `scoreZoom`,
`onZoomChange`, `onExit` (Library), `settingsOpen`, `onToggleSettings`.

**Dragging.** The HUD is absolutely positioned via a `{ x, y }` state held in
`PracticeView`. A `pointerdown` anywhere on the HUD background (not on an
interactive control — buttons/inputs stop propagation) starts a drag;
`pointermove` updates `{ x, y }`; `pointerup` ends it. Position is clamped so
the HUD stays fully inside the `.practice-view` bounds. Default position:
horizontally centered, near the top (e.g. `y = 16px`).

**Fade.** A custom hook `useIdleFade` (in `FloatingHud.tsx`) tracks pointer
activity:
- A document-level `pointermove` listener resets a timer and sets the HUD to
  full opacity.
- After `IDLE_MS = 2500` with no movement, opacity transitions to
  `IDLE_OPACITY = 0.2` (CSS `transition: opacity 0.4s`).
- The HUD never fades while the pointer is over it (`:hover` keeps it solid),
  while a drag is in progress, or while the control-panel drawer is open.

**Position memory.** In-session only — `{ x, y }` lives in React state, not
persisted. On window resize the position is re-clamped into the new bounds.

### A4. ControlPanel as an overlay drawer

`ControlPanel`'s control logic is unchanged. Its container becomes an
absolutely-positioned overlay panel (e.g. anchored top-right under the HUD),
shown only when `settingsOpen` is true (toggled by the HUD ⚙ button). It does
not fade — when open the user is using it; closing it reclaims all space. A
close affordance (the ⚙ toggle, and clicking outside / an × button) hides it.

`PracticeView` owns `const [settingsOpen, setSettingsOpen] = useState(false)`.

### A5. Layout / CSS

- `.practice-view` becomes `position: relative` and fills its parent; its old
  column flow is removed.
- `Layout` is rendered first and absolutely fills `.practice-view`.
- `.floating-hud` and the `.control-panel` overlay use `position: absolute`
  and a `z-index` above the canvas/score.
- The existing `quality-warning` and `score-loading` notices stay as overlays.

## Part B — Renderer polish

All changes are in `src/falldown/`. Pure-geometry functions stay testable;
drawing changes are exercised via the existing renderer smoke tests plus new
unit assertions on the data carried into draw calls.

### B1. Rounded note corners

`drawNotes` in `renderer.ts` replaces `ctx.fillRect` with a `ctx.roundRect`
path + fill. Corner radius = `Math.min(4, width / 3, height / 2)` so thin or
short notes degrade gracefully.

### B2. Velocity → opacity

`NoteRect` (`notes.ts`) gains a `velocity: number` field, copied from
`note.velocity` (model range 0–1). `drawNotes` sets
`ctx.globalAlpha = 0.5 + 0.5 * velocity` before filling each note and restores
it to `1` afterward. Faint notes stay visible (floor 0.5).

### B3. Hit-line glow on sounding notes

`NoteRect` gains `playing: boolean`, set true when `note.start <= t < note.start
+ note.duration` (the note is sounding at the current clock time). `drawNotes`
draws `playing` notes with `ctx.shadowColor = rect.color` and
`ctx.shadowBlur ≈ 12`, cleared (`shadowBlur = 0`) for non-playing notes. Glow
is applied per-note so non-glowing notes pay nothing.

### B4. Keyboard depth (`drawPiano` in `piano.ts`)

- **White keys:** after the base fill, draw a top highlight and a bottom shadow.
  Implemented with a vertical `createLinearGradient` over the key (light at top,
  faint dark at bottom) layered at low alpha, so keys read as lit from above.
- **Black keys:** after the base fill, draw a thin highlight strip across the
  top (bevel) so they read as raised.
- White-key separators (the existing 1px stroke) are kept.

### B5. Active-key halo, tinted by hand

Today `drawPiano` takes one `activeColor`. Replace it with
`activeKeyColors: Map<number, string>` — midi → color. The renderer builds this
map from the notes sounding at `t`: a key sounded by a right-hand note gets
`RIGHT`, a left-hand note gets `LEFT` (if both hands sound the same pitch,
right wins — arbitrary, rare). For each active key `drawPiano` draws (a) a soft
halo behind the key (an expanded, low-alpha rounded rect or a `shadowBlur`
glow in the key's color) and (b) tints the key body with that color.
`DrawPianoOptions` drops `activeColor`; `activeKeys: Set<number>` is replaced by
`activeKeyColors`.

### B6. Hands-separate Dim (3-way visibility)

`HandState` (`practice/hands.ts`) currently has `hidden: Record<Hand, boolean>`.
Replace it with a 3-way visibility per hand:

```ts
type HandVisibility = "show" | "dim" | "hide";
```

- `HandFilter` gains `visibility(hand): HandVisibility` and `isHidden` is
  removed. The only `isHidden` caller is the falldown renderer, which moves to
  `visibility` (it needs the `dim` case anyway); the audio engine uses
  `isMuted` and is untouched.
- `HandState` gets `setVisibility(hand, value)` replacing `setHidden`.
- `NO_HAND_FILTER.visibility` returns `"show"`.
- The falldown renderer: `"hide"` → skip the note (today's behavior); `"dim"` →
  draw at reduced alpha (`DIM_ALPHA ≈ 0.3`, multiplied with the B2 velocity
  alpha); `"show"` → normal.
- `ControlPanel` replaces the per-hand "Hide left/right" checkboxes with a
  3-way control per hand (Show / Dim / Hide — a `<select>` or radio group).
  The "Mute left/right" audio checkboxes are unchanged.
- `practiceState` save/restore: the persisted hidden booleans become the 3-way
  value. Old saved states with the boolean shape are read leniently
  (`true` → `"hide"`, absent/`false` → `"show"`).

## Testing

- **Part A:** component tests for `FloatingHud` — renders transport controls,
  drag updates position and clamps to bounds, idle fade toggles the faded
  state, ⚙ toggles the drawer. Existing `TransportBar` tests are migrated onto
  `FloatingHud` (and the `TransportBar` test file removed with the component).
- **Part B:**
  - `notes.ts` — `noteRects` carries correct `velocity` and `playing` flags.
  - `piano.ts` — `drawPiano` smoke test still passes with `activeKeyColors`;
    assert it draws halo geometry for active keys.
  - `hands.ts` — `HandState` 3-way visibility get/set; `NO_HAND_FILTER`.
  - `practiceState` — round-trips the 3-way value; legacy boolean states load.
  - Renderer smoke tests stay green.
- Full gate: `npm run lint && npm run typecheck && npm test && npm run build`.

## Conventions

Follow the repo's existing flow: a just-in-time bite-sized plan, TDD per task,
strict TypeScript, commit per step. `TransportBar.tsx` + its test are deleted
when `FloatingHud` replaces them.
