import { useEffect, useRef, useState } from "react";
import type { Score } from "../model/score";
import { Transport } from "../transport/transport";
import { FrameLoop } from "./frameLoop";
import {
  createAudioEngine,
  startAudioContext,
  type AudioEngine,
} from "../audio/engine";
import { FalldownRenderer } from "../falldown/renderer";
import { renderScore } from "../score-view/verovio";
import { ScoreView } from "../score-view/scoreView";
import { Layout } from "../layout/Layout";
import type { ViewMode } from "../layout/viewMode";
import { ExtendedTopBar } from "../ui/ExtendedTopBar";
import { FloatingHud } from "../ui/FloatingHud";
import { TopBar } from "../ui/TopBar";
import { HandState } from "../practice/hands";
import type { HandVisibility } from "../practice/hands";
import { ControlPanel } from "../practice/ControlPanel";
import {
  getPracticeState,
  savePracticeState,
  type StoredPracticeState,
} from "../library/db";
import {
  capturePracticeState,
  applyPracticeState,
} from "../library/practiceState";
import type { PracticeMode } from "../layout/practiceMode";
import { measureJumpTarget } from "../transport/measureJump";

interface PracticeViewProps {
  score: Score;
  pieceId: string;
  pieceName: string;
  onExit: () => void;
}

/** Initial score zoom — slightly out so a full page fits beside the falldown. */
const DEFAULT_SCORE_ZOOM = 0.8;

/**
 * The assembled practice screen: composes the transport, frame loop, falldown
 * renderer, audio engine, and engraved score view into a single playable view.
 */
export function PracticeView({
  score,
  pieceId,
  pieceName,
  onExit,
}: PracticeViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scoreContainerRef = useRef<HTMLDivElement>(null);

  // The Transport must be stable across renders; a lazy initializer creates it
  // exactly once, and unlike a ref it is safe to read during render.
  const [transport] = useState(() => new Transport(score));

  // Stable per-hand mute/hide state shared by the audio engine and renderer.
  const [handState] = useState(() => new HandState());

  const engineRef = useRef<AudioEngine | null>(null);
  const scoreViewRef = useRef<ScoreView | null>(null);
  const audioStartedRef = useRef(false);
  const falldownRef = useRef<FalldownRenderer | null>(null);
  const loadedStateRef = useRef<StoredPracticeState | null>(null);

  // Practice-only state stowed while in Play mode (suspend & restore).
  const suspendedRef = useRef<{
    loop: { start: number; end: number } | null;
    speedUp: boolean;
    metronome: boolean;
    leftMuted: boolean;
    rightMuted: boolean;
    leftVis: HandVisibility;
    rightVis: HandVisibility;
  } | null>(null);
  // Each mode keeps its own tempo; snapshotted on switch, re-applied on return.
  const practiceBpmRef = useRef<number>(transport.bpm);
  const playBpmRef = useRef<number>(transport.referenceBpm);
  const modeRef = useRef<PracticeMode>("play");
  const collapsedRef = useRef(false);
  // True once the user has explicitly changed mode (prevents async init from
  // overwriting a mode the user already set before state was loaded).
  const userChangedModeRef = useRef(false);

  const [mode, setMode] = useState<PracticeMode>("play");
  const [hudCollapsed, setHudCollapsed] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>("both");
  const [split, setSplit] = useState(0.58);
  const [scoreReady, setScoreReady] = useState(false);
  const [scoreZoom, setScoreZoom] = useState(DEFAULT_SCORE_ZOOM);

  // The falldown renderer and audio engine are built inside the mount effect;
  // exposing them as state lets the ControlPanel render against them in JSX.
  const [falldown, setFalldown] = useState<FalldownRenderer | null>(null);
  const [audioEngine, setAudioEngine] = useState<AudioEngine | null>(null);

  // The practice-state restore is async; gate the ControlPanel on this so its
  // inputs initialize from the restored values rather than stale defaults.
  const [practiceReady, setPracticeReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Single mount effect: wires the frame loop, falldown, audio, and score view.
  useEffect(() => {
    let cancelled = false;
    const loop = new FrameLoop(transport.clock);

    const canvas = canvasRef.current;
    if (canvas) {
      const width = canvas.clientWidth || 800;
      const height = canvas.clientHeight || 600;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const falldownInstance = new FalldownRenderer(ctx, transport, {
          width,
          height,
        });
        falldownInstance.handState = handState;
        loop.onFrame(() => falldownInstance.renderFrame());
        falldownRef.current = falldownInstance;
        setFalldown(falldownInstance);
      }
    }

    loop.start();

    void (async () => {
      try {
        const engine = await createAudioEngine(transport);
        if (cancelled) return;
        engine.handState = handState;
        engineRef.current = engine;
        loop.onFrame(() => engine.update());
        const loaded = loadedStateRef.current;
        if (loaded && loaded.numerator && loaded.denominator) {
          engine.metronome.setTimeSignature(
            loaded.numerator,
            loaded.denominator,
          );
        }
        if (loaded && loaded.subdivision) {
          engine.metronome.subdivision = loaded.subdivision;
        }
        setAudioEngine(engine);
      } catch {
        // Audio is non-essential for the visual practice view; ignore failures.
      }
    })();

    void (async () => {
      const state = await getPracticeState(pieceId);
      if (cancelled) return;
      if (state) {
        loadedStateRef.current = state;
        applyPracticeState(state, transport, handState);
        if (state.numerator && state.denominator) {
          const renderer = falldownRef.current;
          if (renderer) {
            renderer.beatMeter = {
              numerator: state.numerator,
              denominator: state.denominator,
            };
          }
          if (engineRef.current) {
            engineRef.current.metronome.setTimeSignature(
              state.numerator,
              state.denominator,
            );
          }
        }
        if (state.subdivision != null && engineRef.current) {
          engineRef.current.metronome.subdivision = state.subdivision;
        }
      }
      practiceBpmRef.current = transport.bpm;
      playBpmRef.current = transport.referenceBpm;
      const restoredMode: PracticeMode = state?.mode ?? "play";
      if (restoredMode === "play") {
        // Stow whatever applyPracticeState just applied, so Play is clean
        // and a later switch to Practice restores it.
        suspendPractice();
        transport.setBpm(playBpmRef.current);
      }
      // Only apply the persisted mode and collapsed state if the user has not
      // already changed the mode (prevents async load from overwriting a change
      // made before the stored state resolved).
      if (!userChangedModeRef.current) {
        setMode(restoredMode);
        setHudCollapsed(state?.hudCollapsed ?? false);
      }
      setPracticeReady(true);
    })();

    void (async () => {
      try {
        const { svgPages, timemap } = await renderScore(
          transport.score.musicXml,
        );
        if (cancelled) return;
        const container = scoreContainerRef.current;
        if (!container) return;
        const scoreView = new ScoreView(
          container,
          transport,
          svgPages,
          timemap,
        );
        // Start slightly zoomed out; the zoom buttons drive subsequent changes.
        scoreView.setZoom(DEFAULT_SCORE_ZOOM);
        scoreViewRef.current = scoreView;
        loop.onFrame(() => scoreView.renderFrame());
        setScoreReady(true);
      } catch {
        // Verovio failed; leave the score panel empty rather than crashing.
      }
    })();

    return () => {
      cancelled = true;
      loop.stop();
      scoreViewRef.current?.destroy();
      const renderer = falldownRef.current;
      const beat = renderer
        ? {
            numerator: renderer.beatMeter.numerator,
            denominator: renderer.beatMeter.denominator,
            subdivision: engineRef.current?.metronome.subdivision ?? 1,
          }
        : undefined;
      // If we are in Play mode the practice state is suspended; momentarily
      // restore it so the captured snapshot has the real loop/hand values.
      if (modeRef.current === "play") restorePractice();
      void savePracticeState(
        pieceId,
        capturePracticeState(transport, handState, beat, {
          mode: modeRef.current,
          hudCollapsed: collapsedRef.current,
        }),
      );
    };
  }, [transport, handState, pieceId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fit the falldown canvas whenever its panel resizes (view-mode switch,
  // divider drag, or window resize). The renderer holds onto a fixed pixel
  // size, so the canvas backing store and the renderer must both be updated.
  useEffect(() => {
    if (!falldown) return;
    if (typeof ResizeObserver === "undefined") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const observer = new ResizeObserver(() => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width > 0 && height > 0) {
        canvas.width = width;
        canvas.height = height;
        falldown.resize(width, height);
      }
    });
    observer.observe(canvas);

    return () => observer.disconnect();
  }, [falldown]);

  // Resume the Web Audio context on the first user-driven play.
  useEffect(() => {
    return transport.clock.onChange(() => {
      if (transport.clock.playing && !audioStartedRef.current) {
        audioStartedRef.current = true;
        void startAudioContext();
      }
    });
  }, [transport]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    collapsedRef.current = hudCollapsed;
  }, [hudCollapsed]);

  // Arrow keys jump the playhead one measure back/forward, in both modes.
  // Ignored while a form control is focused (so typing a tempo is not stolen).
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
      e.preventDefault();
      const target = measureJumpTarget(
        transport.score.measures,
        transport.clock.position,
        e.key === "ArrowRight" ? "next" : "prev",
      );
      transport.clock.seek(target);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [transport]);

  // Stow practice-only state and make playback "straight through" for Play.
  function suspendPractice(): void {
    const loop = transport.clock.loop;
    suspendedRef.current = {
      loop: loop ? { start: loop.start, end: loop.end } : null,
      speedUp: transport.speedUpActive,
      metronome: engineRef.current?.metronome.enabled ?? false,
      leftMuted: handState.isMuted("left"),
      rightMuted: handState.isMuted("right"),
      leftVis: handState.visibility("left"),
      rightVis: handState.visibility("right"),
    };
    transport.clearLoop();
    transport.disableSpeedUp();
    if (engineRef.current) {
      engineRef.current.metronome.enabled = false;
    }
    if (falldownRef.current) {
      falldownRef.current.showBeatPulse = false;
    }
    handState.setMuted("left", false);
    handState.setMuted("right", false);
    handState.setVisibility("left", "show");
    handState.setVisibility("right", "show");
  }

  // Restore the practice-only state stowed by suspendPractice().
  function restorePractice(): void {
    const s = suspendedRef.current;
    if (!s) return;
    transport.clock.setLoop(s.loop ? { ...s.loop } : null);
    if (s.speedUp) {
      // Speed-up is a ramping process, not a stored value: restoring it restarts
      // the ramp from startRate. Mid-ramp progress across a mode switch is lost.
      transport.enableSpeedUp({ startRate: 0.5, targetRate: 1, step: 0.05 });
    }
    if (engineRef.current) {
      engineRef.current.metronome.enabled = s.metronome;
    }
    if (falldownRef.current) {
      falldownRef.current.showBeatPulse = s.metronome;
    }
    handState.setMuted("left", s.leftMuted);
    handState.setMuted("right", s.rightMuted);
    handState.setVisibility("left", s.leftVis);
    handState.setVisibility("right", s.rightVis);
  }

  function handleModeChange(next: PracticeMode): void {
    if (next === mode) return;
    userChangedModeRef.current = true;
    if (next === "play") {
      practiceBpmRef.current = transport.bpm;
      suspendPractice();
      transport.setBpm(playBpmRef.current);
    } else {
      playBpmRef.current = transport.bpm;
      restorePractice();
      transport.setBpm(practiceBpmRef.current);
    }
    setMode(next);
  }

  function zoomIn(): void {
    const next = Math.min(2.5, Math.round((scoreZoom + 0.25) * 100) / 100);
    setScoreZoom(next);
    scoreViewRef.current?.setZoom(next);
  }

  function zoomOut(): void {
    const next = Math.max(0.5, Math.round((scoreZoom - 0.25) * 100) / 100);
    setScoreZoom(next);
    scoreViewRef.current?.setZoom(next);
  }

  const extendedBarShown = mode === "practice" && !hudCollapsed && practiceReady;

  return (
    <div
      className={
        extendedBarShown
          ? "practice-view practice-view--extended"
          : "practice-view"
      }
    >
      <Layout
        viewMode={viewMode}
        split={split}
        onSplitChange={setSplit}
        falldown={<canvas ref={canvasRef} className="falldown-canvas" />}
        score={
          <>
            <div
              ref={scoreContainerRef}
              className={
                viewMode === "score"
                  ? "score-container horizontal-pages"
                  : "score-container"
              }
            />
            <div className="score-zoom">
              <button type="button" aria-label="Zoom out" onClick={zoomOut}>
                −
              </button>
              <button type="button" aria-label="Zoom in" onClick={zoomIn}>
                +
              </button>
            </div>
          </>
        }
      />
      <TopBar
        pieceName={pieceName}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onOpenLibrary={onExit}
        settingsOpen={settingsOpen}
        onToggleSettings={() => setSettingsOpen((o) => !o)}
        mode={mode}
        onModeChange={handleModeChange}
      />
      <FloatingHud
        transport={transport}
        settingsOpen={settingsOpen}
        audioEngine={audioEngine}
        falldown={falldown}
        mode={mode}
        collapsed={hudCollapsed}
      />
      {extendedBarShown && (
        <ExtendedTopBar transport={transport} handState={handState} />
      )}
      {falldown && practiceReady && settingsOpen && (
        <ControlPanel falldown={falldown} audioEngine={audioEngine} />
      )}
      {!scoreReady && <div className="score-loading">Loading score…</div>}
      {score.qualityWarning && (
        <div className="quality-warning">{score.qualityWarning}</div>
      )}
    </div>
  );
}
