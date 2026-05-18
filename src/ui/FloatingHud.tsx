import {
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import type { Transport } from "../transport/transport";
import type { AudioEngine } from "../audio/engine";
import type { PracticeMode } from "../layout/practiceMode";
import { startCountIn, type CountInHandle } from "../practice/countIn";

interface FloatingHudProps {
  transport: Transport;
  settingsOpen: boolean;
  audioEngine: AudioEngine | null;
  mode: PracticeMode;
  /** Count-in bars (owned by PracticeView; the metronome section sets it). */
  countInBars: number;
}

/** Milliseconds of pointer inactivity before the HUD fades. */
const IDLE_MS = 2500;

/** Play-mode playback-speed multipliers, slowest to fastest. */
const SPEED_STEPS = [0.5, 0.75, 1, 1.25, 1.5] as const;

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
 * pointer movement. Never fades while `disabled` is true.
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
 * Makes the HUD draggable within its offset parent. The initial position
 * depends on `mode`: Play spawns top-left, Practice spawns top-center. A drag
 * is ignored when it starts on an interactive control.
 */
function useDraggable(mode: PracticeMode): {
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
      const x =
        mode === "play" ? 10 : (parent.clientWidth - el.offsetWidth) / 2;
      setPos({ x, y: 70 });
    } else {
      setPos({ x: 16, y: 70 });
    }
    // Initial placement only — once placed, the user owns the position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  return { ref, pos, onPointerDown };
}

/**
 * The draggable transport HUD. Play mode adds a playback-speed stepper;
 * Practice mode is transport-only (loop/tempo/hands/metronome live in the
 * accordion bar). Idle-fades when untouched.
 */
export function FloatingHud({
  transport,
  settingsOpen,
  audioEngine,
  mode,
  countInBars,
}: FloatingHudProps): React.JSX.Element {
  const [, forceUpdate] = useReducer((n: number) => n + 1, 0);
  useEffect(() => transport.clock.onChange(forceUpdate), [transport]);

  const { ref, pos, onPointerDown } = useDraggable(mode);
  const faded = useIdleFade(settingsOpen);

  const { clock } = transport;
  const { playing, position, duration } = clock;

  const [countingIn, setCountingIn] = useState(false);
  const countInRef = useRef<CountInHandle | null>(null);

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

  // A count-in only makes sense in Practice mode; cancel it on leaving.
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
      <button
        type="button"
        className="hud-play-btn"
        aria-label={playing ? "Pause" : "Play"}
        disabled={countingIn}
        onClick={handlePlayToggle}
      >
        {playing ? "⏸" : "▶"}
      </button>
      <input
        type="range"
        className="hud-scrubber"
        min={0}
        max={duration}
        step={0.01}
        value={position}
        onChange={(e) => clock.seek(Number(e.target.value))}
        style={
          {
            "--pct": `${duration > 0 ? (position / duration) * 100 : 0}%`,
          } as React.CSSProperties
        }
      />
      <span className="hud-time">
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
          <span className="hud-tempo-readout">{SPEED_STEPS[speedIndex]}×</span>
          <button
            type="button"
            aria-label="Increase speed"
            onClick={() => changeSpeed(1)}
          >
            +
          </button>
        </div>
      )}
    </div>
  );
}
