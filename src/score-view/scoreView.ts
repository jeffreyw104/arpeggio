import type { Transport } from "../transport/transport";
import { currentMeasureIndex, notesAtTime } from "./sync";
import { measureIndexFromTarget, orderedRange } from "./interactions";
import type { TimemapEntry } from "./verovio";

/**
 * Orchestrates the engraved score: injects the Verovio SVG, tags measures with
 * their index, drives per-frame measure/note highlighting from the transport
 * clock, and turns clicks/drags into seeks and A-B loops. The view only READS
 * `transport.clock.position`; user input drives `seek`/`loopMeasures`.
 */
export class ScoreView {
  private readonly container: HTMLElement;
  private readonly transport: Transport;
  private readonly timemap: TimemapEntry[];
  private readonly pagesEl: HTMLElement;
  private dragStart: number | null = null;
  private readonly onMouseDown: (e: MouseEvent) => void;
  private readonly onMouseUp: (e: MouseEvent) => void;

  constructor(
    container: HTMLElement,
    transport: Transport,
    svgPages: string[],
    timemap: TimemapEntry[],
  ) {
    this.container = container;
    this.transport = transport;
    this.timemap = timemap;

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
    container.addEventListener("mousedown", this.onMouseDown);
    container.addEventListener("mouseup", this.onMouseUp);
  }

  /** Update measure/note highlighting and scroll from the current clock time. */
  renderFrame(): void {
    const t = this.transport.clock.position;

    const idx = currentMeasureIndex(this.transport.score, t);
    for (const el of this.container.querySelectorAll(".current-measure")) {
      el.classList.remove("current-measure");
    }
    const current = this.container.querySelector(
      `[data-measure-index="${idx}"]`,
    );
    if (current) {
      current.classList.add("current-measure");
      (current as HTMLElement).scrollIntoView?.({ block: "nearest" });
    }

    const ids = notesAtTime(this.timemap, t * 1000);
    for (const el of this.container.querySelectorAll(".current-note")) {
      el.classList.remove("current-note");
    }
    for (const id of ids) {
      const note = this.container.querySelector("#" + CSS.escape(id));
      if (note) note.classList.add("current-note");
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
    this.container.innerHTML = "";
  }
}
