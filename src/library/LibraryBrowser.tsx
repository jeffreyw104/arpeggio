import { useCallback, useEffect, useState } from "react";
import { listPieces, deletePiece, type StoredPiece } from "./db";

/** Props for {@link LibraryBrowser}. */
interface LibraryBrowserProps {
  /** Called with the piece id when a saved piece is opened. */
  onOpen: (id: string) => void;
}

/** A searchable list of saved pieces, with open and delete actions. */
export function LibraryBrowser({ onOpen }: LibraryBrowserProps) {
  const [pieces, setPieces] = useState<StoredPiece[]>([]);
  const [query, setQuery] = useState("");

  const refresh = useCallback(() => listPieces().then(setPieces), []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const needle = query.trim().toLowerCase();
  const filtered = pieces.filter((p) => p.name.toLowerCase().includes(needle));

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
              <button
                type="button"
                className="library-name"
                onClick={() => onOpen(p.id)}
              >
                {p.name}
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
