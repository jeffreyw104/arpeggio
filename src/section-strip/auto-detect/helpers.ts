import { newSectionId, type Section } from "../../model/sections";
import type { Note, Score } from "../../model/score";
import { LONG_REST_SECONDS, LONG_REST_MIN_MEASURES } from "./thresholds";
import type { Candidate } from "./types";

/** Return the measure index whose start is nearest to `time`. */
export function nearestMeasureIndex(measures: Score["measures"], time: number): number {
  if (measures.length === 0) return 0;
  let best = 0;
  let bestDist = Math.abs(measures[0].start - time);
  for (let i = 1; i < measures.length; i += 1) {
    const d = Math.abs(measures[i].start - time);
    if (d < bestDist) {
      best = i;
      bestDist = d;
    }
  }
  return best;
}

/** Notes per second within [a, b). */
export function densityIn(notes: Note[], a: number, b: number): number {
  const span = Math.max(0.0001, b - a);
  let count = 0;
  for (const n of notes) {
    if (n.start >= a && n.start < b) count += 1;
  }
  return count / span;
}

/** Mean MIDI pitch within [a, b), or NaN if no notes. */
export function meanPitchIn(notes: Note[], a: number, b: number): number {
  let sum = 0;
  let count = 0;
  for (const n of notes) {
    if (n.start >= a && n.start < b) {
      sum += n.midi;
      count += 1;
    }
  }
  return count === 0 ? NaN : sum / count;
}

/** Is there ≥ LONG_REST_SECONDS of silence ending exactly at `time`? */
export function endsLongRest(notes: Note[], time: number, measures: Score["measures"]): boolean {
  // Find the latest note sustain end strictly before `time`.
  let latestEnd = 0;
  for (const n of notes) {
    if (n.start < time) latestEnd = Math.max(latestEnd, n.start + n.duration);
    else break;
  }
  if (time - latestEnd < LONG_REST_SECONDS) return false;
  // Rest starts in the measure that CONTAINS latestEnd (m.end > latestEnd),
  // not the next measure that starts after it.
  const restStartMeasure = measures.findIndex((m) => m.end > latestEnd);
  const boundaryMeasure = measures.findIndex((m) => m.start >= time);
  if (restStartMeasure < 0 || boundaryMeasure < 0) return false;
  return boundaryMeasure - restStartMeasure >= LONG_REST_MIN_MEASURES;
}

export function candidatesToSections(
  candidates: Candidate[],
  durationSeconds: number,
  _hasMarkers: boolean,
  measureZeroName?: string,
): Section[] {
  const sortedCands = [...candidates].sort((a, b) => a.time - b.time);
  const starts: Array<{ time: number; name?: string }> = [{ time: 0, name: measureZeroName }];
  for (const c of sortedCands) {
    if (c.time > 0 && c.time < durationSeconds) {
      starts.push({ time: c.time, name: c.name });
    }
  }

  const sections: Section[] = [];
  let labelN = 1;
  for (let i = 0; i < starts.length; i += 1) {
    const start = starts[i].time;
    const end = i + 1 < starts.length ? starts[i + 1].time : durationSeconds;
    if (end <= start) continue;
    const explicit = starts[i].name;
    sections.push({
      id: newSectionId(),
      start,
      end,
      autoEnd: end,
      name: explicit ?? `Section ${labelN}`,
      isAuto: true,
    });
    if (!explicit) labelN += 1;
  }
  return sections;
}
