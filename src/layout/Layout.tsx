import type { ReactNode } from "react";
import type { ViewMode } from "./viewMode";
import { Divider } from "./Divider";

interface LayoutProps {
  viewMode: ViewMode;
  split: number;
  onSplitChange: (f: number) => void;
  falldown: ReactNode;
  score: ReactNode;
}

export function Layout({
  viewMode,
  split,
  onSplitChange,
  falldown,
  score,
}: LayoutProps) {
  const showFalldown = viewMode !== "score";
  const showScore = viewMode !== "falldown";

  const falldownStyle =
    viewMode === "both"
      ? {
          display: showFalldown ? undefined : "none",
          flexBasis: `${split * 100}%`,
          flexGrow: 0,
          flexShrink: 0,
        }
      : { display: showFalldown ? undefined : "none", flex: 1 };

  return (
    <div className="layout">
      <div className="layout-panel" style={falldownStyle}>
        {falldown}
      </div>
      {viewMode === "both" && (
        <Divider fraction={split} onChange={onSplitChange} />
      )}
      <div
        className="layout-panel"
        style={{ display: showScore ? undefined : "none", flex: 1 }}
      >
        {score}
      </div>
    </div>
  );
}
