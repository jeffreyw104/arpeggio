import { autoFitRange, FULL_88, type KeyRange } from "./keyRange";
import { keyLayout, drawPiano, midiToNoteName, type KeyboardLayout } from "./piano";
import { noteRects, activeKeys } from "./notes";
import { beatGridLines } from "./beatGrid";
import type { Transport } from "../transport/transport";
import type { Note } from "../model/score";
import { type HandFilter, NO_HAND_FILTER } from "../practice/hands";
import { averageBpm } from "../transport/tempoMap";

const RIGHT = "#4a90d9";
const LEFT = "#e08a3c";
const ACTIVE = "#4aa988";
const WHITE = "#e6e6ea";
const BLACK = "#15151a";
const BG = "#15151a";
const BEAT_LINE = "#34343c";
const DOWNBEAT_LINE = "#5a5a66";
const LABEL = "#15151a";

export interface FalldownRendererOptions {
  width: number;
  height: number;
}

/**
 * Composes the key range, keyboard, falling notes, and beat grid into a single
 * Canvas2D "falldown" view. Draws one frame for the transport clock's current
 * position; only ever READS the clock, never advancing it.
 */
export class FalldownRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly transport: Transport;
  private width: number;
  private height: number;
  private pianoHeight: number;
  private hitLineY: number;
  private pixelsPerSecond: number;
  private rafHandle: number | null = null;

  /** Show the full 88-key keyboard instead of the auto-fitted range. */
  full88 = false;
  /** Draw a note-name label inside each falling note. */
  showLabels = false;
  /** Draw the horizontal beat-grid overlay. */
  showBeatGrid = true;
  /** Per-hand hide state; hidden hands' notes are skipped when drawing. */
  handState: HandFilter = NO_HAND_FILTER;
  /** The time signature driving the beat grid; settable by the ControlPanel. */
  beatMeter: { numerator: number; denominator: number };

  constructor(
    ctx: CanvasRenderingContext2D,
    transport: Transport,
    options: FalldownRendererOptions,
  ) {
    this.ctx = ctx;
    this.transport = transport;
    this.width = options.width;
    this.height = options.height;
    this.pianoHeight = Math.min(140, this.height * 0.22);
    this.hitLineY = this.height - this.pianoHeight;
    this.pixelsPerSecond = this.hitLineY / 2.5;
    const ts = transport.score.timeSignatures[0];
    this.beatMeter = {
      numerator: ts?.numerator ?? 4,
      denominator: ts?.denominator ?? 4,
    };
  }

  /** Re-size the renderer to a new canvas pixel size (after a layout change). */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.pianoHeight = Math.min(140, this.height * 0.22);
    this.hitLineY = this.height - this.pianoHeight;
    this.pixelsPerSecond = this.hitLineY / 2.5;
  }

  /** The active key range — full 88 or auto-fitted to the score. */
  private range(): KeyRange {
    return this.full88 ? FULL_88 : autoFitRange(this.transport.score);
  }

  /** Draw one complete frame for the clock's current position. */
  renderFrame(): void {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, this.width, this.height);

    const layout = keyLayout(this.range(), this.width);
    const t = this.transport.clock.position;

    const visible = this.transport.score.notes.filter(
      (n) => !this.handState.isHidden(n.hand),
    );

    if (this.showBeatGrid) this.drawBeatGrid(t);
    this.drawNotes(layout, t, visible);

    drawPiano(ctx, layout, {
      y: this.hitLineY,
      height: this.pianoHeight,
      activeKeys: activeKeys(visible, t),
      activeColor: ACTIVE,
      whiteColor: WHITE,
      blackColor: BLACK,
    });
  }

  /** Draw the horizontal beat/downbeat lines visible at time `t`. */
  private drawBeatGrid(t: number): void {
    const { ctx } = this;
    const bpm = averageBpm(this.transport.score);
    const durationSeconds = this.transport.score.durationSeconds;
    const lines = beatGridLines(
      this.beatMeter.numerator,
      this.beatMeter.denominator,
      bpm,
      durationSeconds,
      t,
      {
        hitLineY: this.hitLineY,
        pixelsPerSecond: this.pixelsPerSecond,
      },
    );
    for (const line of lines) {
      ctx.beginPath();
      ctx.moveTo(0, line.y);
      ctx.lineTo(this.width, line.y);
      ctx.strokeStyle = line.downbeat ? DOWNBEAT_LINE : BEAT_LINE;
      ctx.lineWidth = line.downbeat ? 2 : 1;
      ctx.stroke();
    }
  }

  /** Draw the falling-note rectangles (and optional labels) at time `t`. */
  private drawNotes(layout: KeyboardLayout, t: number, notes: Note[]): void {
    const { ctx } = this;
    const rects = noteRects(notes, layout, t, {
      hitLineY: this.hitLineY,
      pixelsPerSecond: this.pixelsPerSecond,
      rightColor: RIGHT,
      leftColor: LEFT,
    });
    for (const rect of rects) {
      ctx.fillStyle = rect.color;
      ctx.fillRect(rect.x, rect.top, rect.width, rect.height);
      if (this.showLabels) {
        ctx.fillStyle = LABEL;
        ctx.font = "11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(
          midiToNoteName(rect.midi),
          rect.x + rect.width / 2,
          rect.bottom - 4,
        );
      }
    }
  }

  /** Begin a requestAnimationFrame draw loop. */
  start(): void {
    const loop = (): void => {
      this.renderFrame();
      this.rafHandle = requestAnimationFrame(loop);
    };
    loop();
  }

  /** Cancel the draw loop if one is running. */
  stop(): void {
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
  }
}
