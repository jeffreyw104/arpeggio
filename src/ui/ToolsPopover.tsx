interface ToolsPopoverProps {
  open: boolean;
  children: React.ReactNode;
}

/**
 * A floating panel anchored below the top bar's Tools button. Renders nothing
 * when closed. While open it stays put — clicking elsewhere (the score, the
 * play button, anywhere) does NOT close it, so the player can keep working
 * with the panel floating. It closes only when the Tools button is pressed
 * again (which toggles `open`).
 */
export function ToolsPopover({
  open,
  children,
}: ToolsPopoverProps): React.JSX.Element | null {
  if (!open) return null;

  return (
    <div className="tools-popover" role="dialog" aria-label="Tools">
      {children}
    </div>
  );
}
