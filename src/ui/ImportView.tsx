import { useState } from "react";
import type { Score } from "../model/score";
import { importFile } from "../import/importFile";

interface ImportViewProps {
  onLoaded: (score: Score) => void;
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
      onLoaded(score);
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
      <h1>Arpeggio</h1>
      <p>Drop a MIDI or MusicXML file here, or pick one to begin.</p>
      <label htmlFor="file-input">Choose a file…</label>
      <input
        id="file-input"
        type="file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      {loading && <p>Loading…</p>}
      {error !== null && <div role="alert">{error}</div>}
    </div>
  );
}
