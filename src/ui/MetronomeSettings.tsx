import { useState } from "react";
import type { FalldownRenderer } from "../falldown/renderer";
import type { AudioEngine } from "../audio/engine";

interface MetronomeSettingsProps {
  falldown: FalldownRenderer | null;
  audioEngine: AudioEngine | null;
  countInBars: number;
  onCountInBarsChange: (bars: number) => void;
}

/**
 * The metronome settings, laid out inline in the Practice-mode HUD: time
 * signature, downbeat accent, beat subdivision, and count-in. Mounted with
 * the Practice HUD, so its inputs initialise from the live renderer /
 * audio-engine state when that HUD mounts.
 */
export function MetronomeSettings({
  falldown,
  audioEngine,
  countInBars,
  onCountInBarsChange,
}: MetronomeSettingsProps): React.JSX.Element {
  const [timeSignature, setTimeSignature] = useState(() =>
    falldown
      ? `${falldown.beatMeter.numerator}/${falldown.beatMeter.denominator}`
      : "4/4",
  );
  const [accentDownbeat, setAccentDownbeat] = useState(
    () => audioEngine?.metronome.accentDownbeat ?? false,
  );
  const [subdivision, setSubdivision] = useState(
    () => audioEngine?.metronome.subdivision ?? 1,
  );

  function handleTimeSignature(value: string): void {
    // Keep the raw string so typing is never blocked mid-edit.
    setTimeSignature(value);
    const match = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(value);
    if (!match) return;
    const numerator = Number(match[1]);
    const denominator = Number(match[2]);
    if (numerator < 1 || denominator < 1) return;
    // The renderer and audio engine are imperative objects written through to.
    // eslint-disable-next-line react-hooks/immutability
    if (falldown) falldown.beatMeter = { numerator, denominator };
    if (audioEngine) {
      audioEngine.metronome.setTimeSignature(numerator, denominator);
    }
  }

  function handleAccent(checked: boolean): void {
    setAccentDownbeat(checked);
    // eslint-disable-next-line react-hooks/immutability
    if (audioEngine) audioEngine.metronome.accentDownbeat = checked;
  }

  function handleSubdivision(value: string): void {
    const next = Number(value);
    setSubdivision(next);
    // eslint-disable-next-line react-hooks/immutability
    if (audioEngine) audioEngine.metronome.subdivision = next;
  }

  return (
    <div className="hud-metronome-settings">
      <label>
        Time signature{" "}
        <input
          type="text"
          placeholder="4/4"
          value={timeSignature}
          onChange={(e) => handleTimeSignature(e.target.value)}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={accentDownbeat}
          onChange={(e) => handleAccent(e.target.checked)}
        />{" "}
        Accent downbeat
      </label>
      <label>
        Subdivision{" "}
        <select
          value={subdivision}
          onChange={(e) => handleSubdivision(e.target.value)}
        >
          <option value={1}>1</option>
          <option value={2}>2</option>
          <option value={3}>3</option>
          <option value={4}>4</option>
        </select>
      </label>
      <label>
        Count-in{" "}
        <select
          value={countInBars}
          onChange={(e) => onCountInBarsChange(Number(e.target.value))}
        >
          <option value={0}>Off</option>
          <option value={1}>1 bar</option>
          <option value={2}>2 bars</option>
        </select>
      </label>
    </div>
  );
}
