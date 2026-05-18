import { useEffect, useRef } from "react";

interface ToolsPopoverProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * A floating panel anchored below the top bar. Renders nothing when closed;
 * when open, traps focus-adjacent interactions via a click-outside listener and
 * an Escape key handler, both of which call `onClose`.
 */
export function ToolsPopover({
  open,
  onClose,
  children,
}: ToolsPopoverProps): React.JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") onClose();
    }

    function handlePointerDown(e: MouseEvent): void {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    // Use capture so clicks on child popovers / buttons inside fire before
    // anything that might stop propagation.
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div ref={panelRef} className="tools-popover" role="dialog" aria-label="Tools">
      {children}
    </div>
  );
}
