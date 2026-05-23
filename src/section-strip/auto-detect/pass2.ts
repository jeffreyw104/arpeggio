import type { Score } from "../../model/score";
import {
  DENSITY_RATIO_THRESHOLD,
  REGISTER_JUMP_SEMITONES,
  SOFT_CLUSTER_REQUIRED,
} from "./thresholds";
import { densityIn, meanPitchIn, endsLongRest } from "./helpers";
import type { Candidate } from "./types";

export function pass2SoftBoundaries(score: Score, hardIndices: Set<number>): Candidate[] {
  const measures = score.measures;
  const notes = score.notes;
  const candidates: Candidate[] = [];

  for (let i = 1; i < measures.length; i += 1) {
    if (hardIndices.has(i)) continue;
    const time = measures[i].start;
    const signals: string[] = [];

    // Long rest just before this boundary.
    if (endsLongRest(notes, time, measures)) signals.push("rest");

    // Density shift: compare 2 measures before vs 2 measures after the boundary.
    // A narrow window avoids counting notes separated from the boundary by a rest.
    const beforeStart = measures[Math.max(0, i - 2)].start;
    const afterEnd = measures[Math.min(measures.length - 1, i + 1)].end;
    const dPrev = densityIn(notes, beforeStart, time);
    const dNext = densityIn(notes, time, afterEnd);
    if (
      (dPrev > 0 && dNext / dPrev >= DENSITY_RATIO_THRESHOLD) ||
      (dNext > 0 && dPrev / dNext >= DENSITY_RATIO_THRESHOLD)
    ) {
      signals.push("density");
    }

    // Register shift.
    const mPrev = meanPitchIn(notes, beforeStart, time);
    const mNext = meanPitchIn(notes, time, afterEnd);
    if (
      !Number.isNaN(mPrev) &&
      !Number.isNaN(mNext) &&
      Math.abs(mNext - mPrev) >= REGISTER_JUMP_SEMITONES
    ) {
      signals.push("register");
    }

    if (signals.length >= SOFT_CLUSTER_REQUIRED) {
      candidates.push({
        measureIndex: i,
        time,
        kind: "soft",
        signals,
      });
    }
  }

  return candidates;
}
