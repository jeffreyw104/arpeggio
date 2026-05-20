import { describe, it, expect } from "vitest";
import { LiveNotes } from "./LiveNotes";

describe("LiveNotes", () => {
  it("tracks held notes and releases them", () => {
    const live = new LiveNotes();
    live.press(60, 0.8, 100);
    expect(live.heldNotes().map((n) => n.pitch)).toEqual([60]);
    live.release(60);
    expect(live.heldNotes()).toEqual([]);
  });

  it("defers a release while the pedal is down, flushing on pedal-up", () => {
    const live = new LiveNotes();
    live.press(60, 0.8, 100);
    live.setPedal(true);
    live.release(60);
    expect(live.heldNotes().map((n) => n.pitch)).toEqual([60]);
    live.setPedal(false);
    expect(live.heldNotes()).toEqual([]);
  });

  it("fires onPressed and onReleased callbacks", () => {
    const live = new LiveNotes();
    const log: string[] = [];
    live.onPressed = (n) => log.push(`press:${n.pitch}`);
    live.onReleased = (p) => log.push(`release:${p}`);
    live.press(60, 0.8, 100);
    live.release(60);
    expect(log).toEqual(["press:60", "release:60"]);
  });

  it("a re-press cancels a pending sustain", () => {
    const live = new LiveNotes();
    live.press(60, 0.8, 100);
    live.setPedal(true);
    live.release(60);
    live.press(60, 0.9, 200);
    live.setPedal(false);
    expect(live.heldNotes().map((n) => n.pitch)).toEqual([60]);
  });

  it("marks pedal-sustained notes with sustained: true and physically held notes without", () => {
    const live = new LiveNotes();
    live.press(60, 0.8, 100);
    live.press(64, 0.8, 110);
    live.setPedal(true);
    live.release(60); // released physically but kept by pedal
    const held = live.heldNotes();
    const byPitch = Object.fromEntries(held.map((n) => [n.pitch, n.sustained]));
    expect(byPitch[60]).toBe(true);
    expect(byPitch[64]).toBeUndefined();
  });
});
