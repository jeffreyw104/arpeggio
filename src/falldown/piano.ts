import type { KeyRange } from "./keyRange";

/** One key's horizontal placement. `x`/`width` are pixels; `black` = sharp/flat. */
export interface KeyRect {
  midi: number;
  x: number;
  width: number;
  black: boolean;
}

/** The full keyboard layout for a range at a given pixel width. */
export interface KeyboardLayout {
  keys: KeyRect[];
  width: number;
  byMidi(midi: number): KeyRect | undefined;
}

export interface DrawPianoOptions {
  y: number; // top of the keyboard
  height: number; // keyboard height in px
  activeKeys: Set<number>;
  activeColor: string;
  whiteColor: string;
  blackColor: string;
}

const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);

function isBlack(midi: number): boolean {
  return BLACK_PITCH_CLASSES.has(((midi % 12) + 12) % 12);
}

const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

/** Convert a MIDI number to a note name with octave, e.g. 60 -> "C4". */
export function midiToNoteName(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  return NOTE_NAMES[((midi % 12) + 12) % 12] + octave;
}

/**
 * Compute the pixel layout for a keyboard range. White keys tile the width
 * edge-to-edge; black keys overlay, narrower and centred on the boundary of
 * their lower white neighbour.
 *
 * For a normal piano appearance the range should begin and end on white keys,
 * as `autoFitRange` guarantees. A black-key bound still lays out without error
 * but may look slightly off (the edge black key is anchored to the leftmost
 * white key's position).
 */
export function keyLayout(range: KeyRange, width: number): KeyboardLayout {
  // Collect white-key MIDI numbers in ascending order.
  const whiteMidis: number[] = [];
  for (let m = range.low; m <= range.high; m++) {
    if (!isBlack(m)) whiteMidis.push(m);
  }
  const whiteCount = whiteMidis.length;

  // Degenerate case: no white keys in the range (e.g. a single black key or an
  // all-black range). Fall back to tiling all keys edge-to-edge as equal-width
  // rectangles so we never produce NaN/Infinity and never crash.
  if (whiteCount === 0) {
    const allMidis: number[] = [];
    for (let m = range.low; m <= range.high; m++) allMidis.push(m);
    const keyWidth = width / allMidis.length;
    const keys: KeyRect[] = allMidis.map((midi, i) => ({
      midi,
      x: i * keyWidth,
      width: keyWidth,
      black: isBlack(midi),
    }));
    const byMidiMap = new Map<number, KeyRect>();
    for (const k of keys) byMidiMap.set(k.midi, k);
    return { keys, width, byMidi: (midi: number) => byMidiMap.get(midi) };
  }

  const whiteWidth = width / whiteCount;
  const blackWidth = whiteWidth * 0.62;

  // Order-index lookup for white keys.
  const whiteIndex = new Map<number, number>();
  whiteMidis.forEach((m, i) => whiteIndex.set(m, i));

  const whiteKeys: KeyRect[] = whiteMidis.map((midi, i) => ({
    midi,
    x: i * whiteWidth,
    width: whiteWidth,
    black: false,
  }));

  const blackKeys: KeyRect[] = [];
  for (let m = range.low; m <= range.high; m++) {
    if (!isBlack(m)) continue;
    const wi = whiteIndex.get(m - 1);
    if (wi === undefined) {
      // The lower white neighbour is outside the range (e.g. range.low is a
      // black key). Anchor to the left edge of the lowest white key so we
      // still emit a KeyRect rather than silently dropping the key.
      blackKeys.push({
        midi: m,
        x: -blackWidth / 2,
        width: blackWidth,
        black: true,
      });
      continue;
    }
    blackKeys.push({
      midi: m,
      x: (wi + 1) * whiteWidth - blackWidth / 2,
      width: blackWidth,
      black: true,
    });
  }

  const keys = [...whiteKeys, ...blackKeys];
  const byMidiMap = new Map<number, KeyRect>();
  for (const k of keys) byMidiMap.set(k.midi, k);

  return {
    keys,
    width,
    byMidi: (midi: number) => byMidiMap.get(midi),
  };
}

/** Draw the keyboard, highlighting any active keys. */
export function drawPiano(
  ctx: CanvasRenderingContext2D,
  layout: KeyboardLayout,
  opts: DrawPianoOptions,
): void {
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#000";

  // White keys first.
  for (const key of layout.keys) {
    if (key.black) continue;
    ctx.fillStyle = opts.activeKeys.has(key.midi)
      ? opts.activeColor
      : opts.whiteColor;
    ctx.fillRect(key.x, opts.y, key.width, opts.height);
    ctx.strokeRect(key.x, opts.y, key.width, opts.height);
  }

  // Black keys on top — shorter.
  for (const key of layout.keys) {
    if (!key.black) continue;
    ctx.fillStyle = opts.activeKeys.has(key.midi)
      ? opts.activeColor
      : opts.blackColor;
    ctx.fillRect(key.x, opts.y, key.width, opts.height * 0.62);
  }
}
