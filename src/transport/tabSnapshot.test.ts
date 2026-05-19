import { describe, it, expect } from "vitest";
import type { Score, Note } from "../model/score";
import { Transport } from "./transport";
import { captureTab, applyTab, switchTab } from "./tabSnapshot";
import type { TabSnapshot } from "./tabSnapshot";
import type { TabMode } from "../layout/practiceMode";

function makeScore(): Score {
  return {
    source: "midi",
    notes: [] as Note[],
    measures: [{ index: 0, start: 0, end: 4, numerator: 4, denominator: 4 }],
    pedalEvents: [],
    timeSignatures: [{ start: 0, numerator: 4, denominator: 4 }],
    tempoMap: [{ start: 0, bpm: 120 }],
    durationSeconds: 30,
    musicXml: "",
    qualityWarning: null,
  } satisfies Score;
}

describe("tabSnapshot", () => {
  it("captureTab reads position, loop, and bpm off the transport", () => {
    const t = new Transport(makeScore());
    t.clock.seek(7);
    t.clock.setLoop({ start: 2, end: 5 });
    t.setBpm(90);
    expect(captureTab(t)).toEqual({
      position: 7,
      loop: { start: 2, end: 5 },
      bpm: 90,
    });
  });

  it("captureTab clones the loop so later clock changes do not mutate it", () => {
    const t = new Transport(makeScore());
    t.clock.setLoop({ start: 1, end: 2 });
    const snap = captureTab(t);
    t.clock.setLoop({ start: 8, end: 9 });
    expect(snap.loop).toEqual({ start: 1, end: 2 });
  });

  it("applyTab writes a snapshot back onto the transport", () => {
    const t = new Transport(makeScore());
    applyTab({ position: 4, loop: { start: 1, end: 3 }, bpm: 60 }, t);
    expect(t.clock.position).toBe(4);
    expect(t.clock.loop).toEqual({ start: 1, end: 3 });
    expect(t.bpm).toBeCloseTo(60, 3);
  });

  it("applyTab clears the loop when the snapshot has none", () => {
    const t = new Transport(makeScore());
    t.clock.setLoop({ start: 1, end: 2 });
    applyTab({ position: 0, loop: null, bpm: 120 }, t);
    expect(t.clock.loop).toBeNull();
  });

  it("switchTab pauses, captures the leaving tab, restores the entering tab", () => {
    const t = new Transport(makeScore());
    const snapshots: Record<TabMode, TabSnapshot> = {
      play: { position: 0, loop: null, bpm: 120 },
      midi: { position: 12, loop: { start: 8, end: 10 }, bpm: 75 },
    };
    t.clock.seek(6);
    t.clock.play();

    switchTab(t, snapshots, "play", "midi");

    expect(snapshots.play).toEqual({ position: 6, loop: null, bpm: 120 });
    expect(t.clock.position).toBe(12);
    expect(t.clock.loop).toEqual({ start: 8, end: 10 });
    expect(t.bpm).toBeCloseTo(75, 3);
    expect(t.clock.playing).toBe(false);
  });
});
