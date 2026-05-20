import type { Transport } from "../transport/transport";
import { PianoRollRenderer } from "./PianoRollRenderer";
import { pageForMeasure } from "./measurePaging";
import { currentMeasureIndex } from "../score-view/sync";

export interface LaneOptions {
  measuresPerPage: number;
}

/**
 * Paginated piano-roll lane: mounts a canvas, picks the page containing the
 * playhead, and discrete-jumps to the next page when the playhead crosses
 * the boundary. Mirrors ReadingLaneView's behaviour for MIDI-source scores.
 */
export class PianoRollLane {
  private readonly container: HTMLElement;
  private readonly transport: Transport;
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: PianoRollRenderer;
  private readonly measuresPerPage: number;
  private _currentPage: { first: number; last: number } = { first: 0, last: -1 };

  private dragStart: number | null = null;
  private readonly onMouseDown: (e: MouseEvent) => void;
  private readonly onMouseUp: (e: MouseEvent) => void;

  constructor(container: HTMLElement, transport: Transport, opts: LaneOptions) {
    this.container = container;
    this.transport = transport;
    this.measuresPerPage = opts.measuresPerPage;

    container.innerHTML = "";
    const canvas = document.createElement("canvas");
    canvas.className = "piano-roll-canvas";
    canvas.width = container.clientWidth || 800;
    canvas.height = container.clientHeight || 100;
    container.appendChild(canvas);
    this.canvas = canvas;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("piano-roll: 2d context unavailable");
    this.renderer = new PianoRollRenderer(ctx, transport, {
      width: canvas.width,
      height: canvas.height,
    });

    this.onMouseDown = (e) => {
      this.dragStart = this.measureIndexAt(e);
    };
    this.onMouseUp = (e) => {
      const end = this.measureIndexAt(e);
      if (this.dragStart === null || end === null) {
        this.dragStart = null;
        return;
      }
      if (this.dragStart === end) {
        const m = this.transport.score.measures[end];
        if (m) this.transport.clock.seek(m.start);
      } else {
        const first = Math.min(this.dragStart, end);
        const last = Math.max(this.dragStart, end);
        this.transport.loopMeasures(first, last);
      }
      this.dragStart = null;
    };
    this.canvas.addEventListener("mousedown", this.onMouseDown);
    this.canvas.addEventListener("mouseup", this.onMouseUp);
  }

  get currentPage(): { first: number; last: number } {
    return this._currentPage;
  }

  renderFrame(): void {
    const measures = this.transport.score.measures;
    if (measures.length === 0) return;

    const idx = currentMeasureIndex(this.transport.score, this.transport.clock.position);
    const page = pageForMeasure(idx, this.measuresPerPage);
    if (page.first !== this._currentPage.first || this._currentPage.last === -1) {
      this._currentPage = page;
      this.applyViewport();
    }
    this.renderer.renderFrame();
  }

  private applyViewport(): void {
    const measures = this.transport.score.measures;
    const first = measures[this._currentPage.first];
    const lastIdx = Math.min(this._currentPage.last, measures.length - 1);
    const last = measures[lastIdx];
    this.renderer.setViewport({ start: first.start, end: last.end });
  }

  private measureIndexAt(e: MouseEvent): number | null {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const measures = this.transport.score.measures;
    const first = measures[this._currentPage.first];
    const lastIdx = Math.min(this._currentPage.last, measures.length - 1);
    const last = measures[lastIdx];
    const t = first.start + (x / rect.width) * (last.end - first.start);
    for (let i = this._currentPage.first; i <= lastIdx; i += 1) {
      const m = measures[i];
      if (t >= m.start && t < m.end) return i;
    }
    return null;
  }

  destroy(): void {
    this.canvas.removeEventListener("mousedown", this.onMouseDown);
    this.canvas.removeEventListener("mouseup", this.onMouseUp);
    this.container.innerHTML = "";
  }
}
