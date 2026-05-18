import { useEffect, useRef, useState } from "react";
import type { Transport } from "../transport/transport";
import type { HandState } from "./hands";
import type { FalldownRenderer } from "../falldown/renderer";
import type { AudioEngine } from "../audio/engine";

interface ControlPanelProps {
  transport: Transport;
  handState: HandState;
  falldown: FalldownRenderer;
  audioEngine: AudioEngine | null;
}

/**
 * Imperative-object control panel for practice tooling. Each control keeps a
 * small piece of local state to drive its input, and writes through to the
 * transport / hand state / renderer / audio engine on change.
 */
export function ControlPanel({
  transport,
  handState,
  falldown,
  audioEngine,
}: ControlPanelProps): React.JSX.Element {
  const [bpm, setBpm] = useState(Math.round(transport.bpm));
  const [speedUp, setSpeedUp] = useState(false);
  const [showLabels, setShowLabels] = useState(falldown.showLabels);
  const [showBeatGrid, setShowBeatGrid] = useState(falldown.showBeatGrid);
  const [full88, setFull88] = useState(falldown.full88);
  const [metronome, setMetronome] = useState(false);
  const [subdivision, setSubdivision] = useState(1);
  const [timeSignature, setTimeSignature] = useState(
    `${falldown.beatMeter.numerator}/${falldown.beatMeter.denominator}`,
  );
  const [flattenTempo, setFlattenTempo] = useState(
    transport.tempoMode === "flatten",
  );
  const pulseRef = useRef<HTMLSpanElement>(null);
  const [muteLeft, setMuteLeft] = useState(handState.isMuted("left"));
  const [muteRight, setMuteRight] = useState(handState.isMuted("right"));
  const [hideLeft, setHideLeft] = useState(handState.isHidden("left"));
  const [hideRight, setHideRight] = useState(handState.isHidden("right"));

  function handleBpm(value: string): void {
    const next = Number(value);
    setBpm(next);
    transport.setBpm(next);
  }

  function handleLoopMeasure(): void {
    const pos = transport.clock.position;
    const found = transport.score.measures.findIndex(
      (m) => pos >= m.start && pos < m.end,
    );
    const idx = found === -1 ? 0 : found;
    transport.loopMeasures(idx, idx);
  }

  function handleSpeedUp(checked: boolean): void {
    setSpeedUp(checked);
    if (checked) {
      transport.enableSpeedUp({ startRate: 0.5, targetRate: 1, step: 0.05 });
    } else {
      transport.disableSpeedUp();
    }
  }

  function handleMetronome(checked: boolean): void {
    setMetronome(checked);
    // The audio engine is an imperative object the panel writes through to.
    // eslint-disable-next-line react-hooks/immutability
    if (audioEngine) audioEngine.metronome.enabled = checked;
  }

  function handleSubdivision(value: string): void {
    const next = Number(value);
    setSubdivision(next);
    // The audio engine is an imperative object the panel writes through to.
    // eslint-disable-next-line react-hooks/immutability
    if (audioEngine) audioEngine.metronome.subdivision = next;
  }

  function handleTimeSignature(value: string): void {
    // Keep the raw string so typing is never blocked mid-edit.
    setTimeSignature(value);
    const match = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(value);
    if (!match) return;
    const numerator = Number(match[1]);
    const denominator = Number(match[2]);
    if (numerator < 1 || denominator < 1) return;
    // The falldown renderer exposes plain mutable fields as its API.
    // eslint-disable-next-line react-hooks/immutability
    falldown.beatMeter = { numerator, denominator };
    if (audioEngine) {
      audioEngine.metronome.setTimeSignature(numerator, denominator);
    }
  }

  function handleFlattenTempo(checked: boolean): void {
    setFlattenTempo(checked);
    transport.setTempoMode(checked ? "flatten" : "preserve");
  }

  // Self-contained rAF loop driving the metronome pulse indicator's opacity
  // from the live `metronome.pulse` value. Does not touch the main FrameLoop.
  useEffect(() => {
    let frame = 0;
    const tick = (): void => {
      if (pulseRef.current) {
        pulseRef.current.style.opacity = String(
          audioEngine?.metronome.pulse ?? 0,
        );
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [audioEngine]);

  // The falldown renderer exposes plain mutable fields as its API (Task H-T3);
  // the panel writes through to them, mirroring local state for the inputs.
  function handleShowLabels(checked: boolean): void {
    setShowLabels(checked);
    // eslint-disable-next-line react-hooks/immutability
    falldown.showLabels = checked;
  }

  function handleShowBeatGrid(checked: boolean): void {
    setShowBeatGrid(checked);
    // eslint-disable-next-line react-hooks/immutability
    falldown.showBeatGrid = checked;
  }

  function handleFull88(checked: boolean): void {
    setFull88(checked);
    // eslint-disable-next-line react-hooks/immutability
    falldown.full88 = checked;
  }

  return (
    <div className="control-panel">
      <fieldset className="control-group">
        <label>
          Tempo (BPM){" "}
          <input
            type="number"
            value={bpm}
            onChange={(e) => handleBpm(e.target.value)}
          />
        </label>
      </fieldset>

      <fieldset className="control-group">
        <button type="button" onClick={handleLoopMeasure}>
          Loop measure
        </button>
        <button type="button" onClick={() => transport.clearLoop()}>
          Clear loop
        </button>
        <label>
          <input
            type="checkbox"
            checked={speedUp}
            onChange={(e) => handleSpeedUp(e.target.checked)}
          />{" "}
          Gradual speed-up
        </label>
      </fieldset>

      <fieldset className="control-group">
        <label>
          <input
            type="checkbox"
            checked={showLabels}
            onChange={(e) => handleShowLabels(e.target.checked)}
          />{" "}
          Note labels
        </label>
        <label>
          <input
            type="checkbox"
            checked={showBeatGrid}
            onChange={(e) => handleShowBeatGrid(e.target.checked)}
          />{" "}
          Beat grid
        </label>
        <label>
          <input
            type="checkbox"
            checked={full88}
            onChange={(e) => handleFull88(e.target.checked)}
          />{" "}
          Full 88 keys
        </label>
        <label>
          <input
            type="checkbox"
            checked={metronome}
            onChange={(e) => handleMetronome(e.target.checked)}
          />{" "}
          Metronome
        </label>
        <span ref={pulseRef} className="metronome-pulse" aria-hidden="true" />
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
          <input
            type="checkbox"
            checked={flattenTempo}
            onChange={(e) => handleFlattenTempo(e.target.checked)}
          />{" "}
          Flatten tempo changes
        </label>
      </fieldset>

      <fieldset className="control-group">
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
        <label>
          <input
            type="checkbox"
            checked={hideLeft}
            onChange={(e) => {
              setHideLeft(e.target.checked);
              handState.setHidden("left", e.target.checked);
            }}
          />{" "}
          Hide left
        </label>
        <label>
          <input
            type="checkbox"
            checked={hideRight}
            onChange={(e) => {
              setHideRight(e.target.checked);
              handState.setHidden("right", e.target.checked);
            }}
          />{" "}
          Hide right
        </label>
      </fieldset>
    </div>
  );
}
