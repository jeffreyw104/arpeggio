import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Mock } from "vitest";
import type { MidiNoteEvent } from "./MidiInput";
import { PointerInput } from "./PointerInput";

function fire(el: HTMLElement, type: string, init: { clientX?: number; clientY?: number; pointerId?: number }) {
  // jsdom doesn't ship PointerEvent constructor; synthesize via MouseEvent
  // and add pointerId.
  const e = new MouseEvent(type, { bubbles: true, ...init }) as MouseEvent & {
    pointerId: number;
  };
  Object.defineProperty(e, "pointerId", { value: init.pointerId ?? 1 });
  el.dispatchEvent(e);
}

describe("PointerInput", () => {
  let canvas: HTMLCanvasElement;
  let input: PointerInput;
  let onNoteOn: Mock<(e: MidiNoteEvent) => void>;
  let onNoteOff: Mock<(e: MidiNoteEvent) => void>;
  let pitchAt: Mock<(x: number, y: number) => number | null>;

  beforeEach(() => {
    canvas = document.createElement("canvas");
    canvas.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 800, height: 300 }) as DOMRect;
    document.body.appendChild(canvas);
    pitchAt = vi.fn<(x: number, y: number) => number | null>((x) => (x < 400 ? 60 : 64));
    input = new PointerInput((x, y) => pitchAt(x, y));
    onNoteOn = vi.fn<(e: MidiNoteEvent) => void>();
    onNoteOff = vi.fn<(e: MidiNoteEvent) => void>();
    input.onNoteOn = onNoteOn;
    input.onNoteOff = onNoteOff;
    input.attach(canvas);
  });

  afterEach(() => {
    input.detach();
    canvas.remove();
  });

  it("emits note-on on pointerdown over a key", () => {
    fire(canvas, "pointerdown", { clientX: 100, clientY: 280, pointerId: 1 });
    expect(onNoteOn).toHaveBeenCalledWith(expect.objectContaining({ pitch: 60 }));
  });

  it("emits note-off on pointerup for the same pointerId", () => {
    fire(canvas, "pointerdown", { clientX: 100, clientY: 280, pointerId: 1 });
    fire(canvas, "pointerup", { clientX: 100, clientY: 280, pointerId: 1 });
    expect(onNoteOff).toHaveBeenCalledWith(expect.objectContaining({ pitch: 60 }));
  });

  it("emits note-off/note-on when dragging onto a different key", () => {
    fire(canvas, "pointerdown", { clientX: 100, clientY: 280, pointerId: 1 });
    onNoteOn.mockClear();
    fire(canvas, "pointermove", { clientX: 500, clientY: 280, pointerId: 1 });
    expect(onNoteOff).toHaveBeenCalledWith(expect.objectContaining({ pitch: 60 }));
    expect(onNoteOn).toHaveBeenCalledWith(expect.objectContaining({ pitch: 64 }));
  });

  it("emits note-off on pointercancel", () => {
    fire(canvas, "pointerdown", { clientX: 100, clientY: 280, pointerId: 1 });
    fire(canvas, "pointercancel", { clientX: 100, clientY: 280, pointerId: 1 });
    expect(onNoteOff).toHaveBeenCalledWith(expect.objectContaining({ pitch: 60 }));
  });

  it("does not emit when pointerdown falls outside any key (pitchAt returns null)", () => {
    pitchAt.mockReturnValueOnce(null);
    fire(canvas, "pointerdown", { clientX: 100, clientY: 280, pointerId: 1 });
    expect(onNoteOn).not.toHaveBeenCalled();
  });

  it("tracks multiple pointers independently", () => {
    fire(canvas, "pointerdown", { clientX: 100, clientY: 280, pointerId: 1 });
    fire(canvas, "pointerdown", { clientX: 500, clientY: 280, pointerId: 2 });
    fire(canvas, "pointerup",   { clientX: 100, clientY: 280, pointerId: 1 });
    expect(onNoteOff).toHaveBeenCalledTimes(1);
    expect(onNoteOff).toHaveBeenCalledWith(expect.objectContaining({ pitch: 60 }));
  });

  it("ignores events after detach()", () => {
    input.detach();
    fire(canvas, "pointerdown", { clientX: 100, clientY: 280, pointerId: 1 });
    expect(onNoteOn).not.toHaveBeenCalled();
  });
});
