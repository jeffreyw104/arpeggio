# Arpeggio — Session Handover

_Last updated: 2026-05-18. Branch: **`fix/chrome-polish`** (unmerged).
**Practice mode** plus three redesign rounds are merged & deployed on `main`.
This branch is a long UI-polish round; the volume/zoom slider feature is now
finished and the full gate is green — see "Current status"._

## What this is

**Arpeggio** is a browser-based piano practice tool. You load a MIDI or
MusicXML file and practice with two synced views: a Canvas2D **falldown** of
notes onto a piano keyboard, and an interactive **MuseScore-style engraved
score**, both driven by one master clock. Plus practice tooling: looping,
tempo, hands-separate, metronome, a saved library.

- **Live:** https://arpeggio-piano.vercel.app/ (auto-deploys on every push to `main`)
- **Repo:** github.com/jeffreyw104/arpeggio
- **Design specs:** `docs/superpowers/specs/` · **Plans:** `docs/superpowers/plans/`

## Current status

**On `main`:** v1, Practice mode, and three Practice-mode redesign rounds are
all merged, pushed, and live on Vercel. `main` is clean and green.

**On `fix/chrome-polish` (current branch, NOT merged):** 10 commits of UI
polish on top of `main` — typography unification, fully-collapsing accordion
sections, the Play/Practice mode switch (reverted to two plain buttons after
centering trouble), a darker theme, a midee-inspired HUD restyle, green accent
on pill highlights, compact tempo steppers, and select-arrow clip fixes.

**The HUD volume + zoom (note height) slider feature is complete** and the full
gate is green (lint, typecheck, 263 Vitest tests, build, 7 Playwright e2e). The
modified files:

- `src/audio/engine.ts` — `OutputSink` interface, `AudioEngine` optional 4th
  ctor arg `output`, `AudioEngine.setVolume(level)`, and `createAudioEngine`
  wires a real `OutputSink` driving `Tone.getDestination().volume`
  (`-Infinity` at 0, else `Tone.gainToDb`).
- `src/falldown/renderer.ts` — public `zoom = 1` field; `pixelsPerSecond` is a
  getter `(this.hitLineY / 2.5) * this.zoom`.
- `src/ui/FloatingHud.tsx` — required prop `falldown: FalldownRenderer | null`;
  `volume`/`zoom` state and handlers; two `.hud-minislider` range inputs
  (Vol + Zoom); `aria-label="Seek"` on the scrubber.
- `src/styles/theme.css` — `.hud-mini` / `.hud-mini-label` / `.hud-minislider`
  styles, plus a `.practice-view--extended .control-panel` rule that drops the
  settings drawer below the accordion bar (the Practice-mode drawer bug).
- `src/app/PracticeView.tsx` — passes `falldown={falldown}` to `<FloatingHud>`.
- Tests: `FloatingHud.test.tsx` passes a `falldown` stub and queries sliders by
  name; new `AudioEngine.setVolume` and `FalldownRenderer` zoom tests.

> The branch is unmerged and the user has **not** authorized merging this
> polish round to `main`. The changes are uncommitted — commit when ready.

## How to verify (run from repo root)

```
npm run lint && npm run typecheck && npm test && npm run build && npm run e2e
```

`npm run dev` for the dev server. Node ≥ 20.

## Tech stack

Vite + TypeScript + React 19 (`react-jsx`, no `import React`) · Canvas2D
(falldown) · Verovio WASM (score engraving) · Tone.js (audio) · `@tonejs/midi`
(MIDI parsing) · `fflate` (`.mxl` unzip) · IndexedDB (library storage) ·
Vitest + Testing Library + Playwright · Vercel · PWA.

## Architecture (the load-bearing idea)

**One master clock + one Score model; everything else only reads from them.**

- `src/model/score.ts` — the canonical `Score` (notes, measures, pedal, time
  signatures, tempo map, `musicXml`). Piece name comes from the imported file
  name, threaded through `App`'s `Session`.
- `src/import/` — `importFile(file)` → `Score`.
- `src/transport/` — `Clock` (master clock) and `Transport` (BPM, looping,
  speed-up, preserve/flatten tempo).
- `src/app/frameLoop.ts` — the ONE `requestAnimationFrame` loop.
- `src/audio/` — `AudioEngine` (Tone.js sampled piano) + `Metronome` + `beats.ts`.
- `src/falldown/` — `FalldownRenderer` (Canvas2D falling notes + piano + beat
  grid + on-beat hit-line pulse).
- `src/score-view/` — Verovio wrapper, `ScoreView` (engraved SVG).
- `src/ui/` — `TopBar`, `FloatingHud`, `ModeSwitch`, the Practice accordion bar.
- `src/practice/` — `HandState` (3-way per-hand visibility), `ControlPanel`.
- `src/app/PracticeView.tsx` — the assembled practice screen.

### The practice-screen chrome

- **`TopBar`** — fixed liquid-glass strip: Library button, now-playing piece
  name (absolutely centered), the **Play/Practice mode switch** (two plain
  `aria-pressed` buttons in `.top-bar-modes`), and the `⚙` settings gear.
- **`FloatingHud`** — transport HUD: play/pause, seek scrubber, time, a Speed
  stepper (Play mode), and the new Vol/Zoom mini-sliders. Draggable,
  auto-fades after 2.5 s idle. Restyled after `aayushdutt/midee`.
- **Accordion control bar** — Practice-mode-only bar with collapsible sections
  (Loop, Metronome, etc.). Open section gets a green accent highlight.
- **`ControlPanel`** — the `⚙` settings drawer: display prefs (note labels,
  beat grid, full-88, flatten tempo), per-hand mute + 3-way Show/Dim/Hide.

### Styling

Liquid-glass design tokens in `theme.css` `:root` (`--glass-bg`, `--glass-blur`,
`--glass-border`, `--glass-shadow`). Accent is green `--accent: #4a8`
(`rgb(68,170,136)`), with `--accent-soft` and `--accent-glow`. The midee study
informed the HUD: 32px pill controls, ghost secondary buttons, an accent-circle
play button, an accent-filled scrubber. Native `<button>`/`<input>`/`<select>`
don't inherit `font-family`/`font-size` — a global rule in `theme.css` fixes it.

## How the project is built (workflow)

The superpowers flow: `brainstorming` → a spec in `docs/superpowers/specs/` →
`writing-plans` → a plan in `docs/superpowers/plans/` →
`subagent-driven-development`. Big feature rounds use the full flow; small
polish is done directly. Each feature on its own branch, merged to `main` after
review; `main` auto-deploys to Vercel.

## Conventions

Strict TypeScript (`noUnusedLocals`/`noUnusedParameters`). React 19 `react-jsx`
(no `import React`). The `react-hooks/immutability` lint rule — writing through
to imperative objects (renderer / audio engine) needs an
`// eslint-disable-next-line react-hooks/immutability`. Commit per bite-sized
step. `HANDOVER.md` itself is intentionally untracked.

## Known limitations / backlog

- **MIDI-imported score is approximate** — engraved score for a MIDI file comes
  from an in-app MIDI→MusicXML conversion; bar lines / meter can be rough. The
  falldown is always exact.
- **Metronome vs. rubato** — the metronome/beat-grid follow `score.measures`; a
  steady audible pulse can't perfectly track heavy internal tempo changes.
- **Offline audio** — Tone.js Salamander samples load from a CDN; first-load
  audio needs network.
- Design backlog, not yet built: raw-MIDI import-settings panel, in-app score
  editing, PDF/OMR import, Tauri desktop app, multi-user/cloud, color themes,
  practice-time tracking.
