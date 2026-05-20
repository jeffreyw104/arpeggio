import type { Note } from "../model/score";
import type { PitchRange } from "./pitchAutoFit";
import { pitchTrack } from "./pitchTrack";

interface Viewport { left: number; top: number; width: number; height: number }
interface TimeWindow { start: number; end: number }

export interface NoteRect {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  velocity: number;
  midi: number;
  start: number;
  end: number;
}

export interface NoteRectsOptions {
  viewport: Viewport;
  timeWindow: TimeWindow;
  pitchRange: PitchRange;
  rightColor: string;
  leftColor: string;
}

export function noteRectsInWindow(
  notes: readonly Note[],
  opts: NoteRectsOptions,
): NoteRect[] {
  const { viewport: vp, timeWindow: tw, pitchRange: pr } = opts;
  const pxPerSec = vp.width / (tw.end - tw.start);
  const rowH = pitchTrack.rowHeight(pr, vp.height);
  const rects: NoteRect[] = [];
  for (const note of notes) {
    const end = note.start + note.duration;
    if (end <= tw.start) continue;
    if (note.start >= tw.end) continue;
    const x = vp.left + (note.start - tw.start) * pxPerSec;
    const width = note.duration * pxPerSec;
    const y = pitchTrack(note.midi, pr, { top: vp.top, height: vp.height });
    rects.push({
      x, y, width, height: rowH,
      color: note.hand === "right" ? opts.rightColor : opts.leftColor,
      velocity: note.velocity, midi: note.midi, start: note.start, end,
    });
  }
  return rects;
}
