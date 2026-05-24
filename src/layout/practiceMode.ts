/** Which tab the practice screen is on. */
export type TabMode = "play" | "midi";

/** All tabs, in switcher order. */
export const TAB_MODES: readonly TabMode[] = ["play", "midi"];

/** The Practice tab's layout: the reading-lane backdrop, or a side-by-side split. */
export type PracticeLayout = "lane" | "split" | "falldown" | "score";

/** The reading lane's visual theme: dark with light notation, or a paper sheet. */
export type LaneTheme = "dark" | "paper";
