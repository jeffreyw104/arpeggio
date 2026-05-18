import { useEffect, useRef, useState } from "react";
import type { Transport } from "../transport/transport";
import type { HandState, HandVisibility } from "../practice/hands";
import type { FalldownRenderer } from "../falldown/renderer";
import type { AudioEngine } from "../audio/engine";
import { MetronomeMenu } from "./MetronomeMenu";

interface PracticeHudControlsProps {
  transport: Transport;
  handState: HandState;
  audioEngine: AudioEngine | null;
  falldown: FalldownRenderer | null;
  countInBars: number;
  onCountInBarsChange: (bars: number) => void;
}

/** The gradual speed-up ramp config — matches the prior ControlPanel setting. */
const SPEED_UP_CONFIG = { startRate: 0.5, targetRate: 1, step: 0.05 };

/** Index of the measure containing `position`, or 0 if none matches. */
function measureAt(transport: Transport, position: number): number {
  const i = transport.score.measures.findIndex(
    (m) => position >= m.start && position < m.end,
  );
  return i === -1 ? 0 : i;
}

/** Measure indices [first,last] of an active loop, or null. 0-based. */
function loopMeasures(
  transport: Transport,
): { first: number; last: number } | null {
  const loop = transport.clock.loop;
  if (!loop) return null;
  const measures = transport.score.measures;
  const first = measures.findIndex(
    (m) => loop.start >= m.start && loop.start < m.end,
  );
  const last = measures.findIndex(
    (m) => loop.end > m.start && loop.end <= m.end,
  );
  return {
    first: first === -1 ? 0 : first,
    last: last === -1 ? (first === -1 ? 0 : first) : last,
  };
}

/**
 * Row 2 of the Practice-mode HUD: the loop-range picker, tempo stepper,
 * gradual speed-up toggle, per-hand show/mute controls, and the metronome.
 * Each control mirrors live imperative state in local React state and writes
 * through on change. Mounting fresh (on a mode switch) re-reads live state.
 */
export function PracticeHudControls({
  transport,
  handState,
  audioEngine,
  falldown,
  countInBars,
  onCountInBarsChange,
}: PracticeHudControlsProps): React.JSX.Element {
  // Loop: a committed range and a pending start (set, end not yet set).
  const [loopRange, setLoopRange] = useState(() => loopMeasures(transport));
  const [pendingStart, setPendingStart] = useState<number | null>(null);

  const [bpm, setBpm] = useState(() => Math.round(transport.bpm));
  const [speedUp, setSpeedUp] = useState(() => transport.speedUpActive);

  const [leftVis, setLeftVis] = useState<HandVisibility>(() =>
    handState.visibility("left"),
  );
  const [rightVis, setRightVis] = useState<HandVisibility>(() =>
    handState.visibility("right"),
  );
  const [muteLeft, setMuteLeft] = useState(() => handState.isMuted("left"));
  const [muteRight, setMuteRight] = useState(() => handState.isMuted("right"));

  const [metronomeOn, setMetronomeOn] = useState(
    () => audioEngine?.metronome.enabled ?? false,
  );
  const [metronomeMenuOpen, setMetronomeMenuOpen] = useState(false);
  const pulseRef = useRef<HTMLSpanElement>(null);
  const metronomeRef = useRef<HTMLDivElement>(null);

  function applyLoop(start: number, end: number): void {
    const first = Math.min(start, end);
    const last = Math.max(start, end);
    transport.loopMeasures(first, last);
    setLoopRange({ first, last });
  }

  function handleSetStart(): void {
    const m = measureAt(transport, transport.clock.position);
    if (loopRange) {
      applyLoop(m, loopRange.last);
    } else {
      setPendingStart(m);
    }
  }

  function handleSetEnd(): void {
    const m = measureAt(transport, transport.clock.position);
    const start = loopRange ? loopRange.first : pendingStart;
    if (start === null) return;
    setPendingStart(null);
    applyLoop(start, m);
  }

  function handleClearLoop(): void {
    transport.clearLoop();
    setLoopRange(null);
    setPendingStart(null);
  }

  function changeBpm(delta: number): void {
    const next = Math.max(20, Math.min(300, bpm + delta));
    setBpm(next);
    transport.setBpm(next);
  }

  function handleSpeedUp(checked: boolean): void {
    setSpeedUp(checked);
    if (checked) {
      transport.enableSpeedUp(SPEED_UP_CONFIG);
    } else {
      transport.disableSpeedUp();
    }
  }

  function handleMetronome(checked: boolean): void {
    setMetronomeOn(checked);
    // The audio engine and renderer are imperative objects written through to.
    // eslint-disable-next-line react-hooks/immutability
    if (audioEngine) audioEngine.metronome.enabled = checked;
    // eslint-disable-next-line react-hooks/immutability
    if (falldown) falldown.showBeatPulse = checked;
  }

  // Self-contained rAF loop driving the metronome pulse indicator's opacity.
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

  // Close the metronome dropdown when the pointer goes down outside it.
  useEffect(() => {
    if (!metronomeMenuOpen) return;
    function onDown(e: PointerEvent): void {
      if (!metronomeRef.current?.contains(e.target as Node)) {
        setMetronomeMenuOpen(false);
      }
    }
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [metronomeMenuOpen]);

  const loopReadout = loopRange
    ? `m.${loopRange.first + 1}–${loopRange.last + 1}`
    : pendingStart !== null
      ? `m.${pendingStart + 1}–…`
      : "—";

  return (
    <div className="practice-hud-controls">
      <div className="hud-group">
        <span className="hud-group-label">Loop</span>
        <button type="button" onClick={handleSetStart}>
          Set start
        </button>
        <button type="button" onClick={handleSetEnd}>
          Set end
        </button>
        <button type="button" onClick={handleClearLoop}>
          Clear
        </button>
        <span className="hud-loop-readout">{loopReadout}</span>
      </div>

      <div className="hud-group">
        <span className="hud-group-label">Tempo</span>
        <button
          type="button"
          aria-label="Decrease tempo"
          onClick={() => changeBpm(-5)}
        >
          −
        </button>
        <span className="hud-tempo-readout">{bpm}</span>
        <button
          type="button"
          aria-label="Increase tempo"
          onClick={() => changeBpm(5)}
        >
          +
        </button>
      </div>

      <div className="hud-group">
        <label>
          <input
            type="checkbox"
            checked={speedUp}
            onChange={(e) => handleSpeedUp(e.target.checked)}
          />{" "}
          Speed-up
        </label>
      </div>

      <div className="hud-group">
        <span className="hud-group-label">Hands</span>
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
          Mute L
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
          Mute R
        </label>
      </div>

      <div className="hud-metronome" ref={metronomeRef}>
        <label>
          <input
            type="checkbox"
            checked={metronomeOn}
            onChange={(e) => handleMetronome(e.target.checked)}
          />{" "}
          Metronome
        </label>
        <button
          type="button"
          aria-label="Metronome settings"
          aria-expanded={metronomeMenuOpen}
          onClick={() => setMetronomeMenuOpen((o) => !o)}
        >
          ▾
        </button>
        <span ref={pulseRef} className="metronome-pulse" aria-hidden="true" />
        {metronomeMenuOpen && (
          <MetronomeMenu
            falldown={falldown}
            audioEngine={audioEngine}
            countInBars={countInBars}
            onCountInBarsChange={onCountInBarsChange}
          />
        )}
      </div>
    </div>
  );
}
