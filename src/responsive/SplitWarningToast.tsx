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

  // React to shouldShow flipping true after mount (e.g., user toggles to
  // Split layout for the first time after the toast was originally inert).
  useEffect(() => {
    if (!shouldShow) return;
    if (localStorage.getItem(STORAGE_KEY) === "1") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(true);
  }, [shouldShow]);

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
    <button
      type="button"
      className="split-warning-toast"
      onClick={dismiss}
      aria-live="polite"
    >
      Split view stacks vertically on tablets — pinch out / use Falldown only
      if the score panel feels cramped.
    </button>
  );
}
