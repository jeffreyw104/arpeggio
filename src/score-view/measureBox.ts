/**
 * The clean measure rectangle: the union of the measure's STAFF-LINE bounding
 * boxes only — not the whole `g.measure` bbox.
 *
 * Verovio draws each staff's 5 horizontal lines as the direct `<path>`
 * children of `g.staff`. Their union spans exactly barline-to-barline in x and
 * from the topmost to the bottommost staff line in y (covering the gap between
 * the two staves of a grand staff). Crucially it EXCLUDES notes, stems, beams
 * and ledger lines, so the box is identical for every measure of the same
 * width and never overflows into a neighbour.
 *
 * Falls back to the full `g.measure` bbox if no staff lines are found.
 */
export function measureBox(measureEl: Element): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const lines = measureEl.querySelectorAll("g.staff > path");
  if (lines.length === 0) {
    return (measureEl as SVGGraphicsElement).getBBox();
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  lines.forEach((line) => {
    const b = (line as SVGGraphicsElement).getBBox();
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  });
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
