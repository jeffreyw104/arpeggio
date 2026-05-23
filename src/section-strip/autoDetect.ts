import { normalize, newSectionId, type SectionState } from "../model/sections";
import type { Score } from "../model/score";
import { pass1HardBoundaries } from "./auto-detect/pass1";
import { pass2SoftBoundaries } from "./auto-detect/pass2";
import { smoothCandidates } from "./auto-detect/pass3";
import { applySmartLabels } from "./auto-detect/pass4";
import { candidatesToSections } from "./auto-detect/helpers";

/**
 * Pure: given a Score, produce an initial SectionState.
 * Runs in four passes — see spec docs/superpowers/specs/2026-05-23-midi-section-navigator-design.md.
 *
 * Passes implemented: 1 (hard boundaries), 2 (soft cluster), 3 (smooth + cap), 4 (smart labels).
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

  // Pass 4: smart labels (gated on no markers).
  sections = applySmartLabels(sections, score);

  // Fallback if no boundaries: one "Whole piece" section.
  if (sections.length === 0) {
    sections = [
      {
        id: newSectionId(),
        start: 0,
        end: duration,
        autoEnd: duration,
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
