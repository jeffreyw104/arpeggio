import { useEffect, useReducer, useRef, useState } from "react";
import type { Transport } from "../transport/transport";
import type { AudioEngine } from "../audio/engine";
import type { FalldownRenderer } from "../falldown/renderer";
import type { PracticeMode } from "../layout/practiceMode";
import { MetronomeSettings } from "./MetronomeSettings";
import { startCountIn, type CountInHandle } from "../practice/countIn";

interface FloatingHudProps {
  transport: Transport;
  settingsOpen: boolean;
  audioEngine: AudioEngine | null;
  falldown: FalldownRenderer | null;
  mode: PracticeMode;
  /** Whether the extended top bar is collapsed — drives the HUD's position. */
  collapsed: boolean;
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

/**
 * Returns whether the HUD should be faded: true after `IDLE_MS` with no
 * pointer movement, reset to false on any movement. Never fades while
 * `disabled` is true.
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
 * The fixed-position transport HUD. Play mode: transport + a playback-speed
 * stepper, anchored top-left. Practice mode: transport + the metronome
 * control, anchored top-center (raised under the top bar when the extended
 * bar is collapsed). Idle-fades when untouched.
 */
export function FloatingHud({
  transport,
  settingsOpen,
  audioEngine,
  falldown,
  mode,
  collapsed,
}: FloatingHudProps): React.JSX.Element {
  const [, forceUpdate] = useReducer((n: number) => n + 1, 0);
  useEffect(() => transport.clock.onChange(forceUpdate), [transport]);

  const faded = useIdleFade(settingsOpen);

  const { clock } = transport;
  const { playing, position, duration } = clock;

  // Count-in bars (per session) and the in-flight count-in handle.
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

  // Metronome on/off mirror. Re-synced on entering Practice mode because the
  // mode-switch suspend/restore may have changed metronome.enabled directly.
  const [metronomeOn, setMetronomeOn] = useState(
    () => audioEngine?.metronome.enabled ?? false,
  );
  useEffect(() => {
    if (mode === "practice") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMetronomeOn(audioEngine?.metronome.enabled ?? false);
    }
  }, [mode, audioEngine]);

  const pulseRef = useRef<HTMLSpanElement>(null);

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

  function changeSpeed(delta: number): void {
    const next = Math.max(
      0,
      Math.min(SPEED_STEPS.length - 1, speedIndex + delta),
    );
    setSpeedIndex(next);
    transport.setBpm(transport.referenceBpm * SPEED_STEPS[next]);
  }

  function handleMetronome(checked: boolean): void {
    setMetronomeOn(checked);
    // The audio engine and renderer are imperative objects written through to.
    // eslint-disable-next-line react-hooks/immutability
    if (audioEngine) audioEngine.metronome.enabled = checked;
    // eslint-disable-next-line react-hooks/immutability
    if (falldown) falldown.showBeatPulse = checked;
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

  const positionClass =
    mode === "play"
      ? "floating-hud--play"
      : `floating-hud--practice${collapsed ? " floating-hud--raised" : ""}`;

  return (
    <div className={`floating-hud ${positionClass}${faded ? " faded" : ""}`}>
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

      {mode === "practice" && (
        <div className="hud-metronome">
          <label>
            <input
              type="checkbox"
              checked={metronomeOn}
              onChange={(e) => handleMetronome(e.target.checked)}
            />{" "}
            Metronome
          </label>
          <span ref={pulseRef} className="metronome-pulse" aria-hidden="true" />
          <MetronomeSettings
            falldown={falldown}
            audioEngine={audioEngine}
            countInBars={countInBars}
            onCountInBarsChange={setCountInBars}
          />
        </div>
      )}
    </div>
  );
}
