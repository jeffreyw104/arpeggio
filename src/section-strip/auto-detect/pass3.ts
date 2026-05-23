import type { Score } from "../../model/score";
import { MAX_SECTIONS, MIN_SECTION_MEASURES_AUTO } from "./thresholds";
import type { Candidate } from "./types";

/** Smooth a candidate list: merge any tiny sections into neighbours, then cap. */
export function smoothCandidates(
  cands: Candidate[],
  measures: Score["measures"],
): Candidate[] {
  if (cands.length === 0) return cands;
  const cur = [...cands].sort((a, b) => a.measureIndex - b.measureIndex);

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
        // Drop the boundary causing the shorter section.
        // If left is short, drop cur[i] (merges the short left into the right).
        // If right is short, drop cur[i+1] (merges the short right into the left).
        // For the terminal boundary (no cur[i+1]), fall back to dropping cur[i],
        // which merges the short terminal section into the preceding one.
        let dropIdx = leftLen < rightLen ? i : i + 1;
        if (dropIdx >= cur.length) dropIdx = i;
        // Never drop a hard boundary unless we have no choice.
        if (cur[dropIdx].kind === "hard") {
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
