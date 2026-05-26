import { describe, it, expect } from "vitest";
import { formatRelative } from "./relativeTime";

const NOW = new Date("2026-05-26T12:00:00Z").getTime();
const DAY = 24 * 60 * 60 * 1000;

describe("formatRelative", () => {
  it("returns 'today' for the same day", () => {
    expect(formatRelative(NOW, NOW)).toBe("today");
    expect(formatRelative(NOW - 3 * 60 * 60 * 1000, NOW)).toBe("today");
  });

  it("returns 'yesterday' for the previous day", () => {
    expect(formatRelative(NOW - DAY, NOW)).toBe("yesterday");
  });

  it("returns 'N days ago' for 2-6 days", () => {
    expect(formatRelative(NOW - 2 * DAY, NOW)).toBe("2 days ago");
    expect(formatRelative(NOW - 6 * DAY, NOW)).toBe("6 days ago");
  });

  it("returns 'N weeks ago' for 7-27 days", () => {
    expect(formatRelative(NOW - 7 * DAY, NOW)).toBe("1 week ago");
    expect(formatRelative(NOW - 14 * DAY, NOW)).toBe("2 weeks ago");
    expect(formatRelative(NOW - 27 * DAY, NOW)).toBe("3 weeks ago");
  });

  it("returns 'N months ago' for 28+ days", () => {
    expect(formatRelative(NOW - 28 * DAY, NOW)).toBe("1 month ago");
    expect(formatRelative(NOW - 60 * DAY, NOW)).toBe("2 months ago");
    expect(formatRelative(NOW - 365 * DAY, NOW)).toBe("12 months ago");
  });

  it("uses the system clock when no `now` arg is supplied", () => {
    // Same-second call should always be 'today'.
    expect(formatRelative(Date.now())).toBe("today");
  });
});
