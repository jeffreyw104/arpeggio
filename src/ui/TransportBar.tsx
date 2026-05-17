import { useEffect, useReducer } from "react";
import type { Transport } from "../transport/transport";
import type { ViewMode } from "../layout/viewMode";

interface TransportBarProps {
  transport: Transport;
  viewMode: ViewMode;
  onViewModeChange: (m: ViewMode) => void;
}

/** Format a duration in seconds as `m:ss` (e.g. 75 → "1:15"). */
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

export function TransportBar({
  transport,
  viewMode,
  onViewModeChange,
}: TransportBarProps) {
  const [, forceUpdate] = useReducer((n: number) => n + 1, 0);

  useEffect(() => transport.clock.onChange(forceUpdate), [transport]);

  const { clock } = transport;
  const { playing, position, duration } = clock;

  return (
    <div className="transport-bar">
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
    </div>
  );
}
