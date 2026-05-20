import type { Transport } from "../transport/transport";
import { currentMeasureIndex } from "./sync";
import { measureBox } from "./measureBox";
import { measureIndexFromTarget, orderedRange } from "./interactions";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Gap above the current system inside the viewport, in px. */
const TOP_MARGIN = 14;

/** Display scale of the lane engraving. */
const LANE_ZOOM = 1;

/** A measure rectangle in viewport-local pixels. */
interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The MIDI Practice reading lane. Shows the score engraved as stacked systems
 * (see `renderReadingLane`) and reveals ~two of them at a time: the system
 * holding the playhead at the top, the next previewing below. When the
 * playhead crosses into the next system the lane JUMPS down to it — a discrete
 * page-turn, never a continuous scroll. Hovering a bar marks it; clicking a
 * bar seeks there.
 *
 * The engraving is recoloured by a CSS `filter` on the track. The green
 * current-measure highlight and the hover marker are therefore rendered as
 * overlay `<div>`s OUTSIDE the filtered track, so that filter never tints
 * them — they keep their exact green.
 */
export class ReadingLaneView {
  private readonly container: HTMLElement;
  private readonly transport: Transport;
  private readonly track: HTMLDivElement;
  private readonly highlightEl: HTMLDivElement;
  private readonly hoverEl: HTMLDivElement;
  private highlightedIndex = -1;
  private hoverIndex: number | null = null;
  private currentSystem: Element | null = null;
  private hitRectsBuilt = false;
  /** Click-drag state: index where the press began. null if not dragging. */
  private dragStart: number | null = null;
  private dragEnd: number | null = null;
  /** One overlay div per measure being dragged over. Transient. */
  private dragEls: HTMLDivElement[] = [];
  /** One overlay div per measure inside the persistent loop indicator. */
  private loopEls: HTMLDivElement[] = [];
  private readonly onMouseDown: (e: MouseEvent) => void;
  private readonly onMouseUp: (e: MouseEvent) => void;
  private readonly onMove: (e: MouseEvent) => void;
  private readonly onLeave: () => void;
  private readonly unsubscribeClock: () => void;

  constructor(
    container: HTMLElement,
    transport: Transport,
    laneSvgs: string[],
  ) {
    this.container = container;
    this.transport = transport;

    container.innerHTML = "";
    const track = document.createElement("div");
    track.className = "reading-lane-track";
    // Stack every rendered page; each is cropped tight, so they read as one
    // continuous run of systems.
    track.innerHTML = laneSvgs.join("");
    container.appendChild(track);
    this.track = track;

    track
      .querySelectorAll("svg")
      .forEach((svg) => (svg.style.zoom = String(LANE_ZOOM)));

    // Highlight + hover markers — overlay divs, siblings of (not inside) the
    // filtered track, so the engraving's recolour filter never touches them.
    this.highlightEl = document.createElement("div");
    this.highlightEl.className = "lane-highlight";
    this.hoverEl = document.createElement("div");
    this.hoverEl.className = "lane-hover";
    container.append(this.highlightEl, this.hoverEl);

    // Tag measures in document order so they map to score.measures indices.
    container
      .querySelectorAll("g.measure")
      .forEach((el, i) => el.setAttribute("data-measure-index", String(i)));

    this.onMouseDown = (e) => {
      const idx = measureIndexFromTarget(e.target);
      this.dragStart = idx;
      this.dragEnd = idx;
      if (idx !== null) this.refreshDragEls();
    };
    this.onMouseUp = (e) => {
      const end = measureIndexFromTarget(e.target);
      if (this.dragStart !== null && end !== null) {
        if (this.dragStart === end) {
          const measure = this.transport.score.measures[end];
          if (measure) this.transport.clock.seek(measure.start);
        } else {
          const { first, last } = orderedRange(this.dragStart, end);
          this.transport.loopMeasures(first, last);
        }
      }
      this.dragStart = null;
      this.dragEnd = null;
      this.clearDragEls();
    };
    this.onMove = (e) => {
      const idx = measureIndexFromTarget(e.target);
      // Drag in progress: extend the preview overlays to cover dragStart→idx.
      if (this.dragStart !== null) {
        if (idx !== null && idx !== this.dragEnd) {
          this.dragEnd = idx;
          this.refreshDragEls();
        }
        return;
      }
      if (idx === this.hoverIndex) return;
      this.hoverIndex = idx;
      const el =
        idx === null
          ? null
          : this.container.querySelector(`[data-measure-index="${idx}"]`);
      if (el) this.position(this.hoverEl, el);
      else this.hoverEl.style.display = "none";
    };
    this.onLeave = () => {
      this.hoverIndex = null;
      this.hoverEl.style.display = "none";
      // Don't clear drag state on leave — the user may sweep back in. mouseup
      // anywhere still resolves the drag via the container's own mouseup.
    };
    container.addEventListener("mousedown", this.onMouseDown);
    container.addEventListener("mouseup", this.onMouseUp);
    container.addEventListener("mousemove", this.onMove);
    container.addEventListener("mouseleave", this.onLeave);

    // Persistent loop indicator: any change to transport.clock.loop — set by
    // drag here, by drag on the engraved score, or by a Tools-popover button —
    // rebuilds the overlay divs.
    this.unsubscribeClock = transport.clock.onChange(() => {
      this.refreshLoopEls();
    });
  }

  /** Re-position the lane for the clock's current time; call once per frame. */
  renderFrame(): void {
    // No-op while the lane is hidden (the split layout is showing). This keeps
    // highlightedIndex / currentSystem at their last on-screen values, so the
    // lane re-syncs correctly — re-highlighting and re-jumping — when shown
    // again, e.g. after seeking from the split view.
    const laneRect = this.container.getBoundingClientRect();
    if (laneRect.height === 0) return;

    if (!this.hitRectsBuilt) {
      this.buildHitRects();
      this.hitRectsBuilt = true;
    }

    const t = this.transport.clock.position;
    const idx = currentMeasureIndex(this.transport.score, t);
    const measureEl = this.container.querySelector(
      `[data-measure-index="${idx}"]`,
    );
    if (!measureEl) return;

    // Jump first — when the playhead enters a different engraved system the
    // lane page-turns down to it — so the highlight below is placed against
    // the post-jump positions. Implemented as `container.scrollTop` (not a
    // CSS transform on the track) so the user can also scroll the lane
    // freely with the wheel / trackpad. Auto-jump still wins on every
    // system change.
    const system = measureEl.closest("g.system");
    let jumped = false;
    if (system && system !== this.currentSystem) {
      this.currentSystem = system;
      const systemTopInContent =
        system.getBoundingClientRect().top -
        this.track.getBoundingClientRect().top;
      this.container.scrollTop = Math.max(0, systemTopInContent - TOP_MARGIN);
      jumped = true;
    }

    if (idx !== this.highlightedIndex || jumped) {
      this.position(this.highlightEl, measureEl);
      this.highlightedIndex = idx;
      // Everything else that's anchored to a measure shifted too if the lane
      // jumped: hover marker, drag preview, loop indicator.
      if (jumped) {
        if (this.hoverIndex !== null) {
          const hovered = this.container.querySelector(
            `[data-measure-index="${this.hoverIndex}"]`,
          );
          if (hovered) this.position(this.hoverEl, hovered);
        }
        this.refreshLoopEls();
        if (this.dragStart !== null) this.refreshDragEls();
      }
    }
  }

  /** Give every measure an invisible full-bar hit area, so hovering or
   *  clicking anywhere in the bar — over notes OR whitespace — registers. */
  private buildHitRects(): void {
    this.container.querySelectorAll("g.measure").forEach((el) => {
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

  /** Position an overlay div over a measure's staff-line box. */
  private position(el: HTMLDivElement, measureEl: Element): void {
    const box = this.staffBox(measureEl);
    el.style.left = `${box.left}px`;
    el.style.top = `${box.top}px`;
    el.style.width = `${box.width}px`;
    el.style.height = `${box.height}px`;
    el.style.display = "block";
  }

  /** Repaint the live drag-to-loop preview overlays. */
  private refreshDragEls(): void {
    if (this.dragStart === null || this.dragEnd === null) {
      this.clearDragEls();
      return;
    }
    const { first, last } = orderedRange(this.dragStart, this.dragEnd);
    const want = last - first + 1;
    while (this.dragEls.length < want) {
      const div = document.createElement("div");
      div.className = "lane-drag";
      this.container.append(div);
      this.dragEls.push(div);
    }
    while (this.dragEls.length > want) {
      const extra = this.dragEls.pop();
      extra?.remove();
    }
    for (let i = 0; i < want; i++) {
      const el = this.container.querySelector(
        `[data-measure-index="${first + i}"]`,
      );
      if (el) this.position(this.dragEls[i], el);
      else this.dragEls[i].style.display = "none";
    }
  }

  private clearDragEls(): void {
    for (const el of this.dragEls) el.remove();
    this.dragEls = [];
  }

  /** Rebuild the persistent loop indicator overlay divs from
   *  transport.clock.loop. Also called after the lane jumps systems so the
   *  divs stay aligned with the now-translated measures. */
  private refreshLoopEls(): void {
    const loop = this.transport.clock.loop;
    if (!loop) {
      for (const el of this.loopEls) el.remove();
      this.loopEls = [];
      return;
    }
    const measures = this.transport.score.measures;
    const firstIdx = measures.findIndex(
      (m) => loop.start >= m.start && loop.start < m.end,
    );
    const lastIdx = measures.findIndex(
      (m) => loop.end > m.start && loop.end <= m.end,
    );
    if (firstIdx === -1) {
      for (const el of this.loopEls) el.remove();
      this.loopEls = [];
      return;
    }
    const actualLast = lastIdx === -1 ? firstIdx : lastIdx;
    const want = actualLast - firstIdx + 1;
    while (this.loopEls.length < want) {
      const div = document.createElement("div");
      div.className = "lane-loop";
      this.container.append(div);
      this.loopEls.push(div);
    }
    while (this.loopEls.length > want) {
      const extra = this.loopEls.pop();
      extra?.remove();
    }
    for (let i = 0; i < want; i++) {
      const el = this.container.querySelector(
        `[data-measure-index="${firstIdx + i}"]`,
      );
      if (el) this.position(this.loopEls[i], el);
      else this.loopEls[i].style.display = "none";
    }
  }

  /** The measure's staff-line rectangle in container-content pixels — i.e.
   *  including the container's scrollTop / scrollLeft, since the overlays
   *  are position:absolute children that live in the scrollable content
   *  frame (so they scroll with the engraving instead of staying pinned to
   *  the viewport). */
  private staffBox(measureEl: Element): Box {
    const vp = this.container.getBoundingClientRect();
    const lines = measureEl.querySelectorAll("g.staff > path");
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    const rects =
      lines.length > 0
        ? [...lines].map((l) => l.getBoundingClientRect())
        : [measureEl.getBoundingClientRect()];
    for (const r of rects) {
      left = Math.min(left, r.left);
      top = Math.min(top, r.top);
      right = Math.max(right, r.right);
      bottom = Math.max(bottom, r.bottom);
    }
    return {
      left: left - vp.left + this.container.scrollLeft,
      top: top - vp.top + this.container.scrollTop,
      width: right - left,
      height: bottom - top,
    };
  }

  /** Remove all listeners and injected content. */
  destroy(): void {
    this.container.removeEventListener("mousedown", this.onMouseDown);
    this.container.removeEventListener("mouseup", this.onMouseUp);
    this.container.removeEventListener("mousemove", this.onMove);
    this.container.removeEventListener("mouseleave", this.onLeave);
    this.unsubscribeClock();
    this.container.innerHTML = "";
  }
}
