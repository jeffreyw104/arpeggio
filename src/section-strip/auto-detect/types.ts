/** Candidate boundary in the auto-detect pipeline. */
export interface Candidate {
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

export interface Pass1Result {
  candidates: Candidate[];
  /** Name from a marker that snapped to measure 0 (names the opening section). */
  measureZeroName?: string;
}
