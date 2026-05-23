import {
  normalize,
  newSectionId,
  type Section,
  type SectionState,
} from "../model/sections";
import type { Note, Score } from "../model/score";

// === Thresholds (named constants for easy tuning) ===
const TEMPO_DELTA_THRESHOLD = 0.08;        // 8%
// Soft-boundary thresholds (Pass 2).
const LONG_REST_SECONDS = 2.0;
const LONG_REST_MIN_MEASURES = 1;
const DENSITY_RATIO_THRESHOLD = 2.0;
const REGISTER_JUMP_SEMITONES = 12;
const SOFT_CLUSTER_REQUIRED = 2;
// SIGNAL_WINDOW_MEASURES = 1             // ± measures the cluster spans (reserved for Task 6 tuning)
// Smart-label thresholds added in Task 7.
const MAX_SECTIONS = 12;                   // Pass 3 cap; declared early.
const MIN_SECTION_MEASURES_AUTO = 2;

/** Candidate boundary in the auto-detect pipeline. */
interface Candidate {
  /** Measure index this boundary sits at the START of. */
  measureIndex: number;
  /** Section start time (seconds), == measures[measureIndex].start. */
  time: number;
  /** "hard" (always kept) or "soft" (kept only by signal cluster). */
  kind: "hard" | "soft";
  /** For "hard" via marker — the section's name; else undefined. */
  name?: string;
  /** Which signals fired here (for diagnostics + Pass 3 weakness ranking). */
  signals: string[];
}

/** Return the measure index whose start is nearest to `time`. */
function nearestMeasureIndex(measures: Score["measures"], time: number): number {
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

interface Pass1Result {
  candidates: Candidate[];
  /** Name from a marker that snapped to measure 0 (names the opening section). */
  measureZeroName?: string;
}

function pass1HardBoundaries(score: Score): Pass1Result {
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

function candidatesToSections(
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
      name: explicit ?? `Section ${labelN}`,
      isAuto: true,
    });
    if (!explicit) labelN += 1;
  }
  return sections;
}

// === Pass 2 helpers ===

/** Notes per second within [a, b). */
function densityIn(notes: Note[], a: number, b: number): number {
  const span = Math.max(0.0001, b - a);
  let count = 0;
  for (const n of notes) {
    if (n.start >= a && n.start < b) count += 1;
  }
  return count / span;
}

/** Mean MIDI pitch within [a, b), or NaN if no notes. */
function meanPitchIn(notes: Note[], a: number, b: number): number {
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
function endsLongRest(notes: Note[], time: number, measures: Score["measures"]): boolean {
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

function pass2SoftBoundaries(score: Score, hardIndices: Set<number>): Candidate[] {
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

/** Smooth a candidate list: merge any tiny sections into neighbours, then cap. */
function smoothCandidates(
  cands: Candidate[],
  measures: Score["measures"],
): Candidate[] {
  if (cands.length === 0) return cands;
  let cur = [...cands].sort((a, b) => a.measureIndex - b.measureIndex);

  // Merge: drop boundaries that would create a section < MIN_SECTION_MEASURES_AUTO measures.
  // Walk left-to-right, virtually keeping a "starts" list (0, then each boundary).
  // If a candidate creates too-short a span from the previous start, drop it.
  // Prefer dropping soft over hard; if both options are hard, prefer dropping the one
  // creating the shortest of the two adjacent sections.
  let changed = true;
  while (changed) {
    changed = false;
    const starts = [0, ...cur.map((c) => c.measureIndex), measures.length];
    for (let i = 0; i < cur.length; i += 1) {
      const a = starts[i];
      const b = starts[i + 1];
      const c = starts[i + 2];
      const leftLen = b - a;
      const rightLen = c - b;
      if (leftLen < MIN_SECTION_MEASURES_AUTO || rightLen < MIN_SECTION_MEASURES_AUTO) {
        // Drop the boundary causing the shorter section. The boundary is cur[i].
        // If left is short and right is long, dropping cur[i] merges left into right.
        // If right is short, dropping cur[i+1] (the next boundary) merges right into left.
        // Whichever side is short, drop the boundary on the SHORT side.
        const dropIdx = leftLen < rightLen ? i : i + 1;
        if (dropIdx < cur.length) {
          // But: never drop a hard boundary unless we have no choice.
          if (cur[dropIdx].kind === "hard") {
            // Try the other boundary if it's soft.
            const altIdx = dropIdx === i ? i + 1 : i;
            if (altIdx >= 0 && altIdx < cur.length && cur[altIdx].kind === "soft") {
              cur.splice(altIdx, 1);
              changed = true;
              break;
            }
            // Both hard — accept the drop anyway to enforce min-length.
          }
          cur.splice(dropIdx, 1);
          changed = true;
          break;
        }
      }
    }
  }

  // Cap at MAX_SECTIONS. Drop weakest soft boundaries first.
  while (cur.length + 1 > MAX_SECTIONS) {
    // Find the weakest soft candidate (fewest signals). If none soft, drop the one
    // creating the shortest adjacent section.
    let weakestIdx = -1;
    let weakestRank = Infinity;
    for (let i = 0; i < cur.length; i += 1) {
      if (cur[i].kind !== "soft") continue;
      const rank = cur[i].signals.length;
      if (rank < weakestRank) {
        weakestRank = rank;
        weakestIdx = i;
      }
    }
    if (weakestIdx === -1) {
      // Only hard candidates remain but still over cap. Drop the one bordering
      // the shortest section.
      const starts = [0, ...cur.map((c) => c.measureIndex), measures.length];
      let bestIdx = 0;
      let bestSpan = Infinity;
      for (let i = 0; i < cur.length; i += 1) {
        const adjSpan = Math.min(starts[i + 1] - starts[i], starts[i + 2] - starts[i + 1]);
        if (adjSpan < bestSpan) {
          bestSpan = adjSpan;
          bestIdx = i;
        }
      }
      cur.splice(bestIdx, 1);
    } else {
      cur.splice(weakestIdx, 1);
    }
  }
  return cur;
}

/**
 * Pure: given a Score, produce an initial SectionState.
 * Runs in four passes — see spec docs/superpowers/specs/2026-05-23-midi-section-navigator-design.md.
 *
 * Current passes implemented: 1 (hard boundaries), 2 (soft cluster) + fallback.
 */
export function autoDetect(score: Score): SectionState {
  const duration = Math.max(0, score.durationSeconds);

  // Pass 1
  const { candidates: hardCands, measureZeroName } = pass1HardBoundaries(score);
  const hardIndices = new Set(hardCands.map((c) => c.measureIndex));

  // Pass 2
  const softCands = pass2SoftBoundaries(score, hardIndices);
  const merged = [...hardCands, ...softCands].sort(
    (a, b) => a.measureIndex - b.measureIndex,
  );

  // Pass 3: smooth (merge tiny sections, cap at MAX_SECTIONS).
  const smoothed = smoothCandidates(merged, score.measures);
  let sections = candidatesToSections(smoothed, duration, (score.midiMarkers?.length ?? 0) > 0, measureZeroName);

  // Fallback if no boundaries: one "Whole piece" section.
  if (sections.length === 0) {
    sections = [
      {
        id: newSectionId(),
        start: 0,
        end: duration,
        name: "Whole piece",
        isAuto: true,
      },
    ];
  }

  return normalize(
    { sections, bookmarks: [], version: 1 },
    duration,
  );
}
