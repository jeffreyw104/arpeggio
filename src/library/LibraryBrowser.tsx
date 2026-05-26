import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  listPieces,
  deletePiece,
  renamePiece,
  getPracticeState,
  type StoredPiece,
  type StoredPracticeState,
} from "./db";
import { detectType } from "../import/detectType";
import { formatRelative } from "./relativeTime";

type FormatVariant = "full" | "compact";

interface FormatCompareProps {
  variant: FormatVariant;
}

function FormatCompare({ variant }: FormatCompareProps) {
  return (
    <div className="lib-compare">
      <div className="lib-compare-col midi" data-testid="lib-compare-midi">
        <span className="lib-compare-chip">MIDI</span>
        {variant === "full" && (
          <>
            <h5>Best for playing along</h5>
            <p className="desc">
              .mid / .midi files. Often exported from a DAW or downloaded as a
              performance.
            </p>
          </>
        )}
        <ul>
          <li>Exact falldown view (note timing is the source of truth)</li>
          <li>Auto-detected practice sections</li>
          <li>Bookmarks &amp; section navigator</li>
          <li className="x">Score notation is auto-generated &amp; approximate</li>
        </ul>
      </div>
      <div className="lib-compare-col xml" data-testid="lib-compare-xml">
        <span className="lib-compare-chip">MUSICXML</span>
        {variant === "full" && (
          <>
            <h5>Best for reading the score</h5>
            <p className="desc">
              .xml / .musicxml files. Authored notation from sheet-music
              software.
            </p>
          </>
        )}
        <ul>
          <li>Original engraved sheet music (verbatim)</li>
          <li>Accurate rhythms, articulations, accidentals</li>
          <li>Slim measure scrubber</li>
          <li className="x">No section navigator (uses engraved score instead)</li>
        </ul>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="lib-empty" data-testid="lib-empty">
      <div className="lib-empty-head">
        <div className="lib-empty-ico" aria-hidden="true">♪</div>
        <h4>Your library is empty</h4>
      </div>
      <p className="lead">
        Arpeggio accepts two formats — here's what each unlocks:
      </p>
      <FormatCompare variant="full" />
    </div>
  );
}

function FormatInfoPill() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onDown(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  return (
    <div className="lib-info-wrap" ref={wrapRef}>
      <button
        type="button"
        className="lib-info-pill"
        data-testid="lib-info-pill"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="dot">ⓘ</span> MIDI vs MusicXML
      </button>
      {open && (
        <div className="lib-info-popover" data-testid="lib-info-popover" role="dialog">
          <p className="pop-label">What each format unlocks</p>
          <FormatCompare variant="compact" />
        </div>
      )}
    </div>
  );
}

interface KebabMenuProps {
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
  onClose: () => void;
}

function KebabMenu({ onOpen, onRename, onDelete, onClose }: KebabMenuProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="lib-menu" role="menu">
      <button type="button" className="lib-menu-item" role="menuitem" onClick={onOpen}>
        Open
      </button>
      <button type="button" className="lib-menu-item" role="menuitem" onClick={onRename}>
        Rename
      </button>
      <div className="lib-menu-sep" />
      <button
        type="button"
        className="lib-menu-item danger"
        role="menuitem"
        onClick={onDelete}
      >
        Delete
      </button>
    </div>
  );
}

// Test-only re-export. Keeps KebabMenu internal to the module while
// allowing direct unit tests of its keyboard / click behavior.
export const __KebabMenu_test_only = KebabMenu;

function chipFor(format: ReturnType<typeof detectType>): { label: string; cls: string } {
  if (format === "midi") return { label: "MIDI", cls: "lib-chip lib-chip-midi" };
  if (format === "musicxml" || format === "mxl")
    return { label: "XML", cls: "lib-chip lib-chip-xml" };
  return { label: "?", cls: "lib-chip" };
}

function formatLabel(format: ReturnType<typeof detectType>): string {
  if (format === "midi") return "MIDI";
  if (format === "mxl") return "MusicXML (.mxl)";
  return "MusicXML";
}

interface RowProps {
  piece: StoredPiece;
  practiceState: StoredPracticeState | undefined;
  onOpen: () => void;
  onRenameCommit: (next: string) => Promise<void>;
  onDelete: () => Promise<void>;
}

function Row({ piece, practiceState, onOpen, onRenameCommit, onDelete }: RowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(piece.name);
  const menuRef = useRef<HTMLLIElement | null>(null);

  const format = useMemo(
    () => detectType(piece.name, new Uint8Array(piece.data.slice(0, 2048))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [piece.id, piece.name, piece.data],
  );
  const chip = chipFor(format);
  const fmt = formatLabel(format);

  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const muted =
    practiceState?.leftMuted && practiceState?.rightMuted
      ? "L+R muted"
      : practiceState?.leftMuted
        ? "L muted"
        : practiceState?.rightMuted
          ? "R muted"
          : null;

  const hasLoop = practiceState?.loop != null;
  const sectionsCount = practiceState?.sectionState?.sections.length ?? 0;
  const bpm = practiceState?.bpm;

  async function commitRename() {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== piece.name) {
      await onRenameCommit(trimmed);
    }
    setEditing(false);
  }

  return (
    <li
      className={`lib-row${menuOpen ? " is-menu-open" : ""}`}
      data-testid="lib-row"
      ref={menuRef}
    >
      <span className={chip.cls} data-testid="lib-chip">{chip.label}</span>
      <div>
        {editing ? (
          <input
            type="text"
            className="lib-rename-input"
            aria-label="New name"
            autoFocus
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commitRename();
              else if (e.key === "Escape") {
                setEditName(piece.name);
                setEditing(false);
              }
            }}
            onBlur={() => void commitRename()}
          />
        ) : (
          <>
            <button type="button" className="lib-name" onClick={onOpen}>
              {piece.name}
            </button>
            <div className="lib-subline">
              <span>{fmt}</span>
              <span className="sep">·</span>
              <span>added {formatRelative(piece.addedAt)}</span>
              {muted && (
                <>
                  <span className="sep">·</span>
                  <span className="lib-mute">{muted}</span>
                </>
              )}
            </div>
          </>
        )}
      </div>
      <div className="lib-stats">
        {hasLoop && <span className="lib-pill">loop</span>}
        {sectionsCount > 0 && (
          <span className="lib-pill">{sectionsCount} sec</span>
        )}
        {typeof bpm === "number" && (
          <>
            <span>♩</span>
            <span className="v">{bpm}</span>
          </>
        )}
      </div>
      <button
        type="button"
        className="lib-kebab"
        data-testid="lib-kebab"
        aria-label={`Actions for ${piece.name}`}
        onClick={() => setMenuOpen((m) => !m)}
      >
        ⋯
      </button>
      {menuOpen && (
        <KebabMenu
          onOpen={() => {
            setMenuOpen(false);
            onOpen();
          }}
          onRename={() => {
            setMenuOpen(false);
            setEditing(true);
          }}
          onDelete={() => {
            setMenuOpen(false);
            void onDelete();
          }}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </li>
  );
}

/** Props for {@link LibraryBrowser}. */
interface LibraryBrowserProps {
  /** Called with the piece id when a saved piece is opened. */
  onOpen: (id: string) => void;
}

/** A searchable list of saved pieces, with open, rename, and delete actions. */
export function LibraryBrowser({ onOpen }: LibraryBrowserProps) {
  const [pieces, setPieces] = useState<StoredPiece[]>([]);
  const [query, setQuery] = useState("");
  const [practiceById, setPracticeById] = useState<Map<string, StoredPracticeState>>(
    () => new Map(),
  );

  const refresh = useCallback(() => listPieces().then(setPieces), []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const entries = await Promise.all(
        pieces.map(async (p) => [p.id, await getPracticeState(p.id)] as const),
      );
      if (cancelled) return;
      const next = new Map<string, StoredPracticeState>();
      for (const [id, state] of entries) {
        if (state) next.set(id, state);
      }
      setPracticeById(next);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [pieces]);

  const needle = query.trim().toLowerCase();
  const filtered = pieces.filter((p) => p.name.toLowerCase().includes(needle));

  if (pieces.length === 0) {
    return (
      <div className="library-browser">
        <div className="lib-head">
          <h2>Library</h2>
          <div className="lib-head-right">0 pieces</div>
        </div>
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="library-browser">
      <div className="lib-head">
        <h2>Library</h2>
        <div className="lib-head-right">
          <FormatInfoPill />
          <span>{pieces.length} piece{pieces.length === 1 ? "" : "s"} saved</span>
        </div>
      </div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search saved pieces"
      />
      <ul className="lib-rows">
        {filtered.map((p) => (
          <Row
            key={p.id}
            piece={p}
            practiceState={practiceById.get(p.id)}
            onOpen={() => onOpen(p.id)}
            onRenameCommit={async (next) => {
              await renamePiece(p.id, next);
              await refresh();
            }}
            onDelete={async () => {
              await deletePiece(p.id);
              await refresh();
            }}
          />
        ))}
      </ul>
    </div>
  );
}
