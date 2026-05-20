import { useEffect, useReducer, useRef } from "react";
import type { Transport } from "../transport/transport";

interface Props {
  transport: Transport;
  viewportWindow: { start: number; end: number };
}

export function Minimap({ transport, viewportWindow }: Props): React.JSX.Element {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => transport.clock.onChange(() => force()), [transport]);

  const stripRef = useRef<HTMLDivElement>(null);
  const dragFromT = useRef<number | null>(null);

  const measures = transport.score.measures;
  const total = measures.length > 0 ? measures[measures.length - 1].end - measures[0].start : 1;
  const t0 = measures.length > 0 ? measures[0].start : 0;
  const t = transport.clock.position;
  const loop = transport.clock.loop;

  function timeFromX(clientX: number): number {
    const rect = stripRef.current!.getBoundingClientRect();
    const f = (clientX - rect.left) / rect.width;
    return t0 + f * total;
  }

  const noteCounts = measures.map((m) =>
    transport.score.notes.reduce((acc, n) => (n.start >= m.start && n.start < m.end ? acc + 1 : acc), 0),
  );
  const maxCount = Math.max(1, ...noteCounts);

  return (
    <div
      ref={stripRef}
      className="minimap"
      data-testid="minimap"
      onMouseDown={(e) => { dragFromT.current = timeFromX(e.clientX); }}
      onMouseMove={() => { if (dragFromT.current !== null) force(); }}
      onMouseUp={(e) => {
        const start = dragFromT.current;
        const end = timeFromX(e.clientX);
        if (start === null) return;
        if (Math.abs(end - start) < 0.05) transport.clock.seek(start);
        else {
          const first = measures.findIndex((m) => Math.min(start, end) < m.end);
          const last  = measures.findIndex((m) => Math.max(start, end) <= m.end);
          if (first !== -1 && last !== -1) transport.loopMeasures(first, last);
        }
        dragFromT.current = null;
      }}
    >
      {measures.map((m, i) => {
        const left = ((m.start - t0) / total) * 100;
        const width = ((m.end - m.start) / total) * 100;
        const opacity = 0.2 + 0.8 * (noteCounts[i] / maxCount);
        return <span key={i} className="minimap-density" style={{ left: `${left}%`, width: `${width}%`, opacity }} />;
      })}
      {transport.score.sections.map((s, i) => {
        const left = ((s.start - t0) / total) * 100;
        return <span key={`s-${i}`} className="minimap-section" style={{ left: `${left}%` }} title={s.label} />;
      })}
      <span
        className="minimap-viewport"
        style={{
          left: `${((viewportWindow.start - t0) / total) * 100}%`,
          width: `${((viewportWindow.end - viewportWindow.start) / total) * 100}%`,
        }}
      />
      {loop && (
        <span
          className="minimap-loop"
          style={{
            left: `${((loop.start - t0) / total) * 100}%`,
            width: `${((loop.end - loop.start) / total) * 100}%`,
          }}
        />
      )}
      <span className="minimap-caret" style={{ left: `${((t - t0) / total) * 100}%` }} />
    </div>
  );
}
