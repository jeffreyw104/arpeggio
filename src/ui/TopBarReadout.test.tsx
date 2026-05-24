import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { TopBarReadout } from "./TopBarReadout";
import type { Transport } from "../transport/transport";
import type { AudioEngine } from "../audio/engine";

interface FakeTransport extends Transport {
  _listeners: Array<() => void>;
}

function makeTransport(opts: {
  bpm?: number;
  position?: number;
  duration?: number;
  loop?: { start: number; end: number } | null;
}): FakeTransport {
  const listeners: Array<() => void> = [];
  return {
    bpm: opts.bpm ?? 72,
    score: {
      measures: [
        { start: 0, end: 2 },
        { start: 2, end: 4 },
        { start: 4, end: 6 },
        { start: 6, end: 8 },
      ],
    },
    clock: {
      position: opts.position ?? 0,
      duration: opts.duration ?? 8,
      playing: false,
      loop: opts.loop ?? null,
      onChange: (cb: () => void) => {
        listeners.push(cb);
        return () => {
          const i = listeners.indexOf(cb);
          if (i !== -1) listeners.splice(i, 1);
        };
      },
    },
    _listeners: listeners,
  } as unknown as FakeTransport;
}

function makeEngine(num = 4, den = 4): AudioEngine {
  return {
    metronome: { timeSignature: { numerator: num, denominator: den } },
  } as unknown as AudioEngine;
}

describe("TopBarReadout — read-only chips", () => {
  it("renders tempo, time-sig, and measure chips", () => {
    render(
      <TopBarReadout
        mode="play"
        transport={makeTransport({ bpm: 96, position: 0 })}
        audioEngine={makeEngine(3, 4)}
      />,
    );
    expect(screen.getByText(/♩ = 96/)).toBeInTheDocument();
    expect(screen.getByText("3/4")).toBeInTheDocument();
    expect(screen.getByText(/m\. 1 \/ 4/)).toBeInTheDocument();
  });

  it("does NOT render the loop chip when no loop is active", () => {
    render(
      <TopBarReadout
        mode="play"
        transport={makeTransport({})}
        audioEngine={makeEngine()}
      />,
    );
    expect(screen.queryByText(/↻/)).toBeNull();
  });

  it("renders the loop chip as `↻ m.X–Y` when a loop is active", () => {
    render(
      <TopBarReadout
        mode="play"
        transport={makeTransport({ loop: { start: 2, end: 6 } })}
        audioEngine={makeEngine()}
      />,
    );
    expect(screen.getByText(/↻ m\.2–3/)).toBeInTheDocument();
  });

  it("updates chip values when the clock fires onChange", () => {
    const t = makeTransport({ position: 0 });
    render(
      <TopBarReadout mode="play" transport={t} audioEngine={makeEngine()} />,
    );
    expect(screen.getByText(/m\. 1 \/ 4/)).toBeInTheDocument();
    act(() => {
      (t.clock as { position: number }).position = 4.5;
      t._listeners.forEach((cb) => cb());
    });
    expect(screen.getByText(/m\. 3 \/ 4/)).toBeInTheDocument();
  });
});
