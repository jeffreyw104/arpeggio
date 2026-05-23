export type StripPosition = "top" | "bottom";

const KEY = "arpeggio.stripPosition";

export function loadStripPosition(): StripPosition {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === "top" || raw === "bottom") return raw;
  } catch {
    // Storage may be unavailable in some test contexts; fall through.
  }
  return "bottom";
}

export function saveStripPosition(p: StripPosition): void {
  try {
    localStorage.setItem(KEY, p);
  } catch {
    // Best-effort.
  }
}
