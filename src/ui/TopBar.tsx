import { useEffect, useReducer, useRef, useState } from "react";
import type { ViewMode } from "../layout/viewMode";
import { ModeSwitch } from "./ModeSwitch";
import type { TabMode } from "../layout/practiceMode";
import type { Transport } from "../transport/transport";
import type { AudioEngine } from "../audio/engine";
import { startCountIn, type CountInHandle } from "../practice/countIn";
import type { MidiStatus } from "../midi/MidiInput";

interface TopBarProps {
  pieceName: string;
  viewMode: ViewMode;
  onViewModeChange: (m: ViewMode) => void;
  onOpenLibrary: () => void;
  settingsOpen: boolean;
  onToggleSettings: () => void;
  toolsOpen: boolean;
  onToggleTools: () => void;
  mode: TabMode;
  onModeChange: (m: TabMode) => void;
  transport: Transport;
  audioEngine: AudioEngine | null;
  countInBars: number;
  /** MIDI tab: whether the reading lane is currently collapsed. */
  laneCollapsed: boolean;
  /** MIDI tab: toggle the reading lane collapsed state. */
  onToggleLane: () => void;
  /** MIDI tab: current MIDI connection status. */
  midiStatus?: MidiStatus;
  /** MIDI tab: name of the connected device (when status is "connected"). */
  midiDeviceName?: string;
}

const VIEW_MODE_OPTIONS: ReadonlyArray<{ mode: ViewMode; label: string }> = [
  { mode: "both", label: "Both" },
  { mode: "falldown", label: "Falldown only" },
  { mode: "score", label: "Score only" },
];

/** Strips a trailing file extension for display ("song.mid" -> "song"). */
function displayName(fileName: string): string {
  return fileName.replace(/\.[^./]+$/, "");
}

/** Format a duration in seconds as `m:ss` (e.g. 75 -> "1:15"). */
function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

/**
 * The fixed top bar. Left: logo, Library, the Tools popover toggle, play/pause,
 * seek scrubber, time, and the Play/MIDI Practice toggle. Center: the
 * now-playing piece name. Right: view controls (Both/Falldown/Score in play
 * mode; Reading lane toggle in midi mode), and the settings gear.
 */
export function TopBar({
  pieceName,
  viewMode,
  onViewModeChange,
  onOpenLibrary,
  settingsOpen,
  onToggleSettings,
  toolsOpen,
  onToggleTools,
  mode,
  onModeChange,
  transport,
  audioEngine,
  countInBars,
  laneCollapsed,
  onToggleLane,
  midiStatus,
  midiDeviceName,
}: TopBarProps): React.JSX.Element {
  const [, forceUpdate] = useReducer((n: number) => n + 1, 0);
  useEffect(() => transport.clock.onChange(forceUpdate), [transport]);

  const { clock } = transport;
  const { playing, position, duration } = clock;

  const [countingIn, setCountingIn] = useState(false);
  const countInRef = useRef<CountInHandle | null>(null);

  useEffect(() => {
    return () => countInRef.current?.cancel();
  }, []);

  // A count-in only makes sense in MIDI Practice mode; cancel it on leaving.
  useEffect(() => {
    if (mode !== "midi" && countInRef.current) {
      countInRef.current.cancel();
      countInRef.current = null;
      setCountingIn(false);
    }
  }, [mode]);

  function handlePlayToggle(): void {
    if (clock.playing) {
      clock.pause();
      countInRef.current?.cancel();
      countInRef.current = null;
      setCountingIn(false);
      return;
    }
    if (mode === "midi" && countInBars > 0 && audioEngine) {
      setCountingIn(true);
      countInRef.current = startCountIn({
        bars: countInBars,
        beatsPerBar: audioEngine.metronome.timeSignature.numerator,
        bpm: transport.bpm,
        onClick: (accent) => audioEngine.playClick(accent),
        onComplete: () => {
          setCountingIn(false);
          countInRef.current = null;
          clock.play();
        },
      });
      return;
    }
    clock.play();
  }

  return (
    <div className="top-bar">
      <span className="top-bar-logo">arpeggio</span>
      <button type="button" onClick={onOpenLibrary}>
        Library
      </button>
      <button
        type="button"
        aria-label="Tools"
        aria-pressed={toolsOpen}
        onClick={onToggleTools}
      >
        Tools
      </button>
      <button
        type="button"
        className="hud-play-btn"
        aria-label={playing ? "Pause" : "Play"}
        disabled={countingIn}
        onClick={handlePlayToggle}
      >
        {playing ? "⏸" : "▶"}
      </button>
      <input
        type="range"
        className="hud-scrubber"
        aria-label="Seek"
        min={0}
        max={duration}
        step={0.01}
        value={position}
        onChange={(e) => clock.seek(Number(e.target.value))}
        style={
          {
            "--pct": `${duration > 0 ? (position / duration) * 100 : 0}%`,
          } as React.CSSProperties
        }
      />
      <span className="hud-time">
        {formatTime(position)} / {formatTime(duration)}
      </span>
      <ModeSwitch mode={mode} onModeChange={onModeChange} />
      <span className="top-bar-piece">{displayName(pieceName)}</span>
      <span className="top-bar-spacer" />
      {mode === "midi" && midiStatus !== undefined && (
        <span
          className="midi-status-chip"
          aria-label={
            midiStatus === "connected"
              ? `MIDI connected: ${midiDeviceName ?? "device"}`
              : "MIDI: Connect keyboard"
          }
        >
          {midiStatus === "connected" ? (
            <>&#9679; {midiDeviceName}</>
          ) : (
            <>&#9675; Connect keyboard</>
          )}
        </span>
      )}
      {/* View controls vary by tab mode */}
      {mode === "play" ? (
        <div className="top-bar-views">
          {VIEW_MODE_OPTIONS.map(({ mode: viewModeOption, label }) => (
            <button
              key={viewModeOption}
              type="button"
              aria-pressed={viewMode === viewModeOption}
              onClick={() => onViewModeChange(viewModeOption)}
            >
              {label}
            </button>
          ))}
        </div>
      ) : (
        <button
          type="button"
          aria-pressed={!laneCollapsed}
          aria-label="Toggle reading lane"
          onClick={onToggleLane}
        >
          Reading lane
        </button>
      )}

      <button
        type="button"
        aria-label="Settings"
        aria-pressed={settingsOpen}
        onClick={onToggleSettings}
      >
        ⚙
      </button>
    </div>
  );
}
