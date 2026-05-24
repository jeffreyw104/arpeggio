# Studio Dark UI Refresh — Design Spec

**Date:** 2026-05-24
**Status:** draft
**Scope:** chrome only — top bar (`src/ui/TopBar.tsx`, `src/ui/ModeSwitch.tsx`, `src/styles/theme.css`), section strip (`src/styles/section-strip.css`, `src/section-strip/SectionStrip.tsx`), and a small follow-on cleanup in the MIDI Practice Tools popover (`src/ui/MidiTools.tsx`) to remove the two controls that are now duplicated by the top-bar wait pill. No changes to the practice content (falldown, engraved score, reading lane), the rest of the Tools popover, or any non-chrome surface.

## Background

The app's chrome is visually fragmented:

1. The **MIDI section strip** is a warm-cream paper panel (`#ebe5d4`) with a muted-pastel 5-color block palette. It sits directly below a dark liquid-glass top bar, so the chrome jumps from "moody studio" to "music paper" with no transition. The pastel blocks read as dusty next to the glass and the green accent.
2. The **top bar** has a large slack region (the `<span className="top-bar-spacer" />` between the piece title and the view controls) that carries no information. It's visible empty space on every viewport wider than ~900px.
3. The overall feel reads as functional rather than sleek — the chrome doesn't lean into the dark-studio aesthetic the rest of the app is already moving toward.

This spec adopts a single direction ("Studio Dark") that addresses all three at once.

## Goals

1. Unify the chrome — top bar and section strip read as one material.
2. Fill the top-bar slack with **live session info** that's useful for both MIDI source files and MusicXML imports.
3. Tighten the visual language so the chrome feels sleek without changing any keyboard / mouse / MIDI interaction.

## Non-goals

- No layout changes to the practice content panels (falldown, score, lane).
- No new color tokens elsewhere (`--accent`, `--hand-right`, `--hand-left`, lane themes are unchanged).
- No new key-signature parsing — explicitly out of scope, decision recorded below.
- No motion redesign, no Tools popover redesign, no library / import view redesign.

## Visual changes

### 1. Section strip palette → moody saturated

The strip's beige paper is replaced by a dark translucent panel that matches the top bar's material. The 5-color block palette is swapped for moody saturated tones tuned to read on dark glass.

| Token | Today | New |
|---|---|---|
| Strip background | `#ebe5d4` (solid cream) | `linear-gradient(rgba(20,20,25,0.78), rgba(12,12,16,0.88))` + `backdrop-filter: blur(16px) saturate(160%)` |
| Strip bottom border | `1px solid #d3cab3` | `1px solid rgba(255,255,255,0.06)` |
| Strip toolbar text | `#6a5e3e` (brown) | `rgba(230,230,234,0.55)` (dim white) |
| Strip toolbar link hover | `#2e2810` | `#e6e6ea` |
| Block palette (cycled by section index) | `#cba37a`, `#7a9cca`, `#c97d7d`, `#7ec98a`, `#b09bca` | `#3a5a78` slate-blue, `#2f6e63` deep teal, `#7a3a4a` plum, `#7a5a2e` burnt amber, `#4a3a6a` indigo |
| Block text | `#fff` weight 600 | `rgba(255,255,255,0.92)` weight 500 + letter-spacing 0.02em |
| Block inner highlight | none | `box-shadow: inset 0 1px 0 rgba(255,255,255,0.08)` |
| Bookmark name + tether colors | brown `#7a6a48` | unchanged — they sit *above* the strip in the dotted-tether band and already use `mix-blend-mode: difference` to stay readable against any block tint, so they survive the background swap |

The 5-color palette in `SectionStrip.tsx` (`const PALETTE` at line 19) is replaced wholesale; the cycling logic that picks `PALETTE[i % PALETTE.length]` is unchanged.

The loop indicator (red bracket + faint red fill) keeps its current `#d9534f` since it carries meaning ("this is a loop"). It's been visually tested against the new palette in the mockup and stays unmistakably red.

The drag-snap line and hover-line indicators are already `#1a1a1a` on white halo — they were tuned for the cream strip. On the new dark strip they're inverted: the bar becomes `rgba(255,255,255,0.85)` with a `rgba(0,0,0,0.4)` halo. The hover/snap label pills stay as they are (dark pill with white text reads fine on both backgrounds).

### 2. Top bar — live session readout in the slack

A new region inside `.top-bar` fills the space between the piece title and the view controls. It contains 3–5 chips that report live session state. Universally shown for both MIDI source files and MusicXML imports.

**Chip set (left to right inside the readout region):**

| Chip | Source | Visibility | Editable? | Format |
|---|---|---|---|---|
| Tempo | `transport.bpm` | always | no (read-only) | `♩ = 72` |
| Time signature | `audioEngine.metronome.timeSignature` | always | no (read-only) | `4/4` |
| Measure counter | derived from playhead time + `score.measureMap` | always (when score loaded) | no (read-only) | `m. 17 / 84` |
| Loop range | `transport.clock.loop` | only when loop is active | no (read-only) | `↻ m. 17–32 · ×3` if loop count is exposed, else `↻ m. 17–32` |
| Wait-mode | `waitEnabled` + `handsIPlay` (read), both setters (write) | MIDI Practice mode only — always visible | yes (click → menu) | see below |

For MusicXML files the existing `<input type="range" className="hud-scrubber">` stays where it is (left side, after time text). For MIDI source files the scrubber stays hidden as today.

Editing tempo and time-sig remains exclusively in the Tools popover (existing controls in `CommonTools` are unchanged). The chips here are at-a-glance readouts only.

**Wait-mode pill** — both indicator and control. Always present in MIDI Practice mode; hidden in Play mode (wait-mode is undefined there).

Visual states:

| State | Pill chrome | Dot | Label |
|---|---|---|---|
| Off | `background: rgba(255,255,255,0.04)`, gray border, dim text | gray `#4a4a52` | `Turn on wait mode` |
| On — Left | green pill (`background: var(--accent)`, dark text) + soft accent halo | white `#d6ffe9` with glow | `Wait L` |
| On — Both | same | same | `Wait L+R` |
| On — Right | same | same | `Wait R` |

Click behavior:

- **From Off** → menu opens with `Left hand` / `Both hands` / `Right hand`. Picking any of the three turns wait on AND sets `handsIPlay` to that selection. No "Off" entry is shown because you're already off.
- **From On** → menu opens with `Off` (separated by divider) / `Left hand` / `Both hands` / `Right hand` (the current `handsIPlay` selection is highlighted). `Off` flips `waitEnabled` to false and leaves `handsIPlay` alone. A different hand swaps `handsIPlay` and keeps wait on.

This shortcut is consistent with the app's *existing* runtime semantics: in MIDI Practice mode, `handsIPlay` already only affects playback-mute and falldown-visibility *when wait-mode is on*. The pill simply surfaces that coupling rather than introducing it. The Tools popover's "Hands I play" + "Wait for me" controls remain — they share state with the pill.

**Chip styling** (consistent with existing `.top-bar` pill chrome):

- Height `1.5rem`, border-radius `999px`, padding `0 0.65rem`
- Default chip: `background: rgba(255,255,255,0.04)`, `border: 1px solid rgba(255,255,255,0.10)`, `color: var(--text-dim)`
- Loop chip uses a faint red tint to match the section-strip loop indicator: `background: rgba(217,83,79,0.10)`, `border: 1px solid rgba(217,83,79,0.45)`, `color: #f0a8a4`
- All chips use `font-variant-numeric: tabular-nums` so the values don't jitter while playing
- **Read-only chips** (tempo, time-sig, measure, loop): `pointer-events: none` — matches the existing `.midi-status-chip`
- **Wait pill** uses the dedicated chrome described above (gray-off / green-on with halo + dot), `cursor: pointer`, hover lifts the background slightly

**Layout inside the top bar.** Every existing element keeps its current position. The new chip group is inserted *after* the existing single spacer, so it groups visually with the MIDI device chip and view controls on the right:

```
logo · Tools · ▶ · [scrubber MusicXML only] · time · ModeSwitch · piece-title · [spacer] · ♩=72 · 4/4 · m.X/Y · [↻ loop] · [⏸ Wait] · midi-chip · view-controls
```

Crucially, this means:

- **Scrubber** stays in its current spot (after ▶, before time) for MusicXML files; stays hidden for MIDI source — same as today.
- **"now playing" piece title** stays in its current spot (after ModeSwitch), not moved.
- The chip group fills what was the empty slack region, anchoring to the right next to the existing `midi-status-chip` and view-controls.

On narrow viewports where the chips would crowd the piece title or view controls:

- The chip group sits behind `.top-bar > *:not(...)` flex-shrink: 0 — like the piece title, it doesn't shrink.
- Instead, the right-side flex-spacer collapses first (already implicit), then chips drop right-to-left in priority order: **loop → measure → time-sig → tempo → wait**. Loop is lowest priority (only conditionally visible). Wait is highest because it's the only chip that's both a control and an indicator — losing it defeats the slack's main purpose.
- Hidden chips are removed from the DOM (not just visually hidden), so they don't reserve space.

A simple JS-free CSS solution: each chip is wrapped in a container with `min-width: 0` and the chip itself uses `white-space: nowrap`. When the container's natural width can't fit, we use a `container-type: inline-size` query on `.top-bar` to drop chips at breakpoints. (Alternative: a small `useTopBarFit` hook that measures and prunes. Spec defers picking the mechanism — both are viable. Implementation picks the simpler one that passes the manual checklist.)

### 3. All top-bar selectors → pill-with-dropdown

Every multi-option selector on the top bar adopts the same pattern as the wait pill: a single pill shows the current choice + a caret; clicking opens a small dropdown menu with all options (the current one highlighted in the accent). This unifies five different control shapes into one.

**`<TopBarSelect>` (new shared component)** — a small generic `<button>`-as-pill + `<ul>`-as-menu primitive. Props: `value`, `options`, `onChange`, `label` (optional prefix shown before the value, e.g. "View: "), `leading` (optional render-prop for an inline glyph beside the value). Used by every selector below. Menu chrome matches the wait-pill menu (frosted dark panel, accent-tinted active item, dividers when needed).

The selectors:

| Selector | Where today | New label | Options | Notes |
|---|---|---|---|---|
| Mode | two-button toggle (`Play` / `MIDI Practice`) in `ModeSwitch.tsx` | shows current mode plainly (no prefix) | `Play`, `MIDI Practice` | Always visible. |
| View (Play tab) | three buttons (`Both` / `Falldown only` / `Score only`) in `TopBar.tsx` | `View: Both` / `View: Falldown only` / `View: Score only` | three values | Replaces the inline button row. |
| Layout (MIDI Practice tab) | two buttons (`Reading lane` / `Split`) + conditional `Paper`/`Dark` toggle in `TopBar.tsx` | `Layout: Reading lane` / `Layout: Split` | Layout section: Reading lane / Split. Divider. Lane theme section: Light / Dark (plain text, no swatch glyph). | **One pill, two sections in the dropdown.** Theme lives inside the same menu under a divided `Lane theme` section header. When Layout = Split, picking Light or Dark auto-switches to Reading lane with that theme (one-click affordance). Renames the displayed `Paper` label to `Light` for consistency; the underlying `LaneTheme = "paper"` value stays. |
| Wait | (new in this spec) | `Turn on wait mode` / `Wait L` / `Wait L+R` / `Wait R` | Off / Left / Both / Right | Uses its own gray/green chrome — wait is the one selector that doubles as an on/off indicator, so it keeps the dedicated styling described in §2. The dropdown shape is the same. |

**Visual treatment** of every selector pill (except wait):

- At rest: `background: rgba(255,255,255,0.06)`, gray border, default text color, trailing **inline SVG chevron** (10×10 viewBox, single stroked polyline). The unicode `⌄` glyph sits low in its em-box just like `▶` — same fix applies: inline SVG drawn centered in the viewBox aligns perfectly with the pill's text.
- Hover / open: lifts to `rgba(255,255,255,0.10)` background and `rgba(255,255,255,0.22)` border (existing button hover treatment).
- Active item in the menu: accent-tinted highlight + leading `✓` check.
- Multi-section menus (Layout): use a `.section-label` mini-heading (small uppercase letter-spaced gray text, 6px top padding) above each section and a 1px divider between sections.

**Layout impact on `TopBar.tsx`.** The Play-tab view buttons (3 inline) collapse into a single pill; the MIDI Practice layout buttons (2 inline) collapse into a single pill; the conditional lane-theme toggle becomes its own pill. Net change: the right-side cluster goes from up to 5 chrome elements down to 1–3 depending on mode. This frees room for the chip group on narrow viewports.

**Theme pill swatch.** The leading glyph is a small filled circle: cream `#f7f3ea` for Light, near-black `#15151a` for Dark — matches the actual lane background colors. Provides instant recognition without reading the word.

The `mode`, `viewMode`, `practiceLayout`, and `laneTheme` props (and their setters) all remain on `TopBar` unchanged — only the rendering changes.

### 4. MIDI Practice Tools popover — remove wait + hands

The top-bar wait pill is now the single control for both `waitEnabled` and `handsIPlay`, so the equivalent rows in `MidiTools.tsx` become duplicates. Remove them:

- "Hands I play" preset row (Left / Right / Both buttons) — `MidiToolsProps.handsIPlay` and `onHandsIPlayChange` are dropped from this component (still threaded into `TopBar`, which is the new owner of the control surface).
- "Wait for me" checkbox — `MidiToolsProps.waitEnabled` and `onWaitEnabledChange` are dropped from this component (same — moved to `TopBar`).

What stays in the popover:

- MIDI Device select + status line
- Strip position fieldset (MIDI source only, unchanged)
- `CommonTools` (Loop, Tempo, Metronome, General settings)

The "Input sound" checkbox **moves** from the `MidiTools` root into the General-settings row (`src/ui/GeneralSettings.tsx`), as a plain inline `<label><input type="checkbox" /> Input sound</label>` alongside Note labels / Beat grid / Full 88 / Volume / Zoom — identical chrome to its row neighbors, no special wrapper or highlight. Since `GeneralSettings` is shared between Play and MIDI Practice tabs but Input sound only makes sense in MIDI Practice, render it conditionally:

- `GeneralSettings` gains optional props `monitorOn?: boolean` and `onMonitorOnChange?: (on: boolean) => void`.
- `CommonTools` accepts and forwards the same optional props.
- `PlayTools` does not pass them — the checkbox doesn't render in Play mode.
- `MidiTools` passes them through — the checkbox renders in the row.

**Default-open state preserved.** All four accordion sections (Loop, Tempo, Metronome, General settings) keep their existing `useState(true)` default in `CommonTools.tsx` and `GeneralSettings.tsx`. Input sound is visible the moment the popover opens — no extra click to expand.

`PracticeView.tsx`'s state for `waitEnabled`, `handsIPlay`, and `monitorOn` is unchanged — only the prop wiring shifts (`waitEnabled` + `handsIPlay` now go to `TopBar`; `monitorOn` now goes through `CommonTools` → `GeneralSettings`). The `MidiSession`-side coupling that makes `handsIPlay` no-op when `waitEnabled` is false is unchanged.

### 5. Sleekness touches

Small consistency moves that don't change information density:

- All top-bar pills get `font-variant-numeric: tabular-nums` so digit-heavy chips (time, tempo, measure) don't dance.
- The section-strip toolbar's underline link style becomes a hover-only state (link reads as plain text at rest, underlines on hover). Quieter at rest, still clearly clickable.
- The Studio-Dark strip gets the same `box-shadow: var(--glass-shadow)` as the top bar, so the strip's bottom edge has the same subtle inset highlight + drop shadow. The two chrome bands read as a matched pair.
- **Play / pause glyph** — replace the unicode `▶` / `⏸` characters in `.hud-play-btn` with inline SVGs drawn centered in their viewBox. The unicode glyphs sit low in the em-box, so even with `align-items: center` they read as bottom-aligned inside the accent circle. Inline SVG (a single `<path>` for play, two `<rect>` for pause, both filling `currentColor`) sizes via `width/height: 0.85em` and centers perfectly. Keeps the existing accent color, glow, hover and `:active` scale transforms.

No font-family, font-size, or spacing changes. No animations added. No icon set introduced.

## Data plumbing

### What's already there

- `transport.bpm`, `transport.clock.loop`, `transport.clock.position` — all on `Transport` passed to `TopBar`.
- `audioEngine.metronome.timeSignature` — already used in `TopBar` for count-in.
- `waitEnabled` + `handsIPlay` (and their setters) — already lifted to `PracticeView` state and passed into `MidiTools` for the Tools-popover surface; the same props get threaded into `TopBar` for the new wait pill.

### What's new

- A `measureMap: { measureNumber: number; time: number }[]` accessor on the loaded score. The data is already computed in `src/score-view` / `src/transport/measureJump.ts` for the Jump-to-measure feature — surfacing it on the score object (or via a `currentMeasure(transport, score)` helper) is the only addition.
- A `loopRangeLabel(loop, score)` helper that turns a `{ start, end }` time range into `"m. 17–32"`. Falls back to `"0:17 → 0:32"` (time format) if the score has no measure map.
- A loop-iteration counter on the `Clock` so `↻ … · ×N` can render. The speed-up feature in `src/transport/speedUp.ts` already counts loop iterations internally; the spec exposes that as a read-only number on the clock. If exposing it cleanly is awkward, the `· ×N` portion is dropped — the chip still reads `↻ m. 17–32` and stays useful.

### What's *not* added

- **Key signature** parsing — explicitly skipped. The MIDI→MusicXML import path (`src/import/midi/midiToMusicXml.ts:239`) hard-codes `<fifths>0</fifths>`, and the rest of the app never reads it. Adding key (either parsing MusicXML `<key>` elements at import time, parsing MIDI key-sig meta events, or doing Krumhansl/Schmuckler key detection) is a follow-up feature, not part of this refresh.

## Surface impact

| File | Change |
|---|---|
| `src/styles/theme.css` | New chip CSS (`.top-bar-readout`, `.top-bar-readout-chip`, `.top-bar-readout-chip--loop`). Adjust `.midi-status-chip` to use the same chip base (DRY). |
| `src/styles/section-strip.css` | Strip background + border + toolbar color tokens. Drag/hover-line color flip. Strip shadow. |
| `src/section-strip/SectionStrip.tsx` | `PALETTE` constant replaced. |
| `src/ui/ModeSwitch.tsx` | Rewritten to render a single pill + dropdown menu instead of two side-by-side buttons. Public props (`mode`, `onModeChange`) unchanged. Internally just calls `<TopBarSelect>`. |
| `src/ui/ModeSwitch.test.tsx` | Update assertions to reflect the dropdown shape: pill shows current mode, click opens a menu with both options, picking the other one calls `onModeChange`. |
| `src/ui/TopBarSelect.tsx` (new) | Generic pill-with-dropdown primitive used by every selector. Handles open/close, outside-click dismiss, Esc dismiss, keyboard navigation. Supports multi-section menus via an `options` prop shape of `{ section?: string; items: SelectOption[] }[]`. Renders inline SVG chevron in the pill instead of unicode `⌄`. |
| `src/ui/TopBarSelect.test.tsx` (new) | Asserts: pill renders current value with chevron, click opens menu, options render with active highlight + check on current, picking an option calls `onChange` and closes, outside-click closes, Esc closes, multi-section menus render section labels + dividers, picking an item from a non-primary section can dispatch multiple callbacks (e.g. theme + layout). |
| `src/ui/TopBar.tsx` | Replaces the inline Play-tab view buttons (Both / Falldown only / Score only) with one `<TopBarSelect>`. Replaces the MIDI Practice layout buttons (Reading lane / Split) + conditional Paper/Dark toggle with a single `<TopBarSelect>` whose menu has two sections (Layout, Lane theme). The layout pill handles both `onPracticeLayoutChange` and `onLaneThemeChange` — picking Light/Dark from the menu also calls `onPracticeLayoutChange("lane")` if the current layout is Split. Rename displayed `Paper` label to `Light` everywhere (the underlying `LaneTheme` value stays `"paper"` to avoid a state-migration; only the displayed label changes). |
| `src/ui/TopBar.tsx` | New `<TopBarReadout …/>` component rendered in the slack region. Threads through props for `waitEnabled` / `onWaitEnabledChange` / `handsIPlay` / `onHandsIPlayChange` (these are already lifted in `PracticeView`). The existing scrubber/time/piece-title/view-controls plumbing is unchanged. |
| `src/ui/TopBarReadout.tsx` (new) | The chip group component. Owns one inline menu (the wait-mode pill's Off/Left/Both/Right dropdown) anchored to the wait chip. All other chips are pure read-outs. Subscribes to clock changes (same `transport.clock.onChange` pattern `TopBar` already uses). |
| `src/app/PracticeView.tsx` | Route the existing `waitEnabled` / `handsIPlay` props (and their setters) to `TopBar` instead of `MidiTools` — the state stays where it lives, only the consumer changes. |
| `src/ui/MidiTools.tsx` | Drop the "Hands I play" preset row and "Wait for me" checkbox + their props. Drop the "Input sound" checkbox at the popover root — forward `monitorOn` + `onMonitorOnChange` into `CommonTools` instead. |
| `src/ui/PlayTools.tsx` | No prop changes — `CommonTools` props are optional. |
| `src/ui/CommonTools.tsx` | Accept optional `monitorOn` + `onMonitorOnChange` props and forward them into `<GeneralSettings>`. |
| `src/ui/GeneralSettings.tsx` | Accept optional `monitorOn` + `onMonitorOnChange` props. Render an "Input sound" checkbox in the existing `.general-settings-row` only when the props are defined. |
| `src/ui/MidiTools.test.tsx` | Drop assertions for the three removed rows (Hands I play, Wait for me, Input sound at root); add an assertion that `monitorOn` props are forwarded to `CommonTools`. |
| `src/ui/GeneralSettings.test.tsx` | Add a test: when `monitorOn` is defined, the Input sound checkbox renders and toggling it calls `onMonitorOnChange`; when undefined, the checkbox is absent. |
| `src/styles/theme.css` | Drop the `.midi-tools-hands` and `.midi-hands-buttons` CSS now that nothing renders them. |
| `src/transport/transport.ts` or `src/transport/clock.ts` | Optional: expose `loopIterationCount` if it's cheap. Skip if it isn't. |
| `src/score-view/...` or new helper | Expose `measureMap` on the loaded score (or a `currentMeasure(time, score)` helper). |
| `docs/features/B-top-bar.md` | Append a Changes-log bullet for the readout + the section-strip retheme. (Per `CLAUDE.md` self-check.) |
| `docs/features/J-midi-section-navigator.md` | Append a Changes-log bullet for the palette + strip retheme. |
| `HANDOVER.md` | Update the architecture overview's "top bar" and "section strip" callouts. |

No new dependencies. No build/test/lint config changes.

## Testing

- **`TopBarReadout.test.tsx`** (new) — renders the chip group with a fake transport / engine + simple prop callbacks; asserts:
  - Tempo, time-sig, measure chips always render and are read-only (no click handlers)
  - Loop chip appears iff `transport.clock.loop !== null`
  - Wait chip appears iff `mode === "midi"` — and renders `"Turn on wait mode"` when `waitEnabled=false`, `"Wait L"` / `"Wait L+R"` / `"Wait R"` when `waitEnabled=true`
  - Clicking the wait chip from the Off state reveals a menu with Left / Both / Right; picking "Left" calls `onWaitEnabledChange(true)` AND `onHandsIPlayChange(new Set(["left"]))`
  - Clicking the wait chip from the On state reveals a menu with Off / Left / Both / Right; picking "Off" calls `onWaitEnabledChange(false)` and does NOT touch `onHandsIPlayChange`
  - Values update when the clock fires `onChange`
- **`TopBar.test.tsx`** — extend to assert the readout renders for both `isMidiSource=true` and `isMidiSource=false`, with the appropriate chip-set differences. Confirm `<TopBarReadout>` receives the wait-mode props only when `mode === "midi"`.
- **`SectionStrip.test.tsx`** — existing snapshot/test count is unchanged; the palette swap is a value change that the existing color-aware tests already cover.
- **No e2e changes** — the e2e suite asserts behavior (click, jump, loop), not chrome colors. Manual checklist covers the visual side.

### Manual checklist

After implementation:

1. Open a MusicXML file. Confirm the scrubber + new chip group both render in the top bar. The tempo / time-sig / measure chips are read-only — no cursor change or hover lift.
2. Press play. Confirm the chip values update live (tempo if it changes via auto-tempo, measure counter every frame).
3. Drag a loop on the score. Confirm the red loop chip appears; iteration count increments (if exposed).
4. Open the Tools popover and change tempo + time-sig. Confirm the top-bar chips reflect the new values immediately.
5. Open a MIDI file. Confirm the section strip is dark with the new moody palette. Confirm block text, hover line, snap line, drag preview, and loop bracket all remain readable.
6. Switch to MIDI Practice mode. Confirm the wait pill shows `"Turn on wait mode"` in gray. Click it; pick `Left hand`; confirm the pill turns green and reads `Wait L`. Confirm the right-hand falldown notes disappear (existing handsIPlay behavior). Open Tools → confirm the Hands I play row, Wait for me checkbox, and Input sound at the popover root are **gone**. Expand General settings and confirm the "Input sound" checkbox now lives in that row alongside Note labels / Beat grid / Full 88 / Volume / Zoom. Toggle it; confirm input-sound monitor behavior responds (today's behavior). In Play mode, confirm General settings does NOT show an Input sound checkbox.
7. Click the wait pill again. Confirm the menu now has `Off` at the top with Left highlighted. Pick `Off`; confirm the pill goes gray. The handsIPlay selection (Left) should be preserved (only `waitEnabled` flips off).
8. Resize the viewport down. Confirm chips drop right-to-left in priority order (loop → measure → time-sig → tempo → wait), and the piece title stays whole until the very narrowest case.
9. Click the mode pill. Confirm a menu appears with `Play` and `MIDI Practice`, the current mode is highlighted. Pick the other; confirm the bar switches to that mode (view controls update, wait chip toggles visibility) and the pill label updates.
10. In Play mode, click the View pill (`View: Both`). Confirm the menu lists Both / Falldown only / Score only with Both highlighted. Pick `Score only`; confirm the bar updates and the pill now reads `View: Score only`.
11. In MIDI Practice mode (on a MusicXML file — for MIDI source files the Layout pill is hidden), click the Layout pill. Confirm the menu has two sections: a "Layout" section (Reading lane / Split) and a "Lane theme" section below a divider (Light / Dark, plain text). The current layout + theme are both highlighted.
12. While Layout = Split, open the Layout pill and pick `Light`. Confirm: the lane switches to Reading lane AND theme to Light in one click. Open the pill again; confirm both highlights moved appropriately.

## Risks & open questions

- **Loop iteration counter** — if surfacing it from `speedUp.ts` is awkward (e.g., it's local to the speed-up controller, not on the clock), the `· ×N` part of the loop chip is dropped. The chip still reads as `↻ m. 17–32`. Implementation makes the call.
- **Measure counter for files without a measure map** — falls back to a time-only `0:38 / 3:12`-style chip. This is the only case where the chip "shape" changes, and it's the same data the existing `.hud-time` element already shows, so we just hide the new measure chip and leave `.hud-time` doing its job.
- **Narrow-viewport chip drop strategy** — CSS container queries vs. a `useTopBarFit` measurement hook. Both work; the plan picks the simpler that passes the manual checklist.
- **Bookmark name color on dark strip** — currently brown `#7a6a48`. The dotted tether already uses `mix-blend-mode: difference` to stay legible across any block tint, but the bookmark *name text* doesn't. If it doesn't read on the new dark strip, lift it to a dim white (`rgba(230,230,234,0.7)`). Verify in manual checklist step 4.

## Out of scope (saved for follow-ups)

- Key signature display (any approach).
- Section-name chip in the slack (would require sections to exist for MusicXML, which they don't today).
- Speed-up indicator chip in the slack (`⏵ +2 bpm / loop`).
- Tools popover restyle.
- Library / Import view restyle.
- Mobile / touch-friendly chrome.
