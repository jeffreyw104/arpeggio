import { useEffect, useReducer, useRef, useState } from "react";
import type { Transport } from "../transport/transport";
import type { AudioEngine } from "../audio/engine";
import type { TabMode } from "../layout/practiceMode";
import type { Hand } from "../model/score";
import { measureAt, loopMeasureRange } from "../transport/measureMap";

interface TopBarReadoutProps {
  mode: TabMode;
  transport: Transport;
  audioEngine: AudioEngine | null;
  /** Wait-mode state — required when mode === "midi", ignored in Play. */
  waitEnabled?: boolean;
  onWaitEnabledChange?: (on: boolean) => void;
  handsIPlay?: ReadonlySet<Hand>;
  onHandsIPlayChange?: (hands: Set<Hand>) => void;
}

type HandChoice = "left" | "both" | "right";

function handsPreset(hands: ReadonlySet<Hand> | undefined): HandChoice | "none" {
  if (!hands) return "none";
  if (hands.has("left") && hands.has("right")) return "both";
  if (hands.has("left")) return "left";
  if (hands.has("right")) return "right";
  return "none";
}

function handsForChoice(c: HandChoice): Set<Hand> {
  if (c === "both") return new Set(["left", "right"]);
  if (c === "left") return new Set(["left"]);
  return new Set(["right"]);
}

function waitLabel(enabled: boolean, hands: ReadonlySet<Hand> | undefined): string {
  if (!enabled) return "Turn on wait mode";
  const p = handsPreset(hands);
  if (p === "left") return "Wait L";
  if (p === "right") return "Wait R";
  if (p === "both") return "Wait L+R";
  return "Wait"; // wait on but no hand selected (shouldn't normally happen)
}

/**
 * The live chip group that fills the top-bar slack region:
 *  - read-only chips: tempo, time-signature, current measure, active loop
 *  - wait pill (MIDI Practice mode only): indicator + control coupling
 *    `waitEnabled` and `handsIPlay`. Off-state shows "Turn on wait mode";
 *    on-state shows "Wait L" / "Wait L+R" / "Wait R".
 *
 * Re-renders on every clock change.
 */
export function TopBarReadout({
  mode,
  transport,
  audioEngine,
  waitEnabled = false,
  onWaitEnabledChange,
  handsIPlay,
  onHandsIPlayChange,
}: TopBarReadoutProps): React.JSX.Element {
  const [, forceUpdate] = useReducer((n: number) => n + 1, 0);
  useEffect(() => transport.clock.onChange(forceUpdate), [transport]);

  const [waitOpen, setWaitOpen] = useState(false);
  const waitRootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!waitOpen) return;
    function onDocMouseDown(e: MouseEvent): void {
      if (!waitRootRef.current?.contains(e.target as Node)) setWaitOpen(false);
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") setWaitOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [waitOpen]);

  function pickHand(c: HandChoice): void {
    onHandsIPlayChange?.(handsForChoice(c));
    onWaitEnabledChange?.(true);
    setWaitOpen(false);
  }
  function turnOff(): void {
    onWaitEnabledChange?.(false);
    setWaitOpen(false);
  }

  const bpm = Math.round(transport.bpm);
  const sig = audioEngine?.metronome.timeSignature;
  const totalMeasures = transport.score.measures.length;
  const currentMeasure =
    totalMeasures > 0 ? measureAt(transport, transport.clock.position) + 1 : 0;
  const loopRange = loopMeasureRange(transport);
  const currentHand = handsPreset(handsIPlay);

  return (
    <div className="top-bar-readout">
      <span className="top-bar-readout-chip">♩ = {bpm}</span>
      {sig && (
        <span className="top-bar-readout-chip">
          {sig.numerator}/{sig.denominator}
        </span>
      )}
      {totalMeasures > 0 && (
        <span className="top-bar-readout-chip">
          m. {currentMeasure} / {totalMeasures}
        </span>
      )}
      {loopRange && (
        <span className="top-bar-readout-chip top-bar-readout-chip--loop">
          ↻ m.{loopRange.first + 1}–{loopRange.last + 1}
        </span>
      )}
      {mode === "midi" && (
        <div className="top-bar-wait" ref={waitRootRef}>
          <button
            type="button"
            className={`top-bar-wait-pill top-bar-wait-pill--${waitEnabled ? "on" : "off"}`}
            aria-pressed={waitEnabled}
            aria-haspopup="menu"
            aria-expanded={waitOpen}
            onClick={() => setWaitOpen((o) => !o)}
          >
            <span className="top-bar-wait-dot" aria-hidden="true" />
            {waitLabel(waitEnabled, handsIPlay)}
          </button>
          {waitOpen && (
            <ul className="top-bar-select-menu" role="menu">
              {waitEnabled && (
                <>
                  <li
                    role="menuitem"
                    className="top-bar-select-item"
                    onClick={turnOff}
                  >
                    <span className="top-bar-select-check" aria-hidden="true">
                      {" "}
                    </span>
                    Off
                  </li>
                  <li className="top-bar-select-divider" role="separator" />
                </>
              )}
              {(["left", "both", "right"] as HandChoice[]).map((c) => {
                const active = waitEnabled && currentHand === c;
                const label =
                  c === "left" ? "Left hand" : c === "both" ? "Both hands" : "Right hand";
                return (
                  <li
                    key={c}
                    role="menuitem"
                    aria-current={active ? "true" : undefined}
                    className={`top-bar-select-item${active ? " top-bar-select-item--active" : ""}`}
                    onClick={() => pickHand(c)}
                  >
                    <span className="top-bar-select-check" aria-hidden="true">
                      {active ? "✓" : " "}
                    </span>
                    {label}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
