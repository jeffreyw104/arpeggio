# Spec — Independent Practice Mode + Reading-Lane Redesign

_Date: 2026-05-19. Branch base: `feature/midi-practice-mode`._

## Motivation

Today the Play tab and the MIDI Practice tab are one `PracticeView` component
sharing a single `Transport`. Playback carries over between tabs: if you play
the piece on the Play tab and switch to Practice, the playhead is mid-piece and
running. The two are meant to be **independent practice surfaces** for the same
piece.

Separately, the Practice tab has a thin engraved-score "reading lane" that the
user wants reimagined as an integrated, blurred score backdrop, and the tab
should expose every tool the Play tab has. There are also three known
MIDI-tab bugs from the prior handover.

This spec covers one coherent round of work: tab independence, tool parity, the
reading-lane redesign, a switchable Practice layout, tappable piano keys, an
updated QWERTY layout, and the bug fixes.

## Goals

1. **Independent tabs** — each tab owns its playhead, play/pause, loop, and
   tempo; playback never carries over.
2. **Tool parity** — the Practice tab's Tools popover exposes all Play tool
   sections plus the MIDI-specific ones.
3. **Reading-lane redesign** — one system of the engraved score, integrated as
   a blurred frosted backdrop at the top of the falldown.
4. **Switchable Practice layout** — toggle between the reading-lane view and a
   side-by-side split view.
5. **Tappable piano keys** — play notes by mouse/touch on the on-canvas
   keyboard.
6. **2-octave QWERTY layout** — adopt midee's FL Studio-style key map.
7. **Bug fixes** — live-input visual feedback and audio-context resume.

## 1. Tab independence (snapshot/restore — "Approach D")

The app keeps **one `Transport`** and **one rendering pipeline** (`FrameLoop`,
`FalldownRenderer`, `ScoreView`, `AudioEngine`). Independence is achieved by
snapshotting and restoring transport state on a tab switch — not by creating a
second `Transport`. This was chosen over two real `Transport` instances because
a tab switch then composes entirely from existing, well-tested operations
(pause, seek, set-loop, set-tempo) and never touches the fragile audio
re-scheduling path.

**Per-tab state:** `PracticeView` holds a snapshot for each tab:

```
TabSnapshot = { position: number, loop: LoopRegion | null, bpm: number }
```

**On a tab switch (`setMode`):**

1. Pause the clock (`transport.clock.pause()`).
2. Capture the **leaving** tab's snapshot from the live transport
   (`clock.position`, `clock.loop`, `transport.bpm`).
3. Apply the **entering** tab's snapshot — `transport.setBpm`,
   `clock.setLoop`, `clock.seek`.
4. The clock stays paused.

**Design decision — switching tabs always pauses.** A tab switch never
auto-resumes playback; auto-starting audio on a tab change is jarring. Each tab
restores its own playhead/loop/tempo and the user presses Play to resume.

Tempo *mode* (preserve/flatten) and gradual speed-up stay **shared** — there is
one `Score` interpretation. `bpm` is the per-tab number.

**Persistence.** `StoredPracticeState` is extended to store a per-tab
`{ loop, bpm }` for both Play and Practice, plus the last-active tab. Old
single-state records fall back to applying their values to both tabs. Restoring
the playhead *position* across reloads is optional (backlog) — independence
within a session is delivered by the in-memory snapshots regardless.

## 2. Tool parity for the Practice tab

The Practice Tools popover currently shows only MIDI sections (device,
hands-I-play, wait-mode, monitor) plus the shared General settings section. It
will additionally show the Play tab's **Loop**, **Tempo**, and **Metronome**
(with count-in) sections — so the Practice tab has every practice tool: section
looping, tempo / slow-down, the metronome, and the general display / volume /
zoom settings, on top of its MIDI features. (Volume and Note-zoom already live
inside the General settings section, which the Practice popover already shows.)

Play's **Hands** section (per-hand show / dim / hide + mute) stays Play-only:
the Practice tab's "Hands I play" control is its hand control, and Play's
per-hand mute would conflict with the MIDI session's automatic hand-muting.

Because settings are shared between tabs (§1 — only transport state is
per-tab), the common sections in the Practice popover edit the **same** state
objects as the Play popover; there is no duplicated state.

**Implementation.** Extract the shared sections (Loop, Tempo, Metronome,
General settings) into a `CommonTools` component. `PlayTools` renders its Hands
section plus `CommonTools`; the Practice popover (`MidiTools`) renders the MIDI
sections plus `CommonTools`.

## 3. Reading-lane redesign — stacked-systems reading view

The Practice tab's reading lane is a **separate engraving** of the score
(`renderReadingLane`), distinct from the paginated engraving the split view
keeps. It is rendered with normal system breaks but every system stacked onto
one tall page, so there are no page-boundary gaps.

- `ReadingLaneView` injects this engraving into a frosted overlay panel
  (`.practice-lane-panel`) below the top bar, and reveals ~two systems at a
  time: the system holding the playhead at the top, the next system previewing
  below.
- When the playhead crosses into the next system the lane **jumps** down a
  system — a discrete page-turn; it never scrolls continuously.
- The current measure carries the green highlight, sized to the staff-line box
  (barline-to-barline, top to bottom staff line) — the same `measureBox`
  helper the split `ScoreView` uses.
- The panel is a light frosted pane; the falling notes blur behind it. Vertical
  padding gives ledger-line headroom so notes outside the staff are not cut.
- `ReadingLaneView` and `ScoreView` both read the one shared transport clock
  every frame, so switching between the reading-lane and split layouts stays
  in sync.

The split view keeps the existing paginated, page-style engraving unchanged.
This redesign **absorbs known bug 1** ("reading lane renders on the bottom").

## 4. Switchable Practice layout

The Practice tab can toggle between two layouts via a control in the `TopBar`
(shown only on the Practice tab); the layout choice is per-tab UI state held in
`PracticeView`:

- **Reading-lane view** — the integrated frosted backdrop of §3.
- **Split view** — falldown and the full engraved score side-by-side, the same
  arrangement as the Play tab. The full score is scrollable with the existing
  click-to-seek and drag-to-loop.

The split view gives the user a way to see and jump to any section of the
piece — this **absorbs known bug 3** ("no way to navigate the score to practice
a specific section"); no separate navigation feature is built.

**Stability constraint preserved.** The falldown `<canvas>` and the
score-container `<div>` are still always rendered at fixed React tree positions
and never remount. The reading-lane / split / Play arrangements differ only by
CSS classes on the content wrapper and the score panel — exactly the mechanism
used today for the play/midi class switch.

## 5. Tappable piano keys

The on-canvas piano keyboard becomes a pointer input source. A
`pointerdown`/`touchstart` on a key emits a note-on; `pointerup`,
`pointercancel`, `pointerleave`, or dragging off the key emits a note-off. It
feeds the live-notes store exactly like the MIDI and QWERTY input sources, so
tapped notes drive the input monitor, key-lighting, and wait-mode.

**Implementation.** A new input source (e.g. `src/midi/PointerInput.ts`) maps
canvas pointer coordinates to a MIDI pitch using the falldown renderer's key
layout, and emits the shared `MidiNoteEvent` shape. `MidiSession` wires it in
alongside `MidiInput` and `KeyboardInput`; it is enabled with the Practice tab
(`setActive`). All 88 keys are tappable.

## 6. QWERTY layout — 2-octave FL Studio map

`KeyboardInput`'s single-octave map is replaced with midee's FL Studio-style
two-octave layout:

- Lower octave white keys: `Z X C V B N M`
- Lower octave black keys: `S D · G H J`
- Upper octave white keys: `Q W E R T Y U`
- Upper octave black keys: `2 3 · 5 6 7`

Octave shifting is **out of scope** for this round (the arrow keys are already
bound to measure-jump); the two-octave range is sufficient for most practice.
Octave shift is noted as backlog.

## 7. Bug fixes

- **Bug 2a — no monitor sound before first Play.** The Web Audio context stays
  suspended until the first `clock.play()`, so tapping QWERTY / MIDI / piano
  keys before pressing Play produces no sound. Fix: also resume the audio
  context on the first live-input note, sharing the dedup flag with
  `PracticeView`'s existing `audioStartedRef`.
- **Bug 2b — held keys light nothing.** `FalldownRenderer.inputHighlights`
  gains a neutral `"held"` kind (type becomes `"correct" | "wrong" | "held"`)
  with its own distinct neutral colour. `MidiSession.update()` lights every
  `liveNotes.heldNotes()` pitch as `"held"` every frame; wait-mode's
  `accepted` / `blocking` results override individual pitches to
  `"correct"` / `"wrong"`.
- **Bug 1** (reading lane position) — absorbed by §3.
- **Bug 3** (score navigation) — absorbed by §4.

## Components affected

- `src/app/PracticeView.tsx` — per-tab snapshots and `setMode` switch logic;
  the integrated reading-lane overlay vs split layout; layout-toggle wiring.
- `src/app/MidiSession.ts` — held-key lighting every frame; audio-context
  resume on first input; wire in the pointer input source.
- `src/falldown/renderer.ts` — `inputHighlights` `"held"` kind + colour.
- `src/midi/KeyboardInput.ts` — 2-octave FL key map.
- `src/midi/PointerInput.ts` — **new**, tappable-keyboard input source.
- `src/ui/` — `CommonTools` (extracted shared sections), `MidiTools`
  (renders MIDI sections + `CommonTools`), `TopBar` (Practice layout toggle).
- `src/styles/theme.css` — frosted reading-lane overlay; split layout.
- `src/library/db.ts` / `practiceState.ts` — per-tab `{ loop, bpm }` storage.

## Testing

- `MidiSession` — held pitches always produce `"held"` highlights; wait-mode
  `accepted`/`blocking` override them; pointer input routes into `liveNotes`.
- Tab snapshots — switching captures/restores `{ position, loop, bpm }` and
  always leaves the clock paused.
- `KeyboardInput` — the 2-octave FL map emits the correct pitches.
- `FalldownRenderer` — a `"held"` highlight draws the neutral colour.
- `PointerInput` — canvas coordinates map to the correct pitch.
- e2e — play on one tab, switch tabs, assert the playhead and play-state did
  not carry over; assert the Practice Tools popover shows the common sections.
- The full gate stays green: `npm run lint && npm run typecheck && npm test &&
  npm run build && npm run e2e`.

## Out of scope / backlog

- QWERTY octave shifting.
- Persisting each tab's playhead *position* across reloads (only `loop`/`bpm`
  are persisted; in-session independence is unaffected).
- Spec 2 — the MIDI-native visualizer (piano-roll lane, progress bar, minimap).
- Tappable keys on the Play tab (this round scopes them to Practice input).
