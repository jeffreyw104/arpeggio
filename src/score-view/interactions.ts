/**
 * The measure index for a clicked/hovered element: the `data-measure-index` of
 * the element or its nearest ancestor carrying that attribute. `null` when the
 * target is outside any measure.
 */
export function measureIndexFromTarget(
  target: EventTarget | null,
): number | null {
  let el = target instanceof Element ? target : null;
  while (el) {
    const attr = el.getAttribute("data-measure-index");
    if (attr !== null) {
      const n = Number(attr);
      return Number.isFinite(n) ? n : null;
    }
    el = el.parentElement;
  }
  return null;
}

/** Order two measure indices (from a drag) into `{ first, last }`. */
export function orderedRange(
  a: number,
  b: number,
): { first: number; last: number } {
  return { first: Math.min(a, b), last: Math.max(a, b) };
}
