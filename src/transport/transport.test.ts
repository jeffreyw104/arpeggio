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

// A score with a varying tempo map — its measures sit at different second
// times under preserve vs. flatten, so the loop must be re-mapped.
const varyingScore = {
  source: "midi",
  notes: [],
  measures: [
    { index: 0, start: 0, end: 2, numerator: 4, denominator: 4 },
    { index: 1, start: 2, end: 6, numerator: 4, denominator: 4 },
    { index: 2, start: 6, end: 8, numerator: 4, denominator: 4 },
  ],
  pedalEvents: [],
  timeSignatures: [{ start: 0, numerator: 4, denominator: 4 }],
  tempoMap: [
    { start: 0, bpm: 120 },
    { start: 4, bpm: 60 },
  ],
  durationSeconds: 8,
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

describe("setTempoMode loop preservation", () => {
  it("keeps an active loop across a flatten toggle", () => {
    const t = new Transport(varyingScore);
    // loopMeasures(0, 1) → preserve-mode seconds: start=0, end=6
    // After flatten (averageBpm=90): end maps to ~6.667 s, not 6.
    // The bug leaves the loop at the old preserve-seconds, so end stays 6.
    t.loopMeasures(0, 1);
    const loopBefore = t.clock.loop;
    expect(loopBefore).not.toBeNull();
    t.setTempoMode("flatten");
    const loopAfter = t.clock.loop;
    expect(loopAfter).not.toBeNull();
    expect(loopAfter!.start).toBeGreaterThanOrEqual(0);
    expect(loopAfter!.end).toBeGreaterThan(loopAfter!.start);
    expect(loopAfter!.end).toBeLessThanOrEqual(t.score.durationSeconds);
    // The loop end must be re-mapped: 10 beats at 90 bpm = 10/1.5 ≈ 6.667 s,
    // not the original preserve-mode 6 s — this assertion catches the bug.
    expect(loopAfter!.end).toBeGreaterThan(6);
  });

  it("does nothing to the loop when none is set", () => {
    const t = new Transport(varyingScore);
    t.setTempoMode("flatten");
    expect(t.clock.loop).toBeNull();
  });
});

describe("Transport onScoreChange", () => {
  it("notifies subscribers when setTempoMode swaps the score reference", () => {
    const t = new Transport(varyingScore);
    const seen: Score[] = [];
    t.onScoreChange((s) => seen.push(s));
    t.setTempoMode("flatten");
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(t.score);
    // The new score is in the post-flatten time space — its measures match
    // the clock & loop the subscriber sees at notification time.
    expect(seen[0].durationSeconds).toBeCloseTo(t.score.durationSeconds, 6);
  });

  it("unsubscribes cleanly", () => {
    const t = new Transport(varyingScore);
    const seen: Score[] = [];
    const off = t.onScoreChange((s) => seen.push(s));
    off();
    t.setTempoMode("flatten");
    expect(seen).toHaveLength(0);
  });

  it("does not fire when settings other than tempo mode change", () => {
    const t = new Transport(varyingScore);
    const seen: Score[] = [];
    t.onScoreChange((s) => seen.push(s));
    t.setBpm(140);
    t.loopMeasures(0, 0);
    t.clearLoop();
    expect(seen).toHaveLength(0);
  });
});
