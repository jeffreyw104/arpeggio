import type { Transport } from "../transport/transport";
import type { HandState } from "../practice/hands";
import type { StoredPracticeState } from "./db";
import type { TabMode } from "../layout/practiceMode";

/** Read the current tempo, loop, hand, and session settings. */
export function capturePracticeState(
  transport: Transport,
  hands: HandState,
  beat?: { numerator: number; denominator: number; subdivision: number },
  session?: { mode: TabMode; hudCollapsed?: boolean },
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
      hudCollapsed: session.hudCollapsed,
    }),
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
