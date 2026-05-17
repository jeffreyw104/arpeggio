import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
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
});
