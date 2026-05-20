import type { MidiNoteEvent } from "./MidiInput";

/** Two-octave FL Studio-style QWERTY layout, mid-C = 60.
 *  Lower octave: Z X C V B N M (white) / S D · G H J (black).
 *  Upper octave: Q W E R T Y U (white) / 2 3 · 5 6 7 (black). */
const KEY_TO_PITCH: Readonly<Record<string, number>> = {
  // Lower octave
  z: 60, s: 61, x: 62, d: 63, c: 64, v: 65, g: 66,
  b: 67, h: 68, n: 69, j: 70, m: 71,
  // Upper octave
  q: 72, "2": 73, w: 74, "3": 75, e: 76, r: 77, "5": 78,
  t: 79, "6": 80, y: 81, "7": 82, u: 83,
};

/** Velocity used for every QWERTY press (no real velocity available). */
const KEYBOARD_VELOCITY = 0.7;

/**
 * QWERTY-keyboard fallback input source. Emits the same MidiNoteEvent shape as
 * MidiInput so a connected keyboard is never required to use wait-mode.
 */
export class KeyboardInput {
  onNoteOn: ((e: MidiNoteEvent) => void) | null = null;
  onNoteOff: ((e: MidiNoteEvent) => void) | null = null;

  private enabled = false;
  private down = new Set<string>();

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
  }

  disable(): void {
    if (!this.enabled) return;
    this.enabled = false;
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    this.down.clear();
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    const target = e.target as HTMLElement | null;
    if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
    const key = e.key.toLowerCase();
    const pitch = KEY_TO_PITCH[key];
    if (pitch === undefined || this.down.has(key)) return;
    this.down.add(key);
    this.onNoteOn?.({
      pitch,
      velocity: KEYBOARD_VELOCITY,
      pressTime: performance.now(),
    });
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    const key = e.key.toLowerCase();
    const pitch = KEY_TO_PITCH[key];
    if (pitch === undefined || !this.down.has(key)) return;
    this.down.delete(key);
    this.onNoteOff?.({
      pitch,
      velocity: 0,
      pressTime: performance.now(),
    });
  };
}
