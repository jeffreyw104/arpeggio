import { describe, it, expect, vi } from "vitest";
import { startCountIn } from "./countIn";

describe("startCountIn", () => {
  it("fires bars*beatsPerBar clicks then onComplete", () => {
    vi.useFakeTimers();
    try {
      const clicks: boolean[] = [];
      const complete = vi.fn();
      // 2 bars of 4 at 120 BPM => 8 clicks, 0.5 s apart, complete at 4.0 s.
      startCountIn({
        bars: 2,
        beatsPerBar: 4,
        bpm: 120,
        onClick: (accent) => clicks.push(accent),
        onComplete: complete,
      });
      vi.advanceTimersByTime(4100);
      expect(clicks).toHaveLength(8);
      expect(complete).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("accents the first beat of every bar", () => {
    vi.useFakeTimers();
    try {
      const clicks: boolean[] = [];
      startCountIn({
        bars: 2,
        beatsPerBar: 4,
        bpm: 240,
        onClick: (accent) => clicks.push(accent),
        onComplete: () => {},
      });
      vi.advanceTimersByTime(3000);
      expect(clicks).toEqual([
        true, false, false, false,
        true, false, false, false,
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancel() stops pending clicks and onComplete", () => {
    vi.useFakeTimers();
    try {
      const clicks: boolean[] = [];
      const complete = vi.fn();
      const handle = startCountIn({
        bars: 1,
        beatsPerBar: 4,
        bpm: 120,
        onClick: (accent) => clicks.push(accent),
        onComplete: complete,
      });
      vi.advanceTimersByTime(600); // two clicks fired (t=0 and t=500); next would be t=1000
      handle.cancel();
      vi.advanceTimersByTime(5000);
      expect(clicks).toHaveLength(2);
      expect(complete).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
