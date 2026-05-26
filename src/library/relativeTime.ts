/** Format a timestamp as a coarse relative phrase.
 *  Bands: today / yesterday / N days / N weeks / N months. */
export function formatRelative(timestamp: number, now: number = Date.now()): string {
  const ms = now - timestamp;
  const day = 24 * 60 * 60 * 1000;

  // Same calendar day check is not strict — anything < 1 day diff is "today".
  if (ms < day) return "today";
  if (ms < 2 * day) return "yesterday";

  const days = Math.floor(ms / day);
  if (days < 7) return `${days} days ago`;

  if (days < 28) {
    const weeks = Math.floor(days / 7);
    return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
  }

  const months = Math.round(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}
