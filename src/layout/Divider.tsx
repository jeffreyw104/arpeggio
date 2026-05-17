import { useEffect, useState } from "react";

/** Clamp a value into the inclusive range [lo, hi]. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

export interface DividerProps {
  /** Current split fraction (0-1). */
  fraction: number;
  /** Reports the new split fraction while the user drags. */
  onChange: (fraction: number) => void;
}

/**
 * A thin vertical bar the user drags to resize the split.
 *
 * Controlled component: it does not store the fraction itself, it only
 * reports the new value via `onChange` during a drag.
 */
export function Divider({ fraction, onChange }: DividerProps) {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return;

    function handleMouseMove(e: MouseEvent) {
      onChange(clamp(e.clientX / window.innerWidth, 0.15, 0.85));
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
  }, [dragging, onChange]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={Math.round(fraction * 100)}
      className="divider"
      onMouseDown={() => setDragging(true)}
    />
  );
}
