import { useEffect, useId, useRef, useState } from "react";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export interface SelectSection<T extends string> {
  /** Optional section heading; omit for ungrouped items. */
  section?: string;
  items: SelectOption<T>[];
}

interface TopBarSelectProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  /** Single flat option list. Mutually exclusive with `sections`. */
  options?: SelectOption<T>[];
  /** Grouped option list with section headings. */
  sections?: SelectSection<T>[];
  /** Optional prefix shown in the pill before the current label. */
  label?: string;
  /** aria-label override; defaults to the current option's label. */
  ariaLabel?: string;
}

function Chevron(): React.JSX.Element {
  return (
    <svg
      className="top-bar-select-caret"
      viewBox="0 0 10 10"
      width="10"
      height="10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="2.5,4 5,6.5 7.5,4" />
    </svg>
  );
}

/**
 * A pill that shows the current selection + a chevron, opening a floating
 * menu below on click. Used by every multi-option control in the top bar
 * (Mode, View, Layout). Supports a single flat list of options or a list
 * of named sections (used by the merged Layout + Lane-theme menu).
 */
export function TopBarSelect<T extends string>({
  value,
  onChange,
  options,
  sections,
  label,
  ariaLabel,
}: TopBarSelectProps<T>): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const allItems: SelectOption<T>[] = sections
    ? sections.flatMap((s) => s.items)
    : (options ?? []);
  const current = allItems.find((o) => o.value === value);
  const display = current?.label ?? value;

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent): void {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(v: T): void {
    onChange(v);
    setOpen(false);
  }

  return (
    <div className="top-bar-select" ref={rootRef}>
      <button
        type="button"
        className={`top-bar-select-pill${open ? " top-bar-select-pill--open" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={ariaLabel ?? (label ? `${label} ${display}` : display)}
        onClick={() => setOpen((o) => !o)}
      >
        {label ? `${label} ${display}` : display}
        <Chevron />
      </button>
      {open && (
        <ul
          id={menuId}
          className="top-bar-select-menu"
          role="menu"
        >
          {sections
            ? sections.map((s, i) => (
                <Section
                  key={s.section ?? i}
                  section={s}
                  value={value}
                  pick={pick}
                  divider={i > 0}
                />
              ))
            : (options ?? []).map((o) => (
                <Item key={o.value} option={o} value={value} pick={pick} />
              ))}
        </ul>
      )}
    </div>
  );
}

function Section<T extends string>({
  section,
  value,
  pick,
  divider,
}: {
  section: SelectSection<T>;
  value: T;
  pick: (v: T) => void;
  divider: boolean;
}): React.JSX.Element {
  return (
    <>
      {divider && <li className="top-bar-select-divider" role="separator" />}
      {section.section && (
        <li className="top-bar-select-section-label" role="presentation">
          {section.section}
        </li>
      )}
      {section.items.map((o) => (
        <Item key={o.value} option={o} value={value} pick={pick} />
      ))}
    </>
  );
}

function Item<T extends string>({
  option,
  value,
  pick,
}: {
  option: SelectOption<T>;
  value: T;
  pick: (v: T) => void;
}): React.JSX.Element {
  const active = option.value === value;
  return (
    <li
      role="menuitem"
      aria-current={active ? "true" : undefined}
      className={`top-bar-select-item${active ? " top-bar-select-item--active" : ""}`}
      onClick={() => pick(option.value)}
    >
      <span className="top-bar-select-check" aria-hidden="true">
        {active ? "✓" : " "}
      </span>
      {option.label}
    </li>
  );
}
