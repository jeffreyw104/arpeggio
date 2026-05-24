import { useEffect, useReducer } from "react";
import type { Transport } from "../transport/transport";
import type { AudioEngine } from "../audio/engine";
import type { TabMode } from "../layout/practiceMode";
import {
  measureAt,
  loopMeasureRange,
} from "../transport/measureMap";

interface TopBarReadoutProps {
  mode: TabMode;
  transport: Transport;
  audioEngine: AudioEngine | null;
}

/**
 * The live chip group that fills the top-bar slack region. Reads tempo,
 * time-signature, current-measure, and active-loop range from the transport
 * and audio engine, re-rendering on every clock change. The wait-mode pill
 * is added in a follow-up task.
 */
export function TopBarReadout({
  // mode is unused until Task 6 adds the wait pill
  transport,
  audioEngine,
}: TopBarReadoutProps): React.JSX.Element {
  const [, forceUpdate] = useReducer((n: number) => n + 1, 0);
  useEffect(() => transport.clock.onChange(forceUpdate), [transport]);

  const bpm = Math.round(transport.bpm);
  const sig = audioEngine?.metronome.timeSignature;
  const totalMeasures = transport.score.measures.length;
  const currentMeasure =
    totalMeasures > 0 ? measureAt(transport, transport.clock.position) + 1 : 0;
  const loopRange = loopMeasureRange(transport);

  return (
    <div className="top-bar-readout">
      <span className="top-bar-readout-chip">♩ = {bpm}</span>
      {sig && (
        <span className="top-bar-readout-chip">
          {sig.numerator}/{sig.denominator}
        </span>
      )}
      {totalMeasures > 0 && (
        <span className="top-bar-readout-chip">
          m. {currentMeasure} / {totalMeasures}
        </span>
      )}
      {loopRange && (
        <span className="top-bar-readout-chip top-bar-readout-chip--loop">
          ↻ m.{loopRange.first + 1}–{loopRange.last + 1}
        </span>
      )}
    </div>
  );
}
