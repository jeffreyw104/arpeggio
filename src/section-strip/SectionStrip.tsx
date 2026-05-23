import { useEffect, useRef } from "react";
import type { Transport } from "../transport/transport";
import type { Section, Bookmark, SectionState } from "../model/sections";
import type { StripPosition } from "./stripPosition";

const PALETTE = ["#cba37a", "#7a9cca", "#c97d7d", "#7ec98a", "#b09bca"] as const;

interface SectionStripProps {
  state: SectionState;
  transport: Transport;
  position: StripPosition;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onChange: (next: SectionState) => void;
  onPositionChange: (p: StripPosition) => void;
}

export function SectionStrip({
  state,
  transport,
  position,
  onChange: _onChange,
  onPositionChange,
}: SectionStripProps): React.JSX.Element {
  const duration = transport.score.durationSeconds;
  const playheadRef = useRef<HTMLDivElement>(null);

  // Drive the playhead from RAF.
  useEffect(() => {
    let raf = 0;
    const update = (): void => {
      const el = playheadRef.current;
      if (el && duration > 0) {
        const pct = (transport.clock.position / duration) * 100;
        el.style.left = `${Math.max(0, Math.min(100, pct))}%`;
      }
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [transport, duration]);

  return (
    <div className={`section-strip section-strip--${position}`}>
      <div className="section-strip__bookmarks">
        {state.bookmarks.map((b) => (
          <BookmarkPin key={b.id} bookmark={b} duration={duration} />
        ))}
      </div>

      <div className="section-strip__sections">
        {state.sections.map((s, i) => (
          <SectionBlock
            key={s.id}
            section={s}
            color={PALETTE[i % PALETTE.length]}
            duration={duration}
          />
        ))}
        <div ref={playheadRef} className="section-strip__playhead" aria-hidden />
      </div>

      <div className="section-strip__toolbar">
        <span className="section-strip__hint">
          + Section · 📌 Bookmark · double-click rename · drag boundary · right-click for more
        </span>
        <button
          type="button"
          className="section-strip__pos-toggle"
          onClick={() => onPositionChange(position === "top" ? "bottom" : "top")}
          aria-label="Move strip"
        >
          ↕ {position === "top" ? "bottom" : "top"}
        </button>
      </div>
    </div>
  );
}

interface SectionBlockProps {
  section: Section;
  color: string;
  duration: number;
}

function SectionBlock({ section, color, duration }: SectionBlockProps): React.JSX.Element {
  const widthPct = duration > 0 ? ((section.end - section.start) / duration) * 100 : 0;
  return (
    <div
      className="section-strip__block"
      style={{ flex: `${widthPct} 0 0`, background: color }}
      data-section-id={section.id}
    >
      <span className="section-strip__block-name">{section.name}</span>
    </div>
  );
}

interface BookmarkPinProps {
  bookmark: Bookmark;
  duration: number;
}

function BookmarkPin({ bookmark, duration }: BookmarkPinProps): React.JSX.Element {
  const leftPct = duration > 0 ? (bookmark.time / duration) * 100 : 0;
  return (
    <span
      className="section-strip__bookmark"
      style={{ left: `${leftPct}%` }}
      data-bookmark-id={bookmark.id}
    >
      <span aria-hidden>📌</span>
      <span className="section-strip__bookmark-name">{bookmark.name}</span>
    </span>
  );
}
