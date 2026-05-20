import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { Midi } from "@tonejs/midi";
import { parseMidi } from "./parseMidi";

// Node's readFileSync returns a Buffer that may share a larger pooled
// ArrayBuffer — slice to the exact file bytes before handing it to parseMidi.
const load = (name: string): ArrayBuffer => {
  const b = readFileSync(`src/test/fixtures/${name}`);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

/** Serialize an in-memory Midi to an ArrayBuffer for parseMidi. */
const toBuffer = (midi: Midi): ArrayBuffer => {
  const buf = new Uint8Array(midi.toArray());
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
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

  it("parses the polyrhythm fixture with triplet right-hand starts", () => {
    const score = parseMidi(load("polyrhythm.mid"));
    expect(score.notes).toHaveLength(5);
    const rh = score.notes
      .filter((n) => n.hand === "right")
      .map((n) => n.start)
      .sort((a, b) => a - b);
    expect(rh).toHaveLength(3);
    expect(rh[0]).toBeCloseTo(0, 2);
    expect(rh[1]).toBeCloseTo(0.667, 2);
    expect(rh[2]).toBeCloseTo(1.333, 2);
  });

  it("splits a single track around middle C into hands", () => {
    const midi = new Midi();
    midi.header.setTempo(120);
    const track = midi.addTrack();
    for (const m of [48, 55, 64, 72]) {
      track.addNote({ midi: m, time: 0, duration: 0.5, velocity: 0.7 });
    }
    const score = parseMidi(toBuffer(midi));
    expect(score.notes).toHaveLength(4);
    for (const note of score.notes) {
      expect(note.hand).toBe(note.midi >= 60 ? "right" : "left");
    }
  });

  it("pairs CC-64 sustain-pedal events", () => {
    const midi = new Midi();
    midi.header.setTempo(120);
    const track = midi.addTrack();
    track.addNote({ midi: 60, time: 0, duration: 1.0, velocity: 0.7 });
    track.addCC({ number: 64, value: 1, time: 0.0 });
    track.addCC({ number: 64, value: 0, time: 1.0 });
    const score = parseMidi(toBuffer(midi));
    expect(score.pedalEvents).toHaveLength(1);
    expect(score.pedalEvents[0].start).toBeCloseTo(0, 2);
    expect(score.pedalEvents[0].end).toBeCloseTo(1.0, 2);
  });
});
