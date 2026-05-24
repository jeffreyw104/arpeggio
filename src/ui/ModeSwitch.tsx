import { TopBarSelect } from "./TopBarSelect";
import type { TabMode } from "../layout/practiceMode";

interface ModeSwitchProps {
  mode: TabMode;
  onModeChange: (m: TabMode) => void;
}

const OPTIONS = [
  { value: "play", label: "Play" },
  { value: "midi", label: "MIDI Practice" },
] as const satisfies ReadonlyArray<{ value: TabMode; label: string }>;

/**
 * The Play / MIDI Practice tab toggle. Rendered as a single pill that shows
 * the current mode and opens a dropdown with both options.
 */
export function ModeSwitch({
  mode,
  onModeChange,
}: ModeSwitchProps): React.JSX.Element {
  return (
    <TopBarSelect<TabMode>
      value={mode}
      options={[...OPTIONS]}
      onChange={onModeChange}
    />
  );
}
