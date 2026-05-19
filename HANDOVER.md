# Arpeggio — Session Handover

_Last updated: 2026-05-19. Branch: **`feature/midi-practice-mode`** — 34 commits
ahead of `main`, clean, full gate green, **not yet merged**._

## What this is

**Arpeggio** is a browser-based piano practice tool. You load a MIDI or
MusicXML file and practice with two synced views: a Canvas2D **falldown** of
notes onto a piano keyboard, and an interactive **MuseScore-style engraved
score**, both driven by one master clock.

- **Live:** https://arpeggio-piano.vercel.app/ (auto-deploys on push to `main`)
- **Repo:** github.com/jeffreyw104/arpeggio
- **Specs:** `docs/superpowers/specs/` · **Plans:** `docs/superpowers/plans/`

## Current status

The branch `feature/midi-practice-mode` implements **Spec 1: MIDI Practice
mode** — Web MIDI keyboard input, wait-mode play-along, and a one-bar chrome
consolidation. All 17 plan tasks plus several rounds of review fixes and
top-bar polish are committed; the full gate passes (lint, typecheck, 308
Vitest tests, build, 9 Playwright e2e).

**The branch is NOT merged to `main`.** It is feature-complete and the chrome
is done — but the **MIDI Practice tab itself has known bugs** (see "Next job"),
which is why this handover exists: the next session should fix those before
the branch merges.

Run `npm run dev` for the dev server; `npm test` etc. for the gate.

## Next job — fix the MIDI Practice tab

The chrome / top bar is **done and good — do not revisit it.** The bugs are all
inside the MIDI Practice tab. Known issues, in rough priority order:

1. **Reading lane renders on the bottom; it should be on top.** In MIDI mode
   the layout is a vertical stack — the engraved-score "reading lane" strip
   should sit *above* the falldown. `.practice-content--midi` in
   `src/styles/theme.css` is `flex-direction: column`, and in
   `PracticeView.tsx` the falldown panel `[A]` is the first child and the
   score panel `[B]` second — so the falldown ends up on top. Fix by ordering
   the score panel first in MIDI mode (e.g. `order: -1` on
   `.practice-content--midi .practice-score-panel`, or reverse the column).
   The CSS comment already *claims* "reading-lane on top" — only the rule is
   missing.

2. **QWERTY keyboard input "doesn't seem to work."** The wiring is actually
   correct (`KeyboardInput` → `LiveNotes` → `MidiSession`, enabled by
   `setActive(true)` on the MIDI tab). Two reasons it *feels* dead:
   - **No sound:** the Web Audio context stays suspended until the first
     `clock.play()` (see the `audioStartedRef` effect in `PracticeView.tsx`).
     Pressing QWERTY keys before pressing Play produces no monitor audio.
     → Fix: also resume the audio context on the first input note.
   - **No visual feedback:** `MidiSession.update()` only writes
     `falldown.inputHighlights` from `WaitModeController.result`, which is
     `null` unless a wait-mode step is currently armed (the playhead within
     `EARLY_ACCEPT_SEC` of a chord). So when paused, or with wait-mode off,
     pressing keys lights nothing. → Fix: light *held* keys always — add a
     neutral `"held"` kind to `inputHighlights` (currently
     `"correct" | "wrong"`) and have `MidiSession.update()` set it for every
     `liveNotes.heldNotes()` pitch, with `accepted`/`blocking` overriding it
     during wait-mode.

   QWERTY note map (one octave from C4): `a w s e d f t g y h u j k` →
   MIDI 60–72.

3. **No way to navigate the score to practice a specific section.** In MIDI
   mode the reading lane auto-follows the playhead and is clipped to ~one
   system; there is no manual scroll / jump. The top-bar scrubber and the
   arrow keys (measure jump) work, but there is no way to *see* and *pick* a
   section. This overlaps with **Spec 2** (the deferred MIDI-native visualizer
   — piano-roll lane + progress bar + minimap with click-to-jump navigation).
   Decide whether to do a light fix now (scrollable lane / click-to-seek) or
   fold it into Spec 2.

4. **Expect more.** The user flagged "a lot of things wrong with practice
   mode" — budget time for a discovery pass through the MIDI tab, not just
   these three.

## Architecture (the load-bearing idea)

**One master clock + one Score model; everything else only reads from them.**
Wait-mode adds exactly one nullable field to the clock (`holdAt`).

- `src/model/score.ts` — the canonical `Score`.
- `src/transport/` — `Clock` (now with a `holdAt` clamp) and `Transport`.
- `src/app/frameLoop.ts` — the one `requestAnimationFrame` loop.
- `src/audio/` — `AudioEngine` (sampled piano + metronome). Gained
  `playInputNote`/`releaseInputNote` for the live-input monitor.
- `src/falldown/` — `FalldownRenderer`. Gained `inputHighlights` (key-lighting)
  and `pedalDown` (pedal indicator).
- `src/score-view/` — Verovio wrapper + `ScoreView`.
- `src/ui/` — `TopBar` (the single consolidated bar), `ToolsPopover` +
  `PlayTools` / `MidiTools` (per-tab popover content), `GeneralSettings` +
  `MetronomeSettings` (shared Tools sections), `ModeSwitch`,
  `CollapsibleSection`.
- `src/app/PracticeView.tsx` — the assembled screen. Both tab layouts are
  **inlined** here in one stable `.practice-content` wrapper (the falldown
  `<canvas>` and the score `<div>` must never remount across a tab switch, or
  the renderer bindings break — there is a comment block explaining this).

### The MIDI layer (Spec 1's new code)

- `src/midi/MidiInput.ts` — thin Web MIDI API wrapper (devices, hot-plug,
  note/CC64 parsing).
- `src/midi/KeyboardInput.ts` — QWERTY fallback input source.
- `src/midi/LiveNotes.ts` — held-notes + sustain-pedal store.
- `src/midi/chords.ts` — `buildSteps`: groups score notes into chord steps.
- `src/midi/waitMode.ts` — `evaluateStep`: the strict chord-matching FSM
  (`pending` / `wrong` / `staggered` / `matched`).
- `src/app/WaitModeController.ts` — runs each frame, parks `clock.holdAt` at
  the next chord, advances on a match.
- `src/app/MidiSession.ts` — the non-React controller that assembles all of
  the above and wires it into `PracticeView` (input → live-notes → monitor +
  key-lighting; the wait-mode gate is active **only** on the MIDI tab).

The strict matching rules are intentional (chords must be pressed *together*,
no extra notes) — see the spec. Do not loosen them without asking.

## How the MIDI tab is wired

`PracticeView` creates one `MidiSession` (lazy `useState`), attaches the
falldown + audio engine to it inside the mount effect, registers
`midiSession.update()` on the frame loop, and calls
`midiSession.setActive(mode === "midi")`. `MidiTools` is presentational —
`PracticeView` owns the `handsIPlay` / `waitEnabled` / `monitorOn` state and
pushes it into the session. Hand mutes apply only while the MIDI tab is
active (a Play-tab hand is never silenced).

## The chrome (done — for reference, not for changes)

One consolidated `TopBar`: logo · Library · Tools · play/pause · scrubber ·
time · Play/MIDI-Practice switch · piece name · view controls. The `Tools`
button (top-left) opens a floating `ToolsPopover` that stays open until Tools
is pressed again (no click-away/Escape close). Popover content is per-tab
(`PlayTools` vs `MidiTools`); sections start expanded and stay collapsible.
There is **no separate ⚙ settings drawer** — the old display toggles (note
labels, beat grid, full-88) live in a shared one-row "General settings"
popover section (`GeneralSettings.tsx`), and the metronome click sound sits in
the Metronome section.

## Spec & plans for this round

- Spec: `docs/superpowers/specs/2026-05-19-midi-practice-mode-design.md`
  (includes a **Backlog** section: session scoring, auto-advance looping —
  tracked, not built).
- Plans: `docs/superpowers/plans/2026-05-19-midi-practice-plan-1-chrome.md`
  and `...-plan-2-input-waitmode.md`.
- **Spec 2 (deferred):** the MIDI-native visualizer (piano-roll reading lane,
  measure progress bar, whole-piece minimap with click-to-jump navigation) —
  its own future brainstorm → spec → plan cycle. Note item 3 above overlaps
  with it.

## How to verify (run from repo root)

```
npm run lint && npm run typecheck && npm test && npm run build && npm run e2e
```

`npm run dev` for the dev server. Node ≥ 20.

## Tech stack

Vite + TypeScript + React 19 (`react-jsx`, no `import React`) · Canvas2D
(falldown) · Verovio WASM (score) · Tone.js (audio) · `@tonejs/midi` ·
Web MIDI API · IndexedDB (library) · Vitest + Testing Library + Playwright ·
Vercel · PWA.

## Conventions

Strict TypeScript (`noUnusedLocals`/`noUnusedParameters`). React 19 `react-jsx`.
The `react-hooks/immutability` lint rule — writing through to imperative
objects (renderer / audio engine / plain controller objects) needs an
`// eslint-disable-next-line react-hooks/immutability`. Commit per bite-sized
step. `HANDOVER.md` is intentionally untracked.

The build workflow: `brainstorming` → spec → `writing-plans` → plan →
`subagent-driven-development`. Big feature rounds use the full flow; small
polish is done directly.

## Known limitations / backlog

- MIDI-imported score is approximate (in-app MIDI→MusicXML conversion); the
  falldown is always exact. Spec 2 will replace it with a MIDI-native lane.
- Metronome vs. rubato; offline audio needs network for first sample load.
- Backlog: session accuracy reports / scoring, auto-advance looping, latency
  calibration, raw-MIDI import settings, color themes, practice-time tracking.
