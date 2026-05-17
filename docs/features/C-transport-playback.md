# Feature C: Transport & Playback

**Status:** Not started
**Owner:** subagent
**Detailed plan:** _(write before build)_

## Scope

The master Transport clock; play/pause/seek; tempo in absolute BPM; A-B loop
including single-beat loop; gradual speed-up; tempo-map toggle (preserve scaled
vs flatten to constant BPM). Does NOT cover audio output or rendering.

## Dependencies

B (Import & Score Model).

## Changes log

- 2026-05-17 — Feature defined.

## Keywords

src/transport/clock.ts, src/transport/loop.ts, src/transport/speedUp.ts,
src/transport/tempoMap.ts, Tone.Transport, seek, loop points, BPM.

## Testing

- Unit: clock seek/position math; loop wrap; single-beat loop bounds;
  speed-up progression; tempo-map scale vs flatten.
- Current status: not started.
