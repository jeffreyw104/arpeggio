import type { Transport } from "./transport";
import type { Loop } from "./clock";
import type { TabMode } from "../layout/practiceMode";

/** A tab's independent transport state — playhead, loop region, tempo. */
export interface TabSnapshot {
  position: number;
  loop: Loop | null;
  bpm: number;
}

/** Read the transport's current state into a snapshot (loop cloned). */
export function captureTab(transport: Transport): TabSnapshot {
  const loop = transport.clock.loop;
  return {
    position: transport.clock.position,
    loop: loop ? { start: loop.start, end: loop.end } : null,
    bpm: transport.bpm,
  };
}

/** Write a snapshot back onto the transport. */
export function applyTab(snapshot: TabSnapshot, transport: Transport): void {
  transport.setBpm(snapshot.bpm);
  transport.clock.setLoop(
    snapshot.loop
      ? { start: snapshot.loop.start, end: snapshot.loop.end }
      : null,
  );
  transport.clock.seek(snapshot.position);
}

/**
 * Switch tabs: pause the clock, save the leaving tab's live state into
 * `snapshots`, and restore the entering tab's state onto the transport.
 * Switching always leaves the clock paused — a tab switch never auto-resumes.
 */
export function switchTab(
  transport: Transport,
  snapshots: Record<TabMode, TabSnapshot>,
  from: TabMode,
  to: TabMode,
): void {
  transport.clock.pause();
  snapshots[from] = captureTab(transport);
  applyTab(snapshots[to], transport);
}
