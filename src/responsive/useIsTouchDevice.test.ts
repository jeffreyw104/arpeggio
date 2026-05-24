import { describe, test, expect, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useIsTouchDevice } from "./useIsTouchDevice";

describe("useIsTouchDevice", () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(
    Navigator.prototype,
    "maxTouchPoints",
  );

  afterEach(() => {
    if (originalDescriptor) {
      Object.defineProperty(Navigator.prototype, "maxTouchPoints", originalDescriptor);
    }
  });

  test("returns true when maxTouchPoints > 1", () => {
    Object.defineProperty(Navigator.prototype, "maxTouchPoints", {
      value: 5,
      configurable: true,
    });
    const { result } = renderHook(() => useIsTouchDevice());
    expect(result.current).toBe(true);
  });

  test("returns false when maxTouchPoints is 0", () => {
    Object.defineProperty(Navigator.prototype, "maxTouchPoints", {
      value: 0,
      configurable: true,
    });
    const { result } = renderHook(() => useIsTouchDevice());
    expect(result.current).toBe(false);
  });
});
