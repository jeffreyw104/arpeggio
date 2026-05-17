import { describe, it, expect } from "vitest";
import { measureElementCount } from "./verovio";

describe("measureElementCount", () => {
  it("counts <g> elements with class 'measure' in an SVG string", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <g class="measure" id="m1"></g>
      <g class="staff"></g>
      <g class="measure" id="m2"></g>
    </svg>`;
    expect(measureElementCount(svg)).toBe(2);
  });

  it("returns 0 when there are no measures", () => {
    expect(measureElementCount("<svg></svg>")).toBe(0);
  });
});
