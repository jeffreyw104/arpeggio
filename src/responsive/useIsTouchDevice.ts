import { useMemo } from "react";

/**
 * Returns true if the current device reports multi-touch capability.
 * Stable per session — reads once on mount; no resize/orientation listener.
 * Reliable across iPadOS Safari's desktop-spoof UA (where UA sniffing fails).
 */
export function useIsTouchDevice(): boolean {
  return useMemo(() => detect(), []);
}

function detect(): boolean {
  if (typeof navigator === "undefined") return false;
  return (navigator.maxTouchPoints ?? 0) > 1;
}
