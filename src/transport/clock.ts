/** An A-B loop region, in score-time seconds. */
export interface Loop {
  start: number;
  end: number;
}

/**
 * The single master playback clock. Holds the canonical position; a render loop
 * advances it via tick(). Everything else only reads from it.
 */
export class Clock {
  private _position = 0;
  private _playing = false;
  private _rate = 1;
  private _loop: Loop | null = null;
  private _holdAt: number | null = null;
  private changeListeners = new Set<() => void>();
  private loopListeners = new Set<() => void>();
  private seekListeners = new Set<() => void>();

  private _duration: number;

  constructor(duration: number) {
    this._duration = duration;
  }

  get duration(): number {
    return this._duration;
  }

  get position(): number {
    return this._position;
  }
  get playing(): boolean {
    return this._playing;
  }
  get rate(): number {
    return this._rate;
  }
  get loop(): Loop | null {
    return this._loop;
  }
  get holdAt(): number | null {
    return this._holdAt;
  }

  play(): void {
    if (this._playing) return;
    this._playing = true;
    this.emitChange();
  }

  pause(): void {
    if (!this._playing) return;
    this._playing = false;
    this.emitChange();
  }

  toggle(): void {
    if (this._playing) {
      this.pause();
    } else {
      this.play();
    }
  }

  seek(seconds: number): void {
    this._position = Math.min(Math.max(seconds, 0), this.duration);
    // A user-driven seek lifts any wait-mode hold so the next tick can
    // actually advance toward the new position. The wait-mode controller
    // re-arms via its onSeek listener and re-sets the hold on the next
    // update(). Without this, tick()'s "next >= holdAt → snap to holdAt"
    // branch would instantly snap the position back to the old hold.
    this._holdAt = null;
    this.emitChange();
    this.seekListeners.forEach((fn) => fn());
  }

  /** Update the total duration; re-clamps the current position into range. */
  setDuration(duration: number): void {
    this._duration = duration;
    this.seek(this._position);
  }

  setRate(rate: number): void {
    this._rate = Math.max(rate, 0.01);
    this.emitChange();
  }

  setLoop(loop: Loop | null): void {
    this._loop = loop;
    this.emitChange();
  }

  /** Clamp clock advancement at `seconds`; null lifts the hold. Also snaps
   *  the current position back to the hold if the position is already past
   *  it — saves the wait-mode controller from doing the snap itself (and
   *  recursing through clock.seek → onSeek listeners). */
  setHold(seconds: number | null): void {
    this._holdAt = seconds;
    if (seconds != null && this._position > seconds) {
      this._position = seconds;
      this.emitChange();
    }
  }

  /**
   * Advance the clock by real elapsed seconds. No-op while paused. Applies rate,
   * wraps inside an active loop (firing onLoop), and stops at the piece end.
   */
  tick(realElapsedSeconds: number): void {
    if (!this._playing || realElapsedSeconds <= 0) return;
    let next = this._position + realElapsedSeconds * this._rate;

    if (this._holdAt != null && next >= this._holdAt) {
      if (this._position !== this._holdAt) {
        this._position = this._holdAt;
        this.emitChange();
      }
      return;
    }

    const loop = this._loop;
    if (loop && loop.end > loop.start && next >= loop.end) {
      // Land exactly on loop.start (drop the sub-frame remainder) so every loop
      // pass begins at the same point and a note or beat sitting exactly on
      // loop.start is never skipped.
      next = loop.start;
      this._position = next;
      this.emitChange();
      this.loopListeners.forEach((fn) => fn());
      return;
    }

    if (next >= this.duration) {
      this._position = this.duration;
      this._playing = false;
      this.emitChange();
      return;
    }

    this._position = next;
    this.emitChange();
  }

  /** Subscribe to any state change. Returns an unsubscribe function. */
  onChange(fn: () => void): () => void {
    this.changeListeners.add(fn);
    return () => this.changeListeners.delete(fn);
  }

  /** Subscribe to loop-wrap events. Returns an unsubscribe function. */
  onLoop(fn: () => void): () => void {
    this.loopListeners.add(fn);
    return () => this.loopListeners.delete(fn);
  }

  /** Subscribe to seek events. Returns an unsubscribe function. */
  onSeek(fn: () => void): () => void {
    this.seekListeners.add(fn);
    return () => this.seekListeners.delete(fn);
  }

  private emitChange(): void {
    this.changeListeners.forEach((fn) => fn());
  }
}
