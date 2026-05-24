import type { ReactNode } from "react";
import type { ViewMode } from "./viewMode";
import { Divider, type DividerOrientation } from "./Divider";

interface LayoutProps {
  viewMode: ViewMode;
  split: number;
  onSplitChange: (f: number) => void;
  falldown: ReactNode;
  score: ReactNode;
  /** `"row"` (default) lays out panels left/right; `"column"` lays them
   *  top/bottom (e.g. tablet portrait). */
  orientation?: "row" | "column";
}

export function Layout({
  viewMode,
  split,
  onSplitChange,
  falldown,
  score,
  orientation = "row",
}: LayoutProps) {
  const showFalldown = viewMode !== "score";
  const showScore = viewMode !== "falldown";
  const dividerAxis: DividerOrientation = orientation === "column" ? "horizontal" : "vertical";

  const falldownStyle =
    viewMode === "both"
      ? {
          display: showFalldown ? undefined : "none",
          flexBasis: `${split * 100}%`,
          flexGrow: 0,
          flexShrink: 0,
        }
      : { display: showFalldown ? undefined : "none", flex: 1 };

  const className = "layout" + (orientation === "column" ? " layout--column" : "");

  return (
    <div className={className}>
      <div className="layout-panel" style={falldownStyle}>
        {falldown}
      </div>
      {viewMode === "both" && (
        <Divider fraction={split} onChange={onSplitChange} orientation={dividerAxis} />
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
