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
 * and a body of controls. The body is rendered only while the section is
 * open, so a collapsed section is exactly its chip — nothing leaks. The
 * section's control state lives in the parent, so unmounting the body does
 * not lose anything.
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
      {open && <div className="accordion-body">{children}</div>}
    </div>
  );
}
