import { useState } from "react";
import type { FalldownRenderer } from "../falldown/renderer";
import type { AudioEngine } from "../audio/engine";
import { CollapsibleSection } from "./CollapsibleSection";

interface GeneralSettingsProps {
  falldown: FalldownRenderer | null;
  audioEngine: AudioEngine | null;
  /** MIDI Practice only — when present, renders the Input sound checkbox. */
  monitorOn?: boolean;
  onMonitorOnChange?: (on: boolean) => void;
}

/**
 * The "General settings" Tools-popover section: falldown display toggles
 * (note labels, beat grid, full-88 keyboard) plus the master volume and
 * note-zoom sliders (caption to the left), all laid out on a single row.
 * Shared by the Play and MIDI Practice tabs — it replaces the old standalone
 * settings drawer.
 */
export function GeneralSettings({
  falldown,
  audioEngine,
  monitorOn,
  onMonitorOnChange,
}: GeneralSettingsProps): React.JSX.Element {
  const [open, setOpen] = useState(true);

  const [showLabels, setShowLabels] = useState(
    () => falldown?.showLabels ?? false,
  );
  const [showBeatGrid, setShowBeatGrid] = useState(
    () => falldown?.showBeatGrid ?? true,
  );
  const [full88, setFull88] = useState(() => falldown?.full88 ?? false);
  const [volume, setVolume] = useState(1);
  const [zoom, setZoom] = useState(() => falldown?.zoom ?? 1);

  // The falldown renderer exposes plain mutable fields as its API; write
  // through to them, mirroring local state for the inputs.
  function handleShowLabels(checked: boolean): void {
    setShowLabels(checked);
    // eslint-disable-next-line react-hooks/immutability
    if (falldown) falldown.showLabels = checked;
  }
  function handleShowBeatGrid(checked: boolean): void {
    setShowBeatGrid(checked);
    // eslint-disable-next-line react-hooks/immutability
    if (falldown) falldown.showBeatGrid = checked;
  }
  function handleFull88(checked: boolean): void {
    setFull88(checked);
    // eslint-disable-next-line react-hooks/immutability
    if (falldown) falldown.full88 = checked;
  }
  function changeVolume(v: number): void {
    setVolume(v);
    audioEngine?.setVolume(v);
  }
  function changeZoom(z: number): void {
    setZoom(z);
    // eslint-disable-next-line react-hooks/immutability
    if (falldown) falldown.zoom = z;
  }

  return (
    <CollapsibleSection
      label="General settings"
      open={open}
      onToggle={() => setOpen((o) => !o)}
    >
      <div className="general-settings-row">
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
        {onMonitorOnChange !== undefined && (
          <label>
            <input
              type="checkbox"
              checked={monitorOn ?? false}
              onChange={(e) => onMonitorOnChange(e.target.checked)}
            />{" "}
            Input sound
          </label>
        )}
        <label className="hud-mini">
          <span className="hud-mini-label">Volume</span>
          <input
            type="range"
            aria-label="Volume"
            className="hud-minislider"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => changeVolume(Number(e.target.value))}
          />
        </label>
        <label className="hud-mini">
          <span className="hud-mini-label">Zoom</span>
          <input
            type="range"
            aria-label="Note zoom"
            className="hud-minislider"
            min={0.5}
            max={2}
            step={0.05}
            value={zoom}
            onChange={(e) => changeZoom(Number(e.target.value))}
          />
        </label>
      </div>
    </CollapsibleSection>
  );
}
