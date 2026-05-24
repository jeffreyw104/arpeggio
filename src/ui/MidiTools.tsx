import type { AudioEngine } from "../audio/engine";
import type { FalldownRenderer } from "../falldown/renderer";
import type { MidiDevice, MidiStatus } from "../midi/MidiInput";
import { CommonTools } from "./CommonTools";
import type { Transport } from "../transport/transport";
import type { StripPosition } from "../section-strip/stripPosition";
import type { Hand } from "../model/score";
import { useIsTouchDevice } from "../responsive/useIsTouchDevice";
import { TopBarReadout } from "./TopBarReadout";

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
  monitorOn: boolean;
  onMonitorOnChange: (on: boolean) => void;
  /** Section-strip position controls — only used for MIDI source files. */
  isMidiSource?: boolean;
  stripPosition?: StripPosition;
  onStripPositionChange?: (p: StripPosition) => void;
  /** Wait-mode state — forwarded to TopBarReadout on touch devices. */
  waitEnabled?: boolean;
  onWaitEnabledChange?: (on: boolean) => void;
  handsIPlay?: ReadonlySet<Hand>;
  onHandsIPlayChange?: (hands: Set<Hand>) => void;
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

/**
 * The Tools popover content for the MIDI Practice tab: MIDI device selection,
 * input-sound monitor, followed by the sections shared with the Play tab
 * (`CommonTools`: Loop, Tempo, Metronome, General settings). Hand selection
 * and wait-for-me are now controlled via the top bar. Presentational — all
 * state lives in PracticeView.
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
  monitorOn,
  onMonitorOnChange,
  isMidiSource = false,
  stripPosition = "bottom",
  onStripPositionChange,
  waitEnabled,
  onWaitEnabledChange,
  handsIPlay,
  onHandsIPlayChange,
}: MidiToolsProps): React.JSX.Element {
  const isTouchDevice = useIsTouchDevice();
  const selectedName =
    devices.find((d) => d.id === selectedDeviceId)?.name ?? null;

  return (
    <div className="play-tools midi-tools">
      {isTouchDevice && (
        <section className="tools-readout-section">
          <header className="tools-section-header">Now playing</header>
          <TopBarReadout
            mode="midi"
            transport={transport}
            audioEngine={audioEngine}
            waitEnabled={waitEnabled}
            onWaitEnabledChange={onWaitEnabledChange}
            handsIPlay={handsIPlay}
            onHandsIPlayChange={onHandsIPlayChange}
          />
        </section>
      )}
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

      <CommonTools
        transport={transport}
        audioEngine={audioEngine}
        falldown={falldown}
        countInBars={countInBars}
        onCountInBarsChange={onCountInBarsChange}
        monitorOn={monitorOn}
        onMonitorOnChange={onMonitorOnChange}
      />
    </div>
  );
}
