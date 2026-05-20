/** Which page (range of measure indices) a given measure belongs to. */
export function pageForMeasure(
  measureIndex: number,
  measuresPerPage: number,
): { first: number; last: number } {
  const first = Math.floor(measureIndex / measuresPerPage) * measuresPerPage;
  return { first, last: first + measuresPerPage - 1 };
}
