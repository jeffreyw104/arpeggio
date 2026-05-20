import { useCallback, useEffect, useState } from "react";
import {
  listPieces,
  deletePiece,
  renamePiece,
  type StoredPiece,
} from "./db";

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

  return (
    <div className="library-browser">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search saved pieces"
      />
      {pieces.length === 0 ? (
        <p className="library-empty">No saved pieces yet.</p>
      ) : (
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
                <>
                  <button
                    type="button"
                    className="library-name"
                    onClick={() => onOpen(p.id)}
                  >
                    {p.name}
                  </button>
                  {p.source && (
                    <span
                      className="library-source-label"
                      aria-label={p.source === "midi" ? "MIDI source" : "Sheet music source"}
                    >
                      {p.source === "midi" ? "♪ Notes only" : "𝄞 Sheet music"}
                    </span>
                  )}
                </>
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
      )}
    </div>
  );
}
