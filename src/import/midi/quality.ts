import type { Score } from "../../model/score";

export interface MidiQualityResult {
  isLivePerformance: boolean;
  warning: string | null;
}

const LIVE_WARNING =
  "This MIDI looks like a live performance — the engraved score is " +
  "auto-generated and approximate. The falldown view is still exact.";

/**
 * Heuristic: live performances have note onsets that sit off the rhythmic grid
 * and a wide spread of velocities. Cleanly step-sequenced MIDI is near-perfectly
 * quantized with few distinct velocities.
 */
export function detectMidiQuality(score: Score): MidiQualityResult {
  const notes = score.notes;
  if (notes.length < 4) return { isLivePerformance: false, warning: null };

  const bpm = score.tempoMap[0]?.bpm ?? 120;
  const sixteenth = 60 / bpm / 4; // seconds per 1/16 note

  // Mean distance of each onset from the nearest 1/16 grid line, as a fraction
  // of a 1/16 (0 = perfectly quantized, ~0.5 = maximally off-grid).
  let offGrid = 0;
  for (const n of notes) {
    const phase = n.start / sixteenth;
    const frac = Math.abs(phase - Math.round(phase));
    offGrid += frac;
  }
  offGrid /= notes.length;

  const distinctVelocities = new Set(
    notes.map((n) => Math.round(n.velocity * 127)),
  ).size;

  const isLivePerformance = offGrid > 0.12 || distinctVelocities > 8;
  return {
    isLivePerformance,
    warning: isLivePerformance ? LIVE_WARNING : null,
  };
}
