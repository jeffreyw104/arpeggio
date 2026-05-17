import type { Clock } from "../transport/clock";

/** A per-frame consumer — e.g. an audio update or a renderer draw. */
export type FrameConsumer = () => void;

/**
 * Largest per-frame delta in seconds. A real frame is ~0.016 s even on slow
 * hardware; capping at 0.25 s prevents a backgrounded/stalled tab from
 * producing one enormous catch-up tick (which would burst-play audio).
 */
const MAX_DELTA = 0.25;

/**
 * The single requestAnimationFrame loop. Advances the master clock by the real
 * inter-frame delta (clamped to MAX_DELTA) and invokes every registered
 * consumer in order.
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
        const delta = Math.min((time - this.lastTime) / 1000, MAX_DELTA);
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
