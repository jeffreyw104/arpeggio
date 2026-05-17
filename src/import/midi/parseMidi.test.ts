import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseMidi } from "./parseMidi";

// Node's readFileSync returns a Buffer that may share a larger pooled
// ArrayBuffer — slice to the exact file bytes before handing it to parseMidi.
const load = (name: string): ArrayBuffer => {
  const b = readFileSync(`src/test/fixtures/${name}`);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

describe("parseMidi", () => {
  it("extracts all notes from the clean fixture", () => {
    const score = parseMidi(load("clean.mid"));
    expect(score.source).toBe("midi");
    expect(score.notes).toHaveLength(10);
  });

  it("keeps notes sorted by start time", () => {
    const score = parseMidi(load("clean.mid"));
    const starts = score.notes.map((n) => n.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it("assigns the higher track to the right hand, lower to the left", () => {
    const score = parseMidi(load("clean.mid"));
    const right = score.notes.filter((n) => n.hand === "right");
    const left = score.notes.filter((n) => n.hand === "left");
    expect(right).toHaveLength(8); // the scale
    expect(left).toHaveLength(2); // the bass notes
    expect(Math.min(...right.map((n) => n.midi))).toBeGreaterThan(
      Math.max(...left.map((n) => n.midi)),
    );
  });

  it("reads the tempo and computes piece duration", () => {
    const score = parseMidi(load("clean.mid"));
    expect(score.tempoMap[0].bpm).toBeCloseTo(120, 0);
    // last RH note starts at 3.5 s, lasts 0.5 s.
    expect(score.durationSeconds).toBeCloseTo(4, 1);
  });

  it("produces at least one measure and one time signature", () => {
    const score = parseMidi(load("clean.mid"));
    expect(score.measures.length).toBeGreaterThan(0);
    expect(score.timeSignatures.length).toBeGreaterThan(0);
    expect(score.measures[0].start).toBe(0);
  });
});
