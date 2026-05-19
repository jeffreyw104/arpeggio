import { useState } from "react";
import type { AudioEngine } from "../audio/engine";
import type { FalldownRenderer } from "../falldown/renderer";
import type { Hand } from "../model/score";
import type { MidiDevice, MidiStatus } from "../midi/MidiInput";
import { CollapsibleSection } from "./CollapsibleSection";

interface MidiToolsProps {
  audioEngine: AudioEngine | null;
  falldown: FalldownRenderer | null;
  midiStatus: MidiStatus;
  devices: readonly MidiDevice[];
  selectedDeviceId: string | null;
  onSelectDevice: (id: string) => void;
  handsIPlay: ReadonlySet<Hand>;
  onHandsIPlayChange: (hands: Set<Hand>) => void;
  waitEnabled: boolean;
  onWaitEnabledChange: (on: boolean) => void;
  monitorOn: boolean;
  onMonitorOnChange: (on: boolean) => void;
}

/** Human-readable status line for each MIDI connection state. */
function statusLine(status: MidiStatus, deviceName: string | null): string {
  switch (status) {
    case "unsupported":
      return "Web MIDI not supported — using the computer keyboard";
    case "denied":
      return "MIDI access denied — using the computer keyboard";
    case "no-device":
      return "No MIDI keyboard — using the computer keyboard";
    case "connected":
      return deviceName ?? "MIDI keyboard connected";
  }
}

/** Which "Hands I play" preset the current set corresponds to. */
function handsPreset(hands: ReadonlySet<Hand>): "left" | "right" | "both" {
  if (hands.has("left") && hands.has("right")) return "both";
  return hands.has("left") ? "left" : "right";
}

/**
 * The Tools popover content for the MIDI Practice tab: MIDI device selection,
 * hand selection, wait-for-me, input-sound monitor, plus a combined Volume &
 * zoom row. Presentational — all state lives in PracticeView.
 */
export function MidiTools({
  audioEngine,
  falldown,
  midiStatus,
  devices,
  selectedDeviceId,
  onSelectDevice,
  handsIPlay,
  onHandsIPlayChange,
  waitEnabled,
  onWaitEnabledChange,
  monitorOn,
  onMonitorOnChange,
}: MidiToolsProps): React.JSX.Element {
  // The combined Volume & zoom section starts open; it can be collapsed.
  const [volZoomOpen, setVolZoomOpen] = useState(true);

  const [volume, setVolume] = useState(1);
  function changeVolume(v: number): void {
    setVolume(v);
    audioEngine?.setVolume(v);
  }

  const [zoom, setZoom] = useState(() => falldown?.zoom ?? 1);
  function changeZoom(z: number): void {
    setZoom(z);
    // eslint-disable-next-line react-hooks/immutability
    if (falldown) falldown.zoom = z;
  }

  const selectedName =
    devices.find((d) => d.id === selectedDeviceId)?.name ?? null;
  const preset = handsPreset(handsIPlay);

  return (
    <div className="play-tools midi-tools">
      <div className="midi-tools-input">
        <label className="hud-mini">
          <span className="hud-mini-label">Device</span>
          <select
            aria-label="MIDI device"
            className="midi-device-select"
            value={selectedDeviceId ?? ""}
            disabled={devices.length === 0}
            onChange={(e) => onSelectDevice(e.target.value)}
          >
            {devices.length === 0 && <option value="">No device</option>}
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <p className="midi-status-line">
          {statusLine(midiStatus, selectedName)}
        </p>
      </div>

      <div className="midi-tools-hands">
        <span className="hud-mini-label">Hands I play</span>
        <div className="midi-hands-buttons">
          <button
            type="button"
            aria-pressed={preset === "left"}
            className={preset === "left" ? "is-active" : ""}
            onClick={() => onHandsIPlayChange(new Set<Hand>(["left"]))}
          >
            Left
          </button>
          <button
            type="button"
            aria-pressed={preset === "right"}
            className={preset === "right" ? "is-active" : ""}
            onClick={() => onHandsIPlayChange(new Set<Hand>(["right"]))}
          >
            Right
          </button>
          <button
            type="button"
            aria-pressed={preset === "both"}
            className={preset === "both" ? "is-active" : ""}
            onClick={() =>
              onHandsIPlayChange(new Set<Hand>(["left", "right"]))
            }
          >
            Both
          </button>
        </div>
      </div>

      <label className="midi-tools-check">
        <input
          type="checkbox"
          checked={waitEnabled}
          onChange={(e) => onWaitEnabledChange(e.target.checked)}
        />
        <span>Wait for me</span>
      </label>

      <label className="midi-tools-check">
        <input
          type="checkbox"
          checked={monitorOn}
          onChange={(e) => onMonitorOnChange(e.target.checked)}
        />
        <span>Input sound</span>
      </label>

      <CollapsibleSection
        label="Volume & zoom"
        open={volZoomOpen}
        onToggle={() => setVolZoomOpen((o) => !o)}
      >
        <div className="vol-zoom-row">
          <label className="hud-mini hud-mini--stacked">
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
          <label className="hud-mini hud-mini--stacked">
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
    </div>
  );
}
