import { useState } from "react";
import type { Transport } from "../transport/transport";
import type { HandState, HandVisibility } from "../practice/hands";
import type { AudioEngine } from "../audio/engine";
import type { FalldownRenderer } from "../falldown/renderer";
import type { StripPosition } from "../section-strip/stripPosition";
import { CollapsibleSection } from "./CollapsibleSection";
import { CommonTools } from "./CommonTools";
import { useIsTouchDevice } from "../responsive/useIsTouchDevice";
import { TopBarReadout } from "./TopBarReadout";

interface PlayToolsProps {
  transport: Transport;
  handState: HandState;
  audioEngine: AudioEngine | null;
  falldown: FalldownRenderer | null;
  countInBars: number;
  onCountInBarsChange: (bars: number) => void;
  /** Section-strip position controls — only used for MIDI source files. */
  isMidiSource?: boolean;
  stripPosition?: StripPosition;
  onStripPositionChange?: (p: StripPosition) => void;
}

/**
 * The Tools popover body for the Play tab: the Play-only per-hand
 * visibility / mute section, followed by the sections shared with the MIDI
 * Practice tab (`CommonTools`).
 */
export function PlayTools({
  transport,
  handState,
  audioEngine,
  falldown,
  countInBars,
  onCountInBarsChange,
  isMidiSource = false,
  stripPosition = "bottom",
  onStripPositionChange,
}: PlayToolsProps): React.JSX.Element {
  const isTouchDevice = useIsTouchDevice();
  const [handsOpen, setHandsOpen] = useState(true);
  const [leftVis, setLeftVis] = useState<HandVisibility>(() =>
    handState.visibility("left"),
  );
  const [rightVis, setRightVis] = useState<HandVisibility>(() =>
    handState.visibility("right"),
  );
  const [muteLeft, setMuteLeft] = useState(() => handState.isMuted("left"));
  const [muteRight, setMuteRight] = useState(() => handState.isMuted("right"));

  return (
    <div className="play-tools">
      {isTouchDevice && (
        <section className="tools-readout-section">
          <header className="tools-section-header">Now playing</header>
          <TopBarReadout
            mode="play"
            transport={transport}
            audioEngine={audioEngine}
          />
        </section>
      )}
      {isMidiSource && onStripPositionChange && (
        <fieldset className="midi-tools-strip-position">
          <legend>Strip position</legend>
          <label>
            <input
              type="radio"
              name="strip-position-play"
              checked={stripPosition === "top"}
              onChange={() => onStripPositionChange("top")}
            />
            Top
          </label>
          <label>
            <input
              type="radio"
              name="strip-position-play"
              checked={stripPosition === "bottom"}
              onChange={() => onStripPositionChange("bottom")}
            />
            Bottom
          </label>
        </fieldset>
      )}

      <CollapsibleSection
        label="Hands"
        open={handsOpen}
        onToggle={() => setHandsOpen((o) => !o)}
      >
        <label>
          Left hand{" "}
          <select
            value={leftVis}
            onChange={(e) => {
              const v = e.target.value as HandVisibility;
              setLeftVis(v);
              handState.setVisibility("left", v);
            }}
          >
            <option value="show">Show</option>
            <option value="dim">Dim</option>
            <option value="hide">Hide</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={muteLeft}
            onChange={(e) => {
              setMuteLeft(e.target.checked);
              handState.setMuted("left", e.target.checked);
            }}
          />{" "}
          Mute left
        </label>
        <label>
          Right hand{" "}
          <select
            value={rightVis}
            onChange={(e) => {
              const v = e.target.value as HandVisibility;
              setRightVis(v);
              handState.setVisibility("right", v);
            }}
          >
            <option value="show">Show</option>
            <option value="dim">Dim</option>
            <option value="hide">Hide</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={muteRight}
            onChange={(e) => {
              setMuteRight(e.target.checked);
              handState.setMuted("right", e.target.checked);
            }}
          />{" "}
          Mute right
        </label>
      </CollapsibleSection>

      <CommonTools
        transport={transport}
        audioEngine={audioEngine}
        falldown={falldown}
        countInBars={countInBars}
        onCountInBarsChange={onCountInBarsChange}
      />
    </div>
  );
}
