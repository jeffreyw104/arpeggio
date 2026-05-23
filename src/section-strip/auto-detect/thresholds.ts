// === Thresholds (named constants for easy tuning) ===
export const TEMPO_DELTA_THRESHOLD = 0.08;        // 8%
// Soft-boundary thresholds (Pass 2).
export const LONG_REST_SECONDS = 2.0;
export const LONG_REST_MIN_MEASURES = 1;
export const DENSITY_RATIO_THRESHOLD = 2.0;
export const REGISTER_JUMP_SEMITONES = 12;
export const SOFT_CLUSTER_REQUIRED = 2;
// SIGNAL_WINDOW_MEASURES = 1             // ± measures the cluster spans (reserved for Task 6 tuning)
// Smart-label thresholds (Pass 4).
export const CLIMAX_DENSITY_RATIO = 1.8;
export const CLIMAX_REGISTER_DELTA = 6;
export const QUIET_DENSITY_RATIO = 0.4;
export const FAST_TEMPO_RATIO = 1.2;
export const SLOW_TEMPO_RATIO = 0.8;
export const HAND_ISOLATION_PCT = 0.95;
export const MIN_SMART_LABEL_MEASURES = 4;
export const MAX_SECTIONS = 12;                   // Pass 3 cap; declared early.
export const MIN_SECTION_MEASURES_AUTO = 2;
