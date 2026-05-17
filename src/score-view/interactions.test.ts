import { describe, it, expect } from "vitest";
import { measureIndexFromTarget, orderedRange } from "./interactions";

describe("measureIndexFromTarget", () => {
  it("reads data-measure-index from the target itself", () => {
    const el = document.createElement("div");
    el.setAttribute("data-measure-index", "3");
    expect(measureIndexFromTarget(el)).toBe(3);
  });

  it("walks up to the nearest tagged ancestor", () => {
    const measure = document.createElement("g");
    measure.setAttribute("data-measure-index", "5");
    const note = document.createElement("g");
    measure.appendChild(note);
    const head = document.createElement("path");
    note.appendChild(head);
    expect(measureIndexFromTarget(head)).toBe(5);
  });

  it("returns null when no ancestor is a measure", () => {
    const el = document.createElement("div");
    expect(measureIndexFromTarget(el)).toBeNull();
    expect(measureIndexFromTarget(null)).toBeNull();
  });
});

describe("orderedRange", () => {
  it("orders a forward or backward drag into [first, last]", () => {
    expect(orderedRange(2, 5)).toEqual({ first: 2, last: 5 });
    expect(orderedRange(5, 2)).toEqual({ first: 2, last: 5 });
    expect(orderedRange(3, 3)).toEqual({ first: 3, last: 3 });
  });
});
