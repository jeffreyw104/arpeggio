import {
  normalize,
  newSectionId,
  newBookmarkId,
  type SectionState,
  type Section,
} from "../model/sections";

const DEFAULT_MIN_SECTION_SECONDS = 0.5;

export function renameSection(
  state: SectionState,
  id: string,
  name: string,
  duration: number,
): SectionState {
  const sections = state.sections.map((s) =>
    s.id === id ? { ...s, name, isAuto: false } : s,
  );
  return normalize({ ...state, sections }, duration);
}

export function splitAt(
  state: SectionState,
  sectionId: string,
  time: number,
  duration: number,
): SectionState {
  const idx = state.sections.findIndex((s) => s.id === sectionId);
  if (idx === -1) return state;
  const target = state.sections[idx];
  if (time <= target.start || time >= target.end) return state;

  // Splitting creates a new boundary at `time` that did not exist in the
  // original auto layout, so neither half can offer the old autoEnd as a snap
  // target — clear it on both sides.
  const left: Section = { ...target, end: time, autoEnd: undefined, isAuto: false };
  const right: Section = {
    id: newSectionId(),
    start: time,
    end: target.end,
    name: `${target.name} (b)`,
    isAuto: false,
  };
  const sections = [
    ...state.sections.slice(0, idx),
    left,
    right,
    ...state.sections.slice(idx + 1),
  ];
  return normalize({ ...state, sections }, duration);
}

export function mergeRight(
  state: SectionState,
  sectionId: string,
  duration: number,
): SectionState {
  const idx = state.sections.findIndex((s) => s.id === sectionId);
  if (idx === -1 || idx === state.sections.length - 1) return state;
  const left = state.sections[idx];
  const right = state.sections[idx + 1];
  // Merging removes a boundary; the merged section's right edge is now the
  // right neighbour's old edge — keep that as the snap target if it existed.
  const merged: Section = {
    ...left,
    end: right.end,
    autoEnd: right.autoEnd,
    isAuto: false,
  };
  const sections = [
    ...state.sections.slice(0, idx),
    merged,
    ...state.sections.slice(idx + 2),
  ];
  return normalize({ ...state, sections }, duration);
}

export function mergeLeft(
  state: SectionState,
  sectionId: string,
  duration: number,
): SectionState {
  const idx = state.sections.findIndex((s) => s.id === sectionId);
  if (idx <= 0) return state;
  return mergeRight(state, state.sections[idx - 1].id, duration);
}

export function resizeBoundary(
  state: SectionState,
  leftSectionId: string,
  newBoundaryTime: number,
  duration: number,
  minSeconds: number = DEFAULT_MIN_SECTION_SECONDS,
): SectionState {
  const idx = state.sections.findIndex((s) => s.id === leftSectionId);
  if (idx === -1 || idx === state.sections.length - 1) return state;
  const left = state.sections[idx];
  const right = state.sections[idx + 1];
  const min = left.start + minSeconds;
  const max = right.end - minSeconds;
  if (min >= max) return state;
  const clamped = Math.min(max, Math.max(min, newBoundaryTime));
  const sections = state.sections.map((s, i) => {
    if (i === idx) return { ...s, end: clamped, isAuto: false };
    if (i === idx + 1) return { ...s, start: clamped, isAuto: false };
    return s;
  });
  return normalize({ ...state, sections }, duration);
}

export function deleteSection(
  state: SectionState,
  sectionId: string,
  duration: number,
): SectionState {
  if (state.sections.length <= 1) return state;
  const idx = state.sections.findIndex((s) => s.id === sectionId);
  if (idx === -1) return state;
  const target = state.sections[idx];
  // Absorb into the left neighbour if there is one, else the right.
  const sections = state.sections.map((s) => ({ ...s }));
  if (idx > 0) {
    sections[idx - 1].end = target.end;
    sections[idx - 1].autoEnd = target.autoEnd;
    sections[idx - 1].isAuto = false;
  } else {
    sections[idx + 1].start = target.start;
    sections[idx + 1].isAuto = false;
  }
  sections.splice(idx, 1);
  return normalize({ ...state, sections }, duration);
}

export function addSection(
  state: SectionState,
  time: number,
  duration: number,
): SectionState {
  if (time <= 0 || time >= duration) return state;
  const containing = state.sections.find((s) => s.start < time && s.end > time);
  if (!containing) return state;
  return splitAt(state, containing.id, time, duration);
}

export function addBookmark(
  state: SectionState,
  time: number,
  name: string,
  duration: number,
): SectionState {
  const bookmarks = [
    ...state.bookmarks,
    { id: newBookmarkId(), time, name },
  ];
  return normalize({ ...state, bookmarks }, duration);
}

export function renameBookmark(
  state: SectionState,
  id: string,
  name: string,
): SectionState {
  const bookmarks = state.bookmarks.map((b) =>
    b.id === id ? { ...b, name } : b,
  );
  return { ...state, bookmarks };
}

export function deleteBookmark(
  state: SectionState,
  id: string,
): SectionState {
  const bookmarks = state.bookmarks.filter((b) => b.id !== id);
  return { ...state, bookmarks };
}
