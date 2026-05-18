import type { ViewMode } from "../layout/viewMode";
import { ModeSwitch } from "./ModeSwitch";
import type { PracticeMode } from "../layout/practiceMode";

interface TopBarProps {
  pieceName: string;
  viewMode: ViewMode;
  onViewModeChange: (m: ViewMode) => void;
  onOpenLibrary: () => void;
  settingsOpen: boolean;
  onToggleSettings: () => void;
  mode: PracticeMode;
  onModeChange: (m: PracticeMode) => void;
  extendedCollapsed: boolean;
  onToggleExtended: () => void;
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
 * The fixed top bar. Left: the arpeggio wordmark and the Library button.
 * Center: the now-playing piece name. Right: the Play/Practice switch, the
 * view-mode switch, the settings gear, and — in Practice mode — the toggle
 * that collapses the extended control bar. Purely presentational.
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
  extendedCollapsed,
  onToggleExtended,
}: TopBarProps): React.JSX.Element {
  return (
    <div className="top-bar">
      <span className="top-bar-logo">arpeggio</span>
      <button type="button" onClick={onOpenLibrary}>
        Library
      </button>
      <span className="top-bar-piece">{displayName(pieceName)}</span>
      <span className="top-bar-spacer" />
      <ModeSwitch mode={mode} onModeChange={onModeChange} />
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
      {mode === "practice" && (
        <button
          type="button"
          className="top-bar-extended-toggle"
          aria-label={
            extendedCollapsed ? "Expand control bar" : "Collapse control bar"
          }
          aria-expanded={!extendedCollapsed}
          onClick={onToggleExtended}
        >
          {extendedCollapsed ? "▾" : "▴"}
        </button>
      )}
    </div>
  );
}
