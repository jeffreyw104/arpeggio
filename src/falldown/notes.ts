import type { Note } from "../model/score";
import type { KeyboardLayout } from "./piano";
import { type HandFilter, NO_HAND_FILTER } from "../practice/hands";

/** Geometry/style configuration for the falldown. */
export interface FalldownConfig {
  /** Y of the keyboard top — where a note's onset edge lands. */
  hitLineY: number;
  /** Fall speed in pixels per second. */
  pixelsPerSecond: number;
  rightColor: string;
  leftColor: string;
}

/** A falling note's drawn rectangle. `bottom` is the onset (lower) edge. */
export interface NoteRect {
  midi: number;
  x: number;
  width: number;
  bottom: number;
  top: number;
  height: number;
  color: string;
  /** The note's velocity, 0-1 — drives draw opacity. */
  velocity: number;
  /** True while the note is sounding at the current clock time. */
  playing: boolean;
  /** True when the note's hand is set to "dim" — draw it faint. */
  dimmed: boolean;
}

/**
 * The drawable rectangle of every note visible at clock time `t`. A note's
 * onset edge sits at `hitLineY` when `t === note.start`, rising above it before
 * and passing below it after. Notes fully outside the falldown area are omitted.
 */
export function noteRects(
  notes: Note[],
  layout: KeyboardLayout,
  t: number,
  config: FalldownConfig,
  handFilter: HandFilter = NO_HAND_FILTER,
): NoteRect[] {
  const rects: NoteRect[] = [];
  for (const note of notes) {
    const vis = handFilter.visibility(note.hand);
    if (vis === "hide") continue;
    const key = layout.byMidi(note.midi);
    if (!key) continue;
    const bottom = config.hitLineY - (note.start - t) * config.pixelsPerSecond;
    const height = note.duration * config.pixelsPerSecond;
    const top = bottom - height;
    if (top > config.hitLineY || bottom < 0) continue;
    rects.push({
      midi: note.midi,
      x: key.x,
      width: key.width,
      bottom,
      top,
      height,
      color: note.hand === "right" ? config.rightColor : config.leftColor,
      velocity: note.velocity,
      playing: t >= note.start && t < note.start + note.duration,
      dimmed: vis === "dim",
    });
  }
  return rects;
}

/**
 * Map of midi -> hand color for every note sounding at time `t`. If two notes
 * sound the same pitch the last one wins (rare; either color reads correctly).
 */
export function activeKeyColors(
  notes: Note[],
  t: number,
  rightColor: string,
  leftColor: string,
): Map<number, string> {
  const map = new Map<number, string>();
  for (const note of notes) {
    if (t >= note.start && t < note.start + note.duration) {
      map.set(note.midi, note.hand === "right" ? rightColor : leftColor);
    }
  }
  return map;
}
