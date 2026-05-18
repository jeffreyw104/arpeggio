import { useEffect, useReducer, useRef, useState } from "react";
import type { ViewMode } from "../layout/viewMode";
import { ModeSwitch } from "./ModeSwitch";
import type { TabMode } from "../layout/practiceMode";
import type { Transport } from "../transport/transport";
import type { AudioEngine } from "../audio/engine";
import type { FalldownRenderer } from "../falldown/renderer";
import { startCountIn, type CountInHandle } from "../practice/countIn";

interface TopBarProps {
  pieceName: string;
  viewMode: ViewMode;
  onViewModeChange: (m: ViewMode) => void;
  onOpenLibrary: () => void;
  settingsOpen: boolean;
  onToggleSettings: () => void;
  mode: TabMode;
  onModeChange: (m: TabMode) => void;
  transport: Transport;
  audioEngine: AudioEngine | null;
  falldown: FalldownRenderer | null;
  countInBars: number;
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
 * The fixed top bar. Left: logo, Library, play/pause, seek scrubber, time,
 * and the Play/MIDI Practice toggle. Center: the now-playing piece name.
 * Right: Vol/Zoom mini-sliders, the view-mode switch, and the settings gear.
 */
export function TopBar({
  pieceName,
  viewMode,
  onViewModeChange,
  onOpenLibrary,
  settingsOpen,
  onToggleSettings,
  mode,
  onModeChange,
  transport,
  audioEngine,
  falldown,
  countInBars,
}: TopBarProps): React.JSX.Element {
  const [, forceUpdate] = useReducer((n: number) => n + 1, 0);
  useEffect(() => transport.clock.onChange(forceUpdate), [transport]);

  const { clock } = transport;
  const { playing, position, duration } = clock;

  const [countingIn, setCountingIn] = useState(false);
  const countInRef = useRef<CountInHandle | null>(null);

  // Master output volume (0-1) and falldown zoom — per-session sliders.
  const [volume, setVolume] = useState(1);
  const [zoom, setZoom] = useState(() => falldown?.zoom ?? 1);

  function changeVolume(v: number): void {
    setVolume(v);
    audioEngine?.setVolume(v);
  }

  function changeZoom(z: number): void {
    setZoom(z);
    // The falldown renderer exposes plain mutable fields as its API.
    // eslint-disable-next-line react-hooks/immutability
    if (falldown) falldown.zoom = z;
  }

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
      <label className="hud-mini">
        <span className="hud-mini-label">Vol</span>
        <input
          type="range"
          className="hud-minislider"
          aria-label="Volume"
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
          className="hud-minislider"
          aria-label="Note zoom"
          min={0.5}
          max={2}
          step={0.05}
          value={zoom}
          onChange={(e) => changeZoom(Number(e.target.value))}
        />
      </label>
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
