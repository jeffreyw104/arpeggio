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
