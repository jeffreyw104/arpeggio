# Feature D: Audio & Metronome

**Status:** Done
**Owner:** subagent
**Detailed plan:** docs/superpowers/plans/2026-05-18-feature-d-audio-metronome.md

## Scope

Tone.js sampled acoustic piano; note scheduling driven by the Transport clock;
metronome with an audible click on/off toggle, subdivisions, and a visual beat
pulse. Does NOT cover visuals beyond the metronome pulse signal.

## Dependencies

B (Import & Score Model), C (Transport & Playback).

## Changes log

- 2026-05-17 — Feature defined.
- 2026-05-18 — Built (Tasks 1-4): `scheduler.ts` (note/time window selection);
  `beats.ts` (metronome click times with subdivisions); `Metronome` class
  (beat detection, on/off, subdivision, decaying visual pulse); `AudioEngine`
  (sink-injected, testable) + `createAudioEngine` (Tone.js Salamander sampled
  piano + click synth, dynamically imported).
- 2026-05-18 — Post-review fix: made seek/loop audio discontinuities
  deterministic. Added `Clock.onSeek`; the loop wrap now lands exactly on
  `loop.start`; added `Metronome.resync()`; `AudioEngine` resyncs on seek/loop
  instead of guessing seeks by jump size. Fixes the metronome going silent on
  loop pass 2 and notes bursting on a short seek. (Touches `src/transport/
clock.ts` — a Feature C file — additively.)
- 2026-05-24 — Mid-piece time-signature support: `Metronome` now stores
  `segments: TimeSignature[]` instead of a single `beatsPerBar`; the
  `timeSignature` getter is position-aware via `timeSignatureAt`; `setTimeSignature`
  collapses segments to one and sets `manualOverride = true`; `setScore` preserves
  the override or adopts the new score's segments. (Task 4 of feat/mid-piece-time-sigs.)

## Keywords

src/audio/scheduler.ts, src/audio/beats.ts, src/audio/metronome.ts,
src/audio/engine.ts, AudioEngine, createAudioEngine, Metronome, notesToTrigger,
metronomeBeats, Tone.Sampler, Salamander, subdivisions, visual pulse.

## Testing

Test files (Vitest; run `npm test`):

- `src/audio/scheduler.test.ts` — note/time window selection.
- `src/audio/beats.test.ts` — beat-time computation with subdivisions.
- `src/audio/metronome.test.ts` — on/off, accents, subdivision, pulse decay,
  `resync` re-enabling beats after a loop/seek.
- `src/audio/engine.test.ts` — note triggering off the clock, boundary note at
  the start position, no burst on seek, loop replay of notes + clicks.

Automated status (verified 2026-05-18): `npm run lint`, `npm run typecheck`,
`npm test` (78/78 total), `npm run build` all pass.

Manual checklist (revisit when audio is wired into the UI in Feature G):

- [ ] Piano notes sound in time; the sampled piano loads (online) at correct pitch.
- [ ] Metronome click toggles on/off; subdivisions add intermediate clicks; the
      first beat of each measure is accented; the visual pulse flashes on the beat.

Known v1 limitation: the Salamander piano samples load from a CDN, so first-load
audio needs network; offline audio is a backlog item.
