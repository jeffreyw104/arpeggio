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
import { renderScore, renderReadingLane } from "../score-view/verovio";
import { ScoreView } from "../score-view/scoreView";
import { ReadingLaneView } from "../score-view/ReadingLaneView";
import { Divider } from "../layout/Divider";
import type { ViewMode } from "../layout/viewMode";
import { useIsTouchDevice } from "../responsive/useIsTouchDevice";
import { useIsNarrowViewport } from "../responsive/useIsNarrowViewport";
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
import type {
  TabMode,
  PracticeLayout,
  LaneTheme,
} from "../layout/practiceMode";
import { measureJumpTarget } from "../transport/measureJump";
import {
  captureTab,
  applyTab,
  switchTab,
  type TabSnapshot,
} from "../transport/tabSnapshot";
import { SectionStrip } from "../section-strip/SectionStrip";
import { ContextMenu } from "../section-strip/ContextMenu";
import { SplitWarningToast } from "../responsive/SplitWarningToast";
import { autoDetect } from "../section-strip/autoDetect";
import { normalize, type SectionState } from "../model/sections";
import {
  loadStripPosition,
  saveStripPosition,
  type StripPosition,
} from "../section-strip/stripPosition";

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
  const laneContainerRef = useRef<HTMLDivElement>(null);

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
  const laneViewRef = useRef<ReadingLaneView | null>(null);
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
  // Default to no hand selected — nothing muted, the piece plays in full.
  const [handsIPlay, setHandsIPlay] = useState<Set<Hand>>(
    () => new Set<Hand>(),
  );
  const [waitEnabled, setWaitEnabled] = useState(true);
  const [monitorOn, setMonitorOn] = useState(true);

  const [viewMode, setViewMode] = useState<ViewMode>("both");
  const [split, setSplit] = useState(0.58);
  const [scoreReady, setScoreReady] = useState(false);
  const [scoreZoom, setScoreZoom] = useState(DEFAULT_SCORE_ZOOM);
  const [practiceLayout, setPracticeLayout] = useState<PracticeLayout>("lane");
  const [laneTheme, setLaneTheme] = useState<LaneTheme>("paper");

  const isTouchDevice = useIsTouchDevice();
  const isNarrowViewport = useIsNarrowViewport(1024);
  const layoutOrientation: "row" | "column" =
    isTouchDevice && isNarrowViewport ? "column" : "row";

  // The falldown renderer and audio engine are built inside the mount effect;
  // exposing them as state lets the Tools popover render against them in JSX.
  const [falldown, setFalldown] = useState<FalldownRenderer | null>(null);
  const [audioEngine, setAudioEngine] = useState<AudioEngine | null>(null);

  // The practice-state restore is async; gate the Tools popover on this so its
  // inputs initialize from the restored values rather than stale defaults.
  const [practiceReady, setPracticeReady] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);

  // True when the loaded piece is a MIDI file — affects layout and strip.
  const isMidiSource = score.source === "midi";
  const [sectionState, setSectionState] = useState<SectionState | null>(null);
  const [sectionHistory, setSectionHistory] = useState<SectionState[]>([]);
  // Undo stack cap — long editing sessions won't grow this without bound.
  // 50 covers any realistic interactive session; older snapshots silently
  // drop off the back so memory stays small.
  const UNDO_HISTORY_MAX = 50;
  function applySectionStateChange(next: SectionState): void {
    setSectionHistory((h) => {
      if (!sectionState) return h;
      const trimmed =
        h.length >= UNDO_HISTORY_MAX ? h.slice(h.length - UNDO_HISTORY_MAX + 1) : h;
      return [...trimmed, sectionState];
    });
    setSectionState(next);
  }
  function undoSectionStateChange(): void {
    setSectionHistory((h) => {
      if (h.length === 0) return h;
      const last = h[h.length - 1];
      setSectionState(last);
      return h.slice(0, -1);
    });
  }
  const [stripPosition, setStripPosition] = useState<StripPosition>(() =>
    loadStripPosition(),
  );
  // Measured height of the rendered strip — drives the tools-popover offset
  // when the strip is docked at the top so the popover stays below it. We
  // re-attach the ResizeObserver only when the wrapper element itself comes
  // and goes (toggled by `isMidiSource && sectionState`); section edits and
  // position changes don't unmount the wrapper so they don't rebind the RO.
  const stripWrapperRef = useRef<HTMLDivElement>(null);
  const stripMounted = isMidiSource && sectionState !== null;
  const [stripHeight, setStripHeight] = useState(0);
  useEffect(() => {
    const el = stripWrapperRef.current;
    if (!el) {
      setStripHeight(0);
      return;
    }
    const measure = (): void => setStripHeight(el.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [stripMounted]);

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
        midiSession.attachPointerInput(canvas);
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

    // A tempo-mode toggle replaces transport.score with a re-timed score;
    // wait-mode's pre-built steps would otherwise sit at stale onset seconds
    // and park the clock at points that no longer correspond to the new time
    // space. Push the new score into the session so the steps rebuild.
    const offScoreChange = transport.onScoreChange((s) =>
      midiSession.setScore(s),
    );

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
        if (loaded && loaded.manualOverride && loaded.numerator && loaded.denominator) {
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
        if (state.manualOverride && state.numerator && state.denominator) {
          const renderer = falldownRef.current;
          if (renderer) {
            renderer.timeSignatures = [
              {
                start: 0,
                numerator: state.numerator,
                denominator: state.denominator,
              },
            ];
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
      // Seed section state for MIDI sources.
      if (score.source === "midi") {
        if (state?.sectionState) {
          setSectionState(normalize(state.sectionState, score.durationSeconds));
        } else {
          setSectionState(autoDetect(score));
        }
      }
      const initialMode: TabMode = state?.mode === "midi" ? "midi" : "play";
      const snapshots = seedTabSnapshots(transport, state ?? null);
      applyTab(snapshots[initialMode], transport);
      snapshotsRef.current = snapshots;
      setMode(initialMode);
      setPracticeReady(true);
    })();

    if (score.source === "midi") {
      // MIDI sources have no engraved score — mark ready immediately so the
      // loading overlay never blocks the SectionStrip.
      setScoreReady(true);
    } else {
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

      // The reading lane is a second, separate engraving — systems stacked on
      // one page (see renderReadingLane) — driven by the same clock as the split
      // ScoreView, so the two views stay in sync across a layout switch.
      void (async () => {
        try {
          const laneSvgs = await renderReadingLane(transport.score.musicXml);
          if (cancelled) return;
          const container = laneContainerRef.current;
          if (!container) return;
          const laneView = new ReadingLaneView(container, transport, laneSvgs);
          laneViewRef.current = laneView;
          loop.onFrame(() => laneView.renderFrame());
        } catch {
          // The reading lane is optional; ignore render failures.
        }
      })();
    }

    return () => {
      cancelled = true;
      offScoreChange();
      loop.stop();
      midiSession.detachPointerInput();
      midiSession.dispose();
      scoreViewRef.current?.destroy();
      laneViewRef.current?.destroy();
      const engine = engineRef.current;
      const override = engine?.metronome.manualOverride
        ? engine.metronome.timeSignature
        : null;
      const beat = engine
        ? {
            ...(override && { numerator: override.numerator, denominator: override.denominator }),
            subdivision: engine.metronome.subdivision,
            manualOverride: engine.metronome.manualOverride,
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
  }, [transport, handState, pieceId, midiSession, score]);

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

  // Also resume on the FIRST user gesture anywhere in the document. Tapping
  // the on-canvas piano (or pressing a QWERTY key) before Play is pressed
  // needs an already-running audio context, otherwise the first input note
  // is silent — Tone.js can't schedule against a suspended context.
  useEffect(() => {
    const resume = (): void => {
      if (audioStartedRef.current) return;
      audioStartedRef.current = true;
      void startAudioContext();
    };
    document.addEventListener("pointerdown", resume, { once: true, capture: true });
    document.addEventListener("keydown", resume, { once: true, capture: true });
    return () => {
      document.removeEventListener("pointerdown", resume, { capture: true });
      document.removeEventListener("keydown", resume, { capture: true });
    };
  }, []);

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

  // Persist sectionState whenever it changes (MIDI source only).
  useEffect(() => {
    if (!isMidiSource || !sectionState) return;
    const engine = engineRef.current;
    const override = engine?.metronome.manualOverride
      ? engine.metronome.timeSignature
      : null;
    const beat = engine
      ? {
          ...(override && { numerator: override.numerator, denominator: override.denominator }),
          subdivision: engine.metronome.subdivision,
          manualOverride: engine.metronome.manualOverride,
        }
      : undefined;
    const snapshots = snapshotsRef.current;
    void savePracticeState(
      pieceId,
      capturePracticeState(transport, handState, beat, {
        mode: modeRef.current,
        ...(snapshots && { tabs: snapshots }),
      }, sectionState),
    );
  }, [isMidiSource, sectionState, pieceId, transport, handState]);

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
      // Same exit-the-loop semantics as a measure click: if the user is
      // navigating outside an active loop, treat it as an intentional exit
      // so the next tick doesn't wrap them back to loop.start.
      const loop = transport.clock.loop;
      if (loop && (target < loop.start || target >= loop.end)) {
        transport.clock.setLoop(null);
      }
      transport.clock.seek(target);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [transport]);

  // Global shortcuts: Cmd/Ctrl+Z undoes the last section-strip edit; Escape
  // closes the tools popover. Both are ignored while a form control is
  // focused so the browser's text-editing semantics keep working.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const t = e.target as HTMLElement | null;
      const inForm = t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        if (inForm) return;
        if (sectionHistory.length === 0) return;
        e.preventDefault();
        undoSectionStateChange();
        return;
      }
      if (e.key === "Escape") {
        if (inForm) return;
        if (toolsOpen) {
          e.preventDefault();
          setToolsOpen(false);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // sectionHistory.length is included so the guard sees the latest count;
    // undoSectionStateChange itself only reads via setSectionHistory's updater.
  }, [sectionHistory.length, toolsOpen]);

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

  function handleOpenLibrary(): void {
    onExit();
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

  // Show the split warning toast the first time a touch-device user selects
  // a split/both layout. Gated by isTouchDevice so desktop users never see it.
  const showSplitWarning =
    isTouchDevice &&
    ((isMidi && practiceLayout === "split") || (!isMidi && viewMode === "both"));

  // In play mode, visibility of each panel depends on viewMode.
  const showFalldownInPlay = viewMode !== "score";
  const showScoreInPlay = viewMode !== "falldown";

  // Falldown panel flex style. Play mode is unchanged; the MIDI split layout
  // sizes its panels exactly the way play's side-by-side view does, and the
  // MIDI reading-lane layout is driven purely by CSS.
  // MIDI-source files have no engraved score and no reading lane, so the
  // falldown takes the full width regardless of mode/layout.
  const falldownPanelStyle = isMidiSource
    ? { flex: 1 }
    : isMidi
    ? practiceLayout === "split"
      ? layoutOrientation === "row"
        ? { flexBasis: `${split * 100}%`, flexGrow: 0, flexShrink: 0 }
        : undefined
      : undefined
    : viewMode === "both"
      ? {
          display: showFalldownInPlay ? undefined : "none",
          flexBasis: `${split * 100}%`,
          flexGrow: 0,
          flexShrink: 0,
        }
      : { display: showFalldownInPlay ? undefined : "none", flex: 1 };

  // Score panel display style.
  const scorePanelStyle = isMidi
    ? practiceLayout === "split" || practiceLayout === "score"
      ? { flex: 1 }
      : undefined
    : { display: showScoreInPlay ? undefined : "none", flex: 1 };

  // The score-container uses horizontal-pages in play score-only view and
  // in MIDI score-only layout.
  const scoreContainerClass =
    (!isMidi && viewMode === "score") || (isMidi && practiceLayout === "score")
      ? "score-container horizontal-pages"
      : "score-container";

  // The score panel is one stable element; the content-wrapper classes drive
  // its arrangement (play column / midi lane overlay / midi split panel).
  const scorePanelClass = "practice-score-panel";

  function handleStripPositionChange(p: StripPosition): void {
    saveStripPosition(p);
    setStripPosition(p);
  }

  // Right-click anywhere in the practice content (engraved score, reading
  // lane, falldown) when a loop is active opens a small "Clear loop" menu.
  const [loopMenuPos, setLoopMenuPos] = useState<{ x: number; y: number } | null>(null);
  function handlePracticeContextMenu(e: React.MouseEvent<HTMLDivElement>): void {
    if (!transport.clock.loop) return;
    e.preventDefault();
    setLoopMenuPos({ x: e.clientX, y: e.clientY });
  }
  useEffect(() => {
    if (!loopMenuPos) return;
    const close = (): void => setLoopMenuPos(null);
    window.addEventListener("click", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", close);
    };
  }, [loopMenuPos]);

  return (
    <div
      className="practice-view"
      style={
        {
          "--section-strip-height": `${stripHeight}px`,
        } as React.CSSProperties
      }
    >
      {/* SectionStrip — single mount; CSS flex order places it above or below
          .practice-content depending on the section-strip--top/bottom modifier. */}
      {isMidiSource && sectionState && (
        <div
          ref={stripWrapperRef}
          className={`section-strip-wrapper section-strip-wrapper--${stripPosition}`}
        >
          <SectionStrip
            state={sectionState}
            transport={transport}
            position={stripPosition}
            onChange={applySectionStateChange}
            canUndo={sectionHistory.length > 0}
            onUndo={undoSectionStateChange}
          />
        </div>
      )}
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
          isMidi ? `layout-${practiceLayout}` : "",
          isMidiSource ? "practice-content--midi-source" : "",
          layoutOrientation === "column" ? "practice-content--column" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onContextMenu={handlePracticeContextMenu}
      >
        {/* [A] Falldown panel — stable tree position, always rendered */}
        <div className="practice-falldown-panel" style={falldownPanelStyle}>
          <canvas ref={canvasRef} className="falldown-canvas" />
        </div>

        {/* Divider — play "both", or the MIDI split layout */}
        {((!isMidi && viewMode === "both") ||
          (isMidi && practiceLayout === "split")) && (
          <Divider fraction={split} onChange={setSplit} />
        )}

        {/*
         * [B] Score panel — stable tree position, always rendered as a <div>.
         * The component type never changes; only the className does.
         * In play mode: right flex column.
         * In MIDI mode: frosted reading-lane overlay (layout-lane) or a
         * side-by-side panel (layout-split).
         */}
        <div className={scorePanelClass} style={scorePanelStyle}>
          {/* The score-container ref is always this element, at this position */}
          <div ref={scoreContainerRef} className={scoreContainerClass} />

          {/* Score zoom buttons — wherever the paginated score is shown */}
          {(!isMidi || practiceLayout === "split" || practiceLayout === "score") && (
            <div className="score-zoom">
              <button type="button" aria-label="Zoom out" onClick={zoomOut}>
                −
              </button>
              <button type="button" aria-label="Zoom in" onClick={zoomIn}>
                +
              </button>
            </div>
          )}

        </div>

        {/*
         * [C] Reading-lane ribbon panel — stable tree position, always
         * rendered. CSS reveals it only in the MIDI reading-lane layout.
         */}
        <div
          className={`practice-lane-panel lane-theme-${laneTheme}`}
          data-testid="reading-lane"
        >
          <div className="practice-lane-bg">
            <div ref={laneContainerRef} className="reading-lane-viewport" />
          </div>
        </div>
      </div>

      <TopBar
        pieceName={pieceName}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onOpenLibrary={handleOpenLibrary}
        toolsOpen={toolsOpen}
        onToggleTools={() => setToolsOpen((o) => !o)}
        mode={mode}
        onModeChange={switchMode}
        transport={transport}
        audioEngine={audioEngine}
        countInBars={countInBars}
        practiceLayout={practiceLayout}
        onPracticeLayoutChange={setPracticeLayout}
        laneTheme={laneTheme}
        onLaneThemeChange={setLaneTheme}
        midiStatus={midiStatus}
        midiDeviceName={
          midiDevices.find((d) => d.id === midiSession.selectedDeviceId)?.name
        }
        waitEnabled={waitEnabled}
        onWaitEnabledChange={setWaitEnabled}
        handsIPlay={handsIPlay}
        onHandsIPlayChange={setHandsIPlay}
        isMidiSource={isMidiSource}
      />
      <ToolsPopover
        open={toolsOpen}
        placement={
          // MIDI source files don't have an engraved reading lane, so the
          // popover never uses the below-lane position regardless of which
          // tab is active — its placement depends only on where the section
          // strip is docked. The below-lane case applies only to MusicXML
          // sources in MIDI Practice mode's lane layout.
          isMidiSource
            ? stripPosition === "top"
              ? "below-strip"
              : "default"
            : mode === "midi" && practiceLayout === "lane"
              ? "below-lane"
              : "default"
        }
      >
        {practiceReady && mode === "play" && (
          <PlayTools
            transport={transport}
            handState={handState}
            audioEngine={audioEngine}
            falldown={falldown}
            countInBars={countInBars}
            onCountInBarsChange={setCountInBars}
            isMidiSource={isMidiSource}
            stripPosition={stripPosition}
            onStripPositionChange={handleStripPositionChange}
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
            monitorOn={monitorOn}
            onMonitorOnChange={setMonitorOn}
            isMidiSource={isMidiSource}
            stripPosition={stripPosition}
            onStripPositionChange={handleStripPositionChange}
            waitEnabled={waitEnabled}
            onWaitEnabledChange={setWaitEnabled}
            handsIPlay={handsIPlay}
            onHandsIPlayChange={setHandsIPlay}
          />
        )}
      </ToolsPopover>
      {!scoreReady && (
        <div className="score-loading" role="status" aria-live="polite">
          <span className="score-loading-bars" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          Rendering sheet music
        </div>
      )}
      {!isMidiSource && score.qualityWarning && (
        <div className="quality-warning">{score.qualityWarning}</div>
      )}
      <SplitWarningToast shouldShow={showSplitWarning} />
      {loopMenuPos && (
        <ContextMenu
          className="practice-loop-menu"
          x={loopMenuPos.x}
          y={loopMenuPos.y}
          items={[
            {
              label: "Clear loop",
              onClick: () => {
                transport.clock.setLoop(null);
                setLoopMenuPos(null);
              },
            },
          ]}
        />
      )}
    </div>
  );
}
