import { describe, test, expect, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useIsNarrowViewport } from "./useIsNarrowViewport";

describe("useIsNarrowViewport", () => {
  const originalInnerWidth = window.innerWidth;

  afterEach(() => {
    Object.defineProperty(window, "innerWidth", {
      value: originalInnerWidth,
      configurable: true,
    });
  });

  function setWidth(w: number): void {
    Object.defineProperty(window, "innerWidth", { value: w, configurable: true });
    window.dispatchEvent(new Event("resize"));
  }

  test("returns true when width below threshold", () => {
    setWidth(800);
    const { result } = renderHook(() => useIsNarrowViewport(1024));
    expect(result.current).toBe(true);
  });

  test("returns false when width at or above threshold", () => {
    setWidth(1366);
    const { result } = renderHook(() => useIsNarrowViewport(1024));
    expect(result.current).toBe(false);
  });

  test("updates on resize", () => {
    setWidth(1200);
    const { result } = renderHook(() => useIsNarrowViewport(1024));
    expect(result.current).toBe(false);
    act(() => setWidth(800));
    expect(result.current).toBe(true);
  });
});
