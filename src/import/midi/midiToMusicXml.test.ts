import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { Midi } from "@tonejs/midi";
import { parseMidi } from "./parseMidi";
import { midiToMusicXml } from "./midiToMusicXml";
import { parseMusicXml } from "../musicxml/parseMusicXml";

const cleanBuf = readFileSync("src/test/fixtures/clean.mid");
const score = parseMidi(
  cleanBuf.buffer.slice(
    cleanBuf.byteOffset,
    cleanBuf.byteOffset + cleanBuf.byteLength,
  ),
);

/** Build a Score with two overlapping right-hand notes (held note + later note). */
function overlappingScore() {
  const midi = new Midi();
  midi.header.setTempo(120);
  const t = midi.addTrack();
  t.addNote({ midi: 72, time: 0, duration: 2.0, velocity: 0.7 });
  t.addNote({ midi: 76, time: 1.0, duration: 1.0, velocity: 0.7 });
  const buf = new Uint8Array(midi.toArray());
  return parseMidi(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  );
}

describe("midiToMusicXml", () => {
  it("produces well-formed XML with a score-partwise root", () => {
    const xml = midiToMusicXml(score);
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    expect(doc.querySelector("parsererror")).toBeNull();
    expect(doc.documentElement.nodeName).toBe("score-partwise");
  });

  it("emits two staves and a measure per bar of the score", () => {
    const xml = midiToMusicXml(score);
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    expect(doc.querySelector("staves")?.textContent).toBe("2");
    expect(doc.querySelectorAll("measure").length).toBe(score.measures.length);
  });

  it("emits at least one pitched note", () => {
    const xml = midiToMusicXml(score);
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    expect(doc.querySelectorAll("note > pitch").length).toBeGreaterThan(0);
  });

  it("round-trips: the output parses without a parser error", () => {
    const xml = midiToMusicXml(score);
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    expect(doc.querySelector("parsererror")).toBeNull();
  });

  it("output is consumable by parseMusicXml", () => {
    const xml = midiToMusicXml(score);
    const reparsed = parseMusicXml(xml);
    expect(reparsed.source).toBe("musicxml");
    expect(reparsed.notes.length).toBeGreaterThan(0);
  });

  it("never emits a measure that overflows its bar length", () => {
    const overlapping = overlappingScore();
    const xml = midiToMusicXml(overlapping);
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    expect(doc.querySelector("parsererror")).toBeNull();

    const divisions = 4;
    const timeSig = overlapping.timeSignatures[0] ?? {
      numerator: 4,
      denominator: 4,
    };
    const barUnits =
      (divisions * 4 * timeSig.numerator) / timeSig.denominator;

    const measures = Array.from(doc.querySelectorAll("measure"));
    expect(measures.length).toBeGreaterThan(0);
    for (const measure of measures) {
      for (const staff of ["1", "2"]) {
        let sum = 0;
        for (const note of Array.from(measure.querySelectorAll("note"))) {
          if (note.querySelector("chord")) continue;
          if (note.querySelector("staff")?.textContent !== staff) continue;
          sum += Number(note.querySelector("duration")?.textContent ?? "0");
        }
        expect(sum).toBeLessThanOrEqual(barUnits);
        expect(sum).toBe(barUnits);
      }
    }
  });
});
