import { useLayoutEffect, useRef, useState } from "react";

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  /** CSS class for the outer <ul>. Defaults to `.section-strip__menu`. */
  className?: string;
}

/**
 * A liquid-glass right-click menu anchored at viewport coordinates `(x, y)`.
 * After mount, the menu measures itself and flips its anchor leftward /
 * upward if it would otherwise overflow the viewport — so right-clicks near
 * the right or bottom edge of the page open a fully-visible menu instead of
 * a clipped one.
 *
 * Used by both the section right-click menu and the sheet-music "Clear loop"
 * floating menu.
 */
export function ContextMenu({
  x,
  y,
  items,
  className = "section-strip__menu",
}: ContextMenuProps): React.JSX.Element {
  const ref = useRef<HTMLUListElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = x + rect.width + pad > vw ? Math.max(pad, x - rect.width) : x;
    const top = y + rect.height + pad > vh ? Math.max(pad, y - rect.height) : y;
    setPos({ left, top });
  }, [x, y, items.length]);
  return (
    <ul
      ref={ref}
      className={className}
      style={{ left: pos.left, top: pos.top }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((it) => (
        <li key={it.label}>
          <button type="button" onClick={it.onClick}>
            {it.label}
          </button>
        </li>
      ))}
    </ul>
  );
}
