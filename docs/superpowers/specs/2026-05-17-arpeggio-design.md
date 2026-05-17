# Arpeggio — Design Spec

**Date:** 2026-05-17
**Status:** Approved design — ready for implementation planning

## 1. Overview

Arpeggio is a browser-based piano practice tool. You load a MIDI or MusicXML file
and practice with two synced views: a **falldown of notes** dropping onto a piano
keyboard, and an **interactive MuseScore-style sheet-music score** whose measures
you can click to jump anywhere. Skipping around in either view moves the other —
and the audio — with it.

The name "Arpeggio" was chosen for its sense of climbing upward / improving.

### Inspiration

- **midee** (github.com/aayushdutt/midee) — browser-native MIDI studio: 88-key
  falldown visualization, Tone.js audio, themes. Source of the falldown concept.
- **MuseScore** — clickable, navigable sheet-music score with playback synced to
  notation. Source of the interactive-score concept.

Arpeggio combines both and adds practice-focused tooling (looping, tempo, rhythm
aids), optimized for practicing piano rather than recording or transcription.

## 2. Goals & Non-Goals

### Goals (v1)

- Load MIDI **or** MusicXML; practice with synced falldown + interactive score.
- Make "skip around → everything follows" reliable by construction.
- Provide practice tooling: looping, absolute-BPM tempo, hands-separate, rhythm aids.
- Run 100% client-side, $0 to host and run, installable and offline-capable.

### Non-Goals (v1) — see Backlog (§11)

- Not a transcription tool, not a notation editor, not a recorder.
- No live MIDI-keyboard input, scoring, or wait-for-correct-note (user has no
  MIDI keyboard — Arpeggio is a visual/playback practice guide).
- No accounts, no multi-user, no cloud sync.

## 3. Input Handling & Quality Expectations

Arpeggio accepts two input formats, treated as a quality spectrum:

- **MIDI** — abundant and easy to find. The falldown is always _exact_ from MIDI:
  pitch, timing, sustain-pedal (CC64), and per-note velocity/dynamics. The
  engraved score is _auto-generated_ via MIDI→MusicXML conversion and is
  approximate — quality tracks the quality of the source MIDI (cleanly-sequenced
  MIDI converts well; live-performance MIDI converts roughly). This is expected
  and accepted.
- **MusicXML** — scarcer, but yields a genuinely high-quality engraved score
  (the engraving quality lives in the file itself, typically authored in
  MuseScore or OpenScore).

MuseScore-quality notation is achievable whenever a MusicXML exists; for raw MIDI,
the score is best-effort. The falldown is exact regardless of input.

Tempo: MIDI almost always carries tempo (often a full tempo map); MusicXML usually
does. Arpeggio reads the file's tempo as the reference tempo. If the source has
internal tempo changes (ritardando, accel.), a toggle controls whether playback
**preserves them scaled proportionally** or **flattens to one constant BPM**.

PDF / Optical Music Recognition is **out of scope for v1** (heavy, imperfect,
would need a paid service) — see Backlog.

## 4. Tech Stack

- **Build/UI:** Vite + TypeScript; React for the UI shell (panels, controls,
  library). Imperative engines for real-time parts (falldown, audio, score sync).
- **Falldown rendering:** Canvas2D.
- **Score rendering:** Verovio (WASM) — engraving quality close to MuseScore;
  renders to SVG with element IDs + a timemap for measure-click and highlight.
- **Audio:** Tone.js with a sampled acoustic piano.
- **MIDI parsing:** `@tonejs/midi`. **MIDI→MusicXML:** an in-app converter module.
- **Storage:** IndexedDB — uploaded files plus per-piece practice state.
- **Hosting:** Vercel (free static deploy; auto-deploy on push; per-branch preview
  URLs). Chosen over GitHub Pages to keep future server-side options open
  (multi-user, cloud sync, cloud OMR) without migrating.
- **Distribution:** installable PWA (offline-capable, dock icon, own window).
- **Cost:** zero. All libraries are open-source and run client-side. No paid APIs.

## 5. Architecture

**Core principle: one master clock + one Score model. Everything else only reads
from them.** This makes synchronization correct by construction — no component
syncs to another component, only to the clock.

### Import pipeline → unified Score model

1. File dropped → detect type.
2. MusicXML → parse directly. MIDI → parse with `@tonejs/midi`, run MIDI→MusicXML
   converter, and keep exact MIDI timing for the falldown.
3. Output: one canonical **Score model** — measures, notes (pitch, start,
   duration, hand, velocity), pedal events, time signatures, tempo map.
4. MIDI quality detection produces an upfront warning when the source looks like
   a live performance.

### The Transport clock

A single master clock (Tone.js Transport) holds the one "where are we now"
position. Seeking, looping, and tempo changes are operations on this clock.

### Four read-only consumers

- **Falldown engine** — Canvas2D; falling blocks, beat-grid overlay, piano, key
  highlighting.
- **Score view** — Verovio SVG; clock-time → measure/note highlight via timemap;
  SVG click → resolved clock time.
- **Audio engine** — Tone.js sampled piano plays notes per the clock; metronome.
- **UI shell** — React controls and library.

### Core data flow

Click a measure → sync layer resolves it to a clock time → `clock.seek(time)` →
falldown, score highlight, and audio all re-read from the clock on the next
frame. No drift is possible because there is only one timeline.

## 6. Feature List (v1)

Each feature gets a `docs/features/<name>.md` file and a subagent owner. Listed in
build order (later features depend on earlier ones).

### A. Scaffold & Deploy

Vite + TS + React project; dark, modern, minimal base styling; Vercel auto-deploy;
installable PWA (offline, dock icon); CI checks.

### B. Import & Score Model

File drop and type detection; MusicXML parser; MIDI parser (`@tonejs/midi`) +
MIDI→MusicXML converter; the unified Score model; MIDI quality-detection warning.

### C. Transport & Playback

The master clock; play/pause/seek; tempo in absolute BPM; A-B loop (including a
single-beat loop); gradual speed-up (loop starts slow, increases a few % per pass
to a target); tempo-map toggle (preserve scaled vs. flatten to constant BPM).

### D. Audio & Metronome

Tone.js sampled acoustic piano; note scheduling off the clock; metronome with an
audible click on/off toggle, subdivisions, and a visual beat pulse.

### E. Falldown View

Canvas2D falling notes color-coded by hand; piano keyboard with auto-fit key range
(renders only the keys the piece uses, plus a full-88 toggle); beat-grid overlay;
toggleable note-name labels; live key highlighting.

### F. Score View

Verovio engraving; continuous scroll with the current measure tracked; live
current-note highlight; click-measure-to-jump; drag-select across measures to set
the A-B loop directly on the score.

### G. Layout & View Modes

Side-by-side layout — left column is the falldown locked on top of the piano
(same width, aligned); right column is the score panel. Resizable divider with a
piano-favoring default split (~65/35). View toggle: Both / Falldown-only /
Score-only (single-view modes expand to full width).

### H. Practice Controls

Hands-separate — mute and/or hide the left or right hand independently. The
control-panel UI surfacing tempo (BPM), loop controls, gradual speed-up, and
the note-label toggle.

### I. Library

IndexedDB storage of uploaded files; searchable library browser; per-piece
practice state remembered across sessions (last tempo, loop points, hand
mute/hide settings). No progress/time tracking.

## 7. Layout & View Modes

The piano keyboard is always locked in width and alignment to the falldown above
it so notes land on the correct keys. Default arrangement is **side-by-side**:
falldown+piano column on the left, score panel on the right, with a resizable
divider (piano-favoring default). The **view toggle** (Both / Falldown-only /
Score-only) is always available; single-view modes expand to full width. In
Score-only mode the piano still highlights current notes.

## 8. Dev Workflow & Repo Structure

```
arpeggio/
  implementation.md          # master plan + live progress dashboard
  docs/
    superpowers/specs/       # this design spec
    features/                # one file per feature A–I
      A-scaffold-deploy.md
      B-import-score-model.md
      C-transport-playback.md
      D-audio-metronome.md
      E-falldown-view.md
      F-score-view.md
      G-layout-view-modes.md
      H-practice-controls.md
      I-library.md
  src/...
```

### `implementation.md` (owned by the main agent)

Project overview, tech stack, a progress-dashboard table (feature → status), the
build-order/dependency graph, and links to every feature doc.

### `docs/features/<x>.md` (owned by the feature's subagent)

Fixed template:

- **Status** — Not started / In progress / Blocked / Done
- **Scope** — what the feature covers and what it does not
- **Dependencies** — features that must come first
- **Changes log** — dated entries of what changed and why
- **Keywords** — key files, modules, symbols, search terms
- **Testing** — test files, coverage, a manual-test checklist, current pass/fail

### Roles

- **Main agent** — orchestrator. Maintains `implementation.md`; dispatches
  subagents in dependency order (A → B → C/D → E/F → G/H → I); reviews each
  subagent's output; handles cross-cutting integration and large fixes; runs
  merges.
- **Subagents** — one per feature. Each implements its feature test-driven,
  writes/updates its `docs/features/<x>.md`, and works on its own branch (so each
  feature gets a Vercel preview URL).

## 9. Testing

Tooling: **Vitest** (unit/component) + **Playwright** (end-to-end), run in CI on
every push/PR.

- **Unit tests** — the deterministic core: Score model, MIDI→MusicXML converter,
  MIDI quality detection, transport-clock math, loop/seek logic, BPM/tempo
  conversions, auto-fit key-range.
- **Component tests** — React controls via Testing Library.
- **End-to-end (Playwright)** — the critical flows: import → play → click a
  measure → assert the clock jumped → assert falldown and score followed.
- **Manual visual checks** — falldown rendering and score engraving are visual;
  each feature doc carries a manual-test checklist rather than automating
  "does it look right".
- **Test fixtures** — a small committed set: one cleanly-sequenced MIDI, one
  live-performance MIDI, one polyrhythm piece, one MusicXML file.

Each feature subagent writes tests as it builds (test-driven) and records coverage
plus the manual checklist in its feature doc.

## 10. v1 "Done" Definition

v1 is complete when all are true:

- All nine features (A–I) implemented; every `docs/features/<x>.md` marked Done.
- Import a MIDI or MusicXML file → it plays and is saved to the IndexedDB library
  with per-piece practice state, persisting across sessions.
- Falldown plays in sync with audio; piano keys highlight; beat-grid overlay and
  note labels toggle on/off.
- Score renders, scrolls continuously, highlights the current note; clicking a
  measure jumps playback and the falldown follows; drag-select sets the A-B loop.
- Practice tools work: absolute-BPM tempo, A-B loop (incl. single-beat), gradual
  speed-up, hands-separate (mute/hide L/R), metronome (audible toggle,
  subdivisions, visual pulse), tempo-map toggle.
- Layout works: side-by-side, resizable divider, Both / Falldown-only /
  Score-only toggle, auto-fit key range.
- Deployed live on Vercel; installable as a PWA; works offline.
- Unit + component + E2E tests pass in CI.

**Golden-path acceptance test:** Load a Chopin Ballade MIDI → see falldown +
score → set the tempo to a slower practice BPM → drag-select measures 8–12 on the
score to loop them → mute the left hand → practice → click measure 20 → playback,
falldown, and score all jump there together.

## 11. Backlog (explicitly not v1)

- Raw-MIDI import-settings panel (quantization grid, staff-split point, key
  override, human-performance toggle).
- In-app score editing.
- PDF / Optical Music Recognition import.
- Tauri native desktop app (`.app`/`.exe` installer, native file dialogs).
- Multi-user: accounts, cloud library sync, sharing, teacher–student features.
- Customizable color themes.
- Metronome count-in.
- Rhythm/drum mode (mute pitch, drill interlocking rhythm).
- Practice time tracking / history / streaks.
- Rhythm-aware subdivision metronome and single-beat loop UX refinements.
