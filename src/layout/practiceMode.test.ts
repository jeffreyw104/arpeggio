import { describe, it, expect } from "vitest";
import { PRACTICE_MODES, type PracticeMode } from "./practiceMode";

describe("practiceMode", () => {
  it("lists Play and Practice in order", () => {
    expect(PRACTICE_MODES).toEqual(["play", "practice"]);
  });

  it("PracticeMode admits exactly the two modes", () => {
    const modes: PracticeMode[] = ["play", "practice"];
    expect(modes).toHaveLength(2);
  });
});
