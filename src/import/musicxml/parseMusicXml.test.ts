import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseMusicXml } from "./parseMusicXml";

const xml = readFileSync("src/test/fixtures/simple.musicxml", "utf-8");

describe("parseMusicXml", () => {
  it("parses every note", () => {
    const score = parseMusicXml(xml);
    expect(score.source).toBe("musicxml");
    expect(score.notes).toHaveLength(8);
  });

  it("converts pitches and timing of the right-hand line", () => {
    const score = parseMusicXml(xml);
    const right = score.notes
      .filter((n) => n.hand === "right")
      .sort((a, b) => a.start - b.start);
    expect(right.map((n) => n.midi)).toEqual([72, 74, 76, 77, 79, 81]);
    expect(right[0].start).toBeCloseTo(0, 3);
    expect(right[1].start).toBeCloseTo(0.5, 3);
    expect(right[0].duration).toBeCloseTo(0.5, 3);
    expect(right[4].start).toBeCloseTo(2.0, 3); // G5, measure 2
    expect(right[4].duration).toBeCloseTo(1.0, 3); // half note
  });

  it("assigns staff 2 to the left hand", () => {
    const score = parseMusicXml(xml);
    const left = score.notes.filter((n) => n.hand === "left");
    expect(left.map((n) => n.midi).sort((a, b) => a - b)).toEqual([43, 48]);
  });

  it("reads time signature, tempo, and measures", () => {
    const score = parseMusicXml(xml);
    expect(score.timeSignatures[0]).toMatchObject({ numerator: 4, denominator: 4 });
    expect(score.tempoMap[0].bpm).toBeCloseTo(120, 0);
    expect(score.measures).toHaveLength(2);
    expect(score.durationSeconds).toBeCloseTo(4, 1);
  });

  it("stores the original XML verbatim", () => {
    const score = parseMusicXml(xml);
    expect(score.musicXml).toBe(xml);
    expect(score.qualityWarning).toBeNull();
  });
});
