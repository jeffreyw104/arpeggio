/** Which session mode the practice screen is in. */
export type PracticeMode = "play" | "practice";

/** All practice modes, in switcher order. Designed so a third could be added. */
export const PRACTICE_MODES: readonly PracticeMode[] = ["play", "practice"];
