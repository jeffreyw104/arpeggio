import type { AudioEngine } from "../audio/engine";
import type { FalldownRenderer } from "../falldown/renderer";
import type { Hand } from "../model/score";
import type { MidiDevice, MidiStatus } from "../midi/MidiInput";
import { CommonTools } from "./CommonTools";
import type { Transport } from "../transport/transport";
import type { StripPosition } from "../section-strip/stripPosition";

interface MidiToolsProps {
  transport: Transport;
  countInBars: number;
  onCountInBarsChange: (bars: number) => void;
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
  /** Section-strip position controls — only used for MIDI source files. */
  isMidiSource?: boolean;
  stripPosition?: StripPosition;
  onStripPositionChange?: (p: StripPosition) => void;
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

/** Which "Hands I play" preset the current set corresponds to. "none" means no
 *  hand is selected — nothing is muted and the piece plays in full. */
function handsPreset(
  hands: ReadonlySet<Hand>,
): "left" | "right" | "both" | "none" {
  if (hands.has("left") && hands.has("right")) return "both";
  if (hands.has("left")) return "left";
  if (hands.has("right")) return "right";
  return "none";
}

/**
 * The Tools popover content for the MIDI Practice tab: MIDI device selection,
 * hand selection, wait-for-me, and the input-sound monitor, followed by the
 * sections shared with the Play tab (`CommonTools`: Loop, Tempo, Metronome,
 * General settings). Presentational — all state lives in PracticeView.
 */
export function MidiTools({
  transport,
  countInBars,
  onCountInBarsChange,
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
  isMidiSource = false,
  stripPosition = "bottom",
  onStripPositionChange,
}: MidiToolsProps): React.JSX.Element {
  const selectedName =
    devices.find((d) => d.id === selectedDeviceId)?.name ?? null;
  const preset = handsPreset(handsIPlay);

  return (
    <div className="play-tools midi-tools">
      {isMidiSource && onStripPositionChange && (
        <fieldset className="midi-tools-strip-position">
          <legend>Strip position</legend>
          <label>
            <input
              type="radio"
              name="strip-position-midi"
              checked={stripPosition === "top"}
              onChange={() => onStripPositionChange("top")}
            />
            Top
          </label>
          <label>
            <input
              type="radio"
              name="strip-position-midi"
              checked={stripPosition === "bottom"}
              onChange={() => onStripPositionChange("bottom")}
            />
            Bottom
          </label>
        </fieldset>
      )}

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
            onClick={() =>
              onHandsIPlayChange(
                preset === "left" ? new Set<Hand>() : new Set<Hand>(["left"]),
              )
            }
          >
            Left
          </button>
          <button
            type="button"
            aria-pressed={preset === "right"}
            onClick={() =>
              onHandsIPlayChange(
                preset === "right"
                  ? new Set<Hand>()
                  : new Set<Hand>(["right"]),
              )
            }
          >
            Right
          </button>
          <button
            type="button"
            aria-pressed={preset === "both"}
            onClick={() =>
              onHandsIPlayChange(
                preset === "both"
                  ? new Set<Hand>()
                  : new Set<Hand>(["left", "right"]),
              )
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

      <CommonTools
        transport={transport}
        audioEngine={audioEngine}
        falldown={falldown}
        countInBars={countInBars}
        onCountInBarsChange={onCountInBarsChange}
      />
    </div>
  );
}
