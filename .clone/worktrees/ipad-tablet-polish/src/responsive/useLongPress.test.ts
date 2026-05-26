import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type React from "react";
import { useLongPress } from "./useLongPress";

describe("useLongPress", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function pe(type: string, init: Partial<PointerEvent> = {}): React.PointerEvent {
    return Object.assign(
      { type, clientX: 0, clientY: 0, target: document.createElement("div") },
      init,
    ) as unknown as React.PointerEvent;
  }

  test("fires onLongPress after threshold", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress, { thresholdMs: 500 }));
    result.current.onPointerDown(pe("pointerdown", { clientX: 10, clientY: 20 }));
    vi.advanceTimersByTime(500);
    expect(onLongPress).toHaveBeenCalledOnce();
    expect(onLongPress.mock.calls[0][0]).toMatchObject({ clientX: 10, clientY: 20 });
  });

  test("does not fire if pointerup before threshold", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));
    result.current.onPointerDown(pe("pointerdown"));
    vi.advanceTimersByTime(200);
    result.current.onPointerUp(pe("pointerup"));
    vi.advanceTimersByTime(1000);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  test("cancels on pointermove beyond tolerance", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() =>
      useLongPress(onLongPress, { thresholdMs: 500, moveTolerancePx: 8 }),
    );
    result.current.onPointerDown(pe("pointerdown", { clientX: 0, clientY: 0 }));
    result.current.onPointerMove(pe("pointermove", { clientX: 20, clientY: 0 }));
    vi.advanceTimersByTime(500);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  test("cancels on pointercancel", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));
    result.current.onPointerDown(pe("pointerdown"));
    result.current.onPointerCancel(pe("pointercancel"));
    vi.advanceTimersByTime(1000);
    expect(onLongPress).not.toHaveBeenCalled();
  });
});
