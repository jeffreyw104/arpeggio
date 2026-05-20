# Arpeggio — Session Handover

_Last updated: 2026-05-21. Branch: **`main`** — Spec 2 (piano-roll visualizer)
shipped and was reverted same-day after the user rejected the literal-MIDI
direction. Working tree is back to the pre-Spec-2 baseline; clean tree,
full gate green._

## What this is

**Arpeggio** — a browser piano practice tool. Load a MIDI/MusicXML file and
practice with a Canvas2D **falldown** + an engraved **score**, one master clock.

- **Live:** https://arpeggio-piano.vercel.app/ (auto-deploys on push to `main`)
- **Repo:** github.com/jeffreyw104/arpeggio · Node ≥ 20 · `npm run dev`
- **Verify gate:** `npm run lint && npm run typecheck && npm test && npm run build && npm run e2e`
  — currently all green (386 Vitest, 11 Playwright e2e).

## Latest round — "Spec 2 piano-roll: shipped, reverted, rethinking" (2026-05-21)

A full piano-roll-based MIDI visualizer (Spec 2) was designed, built, and
merged to main earlier today (commits `8e27f39..d64dc34`), then reverted
in `c51766b`. The reason: the user described the visualizer they actually
wanted as **a menu or map with sections of the piece to jump to, kind of
like sheet music** — and called the literal piano-roll rendering "insanely
hard to read."

### What was reverted

- `src/piano-roll/` package — `PianoRollRenderer`, `PianoRollLane`,
  `PianoRollPanel`, plus pure helpers (`pitchAutoFit`, `pitchTrack`,
  `noteRectsInWindow`, `measurePaging`).
- `MeasureProgressBar` and `Minimap` React components.
- `Score.sections: Section[]` model field + the MIDI marker / MusicXML
  rehearsal extraction in both importers.
- `LibraryBrowser` source-label chip (`♪ Notes only` / `𝄞 Sheet music`).
- `practiceState.minimapVisible` persistence.
- `PracticeView` source-branching that mounted the piano-roll components.
- All accompanying CSS, tests (38 unit tests + 1 e2e file), and
  HANDOVER text covering the round.

### What was kept

- `docs/superpowers/specs/2026-05-20-midi-visualizer-design.md` — the
  spec, left in git history as a record of the rejected approach.
- `docs/superpowers/plans/2026-05-20-midi-native-visualizer.md` — the
  plan, same.
- The git history of the implementation commits (in `c51766b`'s parents).
  Anything from the reverted feature can be cherry-picked back if a
  future direction wants it.

### Where the brainstorming is now

Four fresh-direction ideas are on the table, all leaning on the
"structural / navigation" framing the user wants:

**A — Section browser sidebar.** Vertical list of sections (auto-detected
from rests, density shifts, key/time changes, repetition; markers used
when present). Each row = name, measure range, time, difficulty pip.
Click to seek. Most "menu-like" — matches the user's words most directly.
My recommendation, possibly combined with D.

**B — Page-thumbnail grid.** Paginate the piece (~8 measures/page); each
page is an abstract thumbnail (density sparkline, hand-split bars, range
glyph). Section brackets overlaid. Strongest sheet-music metaphor; whole
piece fits on screen.

**C — Form-aware outline.** Auto-detect repeated phrases via per-measure
note-vector similarity; label them A / B / A' / etc. Hierarchical
collapsible outline. Most musical, but auto-detection is the brittlest
of the four — falls apart on through-composed pieces.

**D — Practice difficulty heatmap.** Per-measure cells coloured by an
objective difficulty score (notes/sec × max chord size × hand spread).
Section boundaries overlaid. Best as a layer on top of A or B, not on
its own.

The open question is whether the user picks A as the primary (with D's
pip baked in) or wants a different combination. Auto-detection algorithm
details haven't been sketched yet — that's the next gate before any spec
is written. **See [[spec2-rethink-navigation]] memory for the full
brainstorm state to resume from.**

### Why the piano-roll didn't work

For future reference: hand-coloured rectangles with velocity opacity and
paginated viewports were visually correct — they just didn't help the
user navigate. The falldown already shows the literal time-axis notes;
the side views shouldn't duplicate that abstraction. Side views are for
"where am I in the piece?", not "what notes are playing?" The lesson is
saved as [[feedback-prefer-structural-over-literal-visualizations]] in
memory.

## Previous round — "MIDI Practice correctness + ergonomics" (merged to main)

The five bugs reported in the previous session plus several pieces of
ergonomics shaped by live-piano testing. All shipped on `main` as separate
small commits. The MIDI Practice tab is the focus throughout.

### Wait-mode correctness

- **A single press no longer satisfies two consecutive steps.** Old
  evaluateStep accepted any held pitch in `requiredPitches` regardless of
  press time — so when two adjacent steps shared a pitch and the player
  couldn't release-and-re-press between them (fast repetitions, tied
  figures buildSteps doesn't classify), the controller silently advanced
  through a step the player didn't play. WaitModeController now tracks a
  `(pitch → consumed pressTime)` map; a held note whose pressTime equals
  the consumed entry doesn't count as accepted, unless the new step's
  `sustainingPitches` marks the pitch as score-tied. Cleared on
  resyncToPosition (seek / loop wrap). The simultaneity-spread
  calculation now only considers fresh presses so tied carry-overs
  don't stretch the spread of the fresh chord.
- **Tempo "Flatten" no longer breaks practice.** Transport now emits
  `onScoreChange` at the end of `setTempoMode`. MidiSession subscribes via
  a new `setScore(score)` that rebuilds wait-mode steps in the post-
  flatten time space. Previously the controller's steps stayed at
  preserve-mode seconds and the clock parked at stale points.
- **Defer other-hand notes at a wait-mode hold.** AudioEngine now
  postpones any score note whose `start === clock.holdAt` and fires it
  when the hold lifts (next step armed, or wait-mode disabled). Without
  this, the computer's side of a simultaneous chord landed before the
  player could press their part, so wait-mode matches felt off-beat. The
  deferred state clears on seek/loop wrap so an abandoned hold never
  leaves a ghost note.

### Score muting & input echo — MIDI-aware

- **All hand-mute and echo-suppression gated on `midiInput.status ===
  "connected"`.** With no MIDI device the computer is the user's only
  sound source, so `applyHandMutes` leaves both hands audible and the
  echo gate echoes every input. With a MIDI device:
  - no hand selected → un-mute both (user is listening)
  - Right selected → mute right, play left
  - Left selected → mute left, play right
  - Both selected → mute both
- **Echo suppression uses score-attributed hand, not a middle-C split.**
  `pitchCoveredByPlayer` searches `score.notes` for a note matching the
  input pitch with `note.hand ∈ handsIPlay`, active within ±0.5 s of the
  clock. Crossing-hand passages (right hand below middle C, left above)
  are now routed correctly. Off-script presses and wrong notes still
  echo so the player hears their input.
- **Input-monitor release no longer leaks.** The release branch dropped
  its `monitorOn` gate (`triggerRelease` on a non-attacking pitch is a
  no-op in Tone.js). `setMonitorOn(false)` and `setHandsIPlay()` also
  proactively release any held voice whose echo just turned off — the
  toggle "snaps" silent rather than letting the held note ring.
- **Hot-plug.** `midiInput.onStatusChange` re-applies hand mutes and
  releases held input voices on connect/disconnect; the new gating
  flips correctly without a tab cycle.
- **`savedMutes` captured BEFORE `midiInput.start()`.** In jsdom and
  any environment where Web MIDI resolves synchronously, `setStatus`
  fires `onStatusChange` immediately, which now calls applyHandMutes —
  capture order matters so the saved snapshot is the user's pre-overlay
  mute state.

### Metronome — free-run mode

- New "Metronome always on" checkbox in the Tempo section of the Tools
  popover (CommonTools). When checked, the metronome runs from
  `performance.now()` at the user's BPM, completely independent of
  `transport.clock` — keeps clicking while wait-mode parks the clock on
  a step. `Metronome.freeRun` + `updateFree(bpm, nowMs)` drive the new
  path; the score-locked `update(prev, cur)` becomes a no-op while
  freeRun is on. AudioEngine runs `updateFree` BEFORE the no-advance
  early-out so held clocks keep ticking.

### Audio latency tuning

- `Tone.context.lookAhead` lowered from the default 100 ms to **10 ms**;
  `Tone.context.latencyHint = "interactive"` requested. Tightens MIDI
  input → audible output by ~90 ms. The latencyHint setter is wrapped
  in `try/catch` for older browsers that reject hint changes after
  context creation. Trade-off: occasional click-pops possible on slow
  machines — if reported, the next move is to expose a toggle.

### UI polish

- **Lane overlays use positive-z track, not negative-z overlays.** The
  original setup put `.lane-highlight` / `.lane-hover` / `.lane-drag`
  / `.lane-loop` at `z-index: -1` so the engraving could paint on top.
  That tripped a Chromium compositor quirk where negative-z descendants
  of a backdrop-filter ancestor get silently dropped — visible on the
  Vercel HTTPS deploy, fine on localhost HTTP. Fixed by flipping the
  strategy: `.reading-lane-track` now has `position:relative;
  z-index:1`, and the overlays sit at default z (auto). No negative
  z-index anywhere; the lane renders identically on every compositor
  path. The backdrop-filter blur is intact; lane bg opacities are
  back to glass-like values (dark 0.72, paper 0.88). Loop indicator
  softened to background `rgba(217,83,79,0.16)` + 1px outline at 0.6.
  **Paper is the new default lane theme** (was dark) — set via the
  React `useState` initial value in `PracticeView`.
- **PWA service worker now activates immediately.** `vite.config.ts`
  workbox config has `skipWaiting: true` + `clientsClaim: true`. With
  the previous `autoUpdate`-only setup, new builds were fetched but
  didn't take over until every open Vercel tab was closed, so users
  saw stale CSS for hours after a deploy. The first time a user with
  the OLD service worker visits, they still have to manually unregister
  it (DevTools → Application → Service Workers → Unregister); after
  that, all future deploys flip live on the next reload.
- **On-canvas piano lit-keys are distinguishable in dense chords.**
  Halo `shadowBlur` is proportional to key width (`max(3, w * 0.3)`),
  not a fixed 16 px; halo `globalAlpha` 0.7; a 1.25 px dark inset
  stroke runs just inside every active key so a pedal-sustained chord
  reads as a row of lit keys instead of one continuous glow.

## Previous round — "Plan 4 + UX polish" (also merged to main)

Spec: `docs/superpowers/specs/2026-05-19-practice-mode-independence-design.md`.
Plan 4: `docs/superpowers/plans/2026-05-20-plan-4-tappable-keys-qwerty-bugfixes.md`.

### Plan 4 — completed via subagent-driven-development

- **§5 Tappable piano keys.** The on-canvas piano accepts pointer/touch as a
  third input source alongside MIDI and QWERTY. New `src/midi/PointerInput.ts`
  owns pointer listeners on the falldown canvas, calls a pitch-lookup callback,
  and emits the shared `MidiNoteEvent` shape. Pitch lookup is the new
  `FalldownRenderer.pitchAt(x, y)` (built on a pure `src/falldown/pointerHit.ts`
  function that respects black-on-top painting order). `MidiSession` owns the
  `PointerInput` instance and a deferred-attach pattern: `attachPointerInput(canvas)`
  remembers the canvas; the actual `attach()` happens inside `setActive(true)`
  and is paired with `detach()` on `setActive(false)`. Multi-touch is tracked
  per pointerId and drag-across slides between keys legato.
- **§6 2-octave FL Studio QWERTY.** Replaced the 1-octave `KEY_TO_PITCH` in
  `src/midi/KeyboardInput.ts` with midee's layout: `Z X C V B N M` + `Q W E R T Y U`
  white, `S D G H J` + `2 3 5 6 7` black (z=60, u=83). MidiSession's tests
  switched their `pressKey("a")` to `pressKey("z")` to keep the same C4 semantics.
- **§7 bug fixes.**
  - **2a (audio context):** `MidiSession` now resumes the Web Audio context
    on the first live-input note via an injected `startAudio` (defaulting to
    `startAudioContext`). A rejection-reset latch retries on the next press
    instead of permanently latching `audioStarted=true`. PracticeView also
    grabs the first user gesture (`pointerdown`/`keydown` anywhere on
    `document`, capture phase) to prime Tone before the input path even fires
    — so tapping a piano key cold doesn't lose a note to Tone-loading lag.
  - **2b (held-key highlight):** `FalldownRenderer.inputHighlights` value type
    widened to `"correct" | "wrong" | "held"`; a warm-orange `INPUT_HELD`
    constant (`#f0a040`) reads as "you're pressing this, no judgement yet".
    `MidiSession.update()` lays down `"held"` for every `liveNotes.heldNotes()`
    pitch each frame, then lets the wait-mode controller's `accepted` /
    `blocking` overwrite individual pitches.

### Floating-HUD polish

- **Reading lane visual.** Dropped the (Chromium-unreliable) mask-based feather
  for **rounded corners** (`border-radius: 24px` on `.practice-lane-bg` with
  `overflow: hidden`). Lighter opacities (paper `0.85`, dark `0.7`) so the
  lane reads as glass rather than a hard sheet.
- **Reading lane is now scrollable.** Auto-page-turn moved from
  `transform: translateY` to `container.scrollTop`; viewport is `overflow-y:
  auto`. User can wheel / trackpad / touch-scroll freely; auto-jump still
  wins on every system change. Overlays (highlight, hover, drag preview,
  loop indicator) are positioned in the container's content frame
  (`staffBox` adds `scrollTop` / `scrollLeft`) so they scroll with the
  engraving instead of pinning to the viewport.
- **Drag-to-loop everywhere.** Both `ScoreView` (engraved split view) and
  `ReadingLaneView` now show a live green preview over every measure the
  pointer sweeps, then a persistent **faint-red** loop indicator
  (`.measure-loop` / `.lane-loop`) covering the whole loop region. Subscribed
  to `clock.onChange` so the indicator stays in sync with loops set
  anywhere — drag here, drag there, or the Tools popover's buttons.
- **Tools popover loop sync.** `CommonTools` subscribes to `clock.onChange`
  and mirrors the loop range into its `m.X–Y` readout. Drag-set loops show
  up immediately; the Clear button wipes the on-score / on-lane indicator.
- **Tools popover drops below the lane.** New `placement` prop on
  `ToolsPopover`; `PracticeView` passes `"below-lane"` when in MIDI
  Practice + lane layout, so the popover floats at `top: 488px` instead of
  covering the engraving.
- **Top bar redesign.** "now playing" small label + title block sits in the
  bar's slack after the mode switch (so the bar's other items don't have to
  rearrange). Title pinned at `min-content` so it never truncates at sane
  viewport widths — the scrubber gives up width first. The `arpeggio`
  wordmark IS the Library button now, with a vertical slide-reveal on hover
  (`arpeggio` ↑ → `← library`); the separate Library button is gone and the
  old `window.confirm` gate is gone (the slide is signal enough).
- **Library rename.** `renamePiece(id, name)` in `db.ts`; LibraryBrowser
  shows a Rename button on each row with inline edit (Enter saves, Escape
  cancels, blur commits).
- **Score-loading HUD.** Centered frosted-glass pill with three bouncing
  accent-green dots reading "Rendering sheet music" while Verovio works on
  the score.

### Wait-mode + clock cleanup

- **Resync on manual seek (no loop).** `WaitModeController` subscribes to
  `clock.onSeek` and calls `resyncToPosition()` when no loop is active. So
  clicking any measure (which seeks to its start) re-arms wait-mode at the
  first chord of that measure — whether you click forward or back, the
  current measure or any other. Inside a loop, the looper still owns
  navigation.
- **Manual seek lifts the wait-mode hold.** `clock.seek()` now clears
  `_holdAt`, and `clock.setHold()` snaps position back to the hold itself
  (when position is past it). Together: clicking a far-away measure while
  held in wait-mode jumps the playhead to that measure cleanly, instead of
  tick()'s "next ≥ holdAt → snap" branch dragging position right back to
  the old hold before the controller could refresh.
- **Pedal-sustained notes don't punish wait-mode.** `HeldNote` gains a
  `sustained` flag (set true when the key is physically released but the
  pedal is keeping the note alive). `evaluateStep` skips those notes when
  building the `blocking` list — sustained notes can still satisfy required
  pitches (arpeggiated chords with pedal down still match) but can't count
  as wrong.
- **Tied / sustaining pitches.** `PracticeStep` gains a `sustainingPitches`
  set — pitches whose earlier notes are still sounding at this step's onset
  (long notes tied across chord boundaries). Re-pressing one of those is no
  longer flagged as a wrong extra; the controller treats them as allowed.

### StrictMode dispose minefield (be aware before refactoring lifecycle code)

React `<StrictMode>` (enabled in `src/main.tsx` for dev) runs every effect
through **setup → cleanup → setup** on the same component instance. Any
`dispose()` called from a useEffect cleanup will therefore fire *between* the
two mounts of the same `MidiSession` instance. If `dispose()` nulls out
constructor-wired callbacks or unsubscribes from clock listeners, the second
mount inherits a half-dead session and silently drops events. Multiple bugs
this round were the same shape:

- **MidiInput.dispose** was nulling `onNoteOn`/`onNoteOff`/`onPedal`/
  `onStatusChange` and clearing every `MIDIInput.onmidimessage` + the
  `MIDIAccess.onstatechange`. Result: the MIDI keyboard's notes arrived but
  were dropped by the second mount; hot-plug stopped working.
- **MidiSession.dispose** was setting `liveNotes.onPressed = null` /
  `onReleased = null`. Result: clicking the on-canvas piano lit the keys
  but produced no audio.
- **WaitModeController.dispose** was unsubscribing from `clock.onLoop` and
  `clock.onSeek`. Result: after a remount, clicking a measure seeked but
  wait-mode never resynced — `update()` re-parked the hold at the old step
  and snapped position right back.

All three `dispose()` methods now do effectively nothing destructive. The
session is referenced by React state for as long as the component is mounted,
so the closures don't extend its lifetime; in production (no StrictMode) the
dispose is only called on real unmount and the GC handles release.

## Architecture pointers (read these before changing core flow)

- One master clock + one `Score`; everything else only READS them. Wait-mode
  parks the clock at a hold; manual seek lifts the hold.
- `src/score-view/verovio.ts` — Verovio toolkit is a single stateful instance;
  every render goes through `queueRender` (serialized). Each render function
  sets *every* Verovio option it depends on — `setOptions` MERGES.
- `PracticeView.tsx` stability constraint: the falldown `<canvas>`, the score
  `<div>`, and the lane container are at fixed React-tree positions and never
  remount — only CSS classes on the content wrapper change.
- `src/score-view/measureBox.ts` — shared staff-line-box helper, used by both
  `ScoreView` and `ReadingLaneView`.
- The on-canvas falldown is the MIDI-native visualization; the engraved score
  + the reading-lane variant of it are the notation visualizations. They all
  read the same clock + score.

## Conventions

Strict TS (`noUnusedLocals`/`noUnusedParameters`), React 19 `react-jsx`.
Writing to imperative objects (renderer/engine) in a React file needs
`// eslint-disable-next-line react-hooks/immutability`. Commit per bite-sized
step. Big features follow brainstorm → spec → `writing-plans` →
`subagent-driven-development`; small polish goes direct.

`HANDOVER.md` is intentionally tracked here (it changed shape this round to be
the canonical "what's on the branch and why").

## Backlog / not yet built

- **MIDI section-nav rethink (in brainstorm).** The visualizer that
  replaces approximate engraving for MIDI imports — now framed as a
  navigation menu / map rather than a piano-roll. Four candidate
  directions sketched above; user picks before any spec is written.
- Session accuracy report / per-measure flub heatmap.
- Auto-advance looping (loop a region cleanly N times → advance to next chunk
  or step the tempo up).
- QWERTY octave shifting (the FL Studio map gives two octaves; shift is
  backlog).
