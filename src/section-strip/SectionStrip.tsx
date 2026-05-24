import { useCallback, useEffect, useRef, useState } from "react";
import type { Transport } from "../transport/transport";
import type { Section, Bookmark, SectionState } from "../model/sections";
import type { StripPosition } from "./stripPosition";
import { ContextMenu } from "./ContextMenu";
import { usePlayheadIndicators } from "./usePlayheadIndicators";
import {
  addBookmark,
  addSection,
  deleteBookmark,
  mergeLeft,
  mergeRight,
  renameBookmark,
  renameSection,
  resizeBoundary,
} from "./edits";
import { newBookmarkId, normalize } from "../model/sections";
import { useIsTouchDevice } from "../responsive/useIsTouchDevice";
import { useLongPress } from "../responsive/useLongPress";

const PALETTE = ["#3a5a78", "#2f6e63", "#7a3a4a", "#7a5a2e", "#4a3a6a"] as const;
/** Within this fraction of duration of `autoEnd`, drag snaps back to it. */
const SNAP_PCT = 0.015;

interface SectionStripProps {
  state: SectionState;
  transport: Transport;
  position: StripPosition;
  onChange: (next: SectionState) => void;
  canUndo?: boolean;
  onUndo?: () => void;
}

export function SectionStrip({
  state,
  transport,
  position,
  onChange,
  canUndo = false,
  onUndo,
}: SectionStripProps): React.JSX.Element {
  const duration = transport.score.durationSeconds;
  const sectionsRef = useRef<HTMLDivElement>(null);
  const measures = transport.score.measures;
  const { playheadRef, playheadLabelRef, loopRef } = usePlayheadIndicators(
    transport,
    duration,
    measures,
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingKind, setEditingKind] = useState<"section" | "bookmark" | null>(null);
  const [menu, setMenu] = useState<
    | { kind: "section"; id: string; x: number; y: number }
    | { kind: "bookmark"; id: string; x: number; y: number }
    | null
  >(null);
  const [dragging, setDragging] = useState<null | { leftId: string }>(null);
  const [showHint, setShowHint] = useState(false);
  // Drill-down: after clicking a section it becomes "active". Hovering over
  // an active section reveals a vertical line that snaps to the nearest
  // measure start; a subsequent click seeks to that snapped point. Clicking
  // outside the active section clears the active state.
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [hoverInfo, setHoverInfo] = useState<
    { pct: number; measureNumber: number } | null
  >(null);

  // Find the nearest measure start time anywhere in the piece (used to snap
  // a freshly-created bookmark onto a measure boundary).
  const snapTimeToNearestMeasure = useCallback(
    (time: number): number => {
      if (measures.length === 0) return time;
      let bestIdx = 0;
      let bestDist = Math.abs(measures[0].start - time);
      for (let i = 1; i < measures.length; i += 1) {
        const d = Math.abs(measures[i].start - time);
        if (d < bestDist) {
          bestIdx = i;
          bestDist = d;
        }
      }
      return measures[bestIdx].start;
    },
    [measures],
  );

  function snapToMeasure(
    s: Section,
    pct: number,
  ): { pct: number; measureNumber: number } {
    const span = Math.max(1e-6, s.end - s.start);
    const time = s.start + pct * span;
    // Candidates: measures whose start lies within [s.start, s.end].
    let best = measures[0];
    let bestDist = Infinity;
    for (const m of measures) {
      if (m.start < s.start - 1e-6 || m.start > s.end + 1e-6) continue;
      const d = Math.abs(m.start - time);
      if (d < bestDist) {
        best = m;
        bestDist = d;
      }
    }
    if (!best) return { pct, measureNumber: 1 };
    const snappedPct = Math.max(0, Math.min(1, (best.start - s.start) / span));
    return { pct: snappedPct, measureNumber: best.index + 1 };
  }

  function handleSectionClick(s: Section, clickPct: number): void {
    if (activeSectionId === s.id) {
      const snapped = snapToMeasure(s, clickPct);
      transport.clock.seek(s.start + snapped.pct * (s.end - s.start));
    } else {
      transport.clock.seek(s.start);
      setActiveSectionId(s.id);
      setHoverInfo(null);
    }
  }

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

  // Keyboard shortcuts: S = add section, B = add bookmark at playhead,
  // Escape = exit drill-in mode / cancel rename / close menu.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const t = e.target as HTMLElement | null;
      const inForm = t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName);
      if (e.key === "Escape") {
        // The rename input handles Escape itself (reverts). Outside an input,
        // Escape progressively dismisses transient UI: menu → drill-in.
        if (inForm) return;
        if (menu) {
          e.preventDefault();
          setMenu(null);
          return;
        }
        if (activeSectionId) {
          e.preventDefault();
          setActiveSectionId(null);
          setHoverInfo(null);
        }
        return;
      }
      if (e.key !== "s" && e.key !== "S" && e.key !== "b" && e.key !== "B") return;
      if (inForm) return;
      e.preventDefault();
      if (e.key === "s" || e.key === "S") {
        onChange(addSection(state, transport.clock.position, duration));
      } else {
        onChange(
          addBookmark(
            state,
            snapTimeToNearestMeasure(transport.clock.position),
            "Mark",
            duration,
          ),
        );
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    state,
    transport,
    duration,
    onChange,
    menu,
    activeSectionId,
    snapTimeToNearestMeasure,
  ]);

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

  // Drill-down mode persists ONLY while clicking inside a section block.
  // Any click elsewhere — outside the strip, OR on the strip's chrome
  // (toolbar, bookmark lane, gaps, ↕ button) — clears active. Section
  // blocks call e.stopPropagation() in their onClick handlers so this
  // listener never sees a real block click.
  useEffect(() => {
    if (!activeSectionId) return;
    function onWindowClick(ev: MouseEvent): void {
      const target = ev.target as HTMLElement | null;
      if (target && target.closest(".section-strip__block")) return;
      setActiveSectionId(null);
      setHoverInfo(null);
    }
    window.addEventListener("click", onWindowClick);
    return () => window.removeEventListener("click", onWindowClick);
  }, [activeSectionId]);

  // Drag-resize boundary. While dragging, if the cursor comes within SNAP_PCT
  // of the boundary's original auto-detected position, snap back to it so the
  // user can return to the default break point.
  useEffect(() => {
    if (!dragging) return;
    const draggedSection = state.sections.find((s) => s.id === dragging.leftId);
    const snapTarget = draggedSection?.autoEnd ?? null;
    function onMove(ev: MouseEvent): void {
      const el = sectionsRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      let t = ((ev.clientX - rect.left) / rect.width) * duration;
      if (
        snapTarget !== null &&
        Math.abs(t - snapTarget) <= SNAP_PCT * duration
      ) {
        t = snapTarget;
      }
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
    setActiveSectionId(null);
    setHoverInfo(null);
  }

  const isTouchDevice = useIsTouchDevice();

  // Touch: long-press in empty strip area → create bookmark. Mirrors the
  // existing right-click / double-click background handlers.
  const bgLongPress = useLongPress((e) => {
    if (!(e.target instanceof Element)) return;
    if (e.target.closest(".section-strip__bookmark")) return;
    if (e.target.closest(".section-strip__boundary-handle")) return;
    if (e.target.closest(".section-strip__block")) return;
    createBookmarkAtClientX(e.clientX);
  });

  // Both right-click and double-click on the strip create a bookmark at the
  // cursor position and immediately open its name input. Bookmark pins handle
  // their own context menus / dbl-clicks and stop propagation so they never
  // trigger this. Section blocks now use right-click for the section menu, so
  // we exclude them from right-click bookmark creation but allow double-click.
  function createBookmarkAtClientX(clientX: number): void {
    const sectionsEl = sectionsRef.current;
    if (!sectionsEl || duration <= 0) return;
    const rect = sectionsEl.getBoundingClientRect();
    const rawTime = Math.max(
      0,
      Math.min(duration, ((clientX - rect.left) / rect.width) * duration),
    );
    // Bookmarks anchor on measure starts, not arbitrary click times.
    const time = snapTimeToNearestMeasure(rawTime);
    // Mint the id locally so we can flip into rename mode for the brand-new
    // bookmark on the same render. `addBookmark` mints internally, so build
    // the next state inline instead.
    const id = newBookmarkId();
    const next = normalize(
      {
        ...state,
        bookmarks: [...state.bookmarks, { id, time, name: "Mark" }],
      },
      duration,
    );
    onChange(next);
    setEditingKind("bookmark");
    setEditingId(id);
  }

  function bookmarkOnRightClickAtEvent(e: React.MouseEvent<HTMLDivElement>): void {
    const target = e.target as HTMLElement;
    if (target.closest(".section-strip__bookmark")) return;
    if (target.closest(".section-strip__boundary-handle")) return;
    if (target.closest(".section-strip__block")) return;
    e.preventDefault();
    createBookmarkAtClientX(e.clientX);
  }

  function bookmarkOnDoubleClickAtEvent(e: React.MouseEvent<HTMLDivElement>): void {
    const target = e.target as HTMLElement;
    if (target.closest(".section-strip__bookmark")) return;
    if (target.closest(".section-strip__boundary-handle")) return;
    e.preventDefault();
    e.stopPropagation();
    createBookmarkAtClientX(e.clientX);
  }

  return (
    <div
      className={
        `section-strip section-strip--${position}` +
        (editingKind ? " section-strip--editing" : "") +
        (isTouchDevice ? " section-strip--touch" : "")
      }
    >
      <div
        className="section-strip__bookmarks"
        onContextMenu={bookmarkOnRightClickAtEvent}
        onDoubleClick={bookmarkOnDoubleClickAtEvent}
        {...(isTouchDevice ? bgLongPress : {})}
      >
        {state.bookmarks.map((b) => (
          <BookmarkPin
            key={b.id}
            bookmark={b}
            duration={duration}
            isEditing={editingKind === "bookmark" && editingId === b.id}
            isTouchDevice={isTouchDevice}
            onSeek={(t) => transport.clock.seek(t)}
            onStartRename={() => startRenameBookmark(b.id)}
            onRenameCommit={commitRename}
            onContextMenu={(e) =>
              setMenu({ kind: "bookmark", id: b.id, x: e.clientX, y: e.clientY })
            }
            onLongPress={(coords) =>
              setMenu({ kind: "bookmark", id: b.id, x: coords.clientX, y: coords.clientY })
            }
          />
        ))}
      </div>

      <div
        ref={sectionsRef}
        className={
          "section-strip__sections" +
          (activeSectionId ? " section-strip__sections--has-active" : "")
        }
        onMouseDown={sectionsMouseDown}
        onContextMenu={bookmarkOnRightClickAtEvent}
        onDoubleClick={bookmarkOnDoubleClickAtEvent}
        {...(isTouchDevice ? bgLongPress : {})}
      >
        {state.sections.flatMap((s, i) => {
          const elements: React.ReactNode[] = [
            <SectionBlock
              key={s.id}
              section={s}
              color={PALETTE[i % PALETTE.length]}
              duration={duration}
              isEditing={editingKind === "section" && editingId === s.id}
              isActive={activeSectionId === s.id}
              isTouchDevice={isTouchDevice}
              onClickAt={(pct) => handleSectionClick(s, pct)}
              onHoverMove={(pct) => {
                if (activeSectionId === s.id) setHoverInfo(snapToMeasure(s, pct));
              }}
              onHoverLeave={() => {
                if (activeSectionId === s.id) setHoverInfo(null);
              }}
              onRenameCommit={commitRename}
              onContextMenu={(e) =>
                setMenu({ kind: "section", id: s.id, x: e.clientX, y: e.clientY })
              }
              onLongPress={(coords) =>
                setMenu({ kind: "section", id: s.id, x: coords.clientX, y: coords.clientY })
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
        {/* Dotted tether per bookmark — a faint vertical line from each pin
            down through the section row, anchored at the bookmark's time. */}
        {state.bookmarks.map((b) => (
          <div
            key={`tether-${b.id}`}
            className="section-strip__bookmark-tether"
            style={{ left: `${duration > 0 ? (b.time / duration) * 100 : 0}%` }}
            aria-hidden
          />
        ))}
        <div
          ref={loopRef}
          className="section-strip__loop-indicator"
          aria-hidden
          style={{ display: "none" }}
        >
          <span className="section-strip__loop-label">looping</span>
        </div>
        <div ref={playheadRef} className="section-strip__playhead" aria-hidden>
          <span ref={playheadLabelRef} className="section-strip__playhead-label" />
        </div>
        {(() => {
          if (!activeSectionId || !hoverInfo) return null;
          const active = state.sections.find((s) => s.id === activeSectionId);
          if (!active || duration <= 0) return null;
          const time = active.start + hoverInfo.pct * (active.end - active.start);
          const leftPct = (time / duration) * 100;
          return (
            <div
              className="section-strip__hover-line"
              style={{ left: `${leftPct}%` }}
              aria-hidden
            >
              <span className="section-strip__hover-line-label">
                m. {hoverInfo.measureNumber}
              </span>
            </div>
          );
        })()}
        {(() => {
          if (!dragging || duration <= 0) return null;
          const left = state.sections.find((s) => s.id === dragging.leftId);
          if (!left || left.autoEnd === undefined) return null;
          const leftPct = (left.autoEnd / duration) * 100;
          return (
            <div
              className="section-strip__snap-line"
              style={{ left: `${leftPct}%` }}
              aria-hidden
            >
              <span className="section-strip__snap-line-label">original</span>
            </div>
          );
        })()}
      </div>

      <div className="section-strip__toolbar">
        {showHint && (
          <span className="section-strip__hint">
            click a section to drill in · double-click to add a bookmark ·
            drag boundary (snaps to original) · right-click for more
          </span>
        )}
        <button
          type="button"
          className="section-strip__help-toggle"
          onClick={() => setShowHint((v) => !v)}
          aria-pressed={showHint}
          aria-label={showHint ? "Hide help" : "Show help"}
        >
          ?
        </button>
        <button
          type="button"
          className="section-strip__undo"
          onClick={() => onUndo && onUndo()}
          disabled={!canUndo || !onUndo}
          title="Undo last edit (⌘Z / Ctrl+Z)"
          aria-label="Undo last edit"
        >
          Undo
        </button>
      </div>

      {menu && menu.kind === "section" && (() => {
        const idx = state.sections.findIndex((s) => s.id === menu.id);
        const hasRight = idx >= 0 && idx < state.sections.length - 1;
        const hasLeft = idx > 0;
        const items: Array<{ label: string; onClick: () => void }> = [
          {
            label: "Rename",
            onClick: () => {
              startRenameSection(menu.id);
              closeMenu();
            },
          },
        ];
        if (hasRight) {
          items.push({
            label: "Merge with right",
            onClick: () => {
              onChange(mergeRight(state, menu.id, duration));
              closeMenu();
            },
          });
        }
        if (hasLeft) {
          items.push({
            label: "Merge with left",
            onClick: () => {
              onChange(mergeLeft(state, menu.id, duration));
              closeMenu();
            },
          });
        }
        if (transport.clock.loop) {
          items.push({
            label: "Clear loop",
            onClick: () => {
              transport.clock.setLoop(null);
              closeMenu();
            },
          });
        }
        return <ContextMenu x={menu.x} y={menu.y} items={items} />;
      })()}

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
  isActive: boolean;
  isTouchDevice?: boolean;
  onClickAt: (pct: number) => void;
  onHoverMove: (pct: number) => void;
  onHoverLeave: () => void;
  onRenameCommit: (name: string) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onLongPress?: (coords: { clientX: number; clientY: number }) => void;
}

function SectionBlock({
  section,
  color,
  duration,
  isEditing,
  isActive,
  isTouchDevice = false,
  onClickAt,
  onHoverMove,
  onHoverLeave,
  onRenameCommit,
  onContextMenu,
  onLongPress,
}: SectionBlockProps): React.JSX.Element {
  const longPress = useLongPress((e) => {
    onLongPress?.({ clientX: e.clientX, clientY: e.clientY });
  });
  const widthPct = duration > 0 ? ((section.end - section.start) / duration) * 100 : 0;
  const className =
    "section-strip__block" + (isActive ? " section-strip__block--active" : "");
  return (
    <div
      className={className}
      style={{ flex: `${widthPct} 0 0`, background: color }}
      data-section-id={section.id}
      {...(isTouchDevice ? longPress : {})}
      onClick={(e) => {
        if (isEditing) return;
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        onClickAt(pct);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(e);
      }}
      onMouseMove={(e) => {
        if (!isActive || isEditing) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        onHoverMove(pct);
      }}
      onMouseLeave={() => {
        if (isActive) onHoverLeave();
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
  isTouchDevice?: boolean;
  onSeek: (time: number) => void;
  onStartRename: () => void;
  onRenameCommit: (name: string) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onLongPress?: (coords: { clientX: number; clientY: number }) => void;
}

function BookmarkPin({
  bookmark,
  duration,
  isEditing,
  isTouchDevice = false,
  onSeek,
  onStartRename,
  onRenameCommit,
  onContextMenu,
  onLongPress,
}: BookmarkPinProps): React.JSX.Element {
  const longPress = useLongPress((e) => {
    onLongPress?.({ clientX: e.clientX, clientY: e.clientY });
  });
  const leftPct = duration > 0 ? (bookmark.time / duration) * 100 : 0;
  return (
    <span
      className="section-strip__bookmark"
      style={{ left: `${leftPct}%` }}
      data-bookmark-id={bookmark.id}
      {...(isTouchDevice ? longPress : {})}
      onClick={(e) => {
        if (isEditing) return;
        e.stopPropagation();
        onSeek(bookmark.time);
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
      <span className="section-strip__bookmark-pin" aria-hidden />

    </span>
  );
}

// ContextMenu lifted to ./ContextMenu.tsx (also reused by PracticeView for
// the sheet-music clear-loop floating menu).
