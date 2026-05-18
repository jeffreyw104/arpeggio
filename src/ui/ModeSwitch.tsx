import type { PracticeMode } from "../layout/practiceMode";

interface ModeSwitchProps {
  mode: PracticeMode;
  onModeChange: (m: PracticeMode) => void;
}

/**
 * The Play / Practice toggle — a pill showing both labels with a frosted
 * liquid-glass selector that slides over the active mode. Clicking flips the
 * mode. Purely presentational; the mode state lives in PracticeView.
 */
export function ModeSwitch({
  mode,
  onModeChange,
}: ModeSwitchProps): React.JSX.Element {
  const practice = mode === "practice";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={practice}
      aria-label="Play / Practice"
      className="mode-switch"
      onClick={() => onModeChange(practice ? "play" : "practice")}
    >
      <span className="mode-switch-glass" aria-hidden="true" />
      <span className="mode-switch-option">Play</span>
      <span className="mode-switch-option">Practice</span>
    </button>
  );
}
