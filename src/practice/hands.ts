import type { Hand } from "../model/score";

/** How a hand's notes are shown in the falldown. */
export type HandVisibility = "show" | "dim" | "hide";

/** Read-only view of which hands are muted (silent) and how visible they are. */
export interface HandFilter {
  isMuted(hand: Hand): boolean;
  visibility(hand: Hand): HandVisibility;
}

/** A filter that mutes nothing and shows everything — the engine default. */
export const NO_HAND_FILTER: HandFilter = {
  isMuted: () => false,
  visibility: () => "show",
};

/**
 * Mutable per-hand mute + visibility state for hands-separate practice. The
 * audio engine reads `isMuted`; the falldown renderer reads `visibility`
 * ("hide" skips the hand's notes, "dim" draws them faint).
 */
export class HandState implements HandFilter {
  private muted: Record<Hand, boolean> = { left: false, right: false };
  private visible: Record<Hand, HandVisibility> = {
    left: "show",
    right: "show",
  };
  private listeners = new Set<() => void>();

  isMuted(hand: Hand): boolean {
    return this.muted[hand];
  }

  visibility(hand: Hand): HandVisibility {
    return this.visible[hand];
  }

  setMuted(hand: Hand, value: boolean): void {
    this.muted[hand] = value;
    this.emit();
  }

  setVisibility(hand: Hand, value: HandVisibility): void {
    this.visible[hand] = value;
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
