import { useEffect, useRef } from "react";
import type { Transport } from "../transport/transport";
import type { Section, Bookmark, SectionState } from "../model/sections";
import type { StripPosition } from "./stripPosition";
import { addBookmark, addSection } from "./edits";

const PALETTE = ["#cba37a", "#7a9cca", "#c97d7d", "#7ec98a", "#b09bca"] as const;

interface SectionStripProps {
  state: SectionState;
  transport: Transport;
  position: StripPosition;
  onChange: (next: SectionState) => void;
  onPositionChange: (p: StripPosition) => void;
}

export function SectionStrip({
  state,
  transport,
  position,
  onChange,
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

  // Keyboard shortcuts: S = add section, B = add bookmark at playhead.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key !== "s" && e.key !== "S" && e.key !== "b" && e.key !== "B") return;
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
      e.preventDefault();
      if (e.key === "s" || e.key === "S") {
        onChange(addSection(state, transport.clock.position, duration));
      } else {
        onChange(addBookmark(state, transport.clock.position, "Mark", duration));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, transport, duration, onChange]);

  function sectionsMouseDown(e: React.MouseEvent<HTMLDivElement>): void {
    if ((e.target as HTMLElement).closest(".section-strip__block")) return;
    if ((e.target as HTMLElement).closest(".section-strip__bookmark")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const time = ((e.clientX - rect.left) / rect.width) * duration;
    // Clear any active loop if the seek lands outside it (mirrors transport behavior).
    const loop = transport.clock.loop;
    if (loop && (time < loop.start || time >= loop.end)) {
      transport.clock.setLoop(null);
    }
    transport.clock.seek(Math.max(0, Math.min(duration, time)));
  }

  return (
    <div className={`section-strip section-strip--${position}`}>
      <div className="section-strip__bookmarks">
        {state.bookmarks.map((b) => (
          <BookmarkPin
            key={b.id}
            bookmark={b}
            duration={duration}
            onSeek={(t) => transport.clock.seek(t)}
          />
        ))}
      </div>

      <div className="section-strip__sections" onMouseDown={sectionsMouseDown}>
        {state.sections.map((s, i) => (
          <SectionBlock
            key={s.id}
            section={s}
            color={PALETTE[i % PALETTE.length]}
            duration={duration}
            onSeek={(t) => transport.clock.seek(t)}
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
  onSeek: (time: number) => void;
}

function SectionBlock({ section, color, duration, onSeek }: SectionBlockProps): React.JSX.Element {
  const widthPct = duration > 0 ? ((section.end - section.start) / duration) * 100 : 0;
  return (
    <div
      className="section-strip__block"
      style={{ flex: `${widthPct} 0 0`, background: color }}
      data-section-id={section.id}
      onClick={() => onSeek(section.start)}
    >
      <span className="section-strip__block-name">{section.name}</span>
    </div>
  );
}

interface BookmarkPinProps {
  bookmark: Bookmark;
  duration: number;
  onSeek: (time: number) => void;
}

function BookmarkPin({ bookmark, duration, onSeek }: BookmarkPinProps): React.JSX.Element {
  const leftPct = duration > 0 ? (bookmark.time / duration) * 100 : 0;
  return (
    <span
      className="section-strip__bookmark"
      style={{ left: `${leftPct}%` }}
      data-bookmark-id={bookmark.id}
      onClick={() => onSeek(bookmark.time)}
    >
      <span aria-hidden>📌</span>
      <span className="section-strip__bookmark-name">{bookmark.name}</span>
    </span>
  );
}
