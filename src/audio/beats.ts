import type { Measure, TimeSignature } from "../model/score";
import { timeSignatureAt } from "./timeSignatureAt";

/** One position on the metric grid. */
export interface MetronomeBeat {
  /** Time in seconds from the start of the piece. */
  time: number;
  /** True on the first beat of a measure (the downbeat). */
  accent: boolean;
  /** True on a counted beat (not an in-between subdivision tick). */
  mainBeat: boolean;
}

/**
 * The metronome/beat grid for a piece. For each measure, the active time
 * signature (looked up by measure start time) determines how many beats fit
 * in the measure; each beat is split into `subdivision` ticks. Beats are
 * phase-locked to the measure's [start, end] span so downbeats land exactly
 * on barlines.
 */
export function metronomeBeats(
  measures: Measure[],
  timeSignatures: TimeSignature[],
  subdivision: number,
): MetronomeBeat[] {
  const sub = Math.max(1, Math.floor(subdivision));

  const beats: MetronomeBeat[] = [];
  for (const m of measures) {
    if (m.end <= m.start) continue;
    const sig = timeSignatureAt(timeSignatures, m.start);
    const bpb = Math.max(1, Math.floor(sig.numerator));
    const beatLen = (m.end - m.start) / bpb;
    const tick = beatLen / sub;
    for (let b = 0; b < bpb; b++) {
      for (let s = 0; s < sub; s++) {
        const time = m.start + b * beatLen + s * tick;
        const mainBeat = s === 0;
        const accent = b === 0 && s === 0;
        beats.push({ time, accent, mainBeat });
      }
    }
  }
  return beats;
}

/**
 * A 0-1 visual pulse of the beat at clock time `t`: 1 exactly on a beat,
 * decaying linearly to 0 over `decay` seconds. Beats come from the same
 * segment-aware grid that drives the metronome.
 */
export function beatPulse(
  measures: Measure[],
  timeSignatures: TimeSignature[],
  t: number,
  decay: number,
): number {
  const beats = metronomeBeats(measures, timeSignatures, 1);
  let last = -Infinity;
  for (const b of beats) {
    if (b.time <= t && b.time > last) last = b.time;
  }
  if (last === -Infinity) return 0;
  return Math.max(0, 1 - (t - last) / decay);
}
