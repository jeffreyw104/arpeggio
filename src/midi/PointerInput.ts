import type { MidiNoteEvent } from "./MidiInput";

/** Velocity used for every tap (no real velocity available from a pointer). */
const POINTER_VELOCITY = 0.7;

/**
 * Pointer-driven input source for the on-canvas piano. Emits the same
 * `MidiNoteEvent` shape as `MidiInput` and `KeyboardInput`, so taps flow
 * through `LiveNotes` like any other input. Drag-across slides between
 * keys legato (off → on as the pointer crosses a boundary). Multi-touch
 * via pointerId tracking — each finger owns its own note-on/off lifecycle.
 */
export class PointerInput {
  onNoteOn: ((e: MidiNoteEvent) => void) | null = null;
  onNoteOff: ((e: MidiNoteEvent) => void) | null = null;

  private canvas: HTMLCanvasElement | null = null;
  private active = new Map<number, number>(); // pointerId -> pitch

  constructor(private readonly pitchAt: (x: number, y: number) => number | null) {}

  attach(canvas: HTMLCanvasElement): void {
    if (this.canvas) this.detach();
    this.canvas = canvas;
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointercancel", this.onUp);
    canvas.addEventListener("pointerleave", this.onUp);
  }

  detach(): void {
    const c = this.canvas;
    if (!c) return;
    c.removeEventListener("pointerdown", this.onDown);
    c.removeEventListener("pointermove", this.onMove);
    c.removeEventListener("pointerup", this.onUp);
    c.removeEventListener("pointercancel", this.onUp);
    c.removeEventListener("pointerleave", this.onUp);
    // Release every in-flight pointer so audio voices aren't stuck.
    for (const [, pitch] of this.active) {
      this.onNoteOff?.({ pitch, velocity: 0, pressTime: performance.now() });
    }
    this.active.clear();
    this.canvas = null;
  }

  private localXY(e: PointerEvent): { x: number; y: number } {
    const rect = (this.canvas ?? (e.currentTarget as HTMLCanvasElement))
      .getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private onDown = (e: PointerEvent): void => {
    const { x, y } = this.localXY(e);
    const pitch = this.pitchAt(x, y);
    if (pitch === null) return;
    this.active.set(e.pointerId, pitch);
    this.canvas?.setPointerCapture?.(e.pointerId);
    this.onNoteOn?.({ pitch, velocity: POINTER_VELOCITY, pressTime: performance.now() });
  };

  private onMove = (e: PointerEvent): void => {
    const previous = this.active.get(e.pointerId);
    if (previous === undefined) return; // only tracking pointers that started on-canvas
    const { x, y } = this.localXY(e);
    const pitch = this.pitchAt(x, y);
    if (pitch === previous) return;
    this.onNoteOff?.({ pitch: previous, velocity: 0, pressTime: performance.now() });
    if (pitch === null) {
      this.active.delete(e.pointerId);
      return;
    }
    this.active.set(e.pointerId, pitch);
    this.onNoteOn?.({ pitch, velocity: POINTER_VELOCITY, pressTime: performance.now() });
  };

  private onUp = (e: PointerEvent): void => {
    const pitch = this.active.get(e.pointerId);
    if (pitch === undefined) return;
    this.active.delete(e.pointerId);
    this.onNoteOff?.({ pitch, velocity: 0, pressTime: performance.now() });
  };
}
