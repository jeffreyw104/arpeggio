import type { Transport } from "../transport/transport";

const BG = "#15151a";
const BEAT_LINE = "#34343c";
const DOWNBEAT_LINE = "#5a5a66";
const PLAYHEAD = "#e6e6ea";

export interface RendererOptions {
  width: number;
  height: number;
}

export interface TimeWindow {
  start: number;
  end: number;
}

/**
 * Canvas2D renderer for the MIDI-native piano roll. Reads transport state;
 * never advances the clock. Notes/sections/wait-mode are added in later
 * tasks; this skeleton draws background, beat grid, and playhead.
 */
export class PianoRollRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly transport: Transport;
  private width: number;
  private height: number;
  private viewport: TimeWindow = { start: 0, end: 1 };

  constructor(
    ctx: CanvasRenderingContext2D,
    transport: Transport,
    options: RendererOptions,
  ) {
    this.ctx = ctx;
    this.transport = transport;
    this.width = options.width;
    this.height = options.height;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  setViewport(window: TimeWindow): void {
    this.viewport = window;
  }

  renderFrame(): void {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, this.width, this.height);

    this.drawBeatGrid();
    this.drawPlayhead();
  }

  private timeToX(t: number): number {
    const w = this.viewport.end - this.viewport.start;
    return ((t - this.viewport.start) / w) * this.width;
  }

  private drawBeatGrid(): void {
    const { ctx } = this;
    const measures = this.transport.score.measures;
    const ts = this.transport.score.timeSignatures[0];
    const beatsPerMeasure = ts?.numerator ?? 4;
    for (const m of measures) {
      if (m.end < this.viewport.start) continue;
      if (m.start > this.viewport.end) break;
      const beatSec = (m.end - m.start) / beatsPerMeasure;
      // Downbeat
      const xd = this.timeToX(m.start);
      ctx.strokeStyle = DOWNBEAT_LINE;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xd, 0);
      ctx.lineTo(xd, this.height);
      ctx.stroke();
      // Mid-measure beats
      ctx.strokeStyle = BEAT_LINE;
      ctx.lineWidth = 1;
      for (let b = 1; b < beatsPerMeasure; b += 1) {
        const xb = this.timeToX(m.start + b * beatSec);
        ctx.beginPath();
        ctx.moveTo(xb, 0);
        ctx.lineTo(xb, this.height);
        ctx.stroke();
      }
    }
  }

  private drawPlayhead(): void {
    const { ctx } = this;
    const t = this.transport.clock.position;
    if (t < this.viewport.start || t > this.viewport.end) return;
    const x = this.timeToX(t);
    ctx.strokeStyle = PLAYHEAD;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, this.height);
    ctx.stroke();
  }
}
