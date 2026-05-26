import { useCallback, useEffect, useState } from "react";
import {
  listPieces,
  deletePiece,
  renamePiece,
  type StoredPiece,
} from "./db";

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

/** Props for {@link LibraryBrowser}. */
interface LibraryBrowserProps {
  /** Called with the piece id when a saved piece is opened. */
  onOpen: (id: string) => void;
}

/** A searchable list of saved pieces, with open, rename, and delete actions. */
export function LibraryBrowser({ onOpen }: LibraryBrowserProps) {
  const [pieces, setPieces] = useState<StoredPiece[]>([]);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const refresh = useCallback(() => listPieces().then(setPieces), []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const needle = query.trim().toLowerCase();
  const filtered = pieces.filter((p) => p.name.toLowerCase().includes(needle));

  function startRename(p: StoredPiece) {
    setEditingId(p.id);
    setEditingName(p.name);
  }

  async function commitRename() {
    if (!editingId) return;
    const trimmed = editingName.trim();
    if (trimmed) await renamePiece(editingId, trimmed);
    setEditingId(null);
    setEditingName("");
    await refresh();
  }

  function cancelRename() {
    setEditingId(null);
    setEditingName("");
  }

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
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search saved pieces"
      />
      <ul>
          {filtered.map((p) => (
            <li key={p.id}>
              {editingId === p.id ? (
                <input
                  type="text"
                  className="library-rename-input"
                  aria-label="New name"
                  value={editingName}
                  autoFocus
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void commitRename();
                    else if (e.key === "Escape") cancelRename();
                  }}
                  onBlur={() => void commitRename()}
                />
              ) : (
                <button
                  type="button"
                  className="library-name"
                  onClick={() => onOpen(p.id)}
                >
                  {p.name}
                </button>
              )}
              <button
                type="button"
                className="library-rename"
                aria-label={`Rename ${p.name}`}
                onClick={() => startRename(p)}
              >
                Rename
              </button>
              <button
                type="button"
                className="library-delete"
                aria-label={`Delete ${p.name}`}
                onClick={async () => {
                  await deletePiece(p.id);
                  await refresh();
                }}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
    </div>
  );
}
