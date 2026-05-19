import type { Transport } from "../transport/transport";
import { currentMeasureIndex } from "./sync";
import { measureBox } from "./measureBox";
import { measureIndexFromTarget } from "./interactions";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Gap above the current system inside the viewport, in px. */
const TOP_MARGIN = 14;

/**
 * The MIDI Practice reading lane. Shows the score engraved as stacked systems
 * (see `renderReadingLane`) and reveals ~two of them at a time: the system
 * holding the playhead at the top, the next previewing below. When the
 * playhead crosses into the next system the lane JUMPS down to it — a discrete
 * page-turn, never a continuous scroll.
 *
 * Like the split `ScoreView` it supports hovering a bar (a light highlight)
 * and clicking a bar to seek there. Only ever READS the transport clock
 * outside of those explicit clicks.
 */
export class ReadingLaneView {
  private readonly container: HTMLElement;
  private readonly transport: Transport;
  private readonly track: HTMLDivElement;
  private highlightRect: SVGRectElement | null = null;
  private hoverRect: SVGRectElement | null = null;
  private highlightedIndex = -1;
  private hoverIndex: number | null = null;
  private currentSystem: Element | null = null;
  private ty = 0;
  private readonly onClick: (e: MouseEvent) => void;
  private readonly onMove: (e: MouseEvent) => void;
  private readonly onLeave: () => void;

  constructor(container: HTMLElement, transport: Transport, laneSvg: string) {
    this.container = container;
    this.transport = transport;

    container.innerHTML = "";
    const track = document.createElement("div");
    track.className = "reading-lane-track";
    track.innerHTML = laneSvg;
    container.appendChild(track);
    this.track = track;

    // Tag measures in document order, and give each an invisible full-measure
    // hit area so a hover or click anywhere in the bar registers (SVG only
    // hit-tests painted ink, leaving gaps between notes dead otherwise).
    container.querySelectorAll("g.measure").forEach((el, i) => {
      el.setAttribute("data-measure-index", String(i));
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

    this.onClick = (e) => {
      const idx = measureIndexFromTarget(e.target);
      if (idx === null) return;
      const measure = this.transport.score.measures[idx];
      if (measure) this.transport.clock.seek(measure.start);
    };
    this.onMove = (e) => {
      const idx = measureIndexFromTarget(e.target);
      if (idx === this.hoverIndex) return;
      this.hoverIndex = idx;
      const el =
        idx === null
          ? null
          : this.container.querySelector(`[data-measure-index="${idx}"]`);
      if (el) {
        this.hoverRect = this.ensureRect(this.hoverRect, "measure-hover");
        this.putRect(this.hoverRect, el);
      } else {
        this.detach(this.hoverRect);
      }
    };
    this.onLeave = () => {
      this.hoverIndex = null;
      this.detach(this.hoverRect);
    };
    container.addEventListener("click", this.onClick);
    container.addEventListener("mousemove", this.onMove);
    container.addEventListener("mouseleave", this.onLeave);
  }

  /** Re-position the lane for the clock's current time; call once per frame. */
  renderFrame(): void {
    const t = this.transport.clock.position;
    const idx = currentMeasureIndex(this.transport.score, t);
    const measureEl = this.container.querySelector(
      `[data-measure-index="${idx}"]`,
    );
    if (!measureEl) return;

    if (idx !== this.highlightedIndex) {
      this.highlightRect = this.ensureRect(
        this.highlightRect,
        "measure-highlight",
      );
      this.putRect(this.highlightRect, measureEl);
      this.highlightedIndex = idx;
    }

    // Jump only when the playhead enters a different engraved system, so the
    // lane holds still while you read a line and page-turns between lines.
    const system = measureEl.closest("g.system");
    if (system && system !== this.currentSystem) {
      this.currentSystem = system;
      this.jumpTo(system);
    }
  }

  /** Jump the track so `system` sits at the top of the viewport. */
  private jumpTo(system: Element): void {
    const laneRect = this.container.getBoundingClientRect();
    if (laneRect.height === 0) return; // lane not visible
    const systemRect = system.getBoundingClientRect();
    this.ty += laneRect.top + TOP_MARGIN - systemRect.top;
    this.track.style.transform = `translateY(${this.ty}px)`;
  }

  /** Lazily create an overlay rect with the given class. */
  private ensureRect(
    rect: SVGRectElement | null,
    className: string,
  ): SVGRectElement {
    if (rect) return rect;
    const created = document.createElementNS(SVG_NS, "rect");
    created.setAttribute("class", className);
    return created;
  }

  /** Size `rect` to a measure's staff-line box and insert it behind the ink. */
  private putRect(rect: SVGRectElement, measureEl: Element): void {
    if (rect.parentNode) rect.parentNode.removeChild(rect);
    const box = measureBox(measureEl);
    rect.setAttribute("x", String(box.x));
    rect.setAttribute("y", String(box.y));
    rect.setAttribute("width", String(box.width));
    rect.setAttribute("height", String(box.height));
    measureEl.insertBefore(rect, measureEl.firstChild);
  }

  /** Detach an overlay rect from the DOM. */
  private detach(rect: SVGRectElement | null): void {
    if (rect && rect.parentNode) rect.parentNode.removeChild(rect);
  }

  /** Remove all listeners and injected content. */
  destroy(): void {
    this.container.removeEventListener("click", this.onClick);
    this.container.removeEventListener("mousemove", this.onMove);
    this.container.removeEventListener("mouseleave", this.onLeave);
    this.container.innerHTML = "";
  }
}
