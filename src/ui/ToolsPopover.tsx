interface ToolsPopoverProps {
  open: boolean;
  /** Where the popover floats. "default" hugs the top bar; "below-lane"
   *  drops it under the reading-lane ribbon so the engraved sheet music
   *  stays visible. */
  placement?: "default" | "below-lane";
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
  placement = "default",
  children,
}: ToolsPopoverProps): React.JSX.Element | null {
  if (!open) return null;

  const className =
    placement === "below-lane"
      ? "tools-popover tools-popover--below-lane"
      : "tools-popover";

  return (
    <div className={className} role="dialog" aria-label="Tools">
      {children}
    </div>
  );
}
