import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { zipSync } from "fflate";
import { importFile } from "./importFile";

const fileOf = (name: string, type = "") =>
  new File([readFileSync(`src/test/fixtures/${name}`)], name, { type });

describe("importFile", () => {
  it("imports a MIDI file into a Score with an engraved MusicXML", async () => {
    const score = await importFile(fileOf("clean.mid"));
    expect(score.source).toBe("midi");
    expect(score.notes).toHaveLength(10);
    expect(score.musicXml).toContain("score-partwise");
    expect(score.qualityWarning).toBeNull(); // clean fixture
  });

  it("flags a live-performance MIDI", async () => {
    const score = await importFile(fileOf("performance.mid"));
    expect(score.qualityWarning).toMatch(/performance/i);
  });

  it("imports a MusicXML file directly", async () => {
    const score = await importFile(fileOf("simple.musicxml"));
    expect(score.source).toBe("musicxml");
    expect(score.notes).toHaveLength(8);
    expect(score.musicXml).toContain("score-partwise");
  });

  it("imports a compressed .mxl file", async () => {
    const xml = readFileSync("src/test/fixtures/simple.musicxml");
    const container =
      '<?xml version="1.0" encoding="UTF-8"?>' +
      "<container><rootfiles>" +
      '<rootfile full-path="score.musicxml" media-type="application/vnd.recordare.musicxml+xml"/>' +
      "</rootfiles></container>";
    const zipped = zipSync({
      "META-INF/container.xml": new TextEncoder().encode(container),
      "score.musicxml": new Uint8Array(xml),
    });
    const file = new File([zipped], "song.mxl");
    const score = await importFile(file);
    expect(score.source).toBe("musicxml");
    expect(score.notes).toHaveLength(8);
  });

  it("rejects an unrecognized file", async () => {
    const junk = new File(["not a song"], "notes.txt", { type: "text/plain" });
    await expect(importFile(junk)).rejects.toThrow(/unsupported|unrecognized/i);
  });
});
