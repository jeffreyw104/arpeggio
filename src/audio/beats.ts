import type { Score } from "../model/score";

/**
 * Every metronome click time (seconds) across the piece. `subdivision` divides
 * each beat: 1 = on the beat, 2 = eighths, 3 = triplets, 4 = sixteenths.
 */
export function metronomeBeats(score: Score, subdivision: number): number[] {
  const sub = Math.max(1, Math.floor(subdivision));
  const bpm = score.tempoMap[0]?.bpm ?? 120;
  const times: number[] = [];
  for (const m of score.measures) {
    const beatLen = (60 / bpm) * (4 / m.denominator);
    for (let beat = 0; beat < m.numerator; beat++) {
      for (let s = 0; s < sub; s++) {
        times.push(m.start + beat * beatLen + s * (beatLen / sub));
      }
    }
  }
  return times;
}
