import { describe, it, expect } from "vitest";
import { TAB_MODES, type TabMode } from "./practiceMode";

describe("practiceMode", () => {
  it("lists Play and MIDI in order", () => {
    expect(TAB_MODES).toEqual(["play", "midi"]);
  });

  it("TabMode admits exactly the two modes", () => {
    const modes: TabMode[] = ["play", "midi"];
    expect(modes).toHaveLength(2);
  });
});
