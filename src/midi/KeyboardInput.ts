import type { MidiNoteEvent } from "./MidiInput";

/** One octave of piano keys, C4 (60) upward. */
const KEY_TO_PITCH: Readonly<Record<string, number>> = {
  a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66,
  g: 67, y: 68, h: 69, u: 70, j: 71, k: 72,
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
