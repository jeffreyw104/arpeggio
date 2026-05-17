import { useState } from "react";
import type { Score } from "./model/score";
import { ImportView } from "./ui/ImportView";
import { PracticeView } from "./app/PracticeView";

export default function App() {
  const [score, setScore] = useState<Score | null>(null);
  return score ? (
    <PracticeView score={score} />
  ) : (
    <ImportView onLoaded={setScore} />
  );
}
