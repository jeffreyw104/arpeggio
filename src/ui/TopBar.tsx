import type { ViewMode } from "../layout/viewMode";
import { ModeSwitch } from "./ModeSwitch";
import type { TabMode } from "../layout/practiceMode";

interface TopBarProps {
  pieceName: string;
  viewMode: ViewMode;
  onViewModeChange: (m: ViewMode) => void;
  onOpenLibrary: () => void;
  settingsOpen: boolean;
  onToggleSettings: () => void;
  mode: TabMode;
  onModeChange: (m: TabMode) => void;
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

/**
 * The fixed top bar. Left: the arpeggio wordmark, the Library button, and the
 * Play/MIDI Practice toggle. Center: the now-playing piece name. Right: the
 * view-mode switch and the settings gear. Purely presentational.
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
}: TopBarProps): React.JSX.Element {
  return (
    <div className="top-bar">
      <span className="top-bar-logo">arpeggio</span>
      <button type="button" onClick={onOpenLibrary}>
        Library
      </button>
      <ModeSwitch mode={mode} onModeChange={onModeChange} />
      <span className="top-bar-piece">{displayName(pieceName)}</span>
      <span className="top-bar-spacer" />
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
