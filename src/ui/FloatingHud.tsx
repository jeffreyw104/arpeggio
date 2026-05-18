import { useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import type { Transport } from "../transport/transport";
import type { AudioEngine } from "../audio/engine";
import type { FalldownRenderer } from "../falldown/renderer";
import type { HandState } from "../practice/hands";
import type { PracticeMode } from "../layout/practiceMode";
import { PracticeHudControls } from "./PracticeHudControls";
import { startCountIn, type CountInHandle } from "../practice/countIn";

interface FloatingHudProps {
  transport: Transport;
  handState: HandState;
  settingsOpen: boolean;
  audioEngine: AudioEngine | null;
  falldown: FalldownRenderer | null;
  mode: PracticeMode;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
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

  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (el && parent && parent.clientWidth > 0 && parent.clientHeight > 0) {
      setPos({
        x: (parent.clientWidth - el.offsetWidth) / 2,
        y: parent.clientHeight - el.offsetHeight - 16,
      });
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

/** Play-mode playback-speed multipliers, slowest to fastest. */
const SPEED_STEPS = [0.5, 0.75, 1, 1.25, 1.5] as const;

/**
 * The floating transport HUD. A shared draggable, idle-fading wrapper carries
 * the transport row; mode-specific content sits alongside it:
 *  - Play mode: a playback-speed stepper.
 *  - Practice mode: a collapse toggle and, when expanded, the practice
 *    controls row. The HUD does not auto-fade while expanded.
 */
export function FloatingHud({
  transport,
  handState,
  settingsOpen,
  audioEngine,
  falldown,
  mode,
  collapsed,
  onCollapsedChange,
}: FloatingHudProps): React.JSX.Element {
  const [, forceUpdate] = useReducer((n: number) => n + 1, 0);
  useEffect(() => transport.clock.onChange(forceUpdate), [transport]);

  const { ref, pos, onPointerDown } = useDraggable();

  const practiceExpanded = mode === "practice" && !collapsed;
  const faded = useIdleFade(settingsOpen || practiceExpanded);

  const { clock } = transport;
  const { playing, position, duration } = clock;

  // Count-in bars (per session); owned here so it survives the metronome menu.
  const [countInBars, setCountInBars] = useState(0);
  const [countingIn, setCountingIn] = useState(false);
  const countInRef = useRef<CountInHandle | null>(null);

  // Play-mode speed multiplier, derived from the live transport rate on mount.
  const [speedIndex, setSpeedIndex] = useState(() => {
    const ratio = transport.bpm / transport.referenceBpm;
    let best = 2;
    let bestDist = Infinity;
    SPEED_STEPS.forEach((s, i) => {
      const d = Math.abs(s - ratio);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  });

  useEffect(() => {
    return () => countInRef.current?.cancel();
  }, []);

  // A count-in only makes sense in Practice mode; cancel it if the user
  // switches to Play while it is still running.
  useEffect(() => {
    if (mode !== "practice" && countInRef.current) {
      countInRef.current.cancel();
      countInRef.current = null;
      setCountingIn(false);
    }
  }, [mode]);

  function changeSpeed(delta: number): void {
    const next = Math.max(
      0,
      Math.min(SPEED_STEPS.length - 1, speedIndex + delta),
    );
    setSpeedIndex(next);
    transport.setBpm(transport.referenceBpm * SPEED_STEPS[next]);
  }

  function handlePlayToggle(): void {
    if (clock.playing) {
      clock.pause();
      countInRef.current?.cancel();
      countInRef.current = null;
      setCountingIn(false);
      return;
    }
    if (mode === "practice" && countInBars > 0 && audioEngine) {
      setCountingIn(true);
      countInRef.current = startCountIn({
        bars: countInBars,
        beatsPerBar: audioEngine.metronome.timeSignature.numerator,
        bpm: transport.bpm,
        onClick: (accent) => audioEngine.playClick(accent),
        onComplete: () => {
          setCountingIn(false);
          countInRef.current = null;
          clock.play();
        },
      });
      return;
    }
    clock.play();
  }

  return (
    <div
      ref={ref}
      className={`floating-hud${faded ? " faded" : ""}`}
      style={pos ? { left: pos.x, top: pos.y } : undefined}
      onPointerDown={onPointerDown}
    >
      <div className="hud-transport-row">
        <button
          type="button"
          aria-label={playing ? "Pause" : "Play"}
          disabled={countingIn}
          onClick={handlePlayToggle}
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

        {mode === "play" && (
          <div className="hud-group">
            <span className="hud-group-label">Speed</span>
            <button
              type="button"
              aria-label="Decrease speed"
              onClick={() => changeSpeed(-1)}
            >
              −
            </button>
            <span className="hud-tempo-readout">
              {SPEED_STEPS[speedIndex]}×
            </span>
            <button
              type="button"
              aria-label="Increase speed"
              onClick={() => changeSpeed(1)}
            >
              +
            </button>
          </div>
        )}

        {mode === "practice" && (
          <button
            type="button"
            className="hud-collapse"
            aria-label={collapsed ? "Expand HUD" : "Collapse HUD"}
            aria-expanded={!collapsed}
            onClick={() => onCollapsedChange(!collapsed)}
          >
            {collapsed ? "▴" : "▾"}
          </button>
        )}
      </div>

      {practiceExpanded && (
        <PracticeHudControls
          transport={transport}
          handState={handState}
          audioEngine={audioEngine}
          falldown={falldown}
          countInBars={countInBars}
          onCountInBarsChange={setCountInBars}
        />
      )}
    </div>
  );
}
