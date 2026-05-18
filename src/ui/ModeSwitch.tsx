import type { PracticeMode } from "../layout/practiceMode";

interface ModeSwitchProps {
  mode: PracticeMode;
  onModeChange: (m: PracticeMode) => void;
}

/**
 * The Play / Practice toggle — a sliding on/off switch. "Practice" is the
 * checked state. Clicking it flips the mode. Purely presentational; the mode
 * state lives in PracticeView.
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
      <span className="mode-switch-label">Play</span>
      <span className="mode-switch-track">
        <span className="mode-switch-knob" />
      </span>
      <span className="mode-switch-label">Practice</span>
    </button>
  );
}
