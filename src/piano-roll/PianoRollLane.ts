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

  destroy(): void {
    this.container.innerHTML = "";
  }
}
