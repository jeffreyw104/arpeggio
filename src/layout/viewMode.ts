/** Which panels the practice view shows. */
export type ViewMode = "both" | "falldown" | "score";

/** All view modes, in toggle order. */
export const VIEW_MODES: readonly ViewMode[] = ["both", "falldown", "score"];

/** The next view mode in the cycle, wrapping around. */
export function nextViewMode(mode: ViewMode): ViewMode {
  const i = VIEW_MODES.indexOf(mode);
  return VIEW_MODES[(i + 1) % VIEW_MODES.length];
}
