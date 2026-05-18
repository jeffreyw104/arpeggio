import { PRACTICE_MODES, type PracticeMode } from "../layout/practiceMode";

interface ModeSwitchProps {
  mode: PracticeMode;
  onModeChange: (m: PracticeMode) => void;
}

const LABELS: Record<PracticeMode, string> = {
  play: "Play",
  practice: "Practice",
};

/**
 * The Play / Practice segmented control. Purely presentational; the mode
 * state lives in PracticeView. Built so a third segment could be added later.
 */
export function ModeSwitch({
  mode,
  onModeChange,
}: ModeSwitchProps): React.JSX.Element {
  return (
    <div className="top-bar-modes">
      {PRACTICE_MODES.map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={mode === m}
          onClick={() => onModeChange(m)}
        >
          {LABELS[m]}
        </button>
      ))}
    </div>
  );
}
