# Practice-mode accordion redesign — design

_Date: 2026-05-18. Branch: `feature/practice-mode`. Builds on
`2026-05-18-practice-mode-redesign.md`; changes the mode switch, the extended
bar, the HUD, and the metronome placement, and fixes a loop/flatten bug._

## 1. Purpose

A second round of practice-chrome refinement from mockup review: the
Play/Practice switch becomes a slider toggle moved beside Library; the floating
HUD becomes draggable again; the extended control bar becomes a horizontal
accordion of collapsible sections with overflow-driven auto-collapse; the
metronome moves into that bar; speed-up gains configurable BPM fields and is
nested under Loop; and a bug where toggling Flatten loses the active loop is
fixed.

## 2. Mode toggle slider

The `ModeSwitch` is rewritten as a **sliding on/off toggle** — a pill-shaped
track with a knob that slides between **Play** (left) and **Practice** (right).
Clicking the track, the knob, or either label flips the mode.

It moves from the top bar's right group to the **left group**, immediately
after the Library button: `arpeggio · Library · [Play⇄Practice]`. The right
group keeps only the view-mode switch and the `⚙` gear.

`PracticeMode` stays `"play" | "practice"` — the toggle is purely a new
presentation of the existing binary mode.

## 3. Movable HUD

`FloatingHud` regains drag: the `useDraggable` hook (removed in the prior
redesign) is restored. Both the Play HUD and the Practice HUD are draggable and
keep idle-fade. Default spawn positions: Play HUD top-left, Practice HUD
top-center. The fixed-position modifier classes from the prior redesign are
replaced by drag-driven positioning.

- **Play HUD:** transport (play/pause, seek, time) + the playback-speed
  stepper. Unchanged content.
- **Practice HUD:** transport only — the metronome moves out (see §6).

## 4. Accordion control bar (Practice mode)

`ExtendedTopBar` becomes a horizontal accordion. It has **four sections**:
**Loop** (which contains Speed-up — see §5), **Tempo**, **Hands**, and
**Metronome**.

Each section renders as a chip: its label plus a caret (`▸` shut, `▾` open).
Clicking the chip toggles it. An open section reveals its controls inline,
animating the width change (a slide). Sections start **collapsed**; more than
one may be open at once. The whole-bar collapse toggle from the prior redesign
(the `top-bar-extended-toggle` button) is **removed** — per-section collapse
replaces it.

### Auto-collapse to fit

The accordion lives in a fixed-width bar. When opening a section would make the
row overflow the bar's width, the **oldest-opened** section collapses to free
space; if it still overflows, the next-oldest collapses; and so on until the
newly opened section fits. Open order is tracked as a queue (the just-opened
section is newest and is never the one auto-collapsed). Implementation: after a
section opens, a layout effect measures whether the content overflows the
bar's client width and collapses oldest-first until it does not.

## 5. Loop section (Loop + Speed-up)

The Loop section's expanded panel has two groups separated by a thin divider:

- **Loop range:** Set start, Set end, Loop measure, Clear, and the range
  readout — behavior unchanged from the prior redesign.
- **Speed-up:** an on/off toggle plus three numeric inputs — **start BPM**,
  **target BPM**, and **increment BPM per loop**.

Speed-up and the loop controls open and collapse together as one section,
because gradual speed-up only takes effect across loop passes.

The three speed-up fields are entered in BPM and converted to the transport's
internal rate ramp: `rate = bpm / transport.referenceBpm`. So enabling speed-up
calls `transport.enableSpeedUp({ startRate, targetRate, step })` with
`startRate = startBpm / referenceBpm`, `targetRate = targetBpm / referenceBpm`,
`step = incrementBpm / referenceBpm`. Default field values derive from the
piece: start `round(0.5 * referenceBpm)`, target `round(referenceBpm)`,
increment `max(1, round(0.05 * referenceBpm))`. Each field is clamped to
20–300 BPM; the increment is clamped to 1–100.

## 6. Metronome section

The metronome moves out of the Practice HUD into the accordion bar as the
fourth section. Its expanded panel holds: the on/off toggle, the beat-pulse
indicator, and the inline metronome settings (time signature, accent,
subdivision, count-in) — i.e. the current `MetronomeSettings` content plus the
toggle and pulse.

`countInBars` lifts from `FloatingHud` up to `PracticeView`, which passes it to
both the Metronome section (the count-in `<select>`) and the HUD (the play
button's count-in handler still lives with the transport). The HUD's
count-in-aware play handler is retained; it reads `countInBars` as a prop.

## 7. Tempo and Hands sections

Unchanged from the prior redesign, now wrapped as accordion sections:

- **Tempo:** `−` / exact numeric BPM input / `+`, plus the Flatten checkbox.
- **Hands:** Left and Right visibility `<select>`s and mute checkboxes, inline.

## 8. Bug fix — Flatten drops the active loop

`Transport.setTempoMode` rebuilds the score when toggling preserve/flatten and
converts the **playhead position** through musical beats so playback stays at
the same musical point. It does **not** convert the **loop**, so an active loop
points at the wrong (or out-of-range) score time after the toggle and is
effectively lost.

Fix: in `setTempoMode`, if a loop is active, convert its `start` and `end`
through `secondsToBeats` (old tempo map) → `beatsToSeconds` (new tempo map) —
the same conversion already applied to the position — and re-apply the
converted loop via `clock.setLoop`. The loop region then survives a
flatten/preserve toggle.

## 9. Components touched

- `src/ui/ModeSwitch.tsx` — rewritten as a slider toggle.
- `src/ui/TopBar.tsx` — `ModeSwitch` relocated to the left group; the
  extended-bar collapse toggle removed.
- `src/ui/FloatingHud.tsx` — `useDraggable` restored; metronome removed
  (Practice HUD is transport-only); `countInBars` becomes a prop.
- `src/ui/ExtendedTopBar.tsx` — rebuilt as the accordion (per-section open
  state, slide animation, oldest-first auto-collapse, width measurement);
  Loop section gains the Speed-up sub-group with BPM fields.
- `src/ui/CollapsibleSection.tsx` (new) — a reusable accordion-section wrapper
  (chip + caret + animated open/close body).
- `src/ui/MetronomeSettings.tsx` — unchanged; now rendered inside the Metronome
  accordion section.
- `src/transport/transport.ts` — `setTempoMode` loop-preservation fix.
- `src/app/PracticeView.tsx` — owns `countInBars`; renders the accordion;
  drops the extended-bar collapse wiring.
- `src/styles/theme.css` — slider toggle, accordion chips/sections, drag.

## 10. Persistence

Accordion section open/closed state is per-session — not persisted. The
`StoredPracticeState.hudCollapsed` field becomes unused (kept optional in the
type for back-compat with older records; new code neither reads nor writes it).

## 11. Testing

Unit/component tests updated for every touched component; new tests for the
slider toggle, the `CollapsibleSection` wrapper, the accordion's
open/close and oldest-first auto-collapse, the BPM-configured speed-up, and the
`setTempoMode` loop-preservation fix. Playwright e2e updated for the new mode
slider and accordion selectors. Full gate:
`npm run lint && npm run typecheck && npm test && npm run build && npm run e2e`.

## 12. Out of scope

No new features beyond the above. The metronome-sound set, arrow-key measure
jumping, count-in, and the suspend/restore mode behavior all carry over
unchanged.
