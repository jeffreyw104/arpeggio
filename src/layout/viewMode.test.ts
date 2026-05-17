import { describe, it, expect } from "vitest";
import { VIEW_MODES, nextViewMode, type ViewMode } from "./viewMode";

describe("viewMode", () => {
  it("lists the three modes", () => {
    expect(VIEW_MODES).toEqual(["both", "falldown", "score"]);
  });

  it("cycles through the modes and wraps", () => {
    let m: ViewMode = "both";
    m = nextViewMode(m);
    expect(m).toBe("falldown");
    m = nextViewMode(m);
    expect(m).toBe("score");
    m = nextViewMode(m);
    expect(m).toBe("both");
  });
});
