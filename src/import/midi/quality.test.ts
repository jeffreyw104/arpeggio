import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseMidi } from "./parseMidi";
import { detectMidiQuality } from "./quality";

const load = (name: string) => {
  const b = readFileSync(`src/test/fixtures/${name}`);
  return parseMidi(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};

describe("detectMidiQuality", () => {
  it("does not flag cleanly-sequenced MIDI", () => {
    const result = detectMidiQuality(load("clean.mid"));
    expect(result.isLivePerformance).toBe(false);
    expect(result.warning).toBeNull();
  });

  it("flags a jittery, dynamically varied performance", () => {
    const result = detectMidiQuality(load("performance.mid"));
    expect(result.isLivePerformance).toBe(true);
    expect(result.warning).toBeTypeOf("string");
    expect(result.warning).toMatch(/performance/i);
  });
});
