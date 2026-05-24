import { useRef } from "react";
import type React from "react";

export interface LongPressEvent {
  clientX: number;
  clientY: number;
  target: EventTarget;
}

export interface UseLongPressOptions {
  thresholdMs?: number;
  moveTolerancePx?: number;
}

export interface LongPressHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
}

/**
 * Fire `onLongPress` after a pointer is held down for `thresholdMs` without
 * moving more than `moveTolerancePx` in any direction. Coordinates passed
 * to the callback are the original pointerdown coordinates.
 *
 * Note: the returned handlers object is recreated on every render. Spread
 * it directly into JSX props (the common case) — React reconciles per-render
 * handlers cleanly. If you cache the object (e.g., as `useEffect` deps), the
 * effect must include the returned object in its dependency list to avoid
 * stale closures.
 */
export function useLongPress(
  onLongPress: (e: LongPressEvent) => void,
  options: UseLongPressOptions = {},
): LongPressHandlers {
  const { thresholdMs = 500, moveTolerancePx = 8 } = options;
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<{ x: number; y: number; target: EventTarget } | null>(null);

  function cancel(): void {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startRef.current = null;
  }

  return {
    onPointerDown(e) {
      cancel();
      startRef.current = { x: e.clientX, y: e.clientY, target: e.target };
      timerRef.current = window.setTimeout(() => {
        if (startRef.current) {
          onLongPress({
            clientX: startRef.current.x,
            clientY: startRef.current.y,
            target: startRef.current.target,
          });
        }
        cancel();
      }, thresholdMs);
    },
    onPointerMove(e) {
      const s = startRef.current;
      if (!s) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (Math.hypot(dx, dy) > moveTolerancePx) cancel();
    },
    onPointerUp() { cancel(); },
    onPointerCancel() { cancel(); },
  };
}
