import { describe, it, expect } from "vitest";
import { Transport } from "./transport";
import { secondsToBeats } from "./tempoMap";
import type { Score } from "../model/score";

const score = {
  source: "midi",
  notes: [],
  measures: [
    { index: 0, start: 0, end: 2, numerator: 4, denominator: 4 },
    { index: 1, start: 2, end: 4, numerator: 4, denominator: 4 },
  ],
  pedalEvents: [],
  timeSignatures: [{ start: 0, numerator: 4, denominator: 4 }],
  tempoMap: [{ start: 0, bpm: 120 }],
  durationSeconds: 4,
  musicXml: "",
  qualityWarning: null,
} satisfies Score;

describe("Transport", () => {
  it("exposes a clock and the score's reference BPM", () => {
    const t = new Transport(score);
    expect(t.referenceBpm).toBeCloseTo(120, 0);
    expect(t.bpm).toBeCloseTo(120, 0);
    expect(t.clock.position).toBe(0);
  });

  it("setBpm scales the clock rate against the reference tempo", () => {
    const t = new Transport(score);
    t.setBpm(60); // half the reference 120
    expect(t.clock.rate).toBeCloseTo(0.5, 6);
    t.setBpm(180);
    expect(t.clock.rate).toBeCloseTo(1.5, 6);
  });

  it("loops a measure range via the clock", () => {
    const t = new Transport(score);
    t.loopMeasures(1, 1);
    expect(t.clock.loop).toEqual({ start: 2, end: 4 });
    t.clearLoop();
    expect(t.clock.loop).toBeNull();
  });

  it("applies gradual speed-up on each loop pass", () => {
    const t = new Transport(score);
    t.loopMeasures(0, 0); // loop [0,2]
    t.enableSpeedUp({ startRate: 0.5, targetRate: 1, step: 0.25 });
    expect(t.clock.rate).toBeCloseTo(0.5, 6); // start slow
    t.clock.seek(0);
    t.clock.play();
    t.clock.tick(5); // long tick -> crosses loop end at least once
    expect(t.clock.rate).toBeGreaterThan(0.5); // sped up after the pass
  });

  it("flatten mode swaps in a re-timed score", () => {
    const t = new Transport(score);
    t.setTempoMode("flatten");
    expect(t.tempoMode).toBe("flatten");
    // constant-tempo score: flattening keeps the duration
    expect(t.score.durationSeconds).toBeCloseTo(4, 3);
  });

  describe("speedUpActive", () => {
    it("reports false initially, true after enableSpeedUp, false after disable", () => {
      const t = new Transport(score);
      expect(t.speedUpActive).toBe(false);
      t.enableSpeedUp({ startRate: 0.5, targetRate: 1, step: 0.05 });
      expect(t.speedUpActive).toBe(true);
      t.disableSpeedUp();
      expect(t.speedUpActive).toBe(false);
    });
  });

  it("keeps the musical position when toggling tempo mode", () => {
    // A score with a tempo change: 120 BPM for [0,2), then 60 BPM after.
    // The flatten and preserve timelines genuinely differ here.
    const tempoScore = {
      ...score,
      tempoMap: [
        { start: 0, bpm: 120 },
        { start: 2, bpm: 60 },
      ],
    } satisfies Score;
    const t = new Transport(tempoScore);

    t.clock.seek(3); // 4 beats by t=2, then +1 beat over [2,3] -> 5 beats
    const beatsBefore = secondsToBeats(t.score.tempoMap, t.clock.position);
    expect(beatsBefore).toBeCloseTo(5, 6);

    t.setTempoMode("flatten");

    const beatsAfter = secondsToBeats(t.score.tempoMap, t.clock.position);
    expect(beatsAfter).toBeCloseTo(beatsBefore, 6);
  });
});
