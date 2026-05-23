import { useEffect, useRef, useState } from "react";
import type { Transport } from "../transport/transport";
import type { Section, Bookmark, SectionState } from "../model/sections";
import type { StripPosition } from "./stripPosition";
import {
  addBookmark,
  addSection,
  deleteBookmark,
  deleteSection,
  mergeRight,
  renameBookmark,
  renameSection,
  resizeBoundary,
  splitAt,
} from "./edits";

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
  const sectionsRef = useRef<HTMLDivElement>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingKind, setEditingKind] = useState<"section" | "bookmark" | null>(null);
  const [menu, setMenu] = useState<
    | { kind: "section"; id: string; x: number; y: number }
    | { kind: "bookmark"; id: string; x: number; y: number }
    | null
  >(null);
  const [dragging, setDragging] = useState<null | { leftId: string }>(null);

  function startRenameSection(id: string): void {
    setEditingKind("section");
    setEditingId(id);
  }

  function startRenameBookmark(id: string): void {
    setEditingKind("bookmark");
    setEditingId(id);
  }

  function commitRename(name: string): void {
    if (editingKind === "section" && editingId) {
      onChange(renameSection(state, editingId, name, duration));
    } else if (editingKind === "bookmark" && editingId) {
      onChange(renameBookmark(state, editingId, name));
    }
    setEditingId(null);
    setEditingKind(null);
  }

  function closeMenu(): void {
    setMenu(null);
  }

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

  // Close menu on outside click / any key.
  useEffect(() => {
    if (!menu) return;
    const close = (): void => closeMenu();
    window.addEventListener("click", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", close);
    };
  }, [menu]);

  // Drag-resize boundary.
  useEffect(() => {
    if (!dragging) return;
    function onMove(ev: MouseEvent): void {
      const el = sectionsRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const t = ((ev.clientX - rect.left) / rect.width) * duration;
      onChange(resizeBoundary(state, dragging!.leftId, t, duration));
    }
    function onUp(): void {
      setDragging(null);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, state, duration, onChange]);

  function sectionsMouseDown(e: React.MouseEvent<HTMLDivElement>): void {
    if ((e.target as HTMLElement).closest(".section-strip__block")) return;
    if ((e.target as HTMLElement).closest(".section-strip__bookmark")) return;
    if ((e.target as HTMLElement).closest(".section-strip__boundary-handle")) return;
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
            isEditing={editingKind === "bookmark" && editingId === b.id}
            onSeek={(t) => transport.clock.seek(t)}
            onRenameCommit={commitRename}
            onContextMenu={(e) =>
              setMenu({ kind: "bookmark", id: b.id, x: e.clientX, y: e.clientY })
            }
          />
        ))}
      </div>

      <div
        ref={sectionsRef}
        className="section-strip__sections"
        onMouseDown={sectionsMouseDown}
      >
        {state.sections.flatMap((s, i) => {
          const elements: React.ReactNode[] = [
            <SectionBlock
              key={s.id}
              section={s}
              color={PALETTE[i % PALETTE.length]}
              duration={duration}
              isEditing={editingKind === "section" && editingId === s.id}
              onSeek={(t) => transport.clock.seek(t)}
              onStartRename={() => startRenameSection(s.id)}
              onRenameCommit={commitRename}
              onContextMenu={(e) =>
                setMenu({ kind: "section", id: s.id, x: e.clientX, y: e.clientY })
              }
            />,
          ];
          if (i < state.sections.length - 1) {
            const leftPct = duration > 0 ? (s.end / duration) * 100 : 0;
            elements.push(
              <div
                key={`bd-${s.id}`}
                className="section-strip__boundary-handle"
                style={{ left: `${leftPct}%` }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragging({ leftId: s.id });
                }}
              />,
            );
          }
          return elements;
        })}
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

      {menu && menu.kind === "section" && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={[
            {
              label: "Rename",
              onClick: () => {
                startRenameSection(menu.id);
                closeMenu();
              },
            },
            {
              label: "Split here",
              onClick: () => {
                onChange(splitAt(state, menu.id, transport.clock.position, duration));
                closeMenu();
              },
            },
            {
              label: "Merge with right",
              onClick: () => {
                onChange(mergeRight(state, menu.id, duration));
                closeMenu();
              },
            },
            {
              label: "Loop section",
              onClick: () => {
                const s = state.sections.find((x) => x.id === menu.id);
                if (s) transport.clock.setLoop({ start: s.start, end: s.end });
                closeMenu();
              },
            },
            {
              label: "Delete",
              onClick: () => {
                onChange(deleteSection(state, menu.id, duration));
                closeMenu();
              },
            },
          ]}
        />
      )}
      {menu && menu.kind === "bookmark" && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={[
            {
              label: "Rename",
              onClick: () => {
                startRenameBookmark(menu.id);
                closeMenu();
              },
            },
            {
              label: "Loop to next mark",
              onClick: () => {
                const me = state.bookmarks.find((b) => b.id === menu.id);
                if (me) {
                  const next = state.bookmarks.find((b) => b.time > me.time);
                  const endTime = next
                    ? next.time
                    : (state.sections.find((s) => me.time >= s.start && me.time < s.end)?.end ??
                       duration);
                  transport.clock.setLoop({ start: me.time, end: endTime });
                }
                closeMenu();
              },
            },
            {
              label: "Delete",
              onClick: () => {
                onChange(deleteBookmark(state, menu.id));
                closeMenu();
              },
            },
          ]}
        />
      )}
    </div>
  );
}

interface SectionBlockProps {
  section: Section;
  color: string;
  duration: number;
  isEditing: boolean;
  onSeek: (time: number) => void;
  onStartRename: () => void;
  onRenameCommit: (name: string) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function SectionBlock({
  section,
  color,
  duration,
  isEditing,
  onSeek,
  onStartRename,
  onRenameCommit,
  onContextMenu,
}: SectionBlockProps): React.JSX.Element {
  const widthPct = duration > 0 ? ((section.end - section.start) / duration) * 100 : 0;
  return (
    <div
      className="section-strip__block"
      style={{ flex: `${widthPct} 0 0`, background: color }}
      data-section-id={section.id}
      onClick={(e) => {
        if (isEditing) return;
        e.stopPropagation();
        onSeek(section.start);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onStartRename();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(e);
      }}
    >
      {isEditing ? (
        <input
          aria-label="Rename section"
          defaultValue={section.name}
          autoFocus
          className="section-strip__rename-input"
          onBlur={(e) => onRenameCommit(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onRenameCommit(e.currentTarget.value);
            if (e.key === "Escape") onRenameCommit(section.name);
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="section-strip__block-name">{section.name}</span>
      )}
    </div>
  );
}

interface BookmarkPinProps {
  bookmark: Bookmark;
  duration: number;
  isEditing: boolean;
  onSeek: (time: number) => void;
  onRenameCommit: (name: string) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function BookmarkPin({
  bookmark,
  duration,
  isEditing,
  onSeek,
  onRenameCommit,
  onContextMenu,
}: BookmarkPinProps): React.JSX.Element {
  const leftPct = duration > 0 ? (bookmark.time / duration) * 100 : 0;
  return (
    <span
      className="section-strip__bookmark"
      style={{ left: `${leftPct}%` }}
      data-bookmark-id={bookmark.id}
      onClick={(e) => {
        if (isEditing) return;
        e.stopPropagation();
        onSeek(bookmark.time);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(e);
      }}
    >
      <span aria-hidden>📌</span>
      {isEditing ? (
        <input
          aria-label="Rename bookmark"
          defaultValue={bookmark.name}
          autoFocus
          className="section-strip__rename-input"
          onBlur={(e) => onRenameCommit(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onRenameCommit(e.currentTarget.value);
            if (e.key === "Escape") onRenameCommit(bookmark.name);
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="section-strip__bookmark-name">{bookmark.name}</span>
      )}
    </span>
  );
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: Array<{ label: string; onClick: () => void }>;
}

function ContextMenu({ x, y, items }: ContextMenuProps): React.JSX.Element {
  return (
    <ul
      className="section-strip__menu"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((it) => (
        <li key={it.label}>
          <button type="button" onClick={it.onClick}>
            {it.label}
          </button>
        </li>
      ))}
    </ul>
  );
}
