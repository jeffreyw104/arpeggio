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
    keydown("a");
    window.dispatchEvent(new KeyboardEvent("keyup", { key: "a" }));
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
      new KeyboardEvent("keydown", { key: "a", repeat: true }),
    );
    kb.disable();
    expect(log).toEqual([]);
  });
});
