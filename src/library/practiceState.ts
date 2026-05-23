import type { Transport } from "../transport/transport";
import type { HandState } from "../practice/hands";
import type { StoredPracticeState } from "./db";
import type { TabMode } from "../layout/practiceMode";
import type { SectionState } from "../model/sections";
import { captureTab, type TabSnapshot } from "../transport/tabSnapshot";

/** Read the current tempo, loop, hand, and session settings. */
export function capturePracticeState(
  transport: Transport,
  hands: HandState,
  beat?: { numerator: number; denominator: number; subdivision: number },
  session?: {
    mode: TabMode;
    tabs?: Record<TabMode, { bpm: number; loop: { start: number; end: number } | null }>;
  },
  sectionState?: SectionState,
): StoredPracticeState {
  const loop = transport.clock.loop;
  return {
    bpm: transport.bpm,
    loop: loop ? { start: loop.start, end: loop.end } : null,
    leftMuted: hands.isMuted("left"),
    rightMuted: hands.isMuted("right"),
    leftVisibility: hands.visibility("left"),
    rightVisibility: hands.visibility("right"),
    ...(beat && {
      numerator: beat.numerator,
      denominator: beat.denominator,
      subdivision: beat.subdivision,
    }),
    ...(session && {
      mode: session.mode,
      ...(session.tabs && {
        tabs: {
          play: {
            bpm: session.tabs.play.bpm,
            loop: session.tabs.play.loop
              ? { ...session.tabs.play.loop }
              : null,
          },
          midi: {
            bpm: session.tabs.midi.bpm,
            loop: session.tabs.midi.loop
              ? { ...session.tabs.midi.loop }
              : null,
          },
        },
      }),
    }),
    ...(sectionState && { sectionState }),
  };
}

/** Apply a stored practice state onto the live transport and hand state. */
export function applyPracticeState(
  state: StoredPracticeState,
  transport: Transport,
  hands: HandState,
): void {
  transport.setBpm(state.bpm);
  transport.clock.setLoop(state.loop ? { ...state.loop } : null);
  hands.setMuted("left", state.leftMuted);
  hands.setMuted("right", state.rightMuted);
  hands.setVisibility(
    "left",
    state.leftVisibility ?? (state.leftHidden ? "hide" : "show"),
  );
  hands.setVisibility(
    "right",
    state.rightVisibility ?? (state.rightHidden ? "hide" : "show"),
  );
}

/**
 * Build the per-tab snapshots for a freshly-opened piece. With stored per-tab
 * state, each tab uses it and starts at position 0 (position is not persisted).
 * Without it, both tabs seed from the live transport — sharing its current
 * position and baseline bpm/loop.
 */
export function seedTabSnapshots(
  transport: Transport,
  state: StoredPracticeState | null,
): Record<TabMode, TabSnapshot> {
  if (!state?.tabs) {
    const base = captureTab(transport);
    return { play: { ...base }, midi: { ...base } };
  }
  return {
    play: {
      position: 0,
      bpm: state.tabs.play.bpm,
      loop: state.tabs.play.loop ? { ...state.tabs.play.loop } : null,
    },
    midi: {
      position: 0,
      bpm: state.tabs.midi.bpm,
      loop: state.tabs.midi.loop ? { ...state.tabs.midi.loop } : null,
    },
  };
}
