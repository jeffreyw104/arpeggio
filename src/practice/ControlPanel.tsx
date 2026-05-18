import { useState } from "react";
import type { Transport } from "../transport/transport";
import type { HandState, HandVisibility } from "./hands";
import type { FalldownRenderer } from "../falldown/renderer";

interface ControlPanelProps {
  transport: Transport;
  handState: HandState;
  falldown: FalldownRenderer;
}

/**
 * Imperative-object control panel for practice tooling. Each control keeps a
 * small piece of local state to drive its input, and writes through to the
 * transport / hand state / renderer / audio engine on change.
 */
export function ControlPanel({
  transport,
  handState,
  falldown,
}: ControlPanelProps): React.JSX.Element {
  const [speedUp, setSpeedUp] = useState(false);
  const [showLabels, setShowLabels] = useState(falldown.showLabels);
  const [showBeatGrid, setShowBeatGrid] = useState(falldown.showBeatGrid);
  const [full88, setFull88] = useState(falldown.full88);
  const [flattenTempo, setFlattenTempo] = useState(
    transport.tempoMode === "flatten",
  );
  const [muteLeft, setMuteLeft] = useState(handState.isMuted("left"));
  const [muteRight, setMuteRight] = useState(handState.isMuted("right"));
  const [leftVis, setLeftVis] = useState<HandVisibility>(
    handState.visibility("left"),
  );
  const [rightVis, setRightVis] = useState<HandVisibility>(
    handState.visibility("right"),
  );

  function handleLoopMeasure(): void {
    const pos = transport.clock.position;
    const found = transport.score.measures.findIndex(
      (m) => pos >= m.start && pos < m.end,
    );
    const idx = found === -1 ? 0 : found;
    transport.loopMeasures(idx, idx);
  }

  function handleSpeedUp(checked: boolean): void {
    setSpeedUp(checked);
    if (checked) {
      transport.enableSpeedUp({ startRate: 0.5, targetRate: 1, step: 0.05 });
    } else {
      transport.disableSpeedUp();
    }
  }

  function handleFlattenTempo(checked: boolean): void {
    setFlattenTempo(checked);
    transport.setTempoMode(checked ? "flatten" : "preserve");
  }

  // The falldown renderer exposes plain mutable fields as its API (Task H-T3);
  // the panel writes through to them, mirroring local state for the inputs.
  function handleShowLabels(checked: boolean): void {
    setShowLabels(checked);
    // eslint-disable-next-line react-hooks/immutability
    falldown.showLabels = checked;
  }

  function handleShowBeatGrid(checked: boolean): void {
    setShowBeatGrid(checked);
    // eslint-disable-next-line react-hooks/immutability
    falldown.showBeatGrid = checked;
  }

  function handleFull88(checked: boolean): void {
    setFull88(checked);
    // eslint-disable-next-line react-hooks/immutability
    falldown.full88 = checked;
  }

  return (
    <div className="control-panel">
      <fieldset className="control-group">
        <button type="button" onClick={handleLoopMeasure}>
          Loop measure
        </button>
        <button type="button" onClick={() => transport.clearLoop()}>
          Clear loop
        </button>
        <label>
          <input
            type="checkbox"
            checked={speedUp}
            onChange={(e) => handleSpeedUp(e.target.checked)}
          />{" "}
          Gradual speed-up
        </label>
      </fieldset>

      <fieldset className="control-group">
        <label>
          <input
            type="checkbox"
            checked={showLabels}
            onChange={(e) => handleShowLabels(e.target.checked)}
          />{" "}
          Note labels
        </label>
        <label>
          <input
            type="checkbox"
            checked={showBeatGrid}
            onChange={(e) => handleShowBeatGrid(e.target.checked)}
          />{" "}
          Beat grid
        </label>
        <label>
          <input
            type="checkbox"
            checked={full88}
            onChange={(e) => handleFull88(e.target.checked)}
          />{" "}
          Full 88 keys
        </label>
        <label>
          <input
            type="checkbox"
            checked={flattenTempo}
            onChange={(e) => handleFlattenTempo(e.target.checked)}
          />{" "}
          Flatten tempo changes
        </label>
      </fieldset>

      <fieldset className="control-group">
        <label>
          <input
            type="checkbox"
            checked={muteLeft}
            onChange={(e) => {
              setMuteLeft(e.target.checked);
              handState.setMuted("left", e.target.checked);
            }}
          />{" "}
          Mute left
        </label>
        <label>
          <input
            type="checkbox"
            checked={muteRight}
            onChange={(e) => {
              setMuteRight(e.target.checked);
              handState.setMuted("right", e.target.checked);
            }}
          />{" "}
          Mute right
        </label>
        <label>
          Left hand{" "}
          <select
            value={leftVis}
            onChange={(e) => {
              const v = e.target.value as HandVisibility;
              setLeftVis(v);
              handState.setVisibility("left", v);
            }}
          >
            <option value="show">Show</option>
            <option value="dim">Dim</option>
            <option value="hide">Hide</option>
          </select>
        </label>
        <label>
          Right hand{" "}
          <select
            value={rightVis}
            onChange={(e) => {
              const v = e.target.value as HandVisibility;
              setRightVis(v);
              handState.setVisibility("right", v);
            }}
          >
            <option value="show">Show</option>
            <option value="dim">Dim</option>
            <option value="hide">Hide</option>
          </select>
        </label>
      </fieldset>
    </div>
  );
}
