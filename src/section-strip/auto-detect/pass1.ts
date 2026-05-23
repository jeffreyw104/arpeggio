import type { Score } from "../../model/score";
import { TEMPO_DELTA_THRESHOLD } from "./thresholds";
import { nearestMeasureIndex } from "./helpers";
import type { Candidate, Pass1Result } from "./types";

export function pass1HardBoundaries(score: Score): Pass1Result {
  const candidates: Candidate[] = [];
  const seen = new Set<number>();
  let measureZeroName: string | undefined;

  function add(measureIndex: number, signal: string, name?: string): void {
    if (measureIndex < 0) return;
    if (measureIndex >= score.measures.length) return;
    // Measure 0 is the implicit start — capture its name but don't emit a boundary candidate.
    if (measureIndex === 0) {
      if (name && !measureZeroName) measureZeroName = name;
      return;
    }
    if (seen.has(measureIndex)) {
      const existing = candidates.find((c) => c.measureIndex === measureIndex)!;
      existing.signals.push(signal);
      if (name && !existing.name) existing.name = name;
      return;
    }
    seen.add(measureIndex);
    candidates.push({
      measureIndex,
      time: score.measures[measureIndex].start,
      kind: "hard",
      name,
      signals: [signal],
    });
  }

  // Markers.
  for (const marker of score.midiMarkers ?? []) {
    const idx = nearestMeasureIndex(score.measures, marker.time);
    add(idx, "marker", marker.text);
  }

  // Tempo changes >= 8% delta.
  for (let i = 1; i < score.tempoMap.length; i += 1) {
    const prev = score.tempoMap[i - 1].bpm;
    const cur = score.tempoMap[i].bpm;
    if (Math.abs(cur - prev) / prev >= TEMPO_DELTA_THRESHOLD) {
      const idx = nearestMeasureIndex(score.measures, score.tempoMap[i].start);
      add(idx, "tempo");
    }
  }

  // Time-signature change between adjacent measures.
  for (let i = 1; i < score.measures.length; i += 1) {
    const prev = score.measures[i - 1];
    const cur = score.measures[i];
    if (
      prev.numerator !== cur.numerator ||
      prev.denominator !== cur.denominator
    ) {
      add(i, "timesig");
    }
  }

  return { candidates: candidates.sort((a, b) => a.measureIndex - b.measureIndex), measureZeroName };
}
