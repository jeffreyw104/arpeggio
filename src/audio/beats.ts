import type { Measure } from "../model/score";

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
 * The metronome/beat grid for a piece: for each measure, `beatsPerBar` beats
 * spread evenly across the measure's [start, end] span (so the downbeat lands
 * exactly on the barline and beats always fill the measure), each beat split
 * into `subdivision` ticks.
 */
export function metronomeBeats(
  measures: Measure[],
  beatsPerBar: number,
  subdivision: number,
): MetronomeBeat[] {
  const bpb = Math.max(1, Math.floor(beatsPerBar));
  const sub = Math.max(1, Math.floor(subdivision));

  const beats: MetronomeBeat[] = [];
  for (const m of measures) {
    if (m.end <= m.start) continue;
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
