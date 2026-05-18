import { useState } from "react";
import type { Score } from "./model/score";
import { ImportView } from "./ui/ImportView";
import { PracticeView } from "./app/PracticeView";
import { LibraryBrowser } from "./library/LibraryBrowser";
import { savePiece, getPiece } from "./library/db";
import { importFile } from "./import/importFile";

interface Session {
  score: Score;
  pieceId: string;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);

  async function handleImported(score: Score, file: File) {
    const id = await savePiece(file.name, await file.arrayBuffer());
    setSession({ score, pieceId: id });
  }

  async function handleOpen(id: string) {
    const piece = await getPiece(id);
    if (!piece) return;
    const score = await importFile(new File([piece.data], piece.name));
    setSession({ score, pieceId: id });
  }

  if (session) {
    return (
      <PracticeView
        score={session.score}
        pieceId={session.pieceId}
        onExit={() => setSession(null)}
      />
    );
  }

  return (
    <div className="landing">
      <ImportView
        onLoaded={(score, file) => void handleImported(score, file)}
      />
      <LibraryBrowser onOpen={(id) => void handleOpen(id)} />
    </div>
  );
}
