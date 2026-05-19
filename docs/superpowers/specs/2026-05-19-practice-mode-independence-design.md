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

The Practice Tools popover currently shows only MIDI sections (device, hands,
wait-mode, monitor). It will additionally show every Play tool section:
Volume, Note-zoom, General settings (note labels / beat grid / full-88),
Metronome, and Count-in.

Because settings are shared between tabs (see §1 — only transport state is
per-tab), the common sections in the Practice popover edit the **same** state
objects as the Play popover; there is no duplicated state.

**Implementation.** Extract the Play tool sections into a shared `CommonTools`
component used by both popovers. `PlayTools` renders `CommonTools`. The
Practice popover renders the MIDI sections first, then `CommonTools`.

## 3. Reading-lane redesign — integrated frosted score backdrop

The Practice tab's reading lane changes from a separate white strip into the
engraved score **integrated as a blurred backdrop** at the top of the falldown.

- The falldown `<canvas>` fills the whole practice area and renders falling
  notes full-height as today.
- The engraved-score container `<div>` is positioned as an **absolute overlay**
  across the top region of the falldown, styled as a frosted panel:
  a translucent dark gradient background plus `backdrop-filter: blur(~6px)`,
  with a soft `mask-image` fade at its lower edge.
- Falling notes therefore appear **blurred behind** the panel (the backdrop
  filter blurs the canvas pixels behind it) and **sharpen** as they fall below
  the panel into the play strip above the keyboard.
- The overlay shows **one system** of the score, scrolled to follow the
  playhead, and advances a system at a time. Measures keep their natural
  engraved widths (Verovio lays them out — a busier measure spans more of the
  line); the lane is not re-engraved.
- The system is positioned with **top headroom** inside the panel so high
  ledger-line notes and their beams are not clipped.
- The current measure keeps the existing green highlight (`ScoreView` already
  draws it), contained within the one system's grand staff.

This redesign **absorbs known bug 1** ("reading lane renders on the bottom") —
the score is now, by construction, the top backdrop.

The visual direction was validated through browser mockups (Frosted-panel
blend, one-system, with ledger headroom).

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
