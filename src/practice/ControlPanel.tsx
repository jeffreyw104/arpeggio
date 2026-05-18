import { useState } from "react";
import type { Transport } from "../transport/transport";
import type { FalldownRenderer } from "../falldown/renderer";

interface ControlPanelProps {
  transport: Transport;
  falldown: FalldownRenderer;
}

/**
 * The settings-drawer panel: display preferences only. Note labels, beat grid,
 * and the full-88 toggle write through to the falldown renderer; flatten tempo
 * writes through to the transport. Practice tooling (loop, speed-up, tempo,
 * hands) lives in the Practice-mode HUD, not here.
 */
export function ControlPanel({
  transport,
  falldown,
}: ControlPanelProps): React.JSX.Element {
  const [showLabels, setShowLabels] = useState(falldown.showLabels);
  const [showBeatGrid, setShowBeatGrid] = useState(falldown.showBeatGrid);
  const [full88, setFull88] = useState(falldown.full88);
  const [flattenTempo, setFlattenTempo] = useState(
    transport.tempoMode === "flatten",
  );

  function handleFlattenTempo(checked: boolean): void {
    setFlattenTempo(checked);
    transport.setTempoMode(checked ? "flatten" : "preserve");
  }

  // The falldown renderer exposes plain mutable fields as its API; the panel
  // writes through to them, mirroring local state for the inputs.
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
    </div>
  );
}
