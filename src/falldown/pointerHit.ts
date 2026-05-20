import type { KeyboardLayout } from "./piano";

/** Black keys occupy the upper 62% of the keyboard band — matches the
 *  fraction `drawPiano` paints. */
const BLACK_KEY_HEIGHT_FRAC = 0.62;

/**
 * Hit-test a pointer position against the on-canvas keyboard layout. Returns
 * the MIDI pitch of the key under (x, y), or null if outside the band.
 *
 * Black keys are checked first when the pointer is in the upper band, since
 * they paint on top of the white keys; if no black key matches, the white
 * key underneath wins.
 */
export function pointerHit(
  layout: KeyboardLayout,
  x: number,
  y: number,
  pianoY: number,
  pianoH: number,
): number | null {
  if (y < pianoY || y > pianoY + pianoH) return null;
  if (x < 0 || x > layout.width) return null;

  const inBlackBand = y - pianoY <= pianoH * BLACK_KEY_HEIGHT_FRAC;
  if (inBlackBand) {
    for (const key of layout.keys) {
      if (!key.black) continue;
      if (x >= key.x && x <= key.x + key.width) return key.midi;
    }
  }
  for (const key of layout.keys) {
    if (key.black) continue;
    if (x >= key.x && x <= key.x + key.width) return key.midi;
  }
  return null;
}
