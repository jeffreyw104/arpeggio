import type { PracticeMode } from "../layout/practiceMode";

interface ModeSwitchProps {
  mode: PracticeMode;
  onModeChange: (m: PracticeMode) => void;
}

/**
 * The Play / Practice switch — two buttons. The active mode is `aria-pressed`
 * and styled as the accent pill. Purely presentational; the mode state lives
 * in PracticeView.
 */
export function ModeSwitch({
  mode,
  onModeChange,
}: ModeSwitchProps): React.JSX.Element {
  return (
    <div className="top-bar-modes">
      <button
        type="button"
        aria-pressed={mode === "play"}
        onClick={() => onModeChange("play")}
      >
        Play
      </button>
      <button
        type="button"
        aria-pressed={mode === "practice"}
        onClick={() => onModeChange("practice")}
      >
        Practice
      </button>
    </div>
  );
}
