/** A currently-sounding note. */
export interface HeldNote {
  pitch: number;
  velocity: number;
  /** Press time in the performance.now() domain (ms). */
  pressTime: number;
  /** True if the key has been physically released and the note is only still
   *  ringing because the sustain pedal is down. False (or absent) means the
   *  key is currently physically held. */
  sustained?: boolean;
}

/**
 * The live held-notes + pedal store. Input sources write here; the wait-mode
 * FSM and the falldown key-lighting read from here. Owns sustain-pedal
 * bookkeeping: a release while the pedal is down is deferred until pedal-up.
 */
export class LiveNotes {
  onPressed: ((note: HeldNote) => void) | null = null;
  onReleased: ((pitch: number) => void) | null = null;

  private held = new Map<number, HeldNote>();
  private sustained = new Set<number>();
  private _pedal = false;

  get pedalDown(): boolean {
    return this._pedal;
  }

  /** Pitches currently sounding. Each note's `sustained` field reflects
   *  whether the key has been physically released (and is only being held
   *  by the sustain pedal). */
  heldNotes(): HeldNote[] {
    return [...this.held.values()].map((n) =>
      this.sustained.has(n.pitch) ? { ...n, sustained: true } : n,
    );
  }

  press(pitch: number, velocity: number, pressTime: number): void {
    this.sustained.delete(pitch);
    const note = { pitch, velocity, pressTime };
    this.held.set(pitch, note);
    this.onPressed?.(note);
  }

  release(pitch: number): void {
    if (this._pedal) {
      if (this.held.has(pitch)) this.sustained.add(pitch);
      return;
    }
    if (this.held.delete(pitch)) this.onReleased?.(pitch);
  }

  setPedal(down: boolean): void {
    this._pedal = down;
    if (down) return;
    for (const pitch of this.sustained) {
      if (this.held.delete(pitch)) this.onReleased?.(pitch);
    }
    this.sustained.clear();
  }

  /** Drop all state (device disconnect, leaving the tab). */
  clear(): void {
    this.held.clear();
    this.sustained.clear();
    this._pedal = false;
  }
}
