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
import { TransportBar } from "../ui/TransportBar";
import { HandState } from "../practice/hands";
import { ControlPanel } from "../practice/ControlPanel";
import { getPracticeState, savePracticeState } from "../library/db";
import {
  capturePracticeState,
  applyPracticeState,
} from "../library/practiceState";

interface PracticeViewProps {
  score: Score;
  pieceId: string;
  onExit: () => void;
}

/**
 * The assembled practice screen: composes the transport, frame loop, falldown
 * renderer, audio engine, and engraved score view into a single playable view.
 */
export function PracticeView({ score, pieceId, onExit }: PracticeViewProps) {
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

  const [viewMode, setViewMode] = useState<ViewMode>("both");
  const [split, setSplit] = useState(0.65);
  const [scoreReady, setScoreReady] = useState(false);

  // The falldown renderer and audio engine are built inside the mount effect;
  // exposing them as state lets the ControlPanel render against them in JSX.
  const [falldown, setFalldown] = useState<FalldownRenderer | null>(null);
  const [audioEngine, setAudioEngine] = useState<AudioEngine | null>(null);

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
        setAudioEngine(engine);
      } catch {
        // Audio is non-essential for the visual practice view; ignore failures.
      }
    })();

    void (async () => {
      const state = await getPracticeState(pieceId);
      if (cancelled || !state) return;
      applyPracticeState(state, transport, handState);
    })();

    void (async () => {
      try {
        const { svg, timemap } = await renderScore(transport.score.musicXml);
        if (cancelled) return;
        const container = scoreContainerRef.current;
        if (!container) return;
        const scoreView = new ScoreView(container, transport, svg, timemap);
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
      void savePracticeState(
        pieceId,
        capturePracticeState(transport, handState),
      );
    };
  }, [transport, handState, pieceId]);

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

  return (
    <div className="practice-view">
      <div className="practice-header">
        <button type="button" onClick={onExit}>
          Library
        </button>
        <TransportBar
          transport={transport}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
      </div>
      {falldown && (
        <ControlPanel
          transport={transport}
          handState={handState}
          falldown={falldown}
          audioEngine={audioEngine}
        />
      )}
      <Layout
        viewMode={viewMode}
        split={split}
        onSplitChange={setSplit}
        falldown={<canvas ref={canvasRef} className="falldown-canvas" />}
        score={<div ref={scoreContainerRef} className="score-container" />}
      />
      {!scoreReady && <div className="score-loading">Loading score…</div>}
      {score.qualityWarning && (
        <div className="quality-warning">{score.qualityWarning}</div>
      )}
    </div>
  );
}
