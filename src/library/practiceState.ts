import type { Transport } from "../transport/transport";
import type { HandState } from "../practice/hands";
import type { StoredPracticeState } from "./db";

/** Read the current tempo, loop, hand, and beat settings into a plain object. */
export function capturePracticeState(
  transport: Transport,
  hands: HandState,
  beat?: { numerator: number; denominator: number; subdivision: number },
): StoredPracticeState {
  const loop = transport.clock.loop;
  return {
    bpm: transport.bpm,
    loop: loop ? { start: loop.start, end: loop.end } : null,
    leftMuted: hands.isMuted("left"),
    rightMuted: hands.isMuted("right"),
    leftHidden: hands.isHidden("left"),
    rightHidden: hands.isHidden("right"),
    ...(beat && {
      numerator: beat.numerator,
      denominator: beat.denominator,
      subdivision: beat.subdivision,
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
  hands.setHidden("left", state.leftHidden);
  hands.setHidden("right", state.rightHidden);
}
