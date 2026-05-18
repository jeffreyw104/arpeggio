# Arpeggio — Session Handover

_Last updated: 2026-05-18. Branch: **`main`** — clean, green, and deployed.
The long `fix/chrome-polish` UI-polish round (including the HUD volume/zoom
sliders) is merged to `main` and live on Vercel — see "Current status"._

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

**`main` is clean, green, and live on Vercel.** v1, Practice mode, three
Practice-mode redesign rounds, and the full `fix/chrome-polish` UI-polish round
are all merged. The full gate passes (lint, typecheck, 263 Vitest tests, build,
7 Playwright e2e). No work is in progress.

The `fix/chrome-polish` round delivered: typography unification,
fully-collapsing accordion sections, the Play/Practice mode switch (two plain
buttons), a darker theme, a midee-inspired HUD restyle, green pill-highlight
accents, compact tempo steppers, and select-arrow clip fixes — plus a final
batch:

- **HUD volume + note-zoom mini-sliders.** `AudioEngine` gained an `OutputSink`
  interface, an optional 4th ctor arg `output`, and `setVolume(level)`;
  `createAudioEngine` wires a real `OutputSink` driving
  `Tone.getDestination().volume` (`-Infinity` at 0, else `Tone.gainToDb`).
  `FalldownRenderer` gained a public `zoom` field, with `pixelsPerSecond` now a
  getter `(hitLineY / 2.5) * zoom`. `FloatingHud` renders the two
  `.hud-minislider` range inputs.
- **Practice-mode chrome fixes.** The settings drawer, the score zoom buttons,
  and the score-only page layout no longer collide with the accordion bar
  (`.practice-view--extended` rules drop them below it).
- **One-row accordion bar.** `.extended-top-bar` is `flex-wrap: nowrap`;
  `ExtendedTopBar` auto-collapses the oldest-opened section to keep one row.
- **Uniform score-only pages.** Verovio renders with `adjustPageHeight: false`
  so every page is a full identical page; the score-only view sizes them to
  the panel height, so it scrolls sideways only.

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
