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
  if (viewMode === "both") {
    return (
      <div className="layout">
        <div
          className="layout-panel"
          style={{ flexBasis: `${split * 100}%`, flexGrow: 0, flexShrink: 0 }}
        >
          {falldown}
        </div>
        <Divider fraction={split} onChange={onSplitChange} />
        <div className="layout-panel" style={{ flex: 1 }}>
          {score}
        </div>
      </div>
    );
  }

  if (viewMode === "falldown") {
    return (
      <div className="layout">
        <div className="layout-panel" style={{ flex: 1 }}>
          {falldown}
        </div>
      </div>
    );
  }

  return (
    <div className="layout">
      <div className="layout-panel" style={{ flex: 1 }}>
        {score}
      </div>
    </div>
  );
}
