interface CollapsibleSectionProps {
  /** The chip label, also the accessible name of the toggle. */
  label: string;
  /** Whether the section is expanded. */
  open: boolean;
  /** Toggle handler — the parent owns the open state. */
  onToggle: () => void;
  /** The section's controls, revealed when open. */
  children: React.ReactNode;
}

/**
 * One section of the accordion control bar: a clickable chip (label + caret)
 * and a body that slides open/closed. The body stays mounted in both states
 * so its controls keep their live state; CSS clips it to zero width when
 * closed and animates the width change.
 */
export function CollapsibleSection({
  label,
  open,
  onToggle,
  children,
}: CollapsibleSectionProps): React.JSX.Element {
  return (
    <div className={`accordion-section${open ? " open" : ""}`}>
      <button
        type="button"
        className="accordion-chip"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="accordion-label">{label}</span>
        <span className="accordion-caret" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
      </button>
      <div className="accordion-body">
        <div className="accordion-body-inner">{children}</div>
      </div>
    </div>
  );
}
