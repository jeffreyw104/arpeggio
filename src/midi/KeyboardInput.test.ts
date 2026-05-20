import { describe, it, expect } from "vitest";
import { KeyboardInput } from "./KeyboardInput";

function keydown(key: string, target?: Element): void {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  void target;
}

describe("KeyboardInput", () => {
  it("maps QWERTY keys to pitches and emits note events", () => {
    const kb = new KeyboardInput();
    const log: string[] = [];
    kb.onNoteOn = (e) => log.push(`on:${e.pitch}`);
    kb.onNoteOff = (e) => log.push(`off:${e.pitch}`);
    kb.enable();
    keydown("z");
    window.dispatchEvent(new KeyboardEvent("keyup", { key: "z" }));
    kb.disable();
    expect(log).toEqual(["on:60", "off:60"]);
  });

  it("ignores unmapped keys and key repeats", () => {
    const kb = new KeyboardInput();
    const log: string[] = [];
    kb.onNoteOn = (e) => log.push(`on:${e.pitch}`);
    kb.enable();
    keydown("1");
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "z", repeat: true }),
    );
    kb.disable();
    expect(log).toEqual([]);
  });

  it("maps the 2-octave FL layout (z=60, m=71, q=72, u=83)", () => {
    const input = new KeyboardInput();
    input.enable();
    const notes: number[] = [];
    input.onNoteOn = (e) => notes.push(e.pitch);
    for (const k of ["z", "m", "q", "u"]) {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: k }));
    }
    input.disable();
    expect(notes).toEqual([60, 71, 72, 83]);
  });

  it("maps the upper-row black keys (2=73, 7=82)", () => {
    const input = new KeyboardInput();
    input.enable();
    const notes: number[] = [];
    input.onNoteOn = (e) => notes.push(e.pitch);
    for (const k of ["2", "7"]) {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: k }));
    }
    input.disable();
    expect(notes).toEqual([73, 82]);
  });
});
