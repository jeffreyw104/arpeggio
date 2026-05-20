import type { PitchRange } from "./pitchAutoFit";

interface ViewportV { top: number; height: number }

/**
 * The pixel `y` of the top of the row for `midi`, inside a viewport
 * `{ top, height }`. The highest pitch sits at the top.
 */
export function pitchTrack(
  midi: number,
  range: PitchRange,
  vp: ViewportV,
): number {
  const rows = range.highMidi - range.lowMidi;
  const rowH = vp.height / rows;
  const fromTop = range.highMidi - midi;
  const clamped = Math.max(0, Math.min(rows - 1, fromTop));
  return vp.top + clamped * rowH;
}

pitchTrack.rowHeight = function rowHeight(
  range: PitchRange,
  height: number,
): number {
  return height / (range.highMidi - range.lowMidi);
};
