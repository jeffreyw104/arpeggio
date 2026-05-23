/**
 * Editable section/bookmark model for the MIDI section navigator. The
 * `normalize` function is the single canonical re-anchor point used by every
 * edit operation; it guarantees the invariants the UI relies on.
 */

export interface Section {
  /** Stable UUID minted on creation; survives all edits. */
  id: string;
  /** Inclusive start time, seconds. */
  start: number;
  /** Exclusive-at-shared-boundary end time, seconds. Equals next section's start. */
  end: number;
  /** Display name. Editable. "Section N" when auto-generated. */
  name: string;
  /** True until the user edits this section. */
  isAuto: boolean;
}

export interface Bookmark {
  id: string;
  /** Time in seconds, in [0, duration]. */
  time: number;
  /** Display name. */
  name: string;
}

export interface SectionState {
  /** Contiguous cover of [0, duration], sorted by start. */
  sections: Section[];
  /** Sorted by time. */
  bookmarks: Bookmark[];
  /** Schema version for future migrations. */
  version: 1;
}

function uuid(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  );
}

export function newSectionId(): string {
  return `sec-${uuid()}`;
}

export function newBookmarkId(): string {
  return `bm-${uuid()}`;
}

/**
 * Re-anchor a section state to invariants:
 *   - sections sorted by start
 *   - sections cover [0, duration] contiguously with no gaps or overlaps
 *   - any section with end <= start is dropped
 *   - empty section list collapses to a single fallback section
 *   - bookmarks sorted by time, clamped into [0, duration]
 */
export function normalize(state: SectionState, duration: number): SectionState {
  const dur = Math.max(0, duration);

  // Sort + drop empty sections.
  const sorted = [...state.sections]
    .sort((a, b) => a.start - b.start)
    .filter((s) => s.end > s.start);

  let sections: Section[];
  if (sorted.length === 0) {
    sections = [
      { id: newSectionId(), start: 0, end: dur, name: "Whole piece", isAuto: true },
    ];
  } else {
    // Anchor first.start = 0, last.end = duration, and stitch adjacencies.
    sections = sorted.map((s) => ({ ...s }));
    sections[0].start = 0;
    for (let i = 0; i < sections.length - 1; i += 1) {
      sections[i].end = sections[i + 1].start;
    }
    sections[sections.length - 1].end = dur;
    // After anchoring, drop any section that collapsed to zero-width.
    sections = sections.filter((s) => s.end > s.start);
    if (sections.length === 0) {
      sections = [
        { id: newSectionId(), start: 0, end: dur, name: "Whole piece", isAuto: true },
      ];
    }
  }

  const bookmarks = [...state.bookmarks]
    .map((b) => ({ ...b, time: Math.min(dur, Math.max(0, b.time)) }))
    .sort((a, b) => a.time - b.time);

  return { sections, bookmarks, version: 1 };
}
