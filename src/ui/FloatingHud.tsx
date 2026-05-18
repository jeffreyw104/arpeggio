import { useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import type { Transport } from "../transport/transport";
import type { ViewMode } from "../layout/viewMode";
import type { AudioEngine } from "../audio/engine";
import type { FalldownRenderer } from "../falldown/renderer";
import { MetronomeMenu } from "./MetronomeMenu";

interface FloatingHudProps {
  transport: Transport;
  viewMode: ViewMode;
  onViewModeChange: (m: ViewMode) => void;
  onExit: () => void;
  settingsOpen: boolean;
  onToggleSettings: () => void;
  audioEngine: AudioEngine | null;
  falldown: FalldownRenderer | null;
}

/** Milliseconds of pointer inactivity before the HUD fades. */
const IDLE_MS = 2500;

/** Format a duration in seconds as `m:ss` (e.g. 75 -> "1:15"). */
function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

const VIEW_MODE_OPTIONS: ReadonlyArray<{ mode: ViewMode; label: string }> = [
  { mode: "both", label: "Both" },
  { mode: "falldown", label: "Falldown only" },
  { mode: "score", label: "Score only" },
];

interface Position {
  x: number;
  y: number;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * Returns whether the HUD should be faded: true after `IDLE_MS` with no
 * pointer movement, reset to false on any movement. Never fades while
 * `disabled` is true (e.g. the settings drawer is open) — the disabled
 * override is applied at render time so the idle state is pure tracking.
 */
function useIdleFade(disabled: boolean): boolean {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    if (disabled) return;
    let timer = window.setTimeout(() => setIdle(true), IDLE_MS);
    function onMove(): void {
      setIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), IDLE_MS);
    }
    window.addEventListener("pointermove", onMove);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", onMove);
    };
  }, [disabled]);

  return disabled ? false : idle;
}

/**
 * Makes an element draggable within its offset parent. Returns the element
 * ref, its position, and a pointerdown handler. Dragging is ignored when the
 * pointer goes down on an interactive control (button/input/select). When the
 * parent has no measured size (e.g. jsdom) the position is left unclamped.
 */
function useDraggable(): {
  ref: React.RefObject<HTMLDivElement | null>;
  pos: Position | null;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
} {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Position | null>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  // Center horizontally near the top once the element has been measured.
  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (el && parent && parent.clientWidth > 0 && parent.clientHeight > 0) {
      setPos({ x: (parent.clientWidth - el.offsetWidth) / 2, y: 16 });
    } else {
      setPos({ x: 16, y: 16 });
    }
  }, []);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    if ((e.target as HTMLElement).closest("button, input, select, label"))
      return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    drag.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
  }

  useEffect(() => {
    function move(e: PointerEvent): void {
      const el = ref.current;
      const d = drag.current;
      if (!el || !d) return;
      const parent = el.offsetParent as HTMLElement | null;
      let x = e.clientX - d.dx;
      let y = e.clientY - d.dy;
      if (parent && parent.clientWidth > 0 && parent.clientHeight > 0) {
        x = clamp(x, 0, parent.clientWidth - el.offsetWidth);
        y = clamp(y, 0, parent.clientHeight - el.offsetHeight);
      }
      setPos({ x, y });
    }
    function up(): void {
      drag.current = null;
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, []);

  useEffect(() => {
    function onResize(): void {
      const el = ref.current;
      const parent = el?.offsetParent as HTMLElement | null;
      if (!el || !parent) return;
      if (parent.clientWidth <= 0 || parent.clientHeight <= 0) return;
      setPos((p) =>
        p
          ? {
              x: clamp(p.x, 0, parent.clientWidth - el.offsetWidth),
              y: clamp(p.y, 0, parent.clientHeight - el.offsetHeight),
            }
          : p,
      );
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return { ref, pos, onPointerDown };
}

/**
 * The floating transport HUD: a compact overlay carrying every playback
 * control. Replaces the old fixed header band. Drag and idle-fade behavior
 * are layered on in later tasks.
 */
export function FloatingHud({
  transport,
  viewMode,
  onViewModeChange,
  onExit,
  settingsOpen,
  onToggleSettings,
  audioEngine,
  falldown,
}: FloatingHudProps): React.JSX.Element {
  const [, forceUpdate] = useReducer((n: number) => n + 1, 0);
  useEffect(() => transport.clock.onChange(forceUpdate), [transport]);

  const { ref, pos, onPointerDown } = useDraggable();
  const faded = useIdleFade(settingsOpen);

  const { clock } = transport;
  const { playing, position, duration } = clock;

  const [metronomeOn, setMetronomeOn] = useState(false);
  const [metronomeMenuOpen, setMetronomeMenuOpen] = useState(false);
  const pulseRef = useRef<HTMLSpanElement>(null);
  const metronomeRef = useRef<HTMLDivElement>(null);

  function handleMetronome(checked: boolean): void {
    setMetronomeOn(checked);
    // The audio engine and renderer are imperative objects written through to.
    // eslint-disable-next-line react-hooks/immutability
    if (audioEngine) audioEngine.metronome.enabled = checked;
    // eslint-disable-next-line react-hooks/immutability
    if (falldown) falldown.showBeatPulse = checked;
  }

  // Self-contained rAF loop driving the metronome pulse indicator's opacity
  // from the live `metronome.pulse` value.
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

  return (
    <div
      ref={ref}
      className={`floating-hud${faded ? " faded" : ""}`}
      style={pos ? { left: pos.x, top: pos.y } : undefined}
      onPointerDown={onPointerDown}
    >
      <button type="button" onClick={onExit}>
        Library
      </button>
      <button
        type="button"
        aria-label={playing ? "Pause" : "Play"}
        onClick={() => clock.toggle()}
      >
        {playing ? "⏸" : "▶"}
      </button>
      <input
        type="range"
        min={0}
        max={duration}
        step={0.01}
        value={position}
        onChange={(e) => clock.seek(Number(e.target.value))}
      />
      <span>
        {formatTime(position)} / {formatTime(duration)}
      </span>
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
            transport={transport}
            falldown={falldown}
            audioEngine={audioEngine}
          />
        )}
      </div>
      {VIEW_MODE_OPTIONS.map(({ mode, label }) => (
        <button
          key={mode}
          type="button"
          aria-pressed={viewMode === mode}
          onClick={() => onViewModeChange(mode)}
        >
          {label}
        </button>
      ))}
      <button
        type="button"
        aria-label="Settings"
        aria-pressed={settingsOpen}
        onClick={onToggleSettings}
      >
        ⚙
      </button>
    </div>
  );
}
