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
  private dragEnd: number | null = null;
  private highlightRect: SVGRectElement | null = null;
  private hoverRect: SVGRectElement | null = null;
  /** One rect per measure highlighted live during a click-drag loop-set. */
  private dragRects: SVGRectElement[] = [];
  /** One rect per measure of the persistent active-loop indicator. */
  private loopRects: SVGRectElement[] = [];
  private lastScrolledIndex: number | null = null;
  private lastHoverIndex: number | null = null;
  /** Container width at the last hit-rect (re)build. Used in renderFrame to
   *  detect "container just became visible / resized" and rebuild the rects
   *  with fresh getBBox values. -1 means "never built." */
  private lastHitContainerWidth = -1;
  private readonly onMouseDown: (e: MouseEvent) => void;
  private readonly onMouseUp: (e: MouseEvent) => void;
  private readonly onMouseMove: (e: MouseEvent) => void;
  private readonly onMouseLeave: () => void;
  private readonly unsubscribeClock: () => void;

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
    container.querySelectorAll("g.measure").forEach((el, i) => {
      el.setAttribute("data-measure-index", String(i));
    });
    // Build hit rects. If this view mounts while its panel is display:none —
    // the common case in MIDI Practice, whose default layout is the reading
    // lane and only switches to the engraved-split layout on demand — every
    // SVG getBBox call returns 0, so the rects come out 0×0 and capture no
    // pointer events. The renderFrame check below detects the eventual
    // "panel becomes visible" transition (container.clientWidth changes from
    // 0 to non-zero) and rebuilds the rects against now-valid measureBox()
    // values. Without this, hovering on whitespace silently fails in any
    // build where the user first opens the engraved-split panel after mount
    // (dev StrictMode happened to mask the bug by mounting twice).
    this.rebuildHitRects();
    this.lastHitContainerWidth = container.clientWidth;

    this.onMouseDown = (e) => {
      const idx = measureIndexFromTarget(e.target);
      this.dragStart = idx;
      this.dragEnd = idx;
      if (idx !== null) this.refreshDragRects();
    };
    this.onMouseUp = (e) => {
      const end = measureIndexFromTarget(e.target);
      if (this.dragStart !== null && end !== null) {
        if (this.dragStart === end) {
          const target = this.transport.score.measures[end].start;
          // A single-measure click is a navigation intent. If a loop is
          // active and the user is clicking outside it, treat this as an
          // intentional exit from the loop — otherwise the clock would wrap
          // back to loop.start on the very next tick, which is the "playhead
          // snaps back almost instantly" symptom that surfaces on production
          // when an old loop has been restored from IndexedDB.
          const loop = this.transport.clock.loop;
          if (loop && (target < loop.start || target >= loop.end)) {
            this.transport.clock.setLoop(null);
          }
          this.transport.clock.seek(target);
        } else {
          const { first, last } = orderedRange(this.dragStart, end);
          this.transport.loopMeasures(first, last);
        }
      }
      this.dragStart = null;
      this.dragEnd = null;
      this.clearDragRects();
    };
    this.onMouseMove = (e) => {
      const idx = measureIndexFromTarget(e.target);
      // While dragging, paint a multi-measure preview of what the loop will
      // become on mouse-up — the same green as the current-measure highlight,
      // extended over every measure the pointer is sweeping across.
      if (this.dragStart !== null) {
        if (idx !== null && idx !== this.dragEnd) {
          this.dragEnd = idx;
          this.refreshDragRects();
        }
        return;
      }
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
      // Don't clear drag state on leave — the user may sweep outside and back.
      // mouseup outside the container still fires `onMouseUp` and resets.
    };
    container.addEventListener("mousedown", this.onMouseDown);
    container.addEventListener("mouseup", this.onMouseUp);
    container.addEventListener("mousemove", this.onMouseMove);
    container.addEventListener("mouseleave", this.onMouseLeave);

    // Keep the persistent loop indicator in sync with the transport — drag-to-
    // loop on this view, button-clicks in the Tools popover, and any external
    // setLoop / clearLoop all funnel through clock.onChange.
    this.unsubscribeClock = transport.clock.onChange(() => {
      this.refreshLoopRects();
    });
    this.refreshLoopRects();
  }

  /** Update the current-measure highlight and scroll from the clock time. */
  renderFrame(): void {
    // Rebuild hit rects if the container's width changed since the last build
    // — most importantly, when the panel transitions from display:none to
    // visible (0 → real width), so the 0×0 rects from the initial mount are
    // refreshed against the now-valid measure bboxes.
    const cw = this.container.clientWidth;
    if (cw !== this.lastHitContainerWidth) {
      this.lastHitContainerWidth = cw;
      this.rebuildHitRects();
    }

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

  /** Replace every measure's invisible full-bar hit area with a fresh rect
   *  sized from the current `measureBox`. Called from the constructor and
   *  again from renderFrame when the container's width changes — most
   *  importantly when the panel transitions from hidden (clientWidth=0,
   *  getBBox=0) to visible. Hovering or clicking the rect — over notes OR
   *  whitespace — registers as that measure. SVG pointer hit-testing only
   *  fires on painted geometry, so without this an empty gap inside a measure
   *  hits nothing. Appended last (on top) to reliably catch events; the app
   *  only does measure-level interaction so this never steals a per-note
   *  event. */
  private rebuildHitRects(): void {
    this.container.querySelectorAll("g.measure").forEach((el) => {
      el.querySelectorAll("rect.measure-hit").forEach((r) => r.remove());
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

  /** Repaint the live drag-to-loop preview over every measure between
   *  dragStart and dragEnd inclusive. Cheap to call on every mousemove. */
  private refreshDragRects(): void {
    if (this.dragStart === null || this.dragEnd === null) {
      this.clearDragRects();
      return;
    }
    const { first, last } = orderedRange(this.dragStart, this.dragEnd);
    const want = last - first + 1;
    // Recycle existing rects rather than reallocate every frame.
    while (this.dragRects.length < want) {
      const rect = document.createElementNS(SVG_NS, "rect");
      rect.setAttribute("class", "measure-drag");
      rect.style.pointerEvents = "none";
      this.dragRects.push(rect);
    }
    while (this.dragRects.length > want) {
      const extra = this.dragRects.pop();
      if (extra && extra.parentNode) extra.parentNode.removeChild(extra);
    }
    for (let i = 0; i < want; i++) {
      const measureIdx = first + i;
      const el = this.container.querySelector(
        `[data-measure-index="${measureIdx}"]`,
      );
      if (el) this.positionRect(this.dragRects[i], el);
    }
  }

  private clearDragRects(): void {
    for (const rect of this.dragRects) {
      if (rect.parentNode) rect.parentNode.removeChild(rect);
    }
    this.dragRects = [];
  }

  /** Rebuild the persistent loop indicator from `transport.clock.loop`.
   *  No loop → no rects. Called on subscription, on clock change, and after
   *  a Verovio re-render (constructor). */
  private refreshLoopRects(): void {
    for (const rect of this.loopRects) {
      if (rect.parentNode) rect.parentNode.removeChild(rect);
    }
    this.loopRects = [];
    const loop = this.transport.clock.loop;
    if (!loop) return;
    const measures = this.transport.score.measures;
    const firstIdx = measures.findIndex(
      (m) => loop.start >= m.start && loop.start < m.end,
    );
    const lastIdx = measures.findIndex(
      (m) => loop.end > m.start && loop.end <= m.end,
    );
    if (firstIdx === -1) return;
    const actualLast = lastIdx === -1 ? firstIdx : lastIdx;
    for (let i = firstIdx; i <= actualLast; i++) {
      const el = this.container.querySelector(`[data-measure-index="${i}"]`);
      if (!el) continue;
      const rect = document.createElementNS(SVG_NS, "rect");
      rect.setAttribute("class", "measure-loop");
      rect.style.pointerEvents = "none";
      this.positionRect(rect, el);
      this.loopRects.push(rect);
    }
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
    this.unsubscribeClock();
    this.container.innerHTML = "";
  }
}
