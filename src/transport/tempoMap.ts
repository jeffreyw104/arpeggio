import type { TempoEvent, Score } from "../model/score";

/** Whether playback keeps the file's tempo changes or re-times onto one tempo. */
export type TempoMode = "preserve" | "flatten";

/** End time (seconds) of tempo segment `i`, or +Infinity for the last segment. */
function segmentEnd(tempoMap: TempoEvent[], i: number): number {
  return i + 1 < tempoMap.length ? tempoMap[i + 1].start : Infinity;
}

/**
 * Convert a score-time position in seconds to a musical beat count by
 * integrating beats (`bpm / 60` per second) across the tempo map's segments.
 */
export function secondsToBeats(tempoMap: TempoEvent[], seconds: number): number {
  let beats = 0;
  for (let i = 0; i < tempoMap.length; i++) {
    const segStart = tempoMap[i].start;
    const segEnd = segmentEnd(tempoMap, i);
    if (seconds <= segStart) break;
    const upper = Math.min(seconds, segEnd);
    beats += (upper - segStart) * (tempoMap[i].bpm / 60);
    if (seconds <= segEnd) break;
  }
  return beats;
}

/**
 * Convert a musical beat count back to a score-time position in seconds — the
 * inverse of {@link secondsToBeats}.
 */
export function beatsToSeconds(tempoMap: TempoEvent[], beats: number): number {
  let accruedBeats = 0;
  for (let i = 0; i < tempoMap.length; i++) {
    const segStart = tempoMap[i].start;
    const segEnd = segmentEnd(tempoMap, i);
    const beatsPerSec = tempoMap[i].bpm / 60;
    const segmentBeats = (segEnd - segStart) * beatsPerSec;
    if (beats <= accruedBeats + segmentBeats) {
      return segStart + (beats - accruedBeats) / beatsPerSec;
    }
    accruedBeats += segmentBeats;
  }
  return tempoMap[tempoMap.length - 1].start;
}

/** The duration-weighted average tempo of a score, in BPM. */
export function averageBpm(score: Score): number {
  if (score.durationSeconds === 0) {
    return score.tempoMap[0]?.bpm ?? 120;
  }
  return (
    (secondsToBeats(score.tempoMap, score.durationSeconds) /
      score.durationSeconds) *
    60
  );
}

/**
 * Apply a tempo mode to a score. `preserve` returns the score unchanged;
 * `flatten` re-times every event onto a single constant tempo (the
 * duration-weighted average BPM) while keeping beat positions intact.
 */
export function applyTempoMode(score: Score, mode: TempoMode): Score {
  if (mode === "preserve") {
    return score;
  }

  const flatMap: TempoEvent[] = [{ start: 0, bpm: averageBpm(score) }];
  const reMap = (t: number): number =>
    beatsToSeconds(flatMap, secondsToBeats(score.tempoMap, t));

  return {
    source: score.source,
    notes: score.notes.map((n) => ({
      ...n,
      start: reMap(n.start),
      duration: reMap(n.start + n.duration) - reMap(n.start),
    })),
    measures: score.measures.map((m) => ({
      ...m,
      start: reMap(m.start),
      end: reMap(m.end),
    })),
    pedalEvents: score.pedalEvents.map((p) => ({
      start: reMap(p.start),
      end: reMap(p.end),
    })),
    timeSignatures: score.timeSignatures.map((ts) => ({
      ...ts,
      start: reMap(ts.start),
    })),
    tempoMap: flatMap,
    durationSeconds: reMap(score.durationSeconds),
    musicXml: score.musicXml,
    qualityWarning: score.qualityWarning,
  };
}
