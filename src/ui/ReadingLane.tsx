interface ReadingLaneProps {
  /** Whether the lane is collapsed (zero height). */
  collapsed: boolean;
  /** Toggle handler — the parent owns the collapsed state. */
  onToggle: () => void;
  /** The score container node, passed through from PracticeView so it stays
   *  at a stable React tree position regardless of mode. */
  children: React.ReactNode;
}

/**
 * The MIDI tab's collapsible reading-lane strip. Clips to ~one engraved
 * system (~120 px) when expanded, or to 0 px when collapsed, so the falldown
 * canvas fills the remaining height. The score-container DOM node is received
 * as `children` — PracticeView always renders it at the same tree position and
 * passes it here, keeping the ScoreView binding intact across tab switches.
 */
export function ReadingLane({
  collapsed,
  onToggle,
  children,
}: ReadingLaneProps): React.JSX.Element {
  return (
    <div
      className={`reading-lane${collapsed ? " reading-lane--collapsed" : ""}`}
      data-testid="reading-lane"
    >
      <div className="reading-lane-score">{children}</div>
      <button
        type="button"
        className="reading-lane-toggle"
        aria-label={collapsed ? "Expand reading lane" : "Collapse reading lane"}
        aria-expanded={!collapsed}
        onClick={onToggle}
      >
        {collapsed ? "▸ Reading lane" : "▾ Reading lane"}
      </button>
    </div>
  );
}
