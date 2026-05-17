# Arpeggio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-based piano practice tool that loads MIDI or MusicXML files and provides a falldown-of-notes view and an interactive MuseScore-style score, both synced to a single transport clock.

**Architecture:** One master clock + one Score model; an import pipeline normalizes both file types into the model; four read-only consumers (falldown engine, score view, audio engine, UI shell) sync only to the clock. See `docs/superpowers/specs/2026-05-17-arpeggio-design.md` for the full design.

**Tech Stack:** Vite, TypeScript, React (UI shell), Canvas2D (falldown), Verovio WASM (score), Tone.js (audio), `@tonejs/midi` (MIDI parsing), IndexedDB (storage), Vitest + Playwright (tests), Vercel (hosting), PWA (distribution).

---

## How This Plan Works

This is the **master plan**. It locks in the file structure, the feature decomposition, and the build order. Each feature gets its **own detailed bite-sized plan** in `docs/superpowers/plans/`, written **just-in-time** — right before that feature is built — so the plan references real, already-built APIs.

- The **main agent** owns this file and the progress dashboard, dispatches one subagent per feature in dependency order, reviews output, handles cross-cutting integration, and runs merges.
- Each **subagent** owns one feature: it implements the feature test-driven on its own branch, and keeps that feature's tracking doc (`docs/features/<x>.md`) current.

## Progress Dashboard

| Feature | Name                 | Status      | Detailed plan                                                       | Tracking doc                            |
| ------- | -------------------- | ----------- | ------------------------------------------------------------------- | --------------------------------------- |
| A       | Scaffold & Deploy    | Done        | `docs/superpowers/plans/2026-05-17-feature-a-scaffold-deploy.md`    | `docs/features/A-scaffold-deploy.md`    |
| B       | Import & Score Model | Done        | `docs/superpowers/plans/2026-05-17-feature-b-import-score-model.md` | `docs/features/B-import-score-model.md` |
| C       | Transport & Playback | Done        | `docs/superpowers/plans/2026-05-18-feature-c-transport-playback.md` | `docs/features/C-transport-playback.md` |
| D       | Audio & Metronome    | In progress | `docs/superpowers/plans/2026-05-18-feature-d-audio-metronome.md`    | `docs/features/D-audio-metronome.md`    |
| E       | Falldown View        | Not started | _(write before build)_                                              | `docs/features/E-falldown-view.md`      |
| F       | Score View           | Not started | _(write before build)_                                              | `docs/features/F-score-view.md`         |
| G       | Layout & View Modes  | Not started | _(write before build)_                                              | `docs/features/G-layout-view-modes.md`  |
| H       | Practice Controls    | Not started | _(write before build)_                                              | `docs/features/H-practice-controls.md`  |
| I       | Library              | Not started | _(write before build)_                                              | `docs/features/I-library.md`            |

Statuses: Not started / In progress / Blocked / Done.

## Build Order & Dependencies

```
A  Scaffold & Deploy        (no deps — foundation)
└─ B  Import & Score Model  (deps: A)
   ├─ C  Transport & Playback   (deps: B)
   ├─ D  Audio & Metronome      (deps: B, C)
   ├─ E  Falldown View          (deps: B, C, D)
   ├─ F  Score View             (deps: B, C, D)
   ├─ G  Layout & View Modes    (deps: E, F)
   ├─ H  Practice Controls      (deps: C, D, E)
   └─ I  Library                (deps: B, H)
```

Build sequence: **A → B → C → D → E → F → G → H → I.** C and D may run in parallel after B; E and F may run in parallel after D; G/H/I after their deps.

## File / Folder Structure

```
arpeggio/
  implementation.md              # this file
  index.html
  package.json  tsconfig.json  vite.config.ts
  vercel.json
  playwright.config.ts  vitest.config.ts
  eslint.config.js  .prettierrc
  .github/workflows/ci.yml
  public/
    manifest.webmanifest
    icons/                       # PWA icons
  docs/
    superpowers/specs/           # design spec
    superpowers/plans/           # per-feature detailed plans
    features/                    # per-feature tracking docs A–I
  src/
    main.tsx                     # React entry
    App.tsx                      # top-level component
    styles/theme.css             # dark minimal theme tokens
    model/
      score.ts                   # Score, Measure, Note, PedalEvent, TempoMap types  [B]
    import/
      detectType.ts              # MIDI vs MusicXML detection                          [B]
      musicxml/parseMusicXml.ts  # MusicXML -> Score                                   [B]
      midi/parseMidi.ts          # MIDI -> intermediate note events                    [B]
      midi/midiToMusicXml.ts     # MIDI -> MusicXML (approximate)                       [B]
      midi/quality.ts            # MIDI source-quality detection                       [B]
    transport/
      clock.ts                   # master Transport clock                              [C]
      loop.ts                    # A-B loop, single-beat loop                          [C]
      speedUp.ts                 # gradual speed-up                                    [C]
      tempoMap.ts                # preserve-scaled vs flatten toggle                   [C]
    audio/
      engine.ts                  # Tone.js sampled piano, note scheduling              [D]
      metronome.ts               # click on/off, subdivisions, visual pulse            [D]
    falldown/
      renderer.ts                # Canvas2D falling-notes renderer                     [E]
      piano.ts                   # piano keyboard render + key highlight               [E]
      keyRange.ts                # auto-fit key range                                  [E]
      beatGrid.ts                # beat-grid overlay                                   [E]
    score-view/
      verovio.ts                 # Verovio WASM load + render                          [F]
      sync.ts                    # clock-time <-> measure/note mapping                 [F]
      interactions.ts            # click-to-jump, drag-select loop                     [F]
    layout/
      Layout.tsx                 # side-by-side layout + view modes                    [G]
      Divider.tsx                # resizable divider                                   [G]
      viewMode.ts                # Both / Falldown-only / Score-only state             [G]
    practice/
      hands.ts                   # hand mute/hide logic                                [H]
      ControlPanel.tsx           # tempo / loop / speed-up / label controls            [H]
    library/
      db.ts                      # IndexedDB wrapper                                   [I]
      practiceState.ts           # per-piece practice state                            [I]
      LibraryBrowser.tsx         # searchable library UI                               [I]
    ui/
      TransportBar.tsx           # play/pause/seek bar                                 [G/H]
    test/fixtures/               # sample MIDI / MusicXML files
  tests/e2e/                     # Playwright end-to-end tests
```

## Feature Summaries

Detailed bite-sized plans are written per feature just-in-time. Summaries:

- **A — Scaffold & Deploy:** Vite + TS + React project, dark-minimal theme tokens, Vitest + Playwright, ESLint/Prettier, GitHub Actions CI, Vercel config, installable PWA. See its detailed plan.
- **B — Import & Score Model:** the `Score` model types; file-type detection; MusicXML parser; MIDI parser; MIDI→MusicXML converter; MIDI quality detection.
- **C — Transport & Playback:** master clock; play/pause/seek; absolute-BPM tempo; A-B loop incl. single-beat; gradual speed-up; tempo-map preserve/flatten toggle.
- **D — Audio & Metronome:** Tone.js sampled piano; note scheduling off the clock; metronome (audible toggle, subdivisions, visual pulse).
- **E — Falldown View:** Canvas2D falling notes, hand color-coding; piano keyboard with auto-fit key range + full-88 toggle; beat-grid overlay; note-name labels; key highlighting.
- **F — Score View:** Verovio engraving; continuous scroll; live current-note highlight; click-measure-to-jump; drag-select A-B loop on score.
- **G — Layout & View Modes:** side-by-side layout; resizable divider; piano-favoring default split; Both / Falldown-only / Score-only toggle.
- **H — Practice Controls:** hands-separate (mute/hide L/R); control-panel UI for tempo, loop, gradual speed-up, label toggles.
- **I — Library:** IndexedDB file storage; searchable library browser; per-piece practice state (last tempo, loop points, hand settings).

## Per-Feature Tracking Doc Template

Each `docs/features/<x>.md` follows this fixed template:

```markdown
# Feature <X>: <Name>

**Status:** Not started | In progress | Blocked | Done
**Owner:** subagent
**Detailed plan:** docs/superpowers/plans/<file>.md

## Scope

What this feature covers — and explicitly what it does not.

## Dependencies

Features that must be Done first.

## Changes log

- YYYY-MM-DD — what changed and why.

## Keywords

Key files, modules, symbols, and search terms for navigating this feature.

## Testing

- Test files and what they cover.
- Manual-test checklist (visual items that can't be automated).
- Current pass/fail status.
```

## Testing Strategy

- **Vitest** — unit tests (model, converters, clock math, loop/seek, key-range) and React component tests.
- **Playwright** — end-to-end: import → play → click measure → assert clock jumped → assert falldown + score followed.
- **Manual** — falldown rendering and score engraving; each feature doc carries a manual-test checklist.
- **CI** — GitHub Actions runs lint + typecheck + Vitest on every push/PR.
- **Fixtures** — `src/test/fixtures/`: one cleanly-sequenced MIDI, one live-performance MIDI, one polyrhythm piece, one MusicXML file.

## v1 Definition of Done

See spec §10. In short: all nine features Done; import either format; falldown + score synced; clicking a measure jumps everything; all practice tools work; deployed on Vercel; installable PWA; CI green.
