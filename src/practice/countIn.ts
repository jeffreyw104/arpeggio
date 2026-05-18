/** A running count-in; call cancel() to stop it before it completes. */
export interface CountInHandle {
  cancel(): void;
}

export interface CountInOptions {
  /** Number of bars to count in (>= 1). */
  bars: number;
  /** Beats per bar (>= 1). */
  beatsPerBar: number;
  /** Tempo in BPM (> 0); sets the spacing between clicks. */
  bpm: number;
  /** Called for each click; `accent` is true on every bar's first beat. */
  onClick: (accent: boolean) => void;
  /** Called once, one beat after the final click. */
  onComplete: () => void;
}

/**
 * Schedule a metronome count-in. Plays `bars * beatsPerBar` evenly spaced
 * clicks starting immediately, then fires `onComplete` one beat after the last
 * click (the downbeat the music should start on). Uses real-time timers, so
 * it runs independently of the master clock.
 */
export function startCountIn(opts: CountInOptions): CountInHandle {
  const { bars, beatsPerBar, bpm, onClick, onComplete } = opts;
  const intervalMs = (60 / bpm) * 1000;
  const totalClicks = bars * beatsPerBar;
  const timers: number[] = [];

  for (let i = 0; i < totalClicks; i++) {
    const accent = i % beatsPerBar === 0;
    timers.push(
      window.setTimeout(() => onClick(accent), i * intervalMs),
    );
  }
  timers.push(window.setTimeout(onComplete, totalClicks * intervalMs));

  return {
    cancel(): void {
      for (const id of timers) window.clearTimeout(id);
    },
  };
}
