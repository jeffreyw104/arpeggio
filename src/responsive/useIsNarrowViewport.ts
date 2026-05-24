import { useEffect, useState } from "react";

/**
 * Returns true when `window.innerWidth < threshold`. Subscribes to `resize`
 * so orientation changes flip the value.
 */
export function useIsNarrowViewport(threshold = 1024): boolean {
  const [narrow, setNarrow] = useState<boolean>(() => isNarrow(threshold));
  useEffect(() => {
    const handler = (): void => setNarrow(isNarrow(threshold));
    handler();
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [threshold]);
  return narrow;
}

function isNarrow(threshold: number): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth < threshold;
}
