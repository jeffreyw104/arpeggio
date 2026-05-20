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
  /** Midi -> color for every key currently sounding; absent = inactive. */
  activeKeyColors: Map<number, string>;
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

  /** Tight outer glow around an active key. The blur radius is proportional
   *  to the key's width so the halo never reaches further than ~30% of a key
   *  on either side — pedal-sustained chords stay as a row of lit keys
   *  rather than merging into one continuous wash. */
  const halo = (x: number, w: number, h: number, color: string): void => {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = Math.max(3, w * 0.3);
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = color;
    ctx.fillRect(x, opts.y, w, h);
    ctx.restore();
  };

  /** Inset edge drawn over an active key. Acts like a thin dark frame just
   *  inside the key — gives every lit key a crisp border, so adjacent active
   *  keys never merge into one undifferentiated colour block. */
  const activeEdge = (x: number, w: number, h: number): void => {
    ctx.save();
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.lineWidth = 1.25;
    // 0.5px inset so the stroke sits fully inside the fill, not striding the
    // boundary with the neighbour.
    ctx.strokeRect(x + 0.75, opts.y + 0.75, w - 1.5, h - 1.5);
    ctx.restore();
  };

  // The white-key depth gradient is geometry-identical for every key, so
  // build it once per call rather than once per key.
  const grad = ctx.createLinearGradient(0, opts.y, 0, opts.y + opts.height);
  grad.addColorStop(0, "rgba(255,255,255,0.35)");
  grad.addColorStop(0.12, "rgba(255,255,255,0)");
  grad.addColorStop(0.85, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.22)");

  // White keys first.
  for (const key of layout.keys) {
    if (key.black) continue;
    const active = opts.activeKeyColors.get(key.midi);
    if (active) halo(key.x, key.width, opts.height, active);
    ctx.fillStyle = active ?? opts.whiteColor;
    ctx.fillRect(key.x, opts.y, key.width, opts.height);
    ctx.strokeRect(key.x, opts.y, key.width, opts.height);
    ctx.fillStyle = grad;
    ctx.fillRect(key.x, opts.y, key.width, opts.height);
    if (active) activeEdge(key.x, key.width, opts.height);
  }

  // Black keys on top — shorter, with a top bevel highlight.
  for (const key of layout.keys) {
    if (!key.black) continue;
    const h = opts.height * 0.62;
    const active = opts.activeKeyColors.get(key.midi);
    if (active) halo(key.x, key.width, h, active);
    ctx.fillStyle = active ?? opts.blackColor;
    ctx.fillRect(key.x, opts.y, key.width, h);
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(key.x, opts.y, key.width, Math.max(1, h * 0.08));
    if (active) activeEdge(key.x, key.width, h);
  }
}
