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

interface PracticeViewProps {
  score: Score;
}

/**
 * The assembled practice screen: composes the transport, frame loop, falldown
 * renderer, audio engine, and engraved score view into a single playable view.
 */
export function PracticeView({ score }: PracticeViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scoreContainerRef = useRef<HTMLDivElement>(null);

  // The Transport must be stable across renders; a lazy initializer creates it
  // exactly once, and unlike a ref it is safe to read during render.
  const [transport] = useState(() => new Transport(score));

  const engineRef = useRef<AudioEngine | null>(null);
  const scoreViewRef = useRef<ScoreView | null>(null);
  const audioStartedRef = useRef(false);

  const [viewMode, setViewMode] = useState<ViewMode>("both");
  const [split, setSplit] = useState(0.65);
  const [scoreReady, setScoreReady] = useState(false);

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
        const falldown = new FalldownRenderer(ctx, transport, {
          width,
          height,
        });
        loop.onFrame(() => falldown.renderFrame());
      }
    }

    loop.start();

    void (async () => {
      try {
        const engine = await createAudioEngine(transport);
        if (cancelled) return;
        engineRef.current = engine;
        loop.onFrame(() => engine.update());
      } catch {
        // Audio is non-essential for the visual practice view; ignore failures.
      }
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
    };
  }, [transport]);

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
      <TransportBar
        transport={transport}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />
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
