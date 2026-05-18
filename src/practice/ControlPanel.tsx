import { useState } from "react";
import type { FalldownRenderer } from "../falldown/renderer";
import {
  METRONOME_SOUNDS,
  type AudioEngine,
  type MetronomeSound,
} from "../audio/engine";

interface ControlPanelProps {
  falldown: FalldownRenderer;
  audioEngine: AudioEngine | null;
}

/**
 * The settings-drawer panel: display preferences plus the metronome-sound
 * choice. Note labels, beat grid, and the full-88 toggle write through to the
 * falldown renderer. Practice tooling (loop, tempo, flatten, speed-up, hands)
 * lives in the extended top bar, not here.
 */
export function ControlPanel({
  falldown,
  audioEngine,
}: ControlPanelProps): React.JSX.Element {
  const [showLabels, setShowLabels] = useState(falldown.showLabels);
  const [showBeatGrid, setShowBeatGrid] = useState(falldown.showBeatGrid);
  const [full88, setFull88] = useState(falldown.full88);
  const [metronomeSound, setMetronomeSound] = useState<MetronomeSound>(
    () => audioEngine?.metronomeSound ?? "click",
  );

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

  function handleMetronomeSound(value: MetronomeSound): void {
    setMetronomeSound(value);
    // eslint-disable-next-line react-hooks/immutability
    if (audioEngine) audioEngine.metronomeSound = value;
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
          Metronome sound{" "}
          <select
            value={metronomeSound}
            onChange={(e) =>
              handleMetronomeSound(e.target.value as MetronomeSound)
            }
          >
            {METRONOME_SOUNDS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </fieldset>
    </div>
  );
}
