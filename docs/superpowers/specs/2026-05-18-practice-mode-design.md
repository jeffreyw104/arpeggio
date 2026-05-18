# Practice mode — design

_Date: 2026-05-18. Branch: `feature/practice-mode` off `main`._

## 1. Purpose

Arpeggio's practice tooling (looping, gradual speed-up, tempo, hands-separate,
metronome) currently lives buried in the `⚙` settings drawer, given no more
prominence than display preferences. This feature introduces a switchable
**Practice mode** so that tooling becomes first-class: a Play / Practice switch
in the top bar, and a dedicated expanded HUD in Practice mode.

Scope is a **re-layout of existing tooling plus two lightweight additions**
(count-in, a loop-range picker). No MIDI-keyboard input, no play-along scoring —
those remain out of scope.

## 2. The two modes

- **Play** — listen straight through. The HUD carries transport plus a
  playback-speed control. No metronome, no loop, no hands-separate.
- **Practice** — the full practice surface. The HUD expands to carry loop,
  tempo, gradual speed-up, hands, and the metronome.

`mode` is React state in `PracticeView`, of a new type
`PracticeMode = "play" | "practice"`. A piece opens in **Play**. The last-used
mode is persisted per piece (see §8).

The mode type and switcher are designed so a third mode *could* be added later,
but no third mode is planned — explicitly, there is no separate "Learn" mode.

## 3. Mode switcher (top bar)

A two-segment control (**Play** / **Practice**) rendered in the `TopBar`'s
existing reserved flex-spacer slot (`.top-bar-spacer`). It is styled as a
segmented control consistent with the existing view-mode switch — same dark
chrome, same `--accent` active-state color, `aria-pressed` on the active
segment.

`TopBar` gains props `mode: PracticeMode` and `onModeChange: (m) => void`. It
remains purely presentational; the state lives in `PracticeView`.

## 4. Play-mode HUD

In Play mode the `FloatingHud` is the current transport HUD with two changes:

- The **metronome** control is removed (metronome is Practice-only).
- A **playback-speed** stepper is added: a `−` button, a readout (e.g. `1.0×`),
  and a `+` button. Range 0.5×–1.5×, step 0.25 (`0.5 0.75 1.0 1.25 1.5`).
  Driving the underlying transport playback rate is left to the implementation
  plan.

Behavior is otherwise unchanged: compact, draggable, auto-fades after 2.5 s of
pointer inactivity.

## 5. Practice-mode HUD

In Practice mode the `FloatingHud` becomes an **expanded, collapsible** panel —
the same floating, draggable, liquid-glass panel, grown to two rows.

### Layout

- **Row 1 — transport:** play/pause, seek slider, `m:ss / m:ss` time readout,
  and a **collapse toggle** (a chevron button at the row's end).
- **Row 2 — practice controls**, as labeled groups (the row uses `flex-wrap`,
  so groups wrap on narrow viewports):
  - **Loop** — `Set start`, `Set end`, `Clear` buttons and a range readout
    (`m.4–8`, or `—` when no loop is set). See §6.
  - **Tempo** — a BPM stepper: `−`, readout, `+`. This drives the existing
    `Transport` tempo.
  - **Speed-up** — a gradual speed-up on/off toggle, wired to the existing
    `transport.enableSpeedUp` / `disableSpeedUp`
    (`{ startRate: 0.5, targetRate: 1, step: 0.05 }`, matching today's
    `ControlPanel`).
  - **Hands** — for each of Left and Right: a show/dim/hide `<select>` and a
    mute checkbox, wired to the existing `HandState`.
  - **Metronome** — an on/off toggle and a `▾` button opening `MetronomeMenu`
    (which opens upward, as today).

### Collapse behavior

- **Collapsed** — only Row 1 is shown; the panel looks like the Play-mode HUD.
  It auto-fades after 2.5 s idle, like the Play HUD.
- **Expanded** — both rows shown. It does **not** auto-fade — practice controls
  must stay visible and usable while practicing.
- Switching into Practice mode shows the HUD **expanded**.
- The collapsed/expanded state is persisted per piece (see §8).
- The collapse toggle's chevron direction reflects state; it carries an
  `aria-expanded` attribute.

## 6. Loop-range picker

Replaces today's single "Loop measure" button. Three buttons plus a readout:

- **Set start** — marks the measure under the current playhead as the loop's
  first measure.
- **Set end** — marks the measure under the current playhead as the loop's last
  measure.
- **Clear** — clears the loop (`transport.clearLoop()`).
- **Readout** — shows the active loop measure range (`m.4–8`), the pending start
  when only a start is set (`m.4–…`), or `—` when no loop is set.

Measure lookup reuses today's logic from `ControlPanel.handleLoopMeasure`:
find the measure containing the playhead position in `transport.score.measures`.
The loop is applied through the existing `transport.loopMeasures(first, last)`,
which already accepts a range. If `end` is set before `start`, the two are
ordered so `first ≤ last`.

## 7. Count-in

A new setting in `MetronomeMenu` (which is Practice-mode-only): **Count-in**,
with values **Off / 1 bar / 2 bars**.

When count-in is set to 1 or 2 bars, pressing play in Practice mode plays that
many bars of metronome clicks at the current tempo and time signature **before**
the music begins. Off (the default) plays immediately, as today.

Count-in builds on the existing `Metronome`. The precise transport/clock
mechanism — delaying the music start while clicks play — is left to the
implementation plan; the spec fixes only the user-visible behavior:

- Count-in applies only in Practice mode and only to a play action that starts
  from a stopped/paused state (not to a seek while playing).
- The metronome need not be toggled on for count-in to click; the count-in
  clicks regardless, then the metronome continues only if its toggle is on.

## 8. Mode-switch behavior — suspend & restore

Switching **Practice → Play** suspends all practice-only state so Play mode
plays straight through:

- the loop is disabled,
- gradual speed-up is disabled,
- the metronome is disabled,
- per-hand mute and visibility reset to unmuted / fully shown.

The suspended values are held in memory. Switching **Play → Practice** restores
them exactly as they were left.

Play-mode playback speed and Practice-mode tempo are **independent** — each mode
keeps its own value across switches; neither is affected by the other.

The suspend/restore state is in-memory only for the session; what is persisted
is the per-piece values themselves (below).

## 9. Persistence

`StoredPracticeState` (in `src/library/db.ts`) gains two optional fields, kept
optional so records saved before this feature still load:

- `mode?: PracticeMode` — the last-used mode.
- `hudCollapsed?: boolean` — the Practice HUD collapse state.

`capturePracticeState` / `applyPracticeState` are extended to round-trip them.
On restore, if `mode` is absent the piece opens in Play; if `hudCollapsed` is
absent the HUD opens expanded.

Existing persisted fields (bpm, loop, hand mute/visibility, time signature,
subdivision) are unchanged. Note: a loop or hand state is captured from its
live values; when the piece is saved while in Play mode (state suspended), the
*suspended* practice values — not the zeroed Play-mode values — are what get
persisted, so a saved loop survives a Play-mode save.

Count-in is **not** persisted in this version (it stays a per-session setting,
consistent with the existing minor limitation that the metronome menu reads
live state). This keeps `StoredPracticeState` changes minimal.

## 10. Settings drawer (`⚙`) re-division

`ControlPanel` is reduced to **display preferences only**:

- Note labels, Beat grid, Full 88 keys, Flatten tempo changes.

Removed from `ControlPanel` (now in the Practice HUD): Loop measure / Clear
loop, Gradual speed-up, and the per-hand mute + show/dim/hide controls.

The drawer is identical in both modes — display preferences apply universally.
The `⚙` gear stays in the top bar in both modes.

## 11. Components touched

- **`src/layout/practiceMode.ts`** (new) — the `PracticeMode` type and a
  `PRACTICE_MODES` constant, mirroring `src/layout/viewMode.ts`.
- **`src/ui/ModeSwitch.tsx`** (new) — the Play / Practice segmented control.
- **`src/ui/TopBar.tsx`** — render `ModeSwitch` in the spacer; new `mode` /
  `onModeChange` props.
- **`src/ui/FloatingHud.tsx`** — accept `mode`; render the Play-mode HUD
  (transport + speed) or the expanded collapsible Practice-mode HUD; own the
  collapse state and the count-in/loop-range controls. This file is already the
  largest piece of UI chrome; if the Practice HUD's controls make it unwieldy,
  extract a `PracticeHudControls` subcomponent for Row 2.
- **`src/ui/MetronomeMenu.tsx`** — add the Count-in selector.
- **`src/practice/ControlPanel.tsx`** — reduced to display preferences.
- **`src/app/PracticeView.tsx`** — own `mode` state; thread it to `TopBar` and
  `FloatingHud`; implement suspend & restore; persist `mode` / `hudCollapsed`.
- **`src/library/db.ts`**, **`src/library/practiceState.ts`** — the two new
  optional persisted fields.

## 12. Styling

- The mode switcher reuses the existing segmented-control styling
  (`.top-bar` segmented rules).
- The expanded Practice HUD keeps the shared `--glass-*` liquid-glass tokens; a
  two-row layout with a hairline divider between rows (matching the
  `ControlPanel` `border-top` group separators).
- The collapse toggle is a chevron button consistent with the metronome `▾`.

## 13. Testing

- **`src/ui/ModeSwitch.test.tsx`** (new) — segments reflect `aria-pressed`,
  clicking emits `onModeChange`.
- **`src/ui/TopBar.test.tsx`** — the mode switch renders and is wired.
- **`src/ui/FloatingHud.test.tsx`** — Play mode: speed stepper present,
  metronome absent. Practice mode: expanded shows both rows, collapse toggle
  hides Row 2, loop Set start/end updates the readout.
- **`src/ui/MetronomeMenu.test.tsx`** — the count-in selector renders and its
  value changes are applied.
- **`src/practice/ControlPanel.test.tsx`** — only display-preference controls
  remain; loop / speed-up / hands controls are gone.
- **`src/app/PracticeView.test.tsx`** — switching to Play suspends loop /
  speed-up / metronome / hand state; switching back restores them.
- **`src/library/practiceState.test.ts`** — `mode` / `hudCollapsed` round-trip;
  records without them still load.
- **Playwright e2e** — a spec that switches Play ↔ Practice and asserts the HUD
  changes shape.

## 14. Verification

`npm run lint && npm run typecheck && npm test && npm run build && npm run e2e`
all clean. Manual check in `npm run dev`: the Play/Practice switch in the top
bar works; Play HUD shows the speed stepper and no metronome; Practice HUD is
expanded with loop/tempo/speed-up/hands/metronome; the collapse toggle works;
Set start/Set end build a loop range; count-in clicks before play; switching to
Play stops the loop/metronome and restores them on switching back.

## 15. Out of scope

MIDI-keyboard input, wait-for-correct-note, play-along scoring, practice-session
time tracking, persisted count-in, and a third mode. These remain in the
backlog.
