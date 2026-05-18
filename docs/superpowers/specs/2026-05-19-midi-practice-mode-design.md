# MIDI Practice Mode — Design (Spec 1)

_Date: 2026-05-19. Branch base: `main`._

## Overview

Arpeggio today is a playback-and-practice tool: you load a MIDI/MusicXML file
and watch it play across a falldown and an engraved score. This spec adds
**live MIDI keyboard input** and a **wait-mode play-along** practice tab: the
music halts at each chord until you play it correctly on a connected keyboard,
then advances. It also restructures the chrome into a single top bar and
removes the old standalone Play mode.

The input layer and onset/timing constants are informed by a study of
`aayushdutt/midee` (see "midee study" below). The chord-matching *strictness*
rules are Arpeggio's own, intentionally stricter than midee's.

## Goals

- Read a connected MIDI keyboard via the Web MIDI API (note on/off, velocity,
  sustain pedal CC64), with a QWERTY-keyboard fallback for when no hardware is
  present.
- A **MIDI Practice tab** with wait-mode play-along: playback holds at each
  chord onset until the player matches it, then resumes. Runs endlessly through
  the piece or repeats inside a loop region.
- Hands-separate practice: the app plays the hand(s) you are not playing.
- Live key-lighting feedback on the falldown keyboard (correct/wrong).
- Consolidate the chrome (top bar + accordion row + floating HUD) into **one
  top bar** (mockup option A).
- Spacebar toggles play/pause.

## Non-goals (deferred)

- The MIDI-native visualizer (piano-roll reading lane, progress bar, minimap)
  that replaces approximate sheet music for MIDI files — that is **Spec 2**, a
  separate cycle. See "Follow-up" at the end.
- The features listed under "Backlog" below — including session accuracy
  reports / scoring and auto-advance looping — are explicitly out of Spec 1's
  scope but kept as tracked future work.

## Decisions captured during brainstorming

| Topic | Decision |
|---|---|
| Tabs | Rename the current Practice mode → **Play** tab. Add a **MIDI Practice** tab. **Delete** the old standalone Play mode entirely. |
| Top bar | Mockup **A** — one bar; transport inline; practice controls in a per-tab `Tools▾` popover. |
| MIDI tab layout | Mockup **B** — falldown-focused; the score rides on top as a collapsible reading-lane strip showing ~one system (~4 measures) at a time, auto-following playback. |
| Match strictness | **Strict** (Arpeggio's own, not midee's): all required pitches down, **no extra notes**, and a chord must be pressed **together** within a simultaneity window. Two-hand chords: both hands within the same window. |
| Clock gating | Approach 1 — a `holdAt` clamp on the `Clock`, mirroring the existing loop-wrap clamp. |
| v1 feature scope | Wait-mode, live key-lighting, hands-separate, sustain-pedal input, QWERTY fallback, spacebar. |

## midee study — what we adopt and what we don't

Both projects sit on the same and only browser API: `navigator.requestMIDIAccess()`.
The value in midee is its *wrapper structure* and its *hard-won timing
constants*.

**Adopt:**

- **A thin, pure Web MIDI layer** separate from app logic (midee's
  `MidiInputManager`) — only access, hotplug, byte parsing. Easy to mock/test.
- **An explicit held-notes + pedal store** (midee's `LiveNoteStore` + the
  pedal bookkeeping it puts in `LivePerformanceBus`): a note-off while the
  pedal is down parks the pitch as "sustained" instead of releasing; a re-press
  fires a synthetic release first; pedal-up flushes all sustained pitches.
- **Timestamps normalized to clock-time** at the input boundary, so nothing
  downstream mixes `DOMHighResTimeStamp` with score time.
- **Channel-agnostic parsing**: `status = data[0] & 0xf0`, `velocity = data[2] / 127`.
- **QWERTY fallback** input source (piano-style key layout).
- The chord-grouping window and early-accept window constants (see Constants).

**Do not adopt** (these serve midee features Arpeggio does not have):

- `LivePerformanceBus` as a full multi-source merge hub — with only two sources
  (MIDI, QWERTY) both can write directly to the one held-notes store.
- `CaptureFanout` / `SessionRecorder` — recording is out of scope.
- midee's `ENGAGE_LEAD_SEC` / `RESUME_NUDGE_SEC` onset nudges — these guard
  midee's scheduler against double-firing a note across a wait. Arpeggio's
  `holdAt` clamp plus the `AudioEngine`'s existing half-open `(prev, cur]`
  trigger window already make resume double-trigger-free (see §3), so the
  nudges would be cargo-culting.
- midee's **lenient matching** (any-order pitches, no extra-note gating,
  articulation span only graded) — Arpeggio uses the strict rules above.

## Architecture

The load-bearing principle is unchanged: **one master `Clock`; everything else
only reads from it.** Wait-mode adds exactly one nullable field to the `Clock`
and otherwise lives in new modules.

### 1. Tab restructure & chrome consolidation

- `src/layout/practiceMode.ts`: `PracticeMode` becomes `TabMode = "play" | "midi"`.
  `"play"` is the former Practice mode (full practice tooling). The former
  standalone Play mode is deleted.
- `src/app/PracticeView.tsx`: delete `suspendPractice`/`restorePractice`, the
  `suspendedRef`, and the per-mode BPM snapshots — they existed only to swap
  between the old Play and Practice modes. The view keeps its single shared
  transport / frame loop / falldown / audio engine / score view and switches
  only the *layout and Tools content* by `TabMode`.
- `src/ui/TopBar.tsx` becomes the single consolidated bar (option A):
  `arpeggio` · Library · ▶ · scrubber · time · *piece name* · `Play | MIDI Practice`
  switch · view control · `Tools▾` · `⚙`. The view control is per-tab: on the
  Play tab it is the existing Both / Falldown / Score switch; on the MIDI tab
  (fixed layout B) it collapses to a single toggle for the reading-lane strip.
  On the MIDI tab the bar also shows a device status chip
  (`● <device>` / `○ Connect keyboard`).
- `src/ui/FloatingHud.tsx` is **removed**; its transport (play/pause, scrubber,
  time) moves into `TopBar`. Its Vol/Zoom mini-sliders move into the Tools
  popover. The HUD speed stepper is dropped (the Tempo tool already covers it).
- `src/ui/ExtendedTopBar.tsx` (the accordion row) is **removed as a row**. Its
  four section bodies — Loop, Tempo, Hands, Metronome — are extracted into
  reusable components and rendered inside the Play tab's Tools popover. The
  auto-collapse-to-one-row logic is dropped (a popover is not width-bound).
- New `src/ui/ToolsPopover.tsx` — a floating panel anchored under the `Tools▾`
  button. Content is per-tab: `PlayTools` (Loop / Tempo / Hands / Metronome /
  Vol / Zoom) and `MidiTools` (device picker / hands-you-play / wait-mode
  on-off / input-monitor on-off / Loop / Vol / Zoom).
- `src/ui/ModeSwitch.tsx`: relabel to `Play` / `MIDI Practice`.

### 2. MIDI input layer — `src/midi/`

Three small units, each independently testable:

- **`MidiInput.ts`** — pure Web MIDI. `requestMIDIAccess()` (catches permission
  denial), `onstatechange` hotplug + device rescan, channel-agnostic message
  parsing for note-on (`0x90`), note-off (`0x80`, and `0x90` velocity 0), and
  control-change CC64 (`0xb0`). Emits `noteOn({pitch, velocity, clockTime})`,
  `noteOff({pitch, clockTime})`, `pedal(down: boolean)`, and exposes a device
  list + selected-device + connection status. Event `timeStamp` is converted to
  clock time at this boundary. No app logic.
- **`KeyboardInput.ts`** — QWERTY fallback. Maps a piano-style key layout to
  pitches; emits the same `noteOn`/`noteOff` shape (fixed velocity, e.g. 0.7;
  no pedal). Active only on the MIDI tab and ignored while a form field is
  focused. Note keys never collide with Spacebar (play/pause) or the arrow
  keys (measure jump).
- **`LiveNotes.ts`** — the held-notes + pedal store. `Map<pitch, {velocity,
  pressTime}>` of currently-held notes, plus pedal state and the sustain
  bookkeeping described in the midee study. Both `MidiInput` and
  `KeyboardInput` write to it; the matching FSM and the falldown key-lighting
  read from it.

If `navigator.requestMIDIAccess` is undefined, `MidiInput` reports
"unsupported"; the MIDI tab falls back to QWERTY-only and shows a notice. The
Play tab is unaffected in all cases.

### 3. Wait-mode play-along

**Chord grouping — `src/midi/chords.ts`.** `buildSteps(notes, handFilter)`
walks the hand-filtered notes in onset order and clusters notes whose `start`
is within `STEP_GROUPING_SEC` of the cluster head into one `PracticeStep`:
`{ time, requiredPitches: Set<number> }`. Steps whose required set is empty for
the player's hand(s) are **not emitted** — so a passage the app plays alone
never holds the clock.

**Matching FSM — `src/midi/waitMode.ts`.** A pure function evaluating the
current step against a `LiveNotes` snapshot and the time the step was armed:

- `accepted` = required pitches currently held.
- A held pitch is a **blocking extra** if it is not required *and* its
  `pressTime` is after the step was armed. Notes still held over from the
  previously-matched step have earlier press times and are ignored — strict
  "no extras" does not punish legato.
- Re-striking an already-accepted pitch updates its `pressTime` and is not an
  error (duplicate tolerance), so re-pressing as part of a together-strike is
  allowed.
- States:
  - `pending` — not all required pitches held.
  - `wrong` — a blocking extra is held.
  - `staggered` — all required held, no blocking extra, but the spread
    `max(pressTime) − min(pressTime)` over the required pitches exceeds
    `SIMULTANEITY_SEC`.
  - `matched` — all required held, no blocking extra, spread within
    `SIMULTANEITY_SEC`. → advance.

Two-hand chords are handled for free: when the player plays both hands, the
required set contains both hands' notes and the single spread check spans all
of them.

**Clock hold — `src/transport/clock.ts`.** Add `private _holdAt: number | null`,
`get holdAt`, `setHold(seconds | null)`. In `tick()`, after computing `next`:
if `_holdAt != null && next >= _holdAt`, clamp `next = _holdAt` and keep
`_playing` true (the clock holds, it does not pause). This is the same shape as
the existing loop-wrap clamp.

Resume needs no nudge: when a step is matched, the controller sets `holdAt` to
the next step's time; the clock advances from the held onset, and the
`AudioEngine`'s half-open `(prev, cur]` trigger window excludes the onset
already played — no note double-fires.

**`src/app/WaitModeController.ts`** — non-visual, registered into the existing
`FrameLoop` via `loop.onFrame`. Each frame it:

1. Picks the active step from `clock.position`; arms it for matching once
   `position >= step.time − EARLY_ACCEPT_SEC` (pressing slightly ahead of the
   beat counts and avoids an audible stop).
2. Sets `clock.setHold(step.time)`.
3. Evaluates the FSM against `LiveNotes`.
4. On `matched`: advances the step index and re-points `holdAt` at the next
   step (or clears it past the final step).
5. Writes `falldown.inputHighlights` (see §4) for key-lighting.

It subscribes to `clock.onLoop`; on a loop wrap it resets the step index to the
first step inside the loop region. **Endless vs. loop** is therefore just
whether a Transport loop region is set — endless = no region.

### 4. Input monitoring, pedal, live key-lighting

- **Input monitor.** The player's note-ons sound through the existing Tone.js
  sampler via `triggerAttack` / `triggerRelease` (press/release, not the
  duration-based `triggerAttackRelease` used for file playback), so a
  silent MIDI controller is still audible. `AudioEngine` gains
  `playInputNote(pitch, velocity)` / `releaseInputNote(pitch)`. A toggle in
  `MidiTools`, on by default.
- **Pedal.** CC64 from `MidiInput` drives the `LiveNotes` sustain bookkeeping,
  which the input monitor honors (held notes are not released until pedal-up).
  Pedal is **not** part of the wait-mode gate. A pedal indicator is shown near
  the falldown keyboard.
- **Live key-lighting.** `FalldownRenderer` gains an
  `inputHighlights: Map<pitch, "correct" | "wrong">` field, read each frame
  when it draws the keyboard. The `WaitModeController` populates it: held
  required pitches → `correct` (green), held blocking extras → `wrong` (red).
- **Hands-separate.** The hand(s) the player chooses are muted in the
  `AudioEngine` via the existing `HandState` mute mechanism (the player
  produces them); the app plays the other hand from the file. The FSM's
  required set is filtered to the player's hand(s).

### 5. MIDI Practice tab — layout B

- `src/app/MidiTab.tsx` — the MIDI-tab content: mounts the
  `WaitModeController`, the reading-lane strip, and the wait-state overlay.
- `src/ui/ReadingLane.tsx` — a collapsible strip above the falldown showing the
  engraved score clipped to roughly one system, auto-following the playhead
  (reuses `score-view/sync.ts`). For a MIDI-imported file it shows that file's
  approximate engraved score as an interim; Spec 2 replaces it with the
  piano-roll lane.
- Wait-state feedback (`staggered` → "play it together", `wrong` flash)
  overlays the falldown near the hit-line — no separate panel.
- Spacebar → `clock.toggle()`, ignored while an `INPUT`/`SELECT`/`TEXTAREA`
  is focused — added alongside the existing arrow-key handler in
  `PracticeView`.

### 6. Error handling

- Web MIDI unsupported or permission denied → MIDI tab shows a clear notice and
  falls back to QWERTY; wait-mode still works with QWERTY. Play tab unaffected.
- Device disconnect mid-session → status chip flips to disconnected; the clock
  simply stays held at the current step until input resumes (no crash).
- A stretch with no required notes for the player's hand → those steps are not
  emitted, so the clock never holds indefinitely on a rest.
- Audio context not yet started → unchanged; the existing first-gesture resume
  covers the first play.

### 7. Testing

- `MidiInput` — against a mocked Web MIDI API (fake `requestMIDIAccess`,
  `statechange`, `midimessage`): parsing, hotplug, permission denial.
- `LiveNotes` — held-note lifecycle and the sustain bookkeeping (note-off under
  pedal, synthetic release on re-press, pedal-up flush).
- `chords.buildSteps` — grouping window, hand filtering, empty-step omission.
- `waitMode` FSM — pure, the bulk of the coverage: `pending` / `wrong` /
  `staggered` / `matched`, the simultaneity spread, blocking-extra vs.
  held-over note, duplicate tolerance, two-hand chords, early-accept.
- `Clock` — `holdAt` clamps `tick()` without clearing `playing`.
- `KeyboardInput` — QWERTY mapping.
- Playwright e2e — the chrome restructure (one bar, tab switch, Tools popover).
  Web MIDI cannot be driven in Playwright; the FSM is covered by unit tests.

Gate to keep green: `npm run lint && npm run typecheck && npm test && npm run build && npm run e2e`.

## Constants

| Constant | Value | Purpose |
|---|---|---|
| `STEP_GROUPING_SEC` | `0.04` | Notes within this of a cluster head form one chord step. |
| `SIMULTANEITY_SEC` | `0.08` | Max press-time spread for a chord to count as played "together". |
| `EARLY_ACCEPT_SEC` | `0.12` | How far before a step's onset presses begin counting. |

(midee's `ENGAGE_LEAD_SEC` / `RESUME_NUDGE_SEC` are intentionally omitted — see
the midee study.)

## File summary

**New:** `src/midi/MidiInput.ts`, `KeyboardInput.ts`, `LiveNotes.ts`,
`chords.ts`, `waitMode.ts`; `src/app/WaitModeController.ts`, `MidiTab.tsx`;
`src/ui/ToolsPopover.tsx`, `PlayTools.tsx`, `MidiTools.tsx`, `ReadingLane.tsx`
(plus `.test` files).

**Modified:** `src/transport/clock.ts`, `src/layout/practiceMode.ts`,
`src/ui/TopBar.tsx`, `src/ui/ModeSwitch.tsx`, `src/app/PracticeView.tsx`,
`src/falldown/renderer.ts`, `src/audio/engine.ts`, `src/library/db.ts` and
`practiceState.ts` (persisted mode values).

**Removed:** `src/ui/FloatingHud.tsx`, `src/ui/ExtendedTopBar.tsx`; the old
Play-mode suspend/restore logic in `PracticeView`.

## Follow-up: Spec 2 — MIDI-native visualizer (deferred)

A separate brainstorming → spec → plan cycle. Replaces approximate sheet music
for MIDI-imported files with a MIDI-native visualizer:

- **Piano-roll reading lane** — horizontal piano-roll, paged ~4 measures at a
  time; the source-specific content of the reading-lane strip (engraved system
  for XML, piano-roll window for MIDI).
- **Measure progress bar** — segmented per-measure strip, source-agnostic.
- **Whole-piece minimap** — zoomed-out overview with a click-to-jump viewport.

All three carry measure numbers and section markers so the player navigates by
landmark, never by guessing with the scrubber — the "skip to known sections
like sheet music" property. The library/home view labels each piece
`♪ Notes only` (MIDI) vs `𝄞 Sheet music` (XML).

## Backlog (tracked, not scheduled)

Future work built on top of the MIDI Practice mode, each its own later cycle:

- **Session accuracy report / scoring** — after a wait-mode run, show percent
  correct, timing accuracy, and a per-measure flub heatmap over the score. The
  matching FSM already distinguishes `wrong` / `staggered` / `matched` and
  tracks the simultaneity spread, so the data needed for scoring is produced by
  Spec 1 — this feature consumes it rather than re-deriving it.
- **Auto-advance looping** — when a loop region is cleanly cleared N times in a
  row, the loop advances to the next chunk (bar-by-bar mastery) or steps the
  tempo up, tying into the existing speed-up ramp.
- Looser ideas, not yet committed: latency calibration, free-play
  record-and-transcribe, sight-reading drills.
