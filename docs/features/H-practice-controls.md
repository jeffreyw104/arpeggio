# Feature H: Practice Controls

**Status:** Done
**Owner:** subagent
**Detailed plan:** docs/superpowers/plans/2026-05-18-feature-h-practice-controls.md

## Scope

Hands-separate — mute and/or hide the left or right hand independently; the
control-panel UI surfacing absolute-BPM tempo, A-B loop controls, gradual
speed-up, and the note-label toggle. Wires existing Transport/Audio/Falldown
capabilities into a UI.

## Dependencies

C (Transport), D (Audio), E (Falldown View).

## Changes log

- 2026-05-17 — Feature defined.
- 2026-05-18 — Built (Tasks 1-5): `HandState` (per-hand mute/hide flags, a
  shared `HandFilter`); `AudioEngine` now skips muted-hand notes at both trigger
  sites; `FalldownRenderer` skips hidden-hand notes (rects and key highlights);
  `ControlPanel` surfacing tempo (BPM), loop measure / clear, gradual speed-up,
  metronome, beat grid, full-88, note labels, and the four hand controls;
  `PracticeView` creates a stable `HandState`, wires it into both engines, and
  renders the `ControlPanel`.
- 2026-05-23 — For MIDI source files, the practice-layout segmented control
  and lane-theme picker in the Tools popover are hidden (the reading-lane
  doesn't apply when Feature J's section strip is the navigation primitive).
  Both `PlayTools` and `MidiTools` now expose a "Strip position: Top /
  Bottom" radio at the very top of the panel (gated on `isMidiSource`) —
  shared backing via the `arpeggio.stripPosition` localStorage key. The
  Tools popover gained a `below-strip` placement variant used when the
  strip is top-docked. Escape now closes the Tools popover (in addition to
  exiting Feature J's drill-in mode and dismissing context menus).
- **2026-05-24** — Post-review fix: `PracticeView` restore path now gates the `setTimeSignature` / `renderer.timeSignatures` calls behind `state.manualOverride === true`. Old saved states (which lack the flag) load without setting an override, so multi-sig pieces see their full segment array rather than being collapsed to the first signature.
- 2026-05-24 — Studio Dark refresh, wait-mode + hands consolidation.
  Introduced a top-bar wait pill that doubles as indicator (gray-off /
  green-on with glowing dot) and control (menu: Off / Left hand / Both hands /
  Right hand). Hand selection now mutates handsIPlay AND waitEnabled in one
  click. Removed the now-redundant Hands I play preset row and Wait for me
  checkbox from the Tools popover. Input sound checkbox moved into the General
  settings row (still MIDI-only via conditional render). Mode toggle
  (Play / MIDI Practice) also became a TopBarSelect pill via the new
  TopBarSelect primitive.
- 2026-05-25 — iPad / touch polish: `TopBarReadout` gains `data-testid="top-bar-readout"`.
  On touch devices, `TopBar` hides the readout (conditional on `useIsTouchDevice`).
  `PlayTools` and `MidiTools` each render a "Now playing" `<section>` with a
  `TopBarReadout` at the top of the Tools popover when on touch, recovering the
  top-bar width budget. `MidiTools` props extended with `waitEnabled`,
  `onWaitEnabledChange`, `handsIPlay`, `onHandsIPlayChange` and threaded from
  `PracticeView`. New TopBar tests verify readout is hidden on touch and shown
  on desktop.

## Keywords

src/practice/hands.ts, src/practice/ControlPanel.tsx, HandState, HandFilter,
ControlPanel, hand mute, hand hide, tempo control, loop controls, speed-up.

## Testing

Test files (Vitest + RTL; run `npm test`):

- `src/practice/hands.test.ts` — mute/hide per hand, change listeners.
- `src/audio/engine.test.ts` — "AudioEngine hand mute" block (muted hand silent).
- `src/falldown/renderer.test.ts` — "FalldownRenderer hand hide" block (hidden
  hand draws fewer rects).
- `src/practice/ControlPanel.test.tsx` — tempo, hand mute/hide, note labels,
  full-88, loop measure / clear, gradual speed-up all wired through.
- `src/app/PracticeView.test.tsx` — control panel mounts in the practice view.

Automated status (verified 2026-05-18): `npm run lint`, `npm run typecheck`,
`npm test` (152/152 total), `npm run build`, `npm run e2e` all pass.

Note: `ControlPanel` writes to the imperative renderer/metronome public fields
(their documented API); four targeted `eslint-disable react-hooks/immutability`
comments cover those prop-field assignments — the only eslint-disables in the
codebase.

Manual checklist:

- [ ] Muting a hand silences it while it still falls; hiding a hand removes it
      from the falldown.
- [ ] Tempo input slows/speeds playback; Loop measure loops the current bar;
      gradual speed-up ramps tempo across loop passes; metronome / beat-grid /
      full-88 / note-label toggles all take effect.
