import { useEffect, useRef, useState } from "react";
import type { Score, Hand } from "../model/score";
import { Transport } from "../transport/transport";
import { MidiSession } from "./MidiSession";
import type { MidiDevice, MidiStatus } from "../midi/MidiInput";
import { FrameLoop } from "./frameLoop";
import {
  createAudioEngine,
  startAudioContext,
  type AudioEngine,
} from "../audio/engine";
import { FalldownRenderer } from "../falldown/renderer";
import { renderScore } from "../score-view/verovio";
import { ScoreView } from "../score-view/scoreView";
import { Divider } from "../layout/Divider";
import type { ViewMode } from "../layout/viewMode";
import { TopBar } from "../ui/TopBar";
import { ToolsPopover } from "../ui/ToolsPopover";
import { PlayTools } from "../ui/PlayTools";
import { MidiTools } from "../ui/MidiTools";
import { HandState } from "../practice/hands";
import {
  getPracticeState,
  savePracticeState,
  type StoredPracticeState,
} from "../library/db";
import {
  capturePracticeState,
  applyPracticeState,
  seedTabSnapshots,
} from "../library/practiceState";
import type { TabMode } from "../layout/practiceMode";
import { measureJumpTarget } from "../transport/measureJump";
import {
  captureTab,
  applyTab,
  switchTab,
  type TabSnapshot,
} from "../transport/tabSnapshot";

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
 *
 * STABILITY CONSTRAINT: The falldown <canvas> and score-container <div> must
 * never be unmounted across play↔midi tab switches, because FalldownRenderer
 * and ScoreView bind to their DOM nodes on mount.
 *
 * Both are rendered at fixed, unconditional React tree positions inside one
 * stable content wrapper. The mode switch changes only CSS classes on the
 * wrapper and the score-panel div — never the component type at those
 * positions. No ternary switches the wrapper type of the canvas or
 * score-container.
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

  // The MIDI Practice session: input sources + wait-mode, created once. Audio
  // and falldown are late-bound below once they exist.
  const [midiSession] = useState(
    () => new MidiSession(transport.clock, score, handState),
  );

  const engineRef = useRef<AudioEngine | null>(null);
  const scoreViewRef = useRef<ScoreView | null>(null);
  const audioStartedRef = useRef(false);
  const falldownRef = useRef<FalldownRenderer | null>(null);
  const loadedStateRef = useRef<StoredPracticeState | null>(null);

  // One transport snapshot per tab. Seeded once the stored state resolves.
  const snapshotsRef = useRef<Record<TabMode, TabSnapshot> | null>(null);

  const modeRef = useRef<TabMode>("play");

  const [mode, setMode] = useState<TabMode>("play");
  const [countInBars, setCountInBars] = useState(0);

  // MIDI tab configuration mirrored into React so MidiTools re-renders.
  const [midiStatus, setMidiStatus] = useState<MidiStatus>("no-device");
  const [midiDevices, setMidiDevices] = useState<readonly MidiDevice[]>([]);
  const [handsIPlay, setHandsIPlay] = useState<Set<Hand>>(
    () => new Set<Hand>(["right"]),
  );
  const [waitEnabled, setWaitEnabled] = useState(true);
  const [monitorOn, setMonitorOn] = useState(true);

  const [viewMode, setViewMode] = useState<ViewMode>("both");
  const [split, setSplit] = useState(0.58);
  const [scoreReady, setScoreReady] = useState(false);
  const [scoreZoom, setScoreZoom] = useState(DEFAULT_SCORE_ZOOM);
  const [laneCollapsed, setLaneCollapsed] = useState(false);

  // The falldown renderer and audio engine are built inside the mount effect;
  // exposing them as state lets the Tools popover render against them in JSX.
  const [falldown, setFalldown] = useState<FalldownRenderer | null>(null);
  const [audioEngine, setAudioEngine] = useState<AudioEngine | null>(null);

  // The practice-state restore is async; gate the Tools popover on this so its
  // inputs initialize from the restored values rather than stale defaults.
  const [practiceReady, setPracticeReady] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);

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
        midiSession.attachFalldown(falldownInstance);
        setFalldown(falldownInstance);
      }
    }

    // Mirror MIDI device status/list into React so MidiTools re-renders on
    // hot-plug. Read-then-set captures the latest state at each change.
    midiSession.setStatusListener(() => {
      setMidiStatus(midiSession.status);
      setMidiDevices([...midiSession.devices]);
    });
    loop.onFrame(() => midiSession.update());

    loop.start();

    void (async () => {
      try {
        const engine = await createAudioEngine(transport);
        if (cancelled) return;
        engine.handState = handState;
        engineRef.current = engine;
        midiSession.attachAudio(engine);
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
      const initialMode: TabMode = state?.mode === "midi" ? "midi" : "play";
      const snapshots = seedTabSnapshots(transport, state ?? null);
      applyTab(snapshots[initialMode], transport);
      snapshotsRef.current = snapshots;
      setMode(initialMode);
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
      midiSession.dispose();
      scoreViewRef.current?.destroy();
      const renderer = falldownRef.current;
      const beat = renderer
        ? {
            numerator: renderer.beatMeter.numerator,
            denominator: renderer.beatMeter.denominator,
            subdivision: engineRef.current?.metronome.subdivision ?? 1,
          }
        : undefined;
      const snapshots = snapshotsRef.current;
      if (snapshots) snapshots[modeRef.current] = captureTab(transport);
      void savePracticeState(
        pieceId,
        capturePracticeState(transport, handState, beat, {
          mode: modeRef.current,
          ...(snapshots && { tabs: snapshots }),
        }),
      );
    };
  }, [transport, handState, pieceId, midiSession]);

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

  // Activate the MIDI session only while the MIDI tab is showing — this is what
  // keeps the wait-mode controller (and its clock hold) off the play tab.
  useEffect(() => {
    midiSession.setActive(mode === "midi");
  }, [mode, midiSession]);

  // Push the user-facing MIDI config into the session (single effect so that
  // all three settings are propagated together whenever any one changes).
  useEffect(() => {
    midiSession.setHandsIPlay(handsIPlay);
    midiSession.setWaitEnabled(waitEnabled);
    midiSession.setMonitorOn(monitorOn);
  }, [handsIPlay, waitEnabled, monitorOn, midiSession]);

  // Arrow keys jump the playhead one measure back/forward, in both modes.
  // Spacebar toggles play/pause.
  // Both are ignored while a form control is focused (so typing is not stolen).
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== " ")
        return;
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
      e.preventDefault();
      if (e.key === " ") {
        transport.clock.toggle();
        return;
      }
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

  // Switch tabs without carrying playback over: snapshot the leaving tab and
  // restore the entering tab. Always lands paused.
  function switchMode(next: TabMode): void {
    if (next === modeRef.current) return;
    const snapshots = snapshotsRef.current;
    if (!snapshots) {
      // Snapshots not seeded yet (stored state still loading) — still honour
      // the "switching always pauses" invariant.
      transport.clock.pause();
      setMode(next);
      return;
    }
    switchTab(transport, snapshots, modeRef.current, next);
    setMode(next);
  }

  const isMidi = mode === "midi";

  // In play mode, visibility of each panel depends on viewMode.
  const showFalldownInPlay = viewMode !== "score";
  const showScoreInPlay = viewMode !== "falldown";

  // Falldown panel flex style — play mode only; MIDI mode CSS handles it.
  const falldownPanelStyle = isMidi
    ? undefined
    : viewMode === "both"
      ? {
          display: showFalldownInPlay ? undefined : "none",
          flexBasis: `${split * 100}%`,
          flexGrow: 0,
          flexShrink: 0,
        }
      : { display: showFalldownInPlay ? undefined : "none", flex: 1 };

  // Score panel display style — play mode only; MIDI mode CSS handles it.
  const scorePanelStyle = isMidi
    ? undefined
    : { display: showScoreInPlay ? undefined : "none", flex: 1 };

  // The score-container uses horizontal-pages only in play score-only view.
  const scoreContainerClass =
    !isMidi && viewMode === "score"
      ? "score-container horizontal-pages"
      : "score-container";

  // CSS classes for the score panel wrapper:
  //   play mode  →  "practice-score-panel"
  //   midi mode  →  "practice-score-panel reading-lane [reading-lane--collapsed]"
  const scorePanelClass = [
    "practice-score-panel",
    isMidi ? "reading-lane" : "",
    isMidi && laneCollapsed ? "reading-lane--collapsed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="practice-view">
      {/*
       * ONE stable content area. The falldown <canvas> (position A) and the
       * score-container <div> (position B) are ALWAYS rendered here, never
       * swapped between different component types. CSS classes on the wrapper
       * and the score-panel div control the visual arrangement for each mode.
       */}
      <div
        className={[
          "practice-content",
          `practice-content--${mode}`,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {/* [A] Falldown panel — stable tree position, always rendered */}
        <div className="practice-falldown-panel" style={falldownPanelStyle}>
          <canvas ref={canvasRef} className="falldown-canvas" />
        </div>

        {/* Divider — play + both mode only */}
        {!isMidi && viewMode === "both" && (
          <Divider fraction={split} onChange={setSplit} />
        )}

        {/*
         * [B] Score panel — stable tree position, always rendered as a <div>.
         * The component type never changes; only the className does.
         * In play mode: right flex column.
         * In MIDI mode: reading-lane strip at top (~120 px, or 0 when collapsed).
         */}
        <div
          className={scorePanelClass}
          style={scorePanelStyle}
          {...(isMidi ? { "data-testid": "reading-lane" } : {})}
        >
          {/* The score-container ref is always this element, at this position */}
          <div ref={scoreContainerRef} className={scoreContainerClass} />

          {/* Play-mode score zoom buttons */}
          {!isMidi && (
            <div className="score-zoom">
              <button type="button" aria-label="Zoom out" onClick={zoomOut}>
                −
              </button>
              <button type="button" aria-label="Zoom in" onClick={zoomIn}>
                +
              </button>
            </div>
          )}

          {/* MIDI-mode reading-lane toggle — only shown when expanded.
               When collapsed, the lane has overflow:hidden so this button
               would be geometrically clipped and unclickable. Re-expanding
               is done via the TopBar "Reading lane" toggle instead. */}
          {isMidi && !laneCollapsed && (
            <button
              type="button"
              className="reading-lane-toggle"
              aria-label="Collapse reading lane"
              aria-expanded={true}
              onClick={() => setLaneCollapsed(true)}
            >
              ▾ Reading lane
            </button>
          )}
        </div>
      </div>

      <TopBar
        pieceName={pieceName}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onOpenLibrary={onExit}
        toolsOpen={toolsOpen}
        onToggleTools={() => setToolsOpen((o) => !o)}
        mode={mode}
        onModeChange={switchMode}
        transport={transport}
        audioEngine={audioEngine}
        countInBars={countInBars}
        laneCollapsed={laneCollapsed}
        onToggleLane={() => setLaneCollapsed((c) => !c)}
        midiStatus={midiStatus}
        midiDeviceName={
          midiDevices.find((d) => d.id === midiSession.selectedDeviceId)?.name
        }
      />
      <ToolsPopover open={toolsOpen}>
        {practiceReady && mode === "play" && (
          <PlayTools
            transport={transport}
            handState={handState}
            audioEngine={audioEngine}
            falldown={falldown}
            countInBars={countInBars}
            onCountInBarsChange={setCountInBars}
          />
        )}
        {practiceReady && mode === "midi" && (
          <MidiTools
            transport={transport}
            countInBars={countInBars}
            onCountInBarsChange={setCountInBars}
            audioEngine={audioEngine}
            falldown={falldown}
            midiStatus={midiStatus}
            devices={midiDevices}
            selectedDeviceId={midiSession.selectedDeviceId}
            onSelectDevice={(id) => midiSession.selectDevice(id)}
            handsIPlay={handsIPlay}
            onHandsIPlayChange={setHandsIPlay}
            waitEnabled={waitEnabled}
            onWaitEnabledChange={setWaitEnabled}
            monitorOn={monitorOn}
            onMonitorOnChange={setMonitorOn}
          />
        )}
      </ToolsPopover>
      {!scoreReady && <div className="score-loading">Loading score…</div>}
      {score.qualityWarning && (
        <div className="quality-warning">{score.qualityWarning}</div>
      )}
    </div>
  );
}
