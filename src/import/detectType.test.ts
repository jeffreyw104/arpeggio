import { describe, it, expect } from "vitest";
import { detectType } from "./detectType";

const bytesOf = (s: string) => new TextEncoder().encode(s);

describe("detectType", () => {
  it("detects MIDI from the MThd magic bytes", () => {
    const midi = new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0x00, 0x00]);
    expect(detectType("song.mid", midi)).toBe("midi");
  });

  it("detects MusicXML from score-partwise content", () => {
    const xml = bytesOf('<?xml version="1.0"?><score-partwise version="4.0">');
    expect(detectType("song.musicxml", xml)).toBe("musicxml");
  });

  it("detects MusicXML from score-timewise content", () => {
    const xml = bytesOf('<?xml version="1.0"?><score-timewise>');
    expect(detectType("song.xml", xml)).toBe("musicxml");
  });

  it("returns unknown for unrecognized content", () => {
    expect(detectType("notes.txt", bytesOf("hello world"))).toBe("unknown");
  });

  it("detects a compressed .mxl from the zip header", () => {
    // .mxl is compressed MusicXML; the "PK" zip magic bytes identify it.
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    expect(detectType("song.mxl", zip)).toBe("mxl");
  });
});
