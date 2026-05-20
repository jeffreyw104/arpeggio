import { describe, it, expect } from "vitest";
import { pageForMeasure } from "./measurePaging";

describe("pageForMeasure", () => {
  it("groups consecutive measures into fixed-size pages", () => {
    expect(pageForMeasure(0, 4)).toEqual({ first: 0, last: 3 });
    expect(pageForMeasure(3, 4)).toEqual({ first: 0, last: 3 });
    expect(pageForMeasure(4, 4)).toEqual({ first: 4, last: 7 });
    expect(pageForMeasure(11, 4)).toEqual({ first: 8, last: 11 });
  });

  it("supports page size of one", () => {
    expect(pageForMeasure(7, 1)).toEqual({ first: 7, last: 7 });
  });
});
