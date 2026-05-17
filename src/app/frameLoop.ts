import type { Clock } from "../transport/clock";

/** A per-frame consumer — e.g. an audio update or a renderer draw. */
export type FrameConsumer = () => void;

/**
 * Largest per-frame delta in seconds; caps catch-up after a stalled tab.
 * Applied only when the inter-frame gap exceeds BACKGROUND_THRESHOLD.
 */
const MAX_DELTA = 0.25;

/**
 * Inter-frame gap (in seconds) above which we treat the tab as having been
 * backgrounded and clamp the advance to MAX_DELTA.
 */
const BACKGROUND_THRESHOLD = 1.0;

/**
 * The single requestAnimationFrame loop. Advances the master clock by the real
 * inter-frame delta (clamped for backgrounded tabs) and invokes every
 * registered consumer in order.
 */
export class FrameLoop {
  private consumers: FrameConsumer[] = [];
  private handle: number | null = null;
  private lastTime: number | null = null;

  constructor(private readonly clock: Clock) {}

  /** Register a per-frame consumer (renderer/audio). */
  onFrame(consumer: FrameConsumer): void {
    this.consumers.push(consumer);
  }

  /** Begin the loop. */
  start(): void {
    if (this.handle !== null) return;
    this.lastTime = null;
    const frame = (time: number): void => {
      if (this.lastTime !== null) {
        const raw = (time - this.lastTime) / 1000;
        const delta = raw > BACKGROUND_THRESHOLD ? MAX_DELTA : raw;
        if (delta > 0) this.clock.tick(delta);
      }
      this.lastTime = time;
      for (const consumer of this.consumers) consumer();
      this.handle = requestAnimationFrame(frame);
    };
    this.handle = requestAnimationFrame(frame);
  }

  /** Stop the loop. */
  stop(): void {
    if (this.handle !== null) {
      cancelAnimationFrame(this.handle);
      this.handle = null;
    }
  }
}
