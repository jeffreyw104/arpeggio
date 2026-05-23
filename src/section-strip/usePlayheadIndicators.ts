import { useEffect, useRef } from "react";
import type { Transport } from "../transport/transport";
import type { Measure } from "../model/score";

/**
 * Drives the playhead bar, its measure-number pill, and the loop bracket
 * via one shared `requestAnimationFrame` loop. The hook returns refs that
 * the caller attaches to the corresponding DOM nodes; all updates are done
 * via direct DOM writes so React doesn't re-render every frame.
 *
 * The loop indicator only repaints when the loop range OR the container
 * width changes — so a window resize (which shrinks/grows the bracket in
 * pixels) also re-evaluates whether the "LOOPING" label fits centered
 * inside the bracket or has to dock outside.
 */
export function usePlayheadIndicators(
  transport: Transport,
  duration: number,
  measures: ReadonlyArray<Measure>,
): {
  playheadRef: React.RefObject<HTMLDivElement | null>;
  playheadLabelRef: React.RefObject<HTMLSpanElement | null>;
  loopRef: React.RefObject<HTMLDivElement | null>;
} {
  const playheadRef = useRef<HTMLDivElement>(null);
  const playheadLabelRef = useRef<HTMLSpanElement>(null);
  const loopRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    let lastMeasure = -1;
    let lastLoopKey = "";
    const update = (): void => {
      const el = playheadRef.current;
      const label = playheadLabelRef.current;
      if (el && duration > 0) {
        const pos = transport.clock.position;
        const pct = (pos / duration) * 100;
        el.style.left = `${Math.max(0, Math.min(100, pct))}%`;
        if (label && measures.length > 0) {
          // Find the measure containing the playhead. measures are sorted by start.
          let idx = 0;
          for (let i = 0; i < measures.length; i += 1) {
            if (measures[i].start <= pos) idx = i;
            else break;
          }
          if (idx !== lastMeasure) {
            label.textContent = `m. ${measures[idx].index + 1}`;
            lastMeasure = idx;
          }
        }
      }
      // Loop bracket. Cache key includes container width so resize also
      // re-evaluates the label-fits-inside-bracket decision.
      const loopEl = loopRef.current;
      if (loopEl && duration > 0) {
        const loop = transport.clock.loop;
        const stripW = loopEl.parentElement?.clientWidth ?? 0;
        const key = loop ? `${loop.start}-${loop.end}@${stripW}` : "";
        if (key !== lastLoopKey) {
          if (loop) {
            const leftPct = (loop.start / duration) * 100;
            const widthPct = ((loop.end - loop.start) / duration) * 100;
            loopEl.style.display = "block";
            loopEl.style.left = `${Math.max(0, leftPct)}%`;
            loopEl.style.width = `${Math.max(0, Math.min(100 - leftPct, widthPct))}%`;
            const bracketW = (widthPct / 100) * stripW;
            const bracketRightPx = ((leftPct + widthPct) / 100) * stripW;
            const LABEL_MIN_PX = 60;
            const LABEL_OUTSIDE_PX = 56;
            loopEl.classList.remove(
              "section-strip__loop-indicator--label-right",
              "section-strip__loop-indicator--label-left",
            );
            if (bracketW < LABEL_MIN_PX) {
              const roomRight = stripW - bracketRightPx;
              if (roomRight >= LABEL_OUTSIDE_PX) {
                loopEl.classList.add("section-strip__loop-indicator--label-right");
              } else {
                loopEl.classList.add("section-strip__loop-indicator--label-left");
              }
            }
          } else {
            loopEl.style.display = "none";
          }
          lastLoopKey = key;
        }
      }
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [transport, duration, measures]);

  return { playheadRef, playheadLabelRef, loopRef };
}
