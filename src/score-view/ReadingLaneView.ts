import type { Transport } from "../transport/transport";
import { currentMeasureIndex } from "./sync";
import { measureBox } from "./measureBox";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Gap above the current system inside the viewport, in px. */
const TOP_MARGIN = 14;

/**
 * The MIDI Practice reading lane. Shows the score engraved as stacked systems
 * (see `renderReadingLane`) and reveals ~two of them at a time: the system
 * holding the playhead sits at the top with the next system previewing below.
 * When the playhead crosses into the next system the lane JUMPS down to it —
 * a discrete page-turn, never a continuous scroll. Only ever READS the clock.
 */
export class ReadingLaneView {
  private readonly container: HTMLElement;
  private readonly transport: Transport;
  private readonly track: HTMLDivElement;
  private highlightRect: SVGRectElement | null = null;
  private highlightedIndex = -1;
  private currentSystem: Element | null = null;
  private ty = 0;

  constructor(container: HTMLElement, transport: Transport, laneSvg: string) {
    this.container = container;
    this.transport = transport;

    container.innerHTML = "";
    const track = document.createElement("div");
    track.className = "reading-lane-track";
    track.innerHTML = laneSvg;
    container.appendChild(track);
    this.track = track;

    // Tag measures in document order so they map to score.measures indices.
    container
      .querySelectorAll("g.measure")
      .forEach((el, i) => el.setAttribute("data-measure-index", String(i)));
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
      this.placeHighlight(measureEl);
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

  /** Move the green highlight onto the current measure's staff-line box. */
  private placeHighlight(measureEl: Element): void {
    if (!this.highlightRect) {
      this.highlightRect = document.createElementNS(SVG_NS, "rect");
      this.highlightRect.setAttribute("class", "measure-highlight");
    }
    const rect = this.highlightRect;
    if (rect.parentNode) rect.parentNode.removeChild(rect);
    const box = measureBox(measureEl);
    rect.setAttribute("x", String(box.x));
    rect.setAttribute("y", String(box.y));
    rect.setAttribute("width", String(box.width));
    rect.setAttribute("height", String(box.height));
    measureEl.insertBefore(rect, measureEl.firstChild);
  }

  /** Remove all injected content. */
  destroy(): void {
    this.container.innerHTML = "";
  }
}
