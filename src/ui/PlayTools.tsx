import { useEffect, useRef, useState } from "react";
import type { Transport } from "../transport/transport";
import type { HandState, HandVisibility } from "../practice/hands";
import type { AudioEngine } from "../audio/engine";
import type { FalldownRenderer } from "../falldown/renderer";
import { CollapsibleSection } from "./CollapsibleSection";
import { MetronomeSettings } from "./MetronomeSettings";
import { GeneralSettings } from "./GeneralSettings";

interface PlayToolsProps {
  transport: Transport;
  handState: HandState;
  audioEngine: AudioEngine | null;
  falldown: FalldownRenderer | null;
  countInBars: number;
  onCountInBarsChange: (bars: number) => void;
}

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
 * The Tools popover body for Play mode: Loop (with Speed-up sub-group), Tempo,
 * Hands, Metronome, and General settings — each in its own CollapsibleSection.
 * All sections start open; each can be collapsed.
 */
export function PlayTools({
  transport,
  handState,
  audioEngine,
  falldown,
  countInBars,
  onCountInBarsChange,
}: PlayToolsProps): React.JSX.Element {
  // Per-section open state — all start open so every control is laid out;
  // the user can still collapse any section they do not need.
  const [loopOpen, setLoopOpen] = useState(true);
  const [tempoOpen, setTempoOpen] = useState(true);
  const [handsOpen, setHandsOpen] = useState(true);
  const [metronomeOpen, setMetronomeOpen] = useState(true);

  // --- Loop state ---
  const [loopRange, setLoopRange] = useState(() => loopMeasures(transport));
  const [pendingStart, setPendingStart] = useState<number | null>(null);

  function applyLoop(start: number, end: number): void {
    const first = Math.min(start, end);
    const last = Math.max(start, end);
    transport.loopMeasures(first, last);
    setLoopRange({ first, last });
  }
  function handleSetStart(): void {
    const m = measureAt(transport, transport.clock.position);
    if (loopRange) applyLoop(m, loopRange.last);
    else setPendingStart(m);
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
  const loopReadout = loopRange
    ? `m.${loopRange.first + 1}–${loopRange.last + 1}`
    : pendingStart !== null
      ? `m.${pendingStart + 1}–…`
      : "—";

  // --- Speed-up state (BPM-configured) ---
  const refBpm = transport.referenceBpm;
  const [speedUp, setSpeedUp] = useState(() => transport.speedUpActive);
  const [startBpm, setStartBpm] = useState(() =>
    String(Math.round(0.5 * refBpm)),
  );
  const [targetBpm, setTargetBpm] = useState(() => String(Math.round(refBpm)));
  const [incBpm, setIncBpm] = useState(() =>
    String(Math.max(1, Math.round(0.05 * refBpm))),
  );

  function applySpeedUp(
    on: boolean,
    start = startBpm,
    target = targetBpm,
    inc = incBpm,
  ): void {
    if (!on) {
      transport.disableSpeedUp();
      return;
    }
    const s = clamp(Number(start) || 0.5 * refBpm, 20, 300);
    const t = clamp(Number(target) || refBpm, 20, 300);
    const i = clamp(Number(inc) || 1, 1, 100);
    transport.enableSpeedUp({
      startRate: s / refBpm,
      targetRate: t / refBpm,
      step: i / refBpm,
    });
  }
  function handleSpeedUpToggle(checked: boolean): void {
    setSpeedUp(checked);
    applySpeedUp(checked);
  }

  // --- Tempo state ---
  const [bpm, setBpm] = useState(() => String(Math.round(transport.bpm)));
  const [flatten, setFlatten] = useState(
    () => transport.tempoMode === "flatten",
  );
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

  // --- Hands state ---
  const [leftVis, setLeftVis] = useState<HandVisibility>(() =>
    handState.visibility("left"),
  );
  const [rightVis, setRightVis] = useState<HandVisibility>(() =>
    handState.visibility("right"),
  );
  const [muteLeft, setMuteLeft] = useState(() => handState.isMuted("left"));
  const [muteRight, setMuteRight] = useState(() => handState.isMuted("right"));

  // --- Metronome state ---
  const [metronomeOn, setMetronomeOn] = useState(
    () => audioEngine?.metronome.enabled ?? false,
  );
  const pulseRef = useRef<HTMLSpanElement>(null);
  function handleMetronome(checked: boolean): void {
    setMetronomeOn(checked);
    // eslint-disable-next-line react-hooks/immutability
    if (audioEngine) audioEngine.metronome.enabled = checked;
    // eslint-disable-next-line react-hooks/immutability
    if (falldown) falldown.showBeatPulse = checked;
  }
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

  return (
    <div className="play-tools">
      <CollapsibleSection
        label="Loop"
        open={loopOpen}
        onToggle={() => setLoopOpen((o) => !o)}
      >
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
        <span className="ext-divider" aria-hidden="true" />
        <span className="ext-sub-label">Speed-up</span>
        <label>
          <input
            type="checkbox"
            aria-label="Speed-up"
            checked={speedUp}
            onChange={(e) => handleSpeedUpToggle(e.target.checked)}
          />{" "}
          on
        </label>
        <label>
          Start BPM{" "}
          <input
            type="number"
            aria-label="Start BPM"
            className="ext-tempo-input"
            value={startBpm}
            onChange={(e) => setStartBpm(e.target.value)}
          />
        </label>
        <label>
          Target BPM{" "}
          <input
            type="number"
            aria-label="Target BPM"
            className="ext-tempo-input"
            value={targetBpm}
            onChange={(e) => setTargetBpm(e.target.value)}
          />
        </label>
        <label>
          +BPM / loop{" "}
          <input
            type="number"
            aria-label="+BPM per loop"
            className="ext-tempo-input"
            value={incBpm}
            onChange={(e) => setIncBpm(e.target.value)}
          />
        </label>
      </CollapsibleSection>

      <CollapsibleSection
        label="Tempo"
        open={tempoOpen}
        onToggle={() => setTempoOpen((o) => !o)}
      >
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
      </CollapsibleSection>

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

      <CollapsibleSection
        label="Metronome"
        open={metronomeOpen}
        onToggle={() => setMetronomeOpen((o) => !o)}
      >
        <label>
          <input
            type="checkbox"
            aria-label="Metronome"
            checked={metronomeOn}
            onChange={(e) => handleMetronome(e.target.checked)}
          />{" "}
          On
        </label>
        <span ref={pulseRef} className="metronome-pulse" aria-hidden="true" />
        <MetronomeSettings
          falldown={falldown}
          audioEngine={audioEngine}
          countInBars={countInBars}
          onCountInBarsChange={onCountInBarsChange}
        />
      </CollapsibleSection>

      <GeneralSettings falldown={falldown} audioEngine={audioEngine} />
    </div>
  );
}
