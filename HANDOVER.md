# Arpeggio — Session Handover

_Last updated: 2026-05-20. Branch: **`feature/midi-practice-mode`** — 104 commits
ahead of `main`. Clean working tree, full gate green, **not yet merged**._

## What this is

**Arpeggio** — a browser piano practice tool. Load a MIDI/MusicXML file and
practice with a Canvas2D **falldown** + an engraved **score**, one master clock.

- **Live:** https://arpeggio-piano.vercel.app/ (auto-deploys on push to `main`)
- **Repo:** github.com/jeffreyw104/arpeggio · Node ≥ 20 · `npm run dev`
- **Verify gate:** `npm run lint && npm run typecheck && npm test && npm run build && npm run e2e`
  — currently all green (357 Vitest, 11 Playwright e2e).

## This round — "Plan 4 + UX polish"

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

- **Spec 2 — MIDI-native visualizer.** Replaces approximate sheet music for
  MIDI-imported files with a piano-roll reading lane (+ optional measure
  progress bar + whole-piece minimap). Sketched in
  `docs/superpowers/specs/2026-05-19-midi-practice-mode-design.md` §297–311.
  Its own brainstorm → spec → plan cycle — not started.
- Session accuracy report / per-measure flub heatmap.
- Auto-advance looping (loop a region cleanly N times → advance to next chunk
  or step the tempo up).
- QWERTY octave shifting (the FL Studio map gives two octaves; shift is
  backlog).
