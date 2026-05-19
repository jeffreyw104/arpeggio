import type { Transport } from "../transport/transport";
import { currentMeasureIndex } from "./sync";
import { measureIndexFromTarget, orderedRange } from "./interactions";
import { measureBox } from "./measureBox";
import type { TimemapEntry } from "./verovio";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Orchestrates the engraved score: injects the Verovio SVG, tags measures with
 * their index, draws a green highlight over the current measure (and a lighter
 * green over the hovered measure), and turns clicks/drags into seeks and A-B
 * loops. The view only READS `transport.clock.position`; user input drives
 * `seek`/`loopMeasures`.
 */
export class ScoreView {
  private readonly container: HTMLElement;
  private readonly transport: Transport;
  private readonly pagesEl: HTMLElement;
  private dragStart: number | null = null;
  private highlightRect: SVGRectElement | null = null;
  private hoverRect: SVGRectElement | null = null;
  private lastScrolledIndex: number | null = null;
  private lastHoverIndex: number | null = null;
  private readonly onMouseDown: (e: MouseEvent) => void;
  private readonly onMouseUp: (e: MouseEvent) => void;
  private readonly onMouseMove: (e: MouseEvent) => void;
  private readonly onMouseLeave: () => void;

  constructor(
    container: HTMLElement,
    transport: Transport,
    svgPages: string[],
    // Per-note highlighting was removed; the timemap is no longer used. The
    // parameter is kept so the constructor signature stays stable for
    // PracticeView and tests.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _timemap: TimemapEntry[],
  ) {
    this.container = container;
    this.transport = transport;

    container.innerHTML = "";
    const pagesEl = document.createElement("div");
    pagesEl.className = "score-pages";
    for (const svg of svgPages) {
      const page = document.createElement("div");
      page.className = "score-page";
      page.innerHTML = svg;
      pagesEl.appendChild(page);
    }
    container.appendChild(pagesEl);
    this.pagesEl = pagesEl;

    // Tag measures in document order across all pages.
    const measures = container.querySelectorAll("g.measure");
    measures.forEach((el, i) => {
      el.setAttribute("data-measure-index", String(i));
      // Give each measure an invisible, full-measure hit area so hovering or
      // clicking anywhere inside the measure — over notes OR whitespace —
      // registers as that measure. SVG pointer hit-testing only fires on
      // painted geometry, so without this an empty gap between notes hits no
      // measure element. Appended last (on top) to reliably catch events; the
      // app only does measure-level interaction so this never steals a needed
      // per-note event.
      const box = measureBox(el);
      const hit = document.createElementNS(SVG_NS, "rect");
      hit.setAttribute("class", "measure-hit");
      hit.setAttribute("x", String(box.x));
      hit.setAttribute("y", String(box.y));
      hit.setAttribute("width", String(box.width));
      hit.setAttribute("height", String(box.height));
      hit.setAttribute("fill", "transparent");
      hit.setAttribute("pointer-events", "all");
      el.appendChild(hit);
    });

    this.onMouseDown = (e) => {
      this.dragStart = measureIndexFromTarget(e.target);
    };
    this.onMouseUp = (e) => {
      const end = measureIndexFromTarget(e.target);
      if (this.dragStart !== null && end !== null) {
        if (this.dragStart === end) {
          this.transport.clock.seek(
            this.transport.score.measures[end].start,
          );
        } else {
          const { first, last } = orderedRange(this.dragStart, end);
          this.transport.loopMeasures(first, last);
        }
      }
      this.dragStart = null;
    };
    this.onMouseMove = (e) => {
      const idx = measureIndexFromTarget(e.target);
      if (idx === this.lastHoverIndex) return;
      this.lastHoverIndex = idx;
      if (idx === null) {
        this.hideRect(this.hoverRect);
        return;
      }
      const el = this.container.querySelector(
        `[data-measure-index="${idx}"]`,
      );
      if (el) {
        this.hoverRect = this.ensureRect(this.hoverRect, "measure-hover");
        this.positionRect(this.hoverRect, el);
      } else {
        this.hideRect(this.hoverRect);
      }
    };
    this.onMouseLeave = () => {
      this.lastHoverIndex = null;
      this.hideRect(this.hoverRect);
    };
    container.addEventListener("mousedown", this.onMouseDown);
    container.addEventListener("mouseup", this.onMouseUp);
    container.addEventListener("mousemove", this.onMouseMove);
    container.addEventListener("mouseleave", this.onMouseLeave);
  }

  /** Update the current-measure highlight and scroll from the clock time. */
  renderFrame(): void {
    const t = this.transport.clock.position;
    const idx = currentMeasureIndex(this.transport.score, t);
    const current = this.container.querySelector(
      `[data-measure-index="${idx}"]`,
    );
    if (current) {
      this.highlightRect = this.ensureRect(
        this.highlightRect,
        "measure-highlight",
      );
      this.positionRect(this.highlightRect, current);

      // Follow the playhead only when it actually moves to a new measure,
      // and only while playing — so a paused user can browse freely.
      if (
        this.transport.clock.playing &&
        idx !== this.lastScrolledIndex
      ) {
        (current as HTMLElement).scrollIntoView?.({ block: "nearest" });
      }
      this.lastScrolledIndex = idx;
    } else {
      this.hideRect(this.highlightRect);
    }
  }

  /** Lazily create an SVG overlay rect with the given class. */
  private ensureRect(
    rect: SVGRectElement | null,
    className: string,
  ): SVGRectElement {
    if (rect) return rect;
    const created = document.createElementNS(SVG_NS, "rect");
    created.setAttribute("class", className);
    created.style.pointerEvents = "none";
    return created;
  }

  /**
   * Move and size `rect` to cover the clean measure rectangle (barline to
   * barline, topmost to bottommost staff line) — MuseScore-style.
   *
   * The rect is inserted as the FIRST child of the measure `<g>` itself, so it
   * sits behind the notation and shares the measure's exact coordinate space.
   * (Verovio nests measures inside transformed `g.page-margin`/`g.system`
   * groups, so `getBBox()`'s local coords are only correct for a sibling of
   * the notation — appending to the root `<svg>`, as before, mis-placed it.)
   *
   * The box comes from `measureBox` (staff lines only), so the highlight has
   * the same shape in every measure and never spills past the barlines into an
   * adjacent measure. The rect is removed from its previous parent first, so
   * it is MOVED between measures, never duplicated.
   */
  private positionRect(rect: SVGRectElement, measureEl: Element): void {
    if (rect.parentNode) rect.parentNode.removeChild(rect);
    const box = measureBox(measureEl);
    rect.setAttribute("x", String(box.x));
    rect.setAttribute("y", String(box.y));
    rect.setAttribute("width", String(box.width));
    rect.setAttribute("height", String(box.height));
    measureEl.insertBefore(rect, measureEl.firstChild);
  }

  /** Detach a rect from the DOM so it is no longer visible. */
  private hideRect(rect: SVGRectElement | null): void {
    if (rect && rect.parentNode) rect.parentNode.removeChild(rect);
  }

  /**
   * Zoom the engraved notation. CSS `zoom` (not `transform: scale`) is used so
   * the scaled pages still expand the scroll area. Targets Chromium browsers.
   */
  setZoom(zoom: number): void {
    this.pagesEl.style.zoom = String(zoom);
  }

  /** Remove all listeners and injected content. */
  destroy(): void {
    this.container.removeEventListener("mousedown", this.onMouseDown);
    this.container.removeEventListener("mouseup", this.onMouseUp);
    this.container.removeEventListener("mousemove", this.onMouseMove);
    this.container.removeEventListener("mouseleave", this.onMouseLeave);
    this.container.innerHTML = "";
  }
}
