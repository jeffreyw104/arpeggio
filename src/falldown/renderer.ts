import { autoFitRange, FULL_88, type KeyRange } from "./keyRange";
import { keyLayout, drawPiano, midiToNoteName, type KeyboardLayout } from "./piano";
import { noteRects, activeKeyColors } from "./notes";
import { beatGridLines } from "./beatGrid";
import { beatPulse } from "../audio/beats";
import type { Transport } from "../transport/transport";
import type { Note } from "../model/score";
import { type HandFilter, NO_HAND_FILTER } from "../practice/hands";

const RIGHT = "#4a90d9";
const LEFT = "#e08a3c";
/** Max corner radius for a falling note, in px. */
const NOTE_RADIUS = 4;
/** Shadow blur applied to a note while it is sounding. */
const GLOW_BLUR = 12;
/** Opacity multiplier for a "dim"-visibility hand's notes. */
const DIM_ALPHA = 0.3;
/** Opacity of a zero-velocity note; velocity scales linearly up to 1.0. */
const MIN_NOTE_ALPHA = 0.5;
const WHITE = "#e6e6ea";
const BLACK = "#15151a";
const BG = "#15151a";
const BEAT_LINE = "#34343c";
const DOWNBEAT_LINE = "#5a5a66";
const LABEL = "#15151a";
/** Seconds for the on-beat pulse to fade out. */
const BEAT_PULSE_DECAY = 0.22;
/** Colour of the beat-pulse effects (matches the metronome pulse dot). */
const PULSE_COLOR = "#44aa88";

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
  /** Brighten the hit line on each beat — driven by the metronome toggle. */
  showBeatPulse = false;
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

    const allNotes = this.transport.score.notes;
    const lit = allNotes.filter(
      (n) => this.handState.visibility(n.hand) !== "hide",
    );

    if (this.showBeatGrid) this.drawBeatGrid(t);
    this.drawNotes(layout, t, allNotes);

    drawPiano(ctx, layout, {
      y: this.hitLineY,
      height: this.pianoHeight,
      activeKeyColors: activeKeyColors(lit, t, RIGHT, LEFT),
      whiteColor: WHITE,
      blackColor: BLACK,
    });

    // Brighten the hit line on each beat while the metronome is enabled.
    const pulse =
      this.transport.clock.playing && this.showBeatPulse
        ? beatPulse(
            this.transport.score.measures,
            this.beatMeter.numerator,
            t,
            BEAT_PULSE_DECAY,
          )
        : 0;
    this.drawHitLinePulse(pulse);
  }

  /** Brighten the hit line on each beat. */
  private drawHitLinePulse(pulse: number): void {
    if (pulse <= 0) return;
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = PULSE_COLOR;
    ctx.lineWidth = 3;
    ctx.shadowColor = PULSE_COLOR;
    ctx.shadowBlur = 16 * pulse;
    ctx.beginPath();
    ctx.moveTo(0, this.hitLineY);
    ctx.lineTo(this.width, this.hitLineY);
    ctx.stroke();
    ctx.restore();
  }

  /** Draw the horizontal beat/downbeat lines visible at time `t`. */
  private drawBeatGrid(t: number): void {
    const { ctx } = this;
    const lines = beatGridLines(
      this.transport.score.measures,
      this.beatMeter.numerator,
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
    }, this.handState);
    for (const rect of rects) {
      const radius = Math.min(NOTE_RADIUS, rect.width / 3, rect.height / 2);
      ctx.save();
      const velocityAlpha =
        MIN_NOTE_ALPHA + (1 - MIN_NOTE_ALPHA) * rect.velocity;
      ctx.globalAlpha = velocityAlpha * (rect.dimmed ? DIM_ALPHA : 1);
      if (rect.playing) {
        ctx.shadowColor = rect.color;
        ctx.shadowBlur = GLOW_BLUR;
      }
      ctx.fillStyle = rect.color;
      ctx.beginPath();
      ctx.roundRect(rect.x, rect.top, rect.width, rect.height, radius);
      ctx.fill();
      ctx.restore();
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
