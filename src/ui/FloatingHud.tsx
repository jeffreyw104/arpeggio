import { useEffect, useReducer } from "react";
import type { Transport } from "../transport/transport";
import type { ViewMode } from "../layout/viewMode";

interface FloatingHudProps {
  transport: Transport;
  viewMode: ViewMode;
  onViewModeChange: (m: ViewMode) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onExit: () => void;
  settingsOpen: boolean;
  onToggleSettings: () => void;
}

/** Format a duration in seconds as `m:ss` (e.g. 75 -> "1:15"). */
function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

const VIEW_MODE_OPTIONS: ReadonlyArray<{ mode: ViewMode; label: string }> = [
  { mode: "both", label: "Both" },
  { mode: "falldown", label: "Falldown only" },
  { mode: "score", label: "Score only" },
];

/**
 * The floating transport HUD: a compact overlay carrying every playback
 * control. Replaces the old fixed header band. Drag and idle-fade behavior
 * are layered on in later tasks.
 */
export function FloatingHud({
  transport,
  viewMode,
  onViewModeChange,
  onZoomIn,
  onZoomOut,
  onExit,
  settingsOpen,
  onToggleSettings,
}: FloatingHudProps): React.JSX.Element {
  const [, forceUpdate] = useReducer((n: number) => n + 1, 0);
  useEffect(() => transport.clock.onChange(forceUpdate), [transport]);

  const { clock } = transport;
  const { playing, position, duration } = clock;

  return (
    <div className="floating-hud">
      <button type="button" onClick={onExit}>
        Library
      </button>
      <button type="button" onClick={() => clock.toggle()}>
        {playing ? "Pause" : "Play"}
      </button>
      <input
        type="range"
        min={0}
        max={duration}
        step={0.01}
        value={position}
        onChange={(e) => clock.seek(Number(e.target.value))}
      />
      <span>
        {formatTime(position)} / {formatTime(duration)}
      </span>
      {VIEW_MODE_OPTIONS.map(({ mode, label }) => (
        <button
          key={mode}
          type="button"
          aria-pressed={viewMode === mode}
          onClick={() => onViewModeChange(mode)}
        >
          {label}
        </button>
      ))}
      <button type="button" aria-label="Zoom out" onClick={onZoomOut}>
        −
      </button>
      <button type="button" aria-label="Zoom in" onClick={onZoomIn}>
        +
      </button>
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
