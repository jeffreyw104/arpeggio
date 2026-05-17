import type { Hand } from "../model/score";

/** Read-only view of which hands are muted (silent) / hidden (not drawn). */
export interface HandFilter {
  isMuted(hand: Hand): boolean;
  isHidden(hand: Hand): boolean;
}

/** A filter that mutes and hides nothing — the default for the engines. */
export const NO_HAND_FILTER: HandFilter = {
  isMuted: () => false,
  isHidden: () => false,
};

/**
 * Mutable per-hand mute/hide state for hands-separate practice. The audio
 * engine reads `isMuted`; the falldown renderer reads `isHidden`.
 */
export class HandState implements HandFilter {
  private muted: Record<Hand, boolean> = { left: false, right: false };
  private hidden: Record<Hand, boolean> = { left: false, right: false };
  private listeners = new Set<() => void>();

  isMuted(hand: Hand): boolean {
    return this.muted[hand];
  }

  isHidden(hand: Hand): boolean {
    return this.hidden[hand];
  }

  setMuted(hand: Hand, value: boolean): void {
    this.muted[hand] = value;
    this.emit();
  }

  setHidden(hand: Hand, value: boolean): void {
    this.hidden[hand] = value;
    this.emit();
  }

  /** Subscribe to any change. Returns an unsubscribe function. */
  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn());
  }
}
