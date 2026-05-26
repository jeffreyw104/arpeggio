import { useState } from "react";
import type { Score } from "../model/score";
import { importFile } from "../import/importFile";

interface ImportViewProps {
  /** Returning a Promise lets the importer surface a save-side error
   *  (e.g., IndexedDB failure) back into this view's error state. */
  onLoaded: (score: Score, file: File) => Promise<void> | void;
}

/** Landing screen: drop zone / file picker that imports a Score. */
export function ImportView({ onLoaded }: ImportViewProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setLoading(true);
    try {
      const score = await importFile(file);
      await onLoaded(score, file);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="import-view"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files?.[0];
        if (f) handleFile(f);
      }}
    >
      <div className="import-card">
        <img
          className="import-logo"
          src="/icons/icon.svg"
          alt=""
          width="72"
          height="72"
        />
        <h1>Arpeggio</h1>
        <p className="import-lead">
          Drop a MIDI or MusicXML file here, or pick one to begin.
        </p>
        <label htmlFor="file-input" className="import-cta">
          Choose a file…
        </label>
        <input
          id="file-input"
          className="import-file-input"
          type="file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        {loading && <p className="import-status">Loading…</p>}
        {error !== null && (
          <div className="import-error" role="alert">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
