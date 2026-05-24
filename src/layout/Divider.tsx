import { useEffect, useState } from "react";

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

export type DividerOrientation = "vertical" | "horizontal";

export interface DividerProps {
  /** Current split fraction (0-1). */
  fraction: number;
  /** Reports the new split fraction while the user drags. */
  onChange: (fraction: number) => void;
  /** Drag axis. `"vertical"` resizes width (clientX/innerWidth); `"horizontal"`
   *  resizes height (clientY/innerHeight). Default `"vertical"`. */
  orientation?: DividerOrientation;
}

/**
 * A thin bar the user drags to resize the split.
 *
 * Controlled component: it does not store the fraction itself, it only
 * reports the new value via `onChange` during a drag.
 */
export function Divider({ fraction, onChange, orientation = "vertical" }: DividerProps) {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return;

    function handleMouseMove(e: MouseEvent) {
      const value =
        orientation === "vertical"
          ? e.clientX / window.innerWidth
          : e.clientY / window.innerHeight;
      onChange(clamp(value, 0.15, 0.85));
    }
    function handleMouseUp() {
      setDragging(false);
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, onChange, orientation]);

  return (
    <div
      role="separator"
      aria-orientation={orientation}
      aria-valuenow={Math.round(fraction * 100)}
      className={`divider divider--${orientation}`}
      onMouseDown={() => setDragging(true)}
    />
  );
}
