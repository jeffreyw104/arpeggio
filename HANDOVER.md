# Arpeggio — Session Handover

_Last updated: 2026-05-18. Branch: `main` (everything below is merged & pushed
& deployed). The **top-bar** feature plus a **liquid-glass** styling round just
shipped. **Practice mode** is the next feature — not yet designed; see "Next"._

## What this is

**Arpeggio** is a browser-based piano practice tool. You load a MIDI or
MusicXML file and practice with two synced views: a Canvas2D **falldown** of
notes onto a piano keyboard, and an interactive **MuseScore-style engraved
score**, both driven by one master clock. Plus practice tooling: looping,
tempo, hands-separate, metronome, a saved library.

- **Live:** https://arpeggio-piano.vercel.app/ (auto-deploys on every push to `main`)
- **Repo:** github.com/jeffreyw104/arpeggio
- **Design specs:** `docs/superpowers/specs/` · **Plans:** `docs/superpowers/plans/`
- **Master plan + progress dashboard:** `implementation.md`

## Current status

**v1, a post-v1 UI-polish round, and the top-bar feature are all complete.**
All work below is merged to `main`, pushed, and live on Vercel.

- 219 unit/component tests (Vitest, 39 files) + 5 Playwright e2e specs — all green.
- `npm run lint`, `npm run typecheck`, `npm run build` all clean.
- Working tree clean. (`HANDOVER.md` itself is intentionally untracked.)
- Merged branches `feature/ui-polish-floating-hud` and `feature/top-bar`
  (the latter remote-only now) still exist — safe to delete.

## How to verify (run from repo root)

```
npm run lint && npm run typecheck && npm test && npm run build && npm run e2e
```

`npm run dev` for the dev server. Node ≥ 20.

## Tech stack

Vite + TypeScript + React 19 · Canvas2D (falldown) · Verovio WASM (score
engraving) · Tone.js (audio) · `@tonejs/midi` (MIDI parsing) · `fflate` (`.mxl`
unzip) · IndexedDB (library storage) · Vitest + Playwright · Vercel · PWA.
UI font is **Rubik** (Google Fonts, with a system-stack fallback).

## Architecture (the load-bearing idea)

**One master clock + one Score model; everything else only reads from them.**

- `src/model/score.ts` — the canonical `Score` (notes, measures, pedal, time
  signatures, tempo map, `musicXml`). No title field — the piece name comes
  from the imported file name, threaded through `App`'s `Session`.
- `src/import/` — `importFile(file)` → `Score`.
- `src/transport/` — `Clock` (master clock) and `Transport` (BPM, looping,
  speed-up, preserve/flatten tempo).
- `src/app/frameLoop.ts` — the ONE `requestAnimationFrame` loop.
- `src/audio/` — `AudioEngine` (Tone.js sampled piano) + `Metronome` + `beats.ts`.
- `src/falldown/` — `FalldownRenderer` (Canvas2D falling notes + piano + beat
  grid + on-beat hit-line pulse).
- `src/score-view/` — Verovio wrapper, `ScoreView` (engraved SVG).
- `src/ui/` — `TopBar` + `FloatingHud` + `MetronomeMenu` (the practice chrome).
- `src/practice/` — `HandState` (3-way per-hand visibility), `ControlPanel`.
- `src/app/PracticeView.tsx` — the assembled practice screen.

### The practice-screen chrome (after the top-bar feature)

- **`TopBar`** (`src/ui/TopBar.tsx`) — a fixed, always-visible, floating
  "liquid-glass" strip across the top. Holds: Library button, the now-playing
  piece name, the view-mode switch (Both / Falldown only / Score only), and the
  `⚙` settings gear. Purely presentational; state lives in `PracticeView`. Its
  layout has a flex spacer reserving room for a future mode switcher.
- **`FloatingHud`** (`src/ui/FloatingHud.tsx`) — slimmed to transport only:
  play/pause, seek, time, the metronome control. Draggable, auto-fading
  (2.5 s idle), defaults to **bottom-center**. Liquid-glass styled.
- **`MetronomeMenu`** (`src/ui/MetronomeMenu.tsx`) — the dropdown from the
  metronome `▾`; Tempo, time signature, accent, subdivision. Opens **upward**
  (the HUD sits at the bottom).
- **`ControlPanel`** (`src/practice/ControlPanel.tsx`) — the `⚙` settings
  drawer: loop measure, gradual speed-up, note labels, beat grid, full-88,
  flatten tempo, per-hand mute + 3-way Show/Dim/Hide.
- **Score panel** — zoom −/+ buttons overlaid top-right; the score container
  has top padding so the engraved music clears the floating bar.
- **Liquid glass** — shared `--glass-*` CSS tokens in `theme.css` `:root` drive
  the frosted background, blur, highlight rim, and shadow on the bar and HUD.

## What shipped recently

- **Top-bar feature** — spec `docs/superpowers/specs/2026-05-18-top-bar-design.md`,
  plan `docs/superpowers/plans/2026-05-18-top-bar.md`. New `TopBar` component;
  Library + view-mode switch + settings gear moved off the HUD into it; new
  now-playing piece-name label; HUD slimmed to transport-only and moved to
  bottom-center; Rubik font fix on chrome buttons (native `<button>` does not
  inherit `font-family`).
- **Liquid-glass styling round** — the bar and HUD became floating rounded
  panels with frosted-glass blur, an inner highlight rim, and a soft shadow,
  via shared `--glass-*` tokens. The bar detached from the viewport edges and
  is slightly taller (50 px). Metronome dropdown opens upward. Score panel
  padded so the music clears the bar.

## Next — practice mode (NOT yet designed or built)

The deferred scope from the top-bar spec §8. The user wants a switchable
**Practice mode**, so practice tooling gets real estate instead of being buried
in the `⚙` settings drawer:

- A Play/Practice **mode switcher** in the top bar. The bar already reserves a
  flex-spacer slot for it. Design it so a 3rd mode *could* slot in later — but
  the user explicitly does **not** want a separate Learn mode ("Practice is my
  Learn").
- An **expanded Practice-mode HUD** surfacing the practice tooling as
  first-class controls: loop region, gradual speed-up, tempo, hands (3-way
  show/dim/hide + mute).
- **Metronome becomes Practice-mode-only.**
- **Adjustable playback speed for Listen/Play mode.**
- Re-divide the `⚙` settings drawer vs. the Practice HUD — display prefs (note
  labels, beat grid, full-88, flatten tempo) stay in the drawer.
- The user is open to additional practice-feature ideas — brainstorm with them.

**To resume:** invoke `superpowers:brainstorming` for practice mode (the user
already accepted the visual-companion tool in prior sessions — offer it again).
Then spec → `superpowers:writing-plans` → `superpowers:subagent-driven-development`.
Do the work on a new branch off `main` (e.g. `feature/practice-mode`).

## How the project is built (workflow)

The superpowers flow: `brainstorming` → a spec in `docs/superpowers/specs/` →
`writing-plans` → a plan in `docs/superpowers/plans/` →
`subagent-driven-development` (fresh implementer subagent per task, then a
spec-compliance review and a code-quality review per task). Each feature on its
own branch, merged to `main` after review; `main` auto-deploys.

## Known limitations / backlog

- **MIDI-imported score is approximate** — the engraved score for a MIDI file
  comes from an in-app MIDI→MusicXML conversion; bar lines / meter can be rough.
  The falldown is always exact.
- **Metronome vs. rubato** — the metronome/beat-grid follow `score.measures`; a
  steady audible pulse can't perfectly track heavy internal tempo changes.
- **Offline audio** — Tone.js Salamander samples load from a CDN; first-load
  audio needs network.
- **HUD time-signature/subdivision restore** — the `MetronomeMenu` reads live
  state when opened, but if a saved practice state changed the time signature,
  the menu shows the score's original until reopened. Minor; pre-existing-style.
- Design backlog (top-bar spec §8 + earlier specs), explicitly NOT yet built:
  practice mode (next), raw-MIDI import-settings panel, in-app score editing,
  PDF/OMR import, Tauri desktop app, multi-user/cloud, color themes, metronome
  count-in, practice-time tracking.

## Conventions

Strict TypeScript (`noUnusedLocals`/`noUnusedParameters`). React 19 `react-jsx`
(no `import React`). `react-hooks/immutability` lint rule — writing through to
imperative objects (renderer/audio engine) needs an `eslint-disable-next-line`.
Commit per bite-sized step. Each feature on its own branch, merged to `main`
after review.
