# Feature D: Audio & Metronome

**Status:** Not started
**Owner:** subagent
**Detailed plan:** _(write before build)_

## Scope

Tone.js sampled acoustic piano; note scheduling driven by the Transport clock;
metronome with an audible click on/off toggle, subdivisions, and a visual beat
pulse. Does NOT cover visuals beyond the metronome pulse signal.

## Dependencies

B (Import & Score Model), C (Transport & Playback).

## Changes log

- 2026-05-17 — Feature defined.

## Keywords

src/audio/engine.ts, src/audio/metronome.ts, Tone.Sampler, note scheduling,
metronome subdivisions, visual pulse.

## Testing

- Unit: note-event scheduling against a mock clock; metronome tick generation
  for beats and subdivisions; mute/unmute toggle.
- Manual checklist: piano sounds correct; metronome audible toggle works;
  visual pulse fires on the beat.
- Current status: not started.
