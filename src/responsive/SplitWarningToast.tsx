import { useEffect, useState } from "react";

const STORAGE_KEY = "arpeggio:tablet:split-warning-seen";
const AUTO_DISMISS_MS = 6000;

export interface SplitWarningToastProps {
  /** When true, the toast may render (still gated by localStorage). */
  shouldShow: boolean;
}

/**
 * One-shot warning toast for tablet users who select the Split layout.
 * Persists dismissal in localStorage; once seen it never reappears.
 */
export function SplitWarningToast({ shouldShow }: SplitWarningToastProps) {
  const [visible, setVisible] = useState<boolean>(() => {
    if (!shouldShow) return false;
    return localStorage.getItem(STORAGE_KEY) !== "1";
  });

  useEffect(() => {
    if (!visible) return;
    const t = window.setTimeout(() => dismiss(), AUTO_DISMISS_MS);
    return () => window.clearTimeout(t);
  }, [visible]);

  function dismiss(): void {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="status"
      className="split-warning-toast"
      onClick={dismiss}
    >
      Split view stacks vertically on tablets — pinch out / use Falldown only
      if the score panel feels cramped.
    </div>
  );
}
