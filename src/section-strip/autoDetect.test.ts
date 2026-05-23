import { describe, it, expect } from "vitest";
import { autoDetect } from "./autoDetect";
import type { Score } from "../model/score";

function baseScore(partial: Partial<Score> = {}): Score {
  return {
    source: "midi",
    notes: [],
    measures: [],
    pedalEvents: [],
    timeSignatures: [{ start: 0, numerator: 4, denominator: 4 }],
    tempoMap: [{ start: 0, bpm: 120 }],
    durationSeconds: 0,
    musicXml: "",
    qualityWarning: null,
    ...partial,
  };
}

function fourFourMeasures(count: number, beatsPerSec = 2): Score["measures"] {
  // Each measure has 4 beats; at beatsPerSec = 2 (120 bpm), each measure = 2 seconds.
  const secondsPerMeasure = 4 / beatsPerSec;
  return Array.from({ length: count }, (_, i) => ({
    index: i,
    start: i * secondsPerMeasure,
    end: (i + 1) * secondsPerMeasure,
    numerator: 4,
    denominator: 4,
  }));
}

describe("autoDetect — fallback", () => {
  it("returns a single 'Whole piece' section when score is empty", () => {
    const score = baseScore({ durationSeconds: 30, measures: fourFourMeasures(15) });
    const state = autoDetect(score);
    expect(state.sections).toHaveLength(1);
    expect(state.sections[0]).toMatchObject({ start: 0, end: 30 });
    expect(state.bookmarks).toEqual([]);
  });
});

describe("autoDetect — Pass 1 markers", () => {
  it("uses marker times as boundaries and marker text as names", () => {
    const measures = fourFourMeasures(20); // 40 sec total
    const score = baseScore({
      durationSeconds: 40,
      measures,
      midiMarkers: [
        { time: 0, text: "Intro" },
        { time: 16, text: "Verse" },
        { time: 32, text: "Outro" },
      ],
    });
    const state = autoDetect(score);
    expect(state.sections.map((s) => s.name)).toEqual(["Intro", "Verse", "Outro"]);
    // Boundaries snap to nearest measure starts.
    expect(state.sections[0].start).toBe(0);
    expect(state.sections[1].start).toBe(16);
    expect(state.sections[2].start).toBe(32);
    expect(state.sections.at(-1)?.end).toBe(40);
  });

  it("snaps marker times to the nearest measure start", () => {
    const measures = fourFourMeasures(20);
    const score = baseScore({
      durationSeconds: 40,
      measures,
      midiMarkers: [
        { time: 0, text: "A" },
        { time: 16.6, text: "B" }, // closest measure start: 16
      ],
    });
    const state = autoDetect(score);
    expect(state.sections[1].start).toBe(16);
  });
});

describe("autoDetect — Pass 1 tempo changes", () => {
  it("splits at a tempo change >= 8% delta", () => {
    const measures = fourFourMeasures(20, 2); // 2 sec/measure at 120 bpm
    const score = baseScore({
      durationSeconds: 40,
      measures,
      tempoMap: [
        { start: 0, bpm: 120 },
        { start: 20, bpm: 140 }, // +16.7% — triggers
      ],
    });
    const state = autoDetect(score);
    expect(state.sections.length).toBeGreaterThanOrEqual(2);
    const boundaryTimes = state.sections.map((s) => s.start);
    expect(boundaryTimes).toContain(20);
  });

  it("does not split at a small tempo change (< 8%)", () => {
    const measures = fourFourMeasures(20, 2);
    const score = baseScore({
      durationSeconds: 40,
      measures,
      tempoMap: [
        { start: 0, bpm: 120 },
        { start: 20, bpm: 124 }, // +3.3% — ignored
      ],
    });
    const state = autoDetect(score);
    expect(state.sections.length).toBe(1);
  });
});

describe("autoDetect — Pass 1 time-signature changes", () => {
  it("splits at a time-signature change between adjacent measures", () => {
    const measures = [
      ...fourFourMeasures(5, 2),  // 5 measures of 4/4
      // Switch to 3/4 from measure 5 onward.
      ...Array.from({ length: 5 }, (_, i) => ({
        index: 5 + i,
        start: 10 + i * 1.5,
        end: 10 + (i + 1) * 1.5,
        numerator: 3,
        denominator: 4,
      })),
    ];
    const score = baseScore({
      durationSeconds: 17.5,
      measures,
    });
    const state = autoDetect(score);
    expect(state.sections.length).toBeGreaterThanOrEqual(2);
    expect(state.sections.map((s) => s.start)).toContain(10);
  });
});
