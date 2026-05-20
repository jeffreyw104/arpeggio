import { useEffect, useReducer, useRef } from "react";
import type { Transport } from "../transport/transport";

interface Props { transport: Transport }

/** Per-measure progress bar replacing the TopBar scrubber. Cell widths are
 *  proportional to measure duration; click → seek, drag → loop. */
export function MeasureProgressBar({ transport }: Props): React.JSX.Element {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => transport.clock.onChange(() => force()), [transport]);

  const dragStart = useRef<number | null>(null);
  const dragEnd = useRef<number | null>(null);

  const measures = transport.score.measures;
  const total = measures.length > 0 ? measures[measures.length - 1].end - measures[0].start : 1;
  const t = transport.clock.position;
  const loop = transport.clock.loop;

  function commitDrag(): void {
    const a = dragStart.current;
    const b = dragEnd.current;
    if (a === null) return;
    if (b === null || a === b) {
      const m = measures[a];
      if (m) transport.clock.seek(m.start);
    } else {
      transport.loopMeasures(Math.min(a, b), Math.max(a, b));
    }
    dragStart.current = null;
    dragEnd.current = null;
  }

  return (
    <div className="measure-progress-bar" data-testid="measure-progress-bar"
         onMouseUp={commitDrag} onMouseLeave={() => { dragStart.current = null; dragEnd.current = null; }}>
      {measures.map((m, i) => {
        const flex = (m.end - m.start) / total;
        const current = t >= m.start && t < m.end;
        const inLoop = !!loop && loop.start <= m.start && loop.end >= m.end;
        return (
          <div key={i} className={[
              "measure-cell",
              current ? "measure-cell--current" : "",
              inLoop ? "measure-cell--in-loop" : "",
            ].filter(Boolean).join(" ")}
            style={{ flexGrow: flex }}
            onMouseDown={() => { dragStart.current = i; dragEnd.current = i; }}
            onMouseEnter={() => { if (dragStart.current !== null) dragEnd.current = i; }}
            onMouseUp={() => { if (dragStart.current !== null) dragEnd.current = i; }}
          />
        );
      })}
      {transport.score.sections.map((s, i) => {
        const left = ((s.start - measures[0].start) / total) * 100;
        return (
          <span key={`s-${i}`} className="section-label" style={{ left: `${left}%` }}>
            {s.label}
          </span>
        );
      })}
    </div>
  );
}
