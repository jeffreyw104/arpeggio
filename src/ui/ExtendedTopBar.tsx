import { useState } from "react";
import type { Transport } from "../transport/transport";
import type { HandState, HandVisibility } from "../practice/hands";

interface ExtendedTopBarProps {
  transport: Transport;
  handState: HandState;
}

/** The gradual speed-up ramp config — matches the prior ControlPanel setting. */
const SPEED_UP_CONFIG = { startRate: 0.5, targetRate: 1, step: 0.05 };

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

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
 * The extended top bar shown in Practice mode: four bordered control boxes —
 * loop-range picker, tempo (exact entry + steppers + flatten), gradual
 * speed-up, and per-hand visibility/mute. Each control mirrors live imperative
 * state in local React state and writes through on change; mounting fresh
 * (the bar is only rendered while expanded in Practice mode) re-reads it.
 */
export function ExtendedTopBar({
  transport,
  handState,
}: ExtendedTopBarProps): React.JSX.Element {
  const [loopRange, setLoopRange] = useState(() => loopMeasures(transport));
  const [pendingStart, setPendingStart] = useState<number | null>(null);

  const [bpm, setBpm] = useState(() => String(Math.round(transport.bpm)));
  const [flatten, setFlatten] = useState(
    () => transport.tempoMode === "flatten",
  );
  const [speedUp, setSpeedUp] = useState(() => transport.speedUpActive);

  const [leftVis, setLeftVis] = useState<HandVisibility>(() =>
    handState.visibility("left"),
  );
  const [rightVis, setRightVis] = useState<HandVisibility>(() =>
    handState.visibility("right"),
  );
  const [muteLeft, setMuteLeft] = useState(() => handState.isMuted("left"));
  const [muteRight, setMuteRight] = useState(() => handState.isMuted("right"));

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

  function handleLoopMeasure(): void {
    const m = measureAt(transport, transport.clock.position);
    setPendingStart(null);
    applyLoop(m, m);
  }

  function handleClearLoop(): void {
    transport.clearLoop();
    setLoopRange(null);
    setPendingStart(null);
  }

  function applyBpm(raw: string): void {
    setBpm(raw);
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 20 && n <= 300) transport.setBpm(n);
  }

  function stepBpm(delta: number): void {
    const base = Number(bpm);
    const current = Number.isFinite(base) ? base : Math.round(transport.bpm);
    const next = clamp(current + delta, 20, 300);
    setBpm(String(next));
    transport.setBpm(next);
  }

  function handleFlatten(checked: boolean): void {
    setFlatten(checked);
    transport.setTempoMode(checked ? "flatten" : "preserve");
  }

  function handleSpeedUp(checked: boolean): void {
    setSpeedUp(checked);
    if (checked) {
      transport.enableSpeedUp(SPEED_UP_CONFIG);
    } else {
      transport.disableSpeedUp();
    }
  }

  const loopReadout = loopRange
    ? `m.${loopRange.first + 1}–${loopRange.last + 1}`
    : pendingStart !== null
      ? `m.${pendingStart + 1}–…`
      : "—";

  return (
    <div className="extended-top-bar">
      <div className="ext-box">
        <span className="ext-box-label">Loop</span>
        <button type="button" onClick={handleSetStart}>
          Set start
        </button>
        <button type="button" onClick={handleSetEnd}>
          Set end
        </button>
        <button type="button" onClick={handleLoopMeasure}>
          Loop measure
        </button>
        <button type="button" aria-label="Clear loop" onClick={handleClearLoop}>
          Clear
        </button>
        <span className="ext-loop-readout">{loopReadout}</span>
      </div>

      <div className="ext-box">
        <span className="ext-box-label">Tempo</span>
        <button
          type="button"
          aria-label="Decrease tempo"
          onClick={() => stepBpm(-5)}
        >
          −
        </button>
        <input
          type="number"
          aria-label="Tempo (BPM)"
          className="ext-tempo-input"
          value={bpm}
          onChange={(e) => applyBpm(e.target.value)}
        />
        <button
          type="button"
          aria-label="Increase tempo"
          onClick={() => stepBpm(5)}
        >
          +
        </button>
        <label>
          <input
            type="checkbox"
            checked={flatten}
            onChange={(e) => handleFlatten(e.target.checked)}
          />{" "}
          Flatten
        </label>
      </div>

      <div className="ext-box">
        <label>
          <input
            type="checkbox"
            checked={speedUp}
            onChange={(e) => handleSpeedUp(e.target.checked)}
          />{" "}
          Speed-up
        </label>
      </div>

      <div className="ext-box">
        <span className="ext-box-label">Hands</span>
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
      </div>
    </div>
  );
}
