import { useEffect, useReducer, useRef, useState } from "react";
import type { ViewMode } from "../layout/viewMode";
import { ModeSwitch } from "./ModeSwitch";
import type { TabMode, PracticeLayout, LaneTheme } from "../layout/practiceMode";
import type { Transport } from "../transport/transport";
import type { AudioEngine } from "../audio/engine";
import { startCountIn, type CountInHandle } from "../practice/countIn";
import type { MidiStatus } from "../midi/MidiInput";
import { TopBarReadout } from "./TopBarReadout";
import type { Hand } from "../model/score";

interface TopBarProps {
  pieceName: string;
  viewMode: ViewMode;
  onViewModeChange: (m: ViewMode) => void;
  onOpenLibrary: () => void;
  toolsOpen: boolean;
  onToggleTools: () => void;
  mode: TabMode;
  onModeChange: (m: TabMode) => void;
  transport: Transport;
  audioEngine: AudioEngine | null;
  countInBars: number;
  /** MIDI tab: the current Practice layout. */
  practiceLayout: PracticeLayout;
  /** MIDI tab: the reading lane's visual theme. */
  laneTheme: LaneTheme;
  /** MIDI tab: change the reading lane's theme. */
  onLaneThemeChange: (theme: LaneTheme) => void;
  /** MIDI tab: change the Practice layout. */
  onPracticeLayoutChange: (layout: PracticeLayout) => void;
  /** MIDI tab: current MIDI connection status. */
  midiStatus?: MidiStatus;
  /** MIDI tab: name of the connected device (when status is "connected"). */
  midiDeviceName?: string;
  /** MIDI tab: wait-mode state, exposed via the top-bar wait pill. */
  waitEnabled?: boolean;
  onWaitEnabledChange?: (on: boolean) => void;
  handsIPlay?: ReadonlySet<Hand>;
  onHandsIPlayChange?: (hands: Set<Hand>) => void;
  /** True when the loaded piece is a MIDI file. Hides the scrubber and
   *  practice-layout controls (replaced by the SectionStrip). */
  isMidiSource?: boolean;
}

const VIEW_MODE_OPTIONS: ReadonlyArray<{ mode: ViewMode; label: string }> = [
  { mode: "both", label: "Both" },
  { mode: "falldown", label: "Falldown only" },
  { mode: "score", label: "Score only" },
];

/** Strips a known trailing file extension for display ("song.mid" -> "song").
 * Only matches the formats the app handles, so titles like "Ballade No.1"
 * keep their ".1" — the previous "anything after the last dot" rule was too
 * eager. */
function displayName(fileName: string): string {
  return fileName.replace(/\.(midi?|musicxml|xml|mxl)$/i, "");
}

/** Format a duration in seconds as `m:ss` (e.g. 75 -> "1:15"). */
function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

/**
 * The fixed top bar. Left: logo, Library, the Tools popover toggle, play/pause,
 * seek scrubber, time, and the Play/MIDI Practice toggle. Center: the
 * now-playing piece name. Right: view controls (Both/Falldown/Score in play
 * mode; Reading lane toggle in midi mode).
 */
export function TopBar({
  pieceName,
  viewMode,
  onViewModeChange,
  onOpenLibrary,
  toolsOpen,
  onToggleTools,
  mode,
  onModeChange,
  transport,
  audioEngine,
  countInBars,
  practiceLayout,
  onPracticeLayoutChange,
  laneTheme,
  onLaneThemeChange,
  midiStatus,
  midiDeviceName,
  waitEnabled,
  onWaitEnabledChange,
  handsIPlay,
  onHandsIPlayChange,
  isMidiSource = false,
}: TopBarProps): React.JSX.Element {
  const [, forceUpdate] = useReducer((n: number) => n + 1, 0);
  useEffect(() => transport.clock.onChange(forceUpdate), [transport]);

  const { clock } = transport;
  const { playing, position, duration } = clock;

  const [countingIn, setCountingIn] = useState(false);
  const countInRef = useRef<CountInHandle | null>(null);

  useEffect(() => {
    return () => countInRef.current?.cancel();
  }, []);

  // A count-in only makes sense in MIDI Practice mode; cancel it on leaving.
  useEffect(() => {
    if (mode !== "midi" && countInRef.current) {
      countInRef.current.cancel();
      countInRef.current = null;
      setCountingIn(false);
    }
  }, [mode]);

  function handlePlayToggle(): void {
    if (clock.playing) {
      clock.pause();
      countInRef.current?.cancel();
      countInRef.current = null;
      setCountingIn(false);
      return;
    }
    if (mode === "midi" && countInBars > 0 && audioEngine) {
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
    <div className="top-bar">
      <button
        type="button"
        className="top-bar-logo"
        aria-label="Back to library"
        onClick={onOpenLibrary}
      >
        <span className="top-bar-logo-inner">
          <span className="top-bar-logo-word">arpeggio</span>
          <span className="top-bar-logo-word top-bar-logo-alt">
            <span aria-hidden="true">←&nbsp;</span>library
          </span>
        </span>
      </button>
      <button
        type="button"
        aria-label="Tools"
        aria-pressed={toolsOpen}
        onClick={onToggleTools}
      >
        Tools
      </button>
      <button
        type="button"
        className="hud-play-btn"
        aria-label={playing ? "Pause" : "Play"}
        disabled={countingIn}
        onClick={handlePlayToggle}
      >
        {playing ? (
          <svg viewBox="0 0 10 10" width="0.75em" height="0.75em" fill="currentColor" aria-hidden="true">
            <rect x="2.5" y="2" width="2" height="6" rx="0.5" />
            <rect x="5.5" y="2" width="2" height="6" rx="0.5" />
          </svg>
        ) : (
          <svg viewBox="0 0 10 10" width="0.85em" height="0.85em" fill="currentColor" aria-hidden="true">
            <path d="M2.5 1.5 L8.5 5 L2.5 8.5 Z" />
          </svg>
        )}
      </button>
      {!isMidiSource && (
        <input
          type="range"
          className="hud-scrubber"
          aria-label="Seek"
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
      )}
      <span className="hud-time">
        {formatTime(position)} / {formatTime(duration)}
      </span>
      <ModeSwitch mode={mode} onModeChange={onModeChange} />
      <div className="top-bar-piece">
        <span className="top-bar-piece-label">now playing</span>
        <span className="top-bar-piece-title">{displayName(pieceName)}</span>
      </div>
      <span className="top-bar-spacer" />
      <TopBarReadout
        mode={mode}
        transport={transport}
        audioEngine={audioEngine}
        waitEnabled={waitEnabled}
        onWaitEnabledChange={onWaitEnabledChange}
        handsIPlay={handsIPlay}
        onHandsIPlayChange={onHandsIPlayChange}
      />
      {mode === "midi" && midiStatus !== undefined && (
        <span
          className="midi-status-chip"
          aria-label={
            midiStatus === "connected"
              ? `MIDI connected: ${midiDeviceName ?? "device"}`
              : "MIDI: Connect keyboard"
          }
        >
          {midiStatus === "connected" ? (
            <>&#9679; {midiDeviceName}</>
          ) : (
            <>&#9675; Connect keyboard</>
          )}
        </span>
      )}
      {/* View controls vary by tab mode; hidden for MIDI source files */}
      {!isMidiSource && (
        mode === "play" ? (
          <div className="top-bar-views">
            {VIEW_MODE_OPTIONS.map(({ mode: viewModeOption, label }) => (
              <button
                key={viewModeOption}
                type="button"
                aria-pressed={viewMode === viewModeOption}
                onClick={() => onViewModeChange(viewModeOption)}
              >
                {label}
              </button>
            ))}
          </div>
        ) : (
          <div className="top-bar-views">
            <button
              type="button"
              aria-pressed={practiceLayout === "lane"}
              onClick={() => onPracticeLayoutChange("lane")}
            >
              Reading lane
            </button>
            <button
              type="button"
              aria-pressed={practiceLayout === "split"}
              onClick={() => onPracticeLayoutChange("split")}
            >
              Split
            </button>
            {practiceLayout === "lane" && (
              <button
                type="button"
                aria-label="Lane theme"
                onClick={() =>
                  onLaneThemeChange(laneTheme === "dark" ? "paper" : "dark")
                }
              >
                {laneTheme === "dark" ? "Paper" : "Dark"}
              </button>
            )}
          </div>
        )
      )}

    </div>
  );
}
