import type { TabMode } from "../layout/practiceMode";

interface ModeSwitchProps {
  mode: TabMode;
  onModeChange: (m: TabMode) => void;
}

/**
 * The Play / MIDI Practice switch — two buttons. The active mode is
 * `aria-pressed` and styled as the accent pill. Purely presentational; the
 * mode state lives in PracticeView.
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
        aria-pressed={mode === "midi"}
        onClick={() => onModeChange("midi")}
      >
        MIDI Practice
      </button>
    </div>
  );
}
