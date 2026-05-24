import { useState } from "react";
import type { Score } from "./model/score";
import { ImportView } from "./ui/ImportView";
import { PracticeView } from "./app/PracticeView";
import { LibraryBrowser } from "./library/LibraryBrowser";
import { savePiece, getPiece } from "./library/db";
import { importFile } from "./import/importFile";
import { useIsTouchDevice } from "./responsive/useIsTouchDevice";

interface Session {
  score: Score;
  pieceId: string;
  pieceName: string;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const isTouch = useIsTouchDevice();
  const appClass = "app" + (isTouch ? " app--touch" : "");

  async function handleImported(score: Score, file: File) {
    const id = await savePiece(file.name, await file.arrayBuffer());
    setSession({ score, pieceId: id, pieceName: file.name });
  }

  async function handleOpen(id: string) {
    const piece = await getPiece(id);
    if (!piece) return;
    const score = await importFile(new File([piece.data], piece.name));
    setSession({ score, pieceId: id, pieceName: piece.name });
  }

  if (session) {
    return (
      <div className={appClass}>
        <PracticeView
          score={session.score}
          pieceId={session.pieceId}
          pieceName={session.pieceName}
          onExit={() => setSession(null)}
        />
      </div>
    );
  }

  return (
    <div className={`${appClass} landing`}>
      <ImportView onLoaded={handleImported} />
      <LibraryBrowser onOpen={(id) => void handleOpen(id)} />
    </div>
  );
}
