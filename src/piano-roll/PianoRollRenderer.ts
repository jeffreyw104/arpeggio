import type { Transport } from "../transport/transport";
import { noteRectsInWindow } from "./noteRectsInWindow";
import { pitchAutoFit } from "./pitchAutoFit";

const BG = "#15151a";
const BEAT_LINE = "#34343c";
const DOWNBEAT_LINE = "#5a5a66";
const PLAYHEAD = "#e6e6ea";
const RIGHT = "#4a90d9";
const LEFT = "#e08a3c";
const MIN_NOTE_ALPHA = 0.5;
const GLOW_BLUR = 12;
const LOOP_FILL = "rgba(217, 83, 79, 0.16)";
const WAIT_HOLD = "rgba(68, 170, 136, 0.45)";
const SECTION_LABEL = "#e6e6ea";

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
    this.drawLoopBand();
    this.drawWaitHold();
    this.drawNotes();
    this.drawSections();
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

  private drawNotes(): void {
    const { ctx } = this;
    const notes = this.transport.score.notes;
    const range = pitchAutoFit(notes, { minSpan: 24, maxSpan: 88 });
    const t = this.transport.clock.position;
    const rects = noteRectsInWindow(notes, {
      viewport: { left: 0, top: 0, width: this.width, height: this.height },
      timeWindow: this.viewport,
      pitchRange: range,
      rightColor: RIGHT,
      leftColor: LEFT,
    });
    for (const rect of rects) {
      ctx.save();
      ctx.globalAlpha = MIN_NOTE_ALPHA + (1 - MIN_NOTE_ALPHA) * rect.velocity;
      const sounding = rect.start <= t && rect.end > t;
      if (sounding) {
        ctx.shadowColor = rect.color;
        ctx.shadowBlur = GLOW_BLUR;
      }
      ctx.fillStyle = rect.color;
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      ctx.restore();
    }
  }

  private drawLoopBand(): void {
    const loop = this.transport.clock.loop;
    if (!loop) return;
    const x0 = this.timeToX(loop.start);
    const x1 = this.timeToX(loop.end);
    this.ctx.fillStyle = LOOP_FILL;
    this.ctx.fillRect(x0, 0, x1 - x0, this.height);
  }

  private drawSections(): void {
    const { ctx } = this;
    ctx.fillStyle = SECTION_LABEL;
    ctx.font = "10px sans-serif";
    ctx.textAlign = "left";
    for (const s of this.transport.score.sections) {
      if (s.start < this.viewport.start) continue;
      if (s.start > this.viewport.end) break;
      const x = this.timeToX(s.start);
      ctx.fillText(s.label, x + 2, 12);
    }
  }

  private drawWaitHold(): void {
    const hold = this.transport.clock.holdAt;
    if (hold === null || hold === undefined) return;
    if (hold < this.viewport.start || hold > this.viewport.end) return;
    const x = this.timeToX(hold);
    this.ctx.strokeStyle = WAIT_HOLD;
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.moveTo(x, 0);
    this.ctx.lineTo(x, this.height);
    this.ctx.stroke();
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
