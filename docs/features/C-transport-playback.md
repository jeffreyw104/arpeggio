# Feature C: Transport & Playback

**Status:** Done
**Owner:** subagent
**Detailed plan:** docs/superpowers/plans/2026-05-18-feature-c-transport-playback.md

## Scope

The master Transport clock; play/pause/seek; tempo in absolute BPM; A-B loop
including single-beat loop; gradual speed-up; tempo-map toggle (preserve scaled
vs flatten to constant BPM). Does NOT cover audio output or rendering.

## Dependencies

B (Import & Score Model).

## Changes log

- 2026-05-17 — Feature defined.
- 2026-05-18 — Built (Tasks 1-5): master `Clock` (position/play/pause/seek/rate/
  loop-wrap/listeners); loop builders (`measureLoop`, `beatLoop`, `clampLoop`);
  `SpeedUp` gradual speed-up controller; `tempoMap` seconds↔beats conversion and
  preserve/flatten mode; `Transport` composing them into the public playback API.
- 2026-05-24 — Play/pause glyph swapped from unicode ▶/⏸ to inline SVG (single
  path for play, two rects for pause) drawn centered in the viewBox. The
  .hud-play-btn outer styling is unchanged.

## Keywords

src/transport/clock.ts, src/transport/loop.ts, src/transport/speedUp.ts,
src/transport/tempoMap.ts, src/transport/transport.ts, Clock, Transport,
SpeedUp, measureLoop, beatLoop, applyTempoMode, seek, loop points, BPM.

## Architecture note

The master clock is a pure, frame-driven `Clock` object (advanced by
`tick(elapsedSeconds)`), NOT Tone.js Transport — this keeps it fully
unit-testable. Feature D drives `clock.tick` from a real time source and
schedules audio off the clock. The clock is the single source of truth.

## Testing

Test files (Vitest, 25 tests for this feature; run `npm test`):

- `src/transport/clock.test.ts` — position math, play/pause, seek clamp, rate,
  end-of-piece stop, loop wrap + `onLoop`, listener subscribe/unsubscribe.
- `src/transport/loop.test.ts` — measure-range loop, single-beat loop, clamp.
- `src/transport/speedUp.test.ts` — start rate, step ramp + clamp, reset.
- `src/transport/tempoMap.test.ts` — seconds↔beats (constant + variable tempo),
  averageBpm, preserve/flatten.
- `src/transport/transport.test.ts` — reference BPM, setBpm→rate, measure loop,
  speed-up on loop pass, flatten mode.

Automated status (verified 2026-05-18): `npm run lint`, `npm run typecheck`,
`npm test` (56/56 total), `npm run build` all pass.

Manual checklist (revisit during Feature D/E integration):

- [ ] Playback position advances smoothly at a real frame rate; seeking is instant.
- [ ] A single-beat loop is a tight audible/visible repeat.
