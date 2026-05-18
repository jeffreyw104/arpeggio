# Practice-mode redesign — design

_Date: 2026-05-18. Branch: `feature/practice-mode`. Supersedes the HUD/top-bar
layout in `2026-05-18-practice-mode-design.md`; the mode concept, suspend/
restore, loop picker, count-in, and persistence carry over unchanged except
where noted below._

## 1. Purpose

A layout overhaul of the practice chrome, driven by interactive mockup review.
The Practice-mode controls move out of one floating HUD into a dedicated
**extended top bar**; the floating HUDs become fixed-position and mode-specific;
the top bar is rearranged; and two small audio/UX features are added
(selectable metronome sounds, arrow-key measure jumping).

## 2. Top bar

The base top bar (`TopBar`), left to right:

- **`arpeggio`** wordmark (far left, accent-colored), then the **Library**
  button.
- The **now-playing piece name**, horizontally centered in the bar
  (absolutely positioned at the bar's center, independent of the side groups).
- On the right: the **ModeSwitch** (Play / Practice), then the **view-mode**
  switch (Both / Falldown / Score), then the **⚙** settings gear.
- In **Practice mode only**, a final **collapse toggle** (`▴` expanded /
  `▾` collapsed) that shows/hides the extended top bar.

The ModeSwitch moves from the center spacer to the right group. The center
spacer is replaced by the centered piece-name element.

## 3. Extended top bar (new)

A second bar, flush below the base top bar, same liquid-glass styling. Shown
only when `mode === "practice"` and the collapse toggle is expanded. It carries
four bordered control boxes (each boxed like the existing `.hud-metronome`
group), all controls listed inline — nothing nested in a dropdown:

- **Loop** — `Set start`, `Set end`, `Loop measure`, `Clear`, and the range
  readout. `Set start`/`Set end`/`Clear`/readout behave as today.
  `Loop measure` is new: a one-click shortcut that loops just the single
  measure under the playhead (`loopMeasures(idx, idx)`).
- **Tempo** — a `−` button, an **editable numeric input** for an exact BPM, a
  `+` button, and a **Flatten** checkbox (moved here from the ⚙ drawer; see §6).
  `−`/`+` step by 5; the input accepts an exact typed value; all are clamped to
  20–300 BPM.
- **Speed-up** — the gradual speed-up checkbox.
- **Hands** — Left visibility `<select>` (show/dim/hide) + mute checkbox, and
  Right visibility `<select>` + mute checkbox, all inline (the dropdown added
  in the prior commit is reverted — hands are listed out, not tucked away).

The extended bar's collapsed/expanded state persists per piece, reusing the
existing `StoredPracticeState.hudCollapsed` field (its meaning shifts from
"Practice HUD collapsed" to "extended bar collapsed").

## 4. Floating HUDs

The HUD (`FloatingHud`) becomes **fixed-position** — the drag behavior
(`useDraggable`) is removed entirely. Idle-fade (`useIdleFade`) is retained.
Position and content depend on the mode:

- **Play mode** — fixed at the **top-left**, below the top bar. Content:
  transport (play/pause, seek, time) + the playback-**Speed** stepper. No
  metronome.
- **Practice mode** — fixed at the **top-center**, below the bar(s). Content:
  transport + the **Metronome** control only — the on/off toggle, the beat
  pulse, and the inline metronome settings (time signature, accent, subdivision,
  count-in). Loop, tempo, speed-up, and hands are NOT in the HUD; they live in
  the extended bar.
- The Practice HUD's vertical position clears the extended bar: it sits below
  the extended bar when that bar is expanded, and slides up directly under the
  top bar when the extended bar is collapsed.

The count-in play handler and `countInBars` state stay in `FloatingHud`. The
metronome on/off state, the pulse rAF loop, and `MetronomeSettings` move into
`FloatingHud`'s Practice rendering (out of the old `PracticeHudControls`).

## 5. Tempo — exact entry

The Practice-mode Tempo control is a numeric `<input>` flanked by `−`/`+`
buttons. Typing sets an exact BPM; the buttons nudge by 5. The value writes
through to `transport.setBpm`, clamped 20–300. The input keeps its raw string
while editing so typing is never blocked; an out-of-range or empty value is
clamped/ignored on commit.

## 6. Settings drawer (⚙)

`ControlPanel` after this change:

- **Keeps:** Note labels, Beat grid, Full 88 keys.
- **Removes:** "Flatten tempo changes" — moved to the extended bar's Tempo box.
- **Adds:** a **Metronome sound** `<select>` — Click / Woodblock / Beep /
  Hi-tick (see §7).

## 7. Metronome sounds

The metronome click can play one of four sounds, all generated with Tone.js
synths — no audio asset files:

- **Click** — the current `MembraneSynth` blip (default; higher pitch on the
  accented downbeat).
- **Woodblock** — a dry, percussive wooden tick.
- **Beep** — a clean short sine/triangle tone.
- **Hi-tick** — a very short, bright, high-frequency click.

The selected sound is a property on the audio layer's click sink, set from the
⚙ drawer. It is a per-session setting — not persisted (consistent with the
existing treatment of count-in and the other display preferences). The accented
downbeat remains distinguishable for every sound.

## 8. Arrow-key measure jumping

A global keyboard handler: **`ArrowLeft`** seeks to the start of the previous
measure, **`ArrowRight`** to the start of the next measure. Active in **both**
modes. The seek lands on `measures[idx ± 1].start`, clamped to the first/last
measure. The handler is ignored when the event target is an `<input>`,
`<select>`, or `<textarea>` (so typing an exact tempo or time signature is not
hijacked).

## 9. Persistence

`StoredPracticeState` is unchanged structurally — `hudCollapsed` is reused for
the extended-bar collapse state. Metronome sound is not persisted.

## 10. Components touched

- `src/ui/TopBar.tsx` — wordmark, centered piece name, relocated ModeSwitch,
  extended-bar collapse toggle.
- `src/ui/ExtendedTopBar.tsx` (new; replaces `PracticeHudControls.tsx`) — the
  four control boxes.
- `src/ui/FloatingHud.tsx` — fixed positioning, drag removal, mode-specific
  content, metronome moved in.
- `src/ui/MetronomeSettings.tsx` — unchanged (now rendered by `FloatingHud`).
- `src/ui/HandsMenu.tsx` — deleted (hands revert to inline in the extended bar).
- `src/practice/ControlPanel.tsx` — drop Flatten, add Metronome-sound select.
- `src/audio/engine.ts` / `src/audio/metronome.ts` — selectable click sounds.
- `src/app/PracticeView.tsx` — render `ExtendedTopBar`; arrow-key handler;
  thread the collapse + metronome-sound state; HUD position wiring.
- `src/styles/theme.css` — top bar, extended bar, fixed HUD positions, boxes.

## 11. Out of scope

A piano-instrument selector (upright/electric/grand) — considered and dropped:
the project has only grand-piano samples and no upright/electric sample sets.

## 12. Testing

Unit/component tests updated for every touched component; the `HandsMenu` test
is removed; new tests for the extended bar, the exact-tempo input, the
metronome-sound selection, and the arrow-key handler. Playwright e2e updated for
the new top-bar / extended-bar selectors. Full gate: `npm run lint && npm run
typecheck && npm test && npm run build && npm run e2e`.
