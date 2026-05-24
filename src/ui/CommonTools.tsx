import { useEffect, useRef, useState } from "react";
import type { Transport } from "../transport/transport";
import type { AudioEngine } from "../audio/engine";
import type { FalldownRenderer } from "../falldown/renderer";
import { measureAt, loopMeasureRange } from "../transport/measureMap";
import { CollapsibleSection } from "./CollapsibleSection";
import { MetronomeSettings } from "./MetronomeSettings";
import { GeneralSettings } from "./GeneralSettings";

interface CommonToolsProps {
  transport: Transport;
  audioEngine: AudioEngine | null;
  falldown: FalldownRenderer | null;
  countInBars: number;
  onCountInBarsChange: (bars: number) => void;
  monitorOn?: boolean;
  onMonitorOnChange?: (on: boolean) => void;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * The Tools-popover sections shared by the Play and MIDI Practice tabs: Loop
 * (with a Speed-up sub-group), Tempo, Metronome, and General settings.
 * Rendered as a fragment so the host popover owns the wrapper element. All
 * sections start open; each can be collapsed.
 */
export function CommonTools({
  transport,
  audioEngine,
  falldown,
  countInBars,
  onCountInBarsChange,
  monitorOn,
  onMonitorOnChange,
}: CommonToolsProps): React.JSX.Element {
  // Per-section open state — all start open so every control is laid out;
  // the user can still collapse any section they do not need.
  const [loopOpen, setLoopOpen] = useState(true);
  const [tempoOpen, setTempoOpen] = useState(true);
  const [metronomeOpen, setMetronomeOpen] = useState(true);

  // --- Loop state ---
  const [loopRange, setLoopRange] = useState(() => loopMeasureRange(transport));
  const [pendingStart, setPendingStart] = useState<number | null>(null);

  // Mirror the transport's loop into the popover state. The score view's
  // drag-to-loop and any other external setter funnels through clock.onChange,
  // so this is the single source of truth for "is there a loop, and where?".
  useEffect(() => {
    const sync = (): void => setLoopRange(loopMeasureRange(transport));
    sync();
    return transport.clock.onChange(sync);
  }, [transport]);

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
  const [metronomeFree, setMetronomeFree] = useState(
    () => audioEngine?.metronome.freeRun ?? false,
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
  function handleMetronomeFree(checked: boolean): void {
    setMetronomeFree(checked);
    if (audioEngine) {
      // eslint-disable-next-line react-hooks/immutability
      audioEngine.metronome.freeRun = checked;
      if (checked) audioEngine.metronome.resetFreeRun();
    }
  }

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
    <>
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
        <label title="When on, the metronome ticks at the BPM above regardless of where the score's clock is — keep practising on beat while wait-mode parks the clock on a chord.">
          <input
            type="checkbox"
            checked={metronomeFree}
            onChange={(e) => handleMetronomeFree(e.target.checked)}
          />{" "}
          Metronome always on
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

      <GeneralSettings
        falldown={falldown}
        audioEngine={audioEngine}
        monitorOn={monitorOn}
        onMonitorOnChange={onMonitorOnChange}
      />
    </>
  );
}
