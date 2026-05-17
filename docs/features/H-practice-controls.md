# Feature H: Practice Controls

**Status:** Not started
**Owner:** subagent
**Detailed plan:** _(write before build)_

## Scope
Hands-separate — mute and/or hide the left or right hand independently; the
control-panel UI surfacing absolute-BPM tempo, A-B loop controls, gradual
speed-up, and the note-label toggle. Wires existing Transport/Audio/Falldown
capabilities into a UI.

## Dependencies
C (Transport), D (Audio), E (Falldown View).

## Changes log
- 2026-05-17 — Feature defined.

## Keywords
src/practice/hands.ts, src/practice/ControlPanel.tsx, hand mute, hand hide,
tempo control, loop controls, speed-up controls.

## Testing
- Unit: hand mute/hide state logic.
- Component: ControlPanel renders and dispatches transport/audio actions.
- Manual checklist: muting a hand silences it and (if hidden) removes it from
  the falldown; tempo/loop/speed-up controls behave.
- Current status: not started.
