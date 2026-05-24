import { describe, it, expect, vi } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { TopBarReadout } from "./TopBarReadout";
import type { Transport } from "../transport/transport";
import type { AudioEngine } from "../audio/engine";
import type { Hand } from "../model/score";

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

describe("TopBarReadout — wait pill", () => {
  function commonProps(over: Partial<Parameters<typeof TopBarReadout>[0]> = {}) {
    return {
      mode: "midi" as const,
      transport: makeTransport({}),
      audioEngine: makeEngine(),
      waitEnabled: false,
      onWaitEnabledChange: vi.fn(),
      handsIPlay: new Set<Hand>(),
      onHandsIPlayChange: vi.fn(),
      ...over,
    };
  }

  it("does NOT render the wait pill in Play mode", () => {
    render(<TopBarReadout {...commonProps({ mode: "play" })} />);
    expect(screen.queryByRole("button", { name: /wait/i })).toBeNull();
  });

  it("renders the wait pill in MIDI Practice mode with `Turn on wait mode` when off", () => {
    render(<TopBarReadout {...commonProps()} />);
    expect(
      screen.getByRole("button", { name: /turn on wait mode/i }),
    ).toBeInTheDocument();
  });

  it("renders `Wait L` when wait is on and hands = Left", () => {
    const p = commonProps({
      waitEnabled: true,
      handsIPlay: new Set<Hand>(["left"]),
    });
    render(<TopBarReadout {...p} />);
    expect(screen.getByRole("button", { name: /Wait L/ })).toBeInTheDocument();
  });

  it("renders `Wait L+R` when wait is on and hands = Both", () => {
    const p = commonProps({
      waitEnabled: true,
      handsIPlay: new Set<Hand>(["left", "right"]),
    });
    render(<TopBarReadout {...p} />);
    expect(screen.getByRole("button", { name: /Wait L\+R/ })).toBeInTheDocument();
  });

  it("renders `Wait R` when wait is on and hands = Right", () => {
    const p = commonProps({
      waitEnabled: true,
      handsIPlay: new Set<Hand>(["right"]),
    });
    render(<TopBarReadout {...p} />);
    expect(screen.getByRole("button", { name: /Wait R/ })).toBeInTheDocument();
  });

  it("opens a menu with Left / Both / Right when clicked from the OFF state", () => {
    render(<TopBarReadout {...commonProps()} />);
    fireEvent.click(screen.getByRole("button", { name: /turn on wait mode/i }));
    expect(screen.getByText("Left hand")).toBeInTheDocument();
    expect(screen.getByText("Both hands")).toBeInTheDocument();
    expect(screen.getByText("Right hand")).toBeInTheDocument();
    expect(screen.queryByText("Off")).toBeNull();
  });

  it("picks Left from OFF state → calls onWaitEnabledChange(true) AND onHandsIPlayChange({left})", () => {
    const onWaitEnabledChange = vi.fn();
    const onHandsIPlayChange = vi.fn();
    render(
      <TopBarReadout
        {...commonProps({ onWaitEnabledChange, onHandsIPlayChange })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /turn on wait mode/i }));
    fireEvent.click(screen.getByText("Left hand"));
    expect(onWaitEnabledChange).toHaveBeenCalledWith(true);
    expect(onHandsIPlayChange).toHaveBeenCalledWith(new Set(["left"]));
  });

  it("opens a menu with Off + hand options when clicked from ON state", () => {
    const p = commonProps({
      waitEnabled: true,
      handsIPlay: new Set<Hand>(["left"]),
    });
    render(<TopBarReadout {...p} />);
    fireEvent.click(screen.getByRole("button", { name: /Wait L/ }));
    expect(screen.getByText("Off")).toBeInTheDocument();
    expect(screen.getByText("Left hand")).toBeInTheDocument();
  });

  it("picks Off from ON state → calls onWaitEnabledChange(false), leaves handsIPlay alone", () => {
    const onWaitEnabledChange = vi.fn();
    const onHandsIPlayChange = vi.fn();
    const p = commonProps({
      waitEnabled: true,
      handsIPlay: new Set<Hand>(["left"]),
      onWaitEnabledChange,
      onHandsIPlayChange,
    });
    render(<TopBarReadout {...p} />);
    fireEvent.click(screen.getByRole("button", { name: /Wait L/ }));
    fireEvent.click(screen.getByText("Off"));
    expect(onWaitEnabledChange).toHaveBeenCalledWith(false);
    expect(onHandsIPlayChange).not.toHaveBeenCalled();
  });
});
