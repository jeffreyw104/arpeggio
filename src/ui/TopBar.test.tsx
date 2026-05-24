import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { TopBar } from "./TopBar";
import { Transport } from "../transport/transport";
import type { Score } from "../model/score";
import type { AudioEngine } from "../audio/engine";

const score = {
  source: "midi",
  notes: [],
  measures: [{ index: 0, start: 0, end: 4, numerator: 4, denominator: 4 }],
  pedalEvents: [],
  timeSignatures: [{ start: 0, numerator: 4, denominator: 4 }],
  tempoMap: [{ start: 0, bpm: 120 }],
  durationSeconds: 4,
  musicXml: "",
  qualityWarning: null,
} satisfies Score;

function makeTransport() {
  return new Transport(score);
}

function renderBar(overrides: Partial<Parameters<typeof TopBar>[0]> = {}) {
  const transport = makeTransport();
  const audioEngine = {
    metronome: { timeSignature: { numerator: 4, denominator: 4 } },
    playClick: vi.fn(),
    setVolume: vi.fn(),
  } as unknown as AudioEngine;
  const props = {
    pieceName: "moonlight-sonata.mid",
    viewMode: "both" as const,
    onViewModeChange: vi.fn(),
    onOpenLibrary: vi.fn(),
    toolsOpen: false,
    onToggleTools: vi.fn(),
    mode: "play" as const,
    onModeChange: vi.fn(),
    transport,
    audioEngine,
    countInBars: 0,
    practiceLayout: "lane" as const,
    onPracticeLayoutChange: vi.fn(),
    laneTheme: "dark" as const,
    onLaneThemeChange: vi.fn(),
    ...overrides,
  };
  render(<TopBar {...props} />);
  return { transport, props };
}

describe("TopBar", () => {
  it("shows the piece name with its file extension stripped", () => {
    renderBar();
    expect(screen.getByText("moonlight-sonata")).toBeInTheDocument();
    expect(screen.queryByText(/\.mid/)).toBeNull();
  });

  it("calls onOpenLibrary when the Library button is clicked", () => {
    const { props } = renderBar();
    fireEvent.click(screen.getByRole("button", { name: /library/i }));
    expect(props.onOpenLibrary).toHaveBeenCalled();
  });

  it("calls onViewModeChange when a view-mode button is clicked", () => {
    const { props } = renderBar();
    fireEvent.click(screen.getByRole("button", { name: /score only/i }));
    expect(props.onViewModeChange).toHaveBeenCalledWith("score");
  });

  it("marks the active view mode with aria-pressed", () => {
    renderBar({ viewMode: "falldown" });
    expect(
      screen.getByRole("button", { name: /falldown only/i }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^both$/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("renders the Play/MIDI Practice switch", () => {
    const { props } = renderBar();
    fireEvent.click(screen.getByRole("button", { name: "MIDI Practice" }));
    expect(props.onModeChange).toHaveBeenCalledWith("midi");
  });

  it("calls onToggleTools when the Tools button is clicked", () => {
    const { props } = renderBar();
    fireEvent.click(screen.getByRole("button", { name: /tools/i }));
    expect(props.onToggleTools).toHaveBeenCalled();
  });

  it("reflects the toolsOpen prop in the Tools button aria-pressed", () => {
    const { props } = renderBar({ toolsOpen: true });
    expect(
      screen.getByRole("button", { name: /tools/i }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(props.onToggleTools).not.toHaveBeenCalled();
  });

  it("shows the arpeggio wordmark", () => {
    renderBar();
    expect(screen.getByText("arpeggio")).toBeInTheDocument();
  });

  /** Returns the transport play/pause button (`.hud-play-btn`). */
  function getPlayBtn(): HTMLElement {
    return document.querySelector(".hud-play-btn") as HTMLElement;
  }

  it("renders the play button and seek scrubber", () => {
    renderBar();
    expect(getPlayBtn()).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: /seek/i })).toBeInTheDocument();
  });

  it("toggles play/pause on the transport clock", () => {
    const { transport } = renderBar();
    fireEvent.click(getPlayBtn());
    expect(transport.clock.playing).toBe(true);
    fireEvent.click(getPlayBtn());
    expect(transport.clock.playing).toBe(false);
  });

  it("seeks the clock when the slider moves", () => {
    const { transport } = renderBar();
    fireEvent.change(screen.getByRole("slider", { name: /seek/i }), {
      target: { value: "2" },
    });
    expect(transport.clock.position).toBeCloseTo(2, 3);
  });

  describe("MIDI status chip", () => {
    it("shows connected dot and device name when status is connected", () => {
      renderBar({
        mode: "midi",
        midiStatus: "connected",
        midiDeviceName: "Piano",
      });
      const chip = document.querySelector(".midi-status-chip");
      expect(chip).toBeInTheDocument();
      expect(chip?.textContent).toMatch(/●/);
      expect(chip?.textContent).toMatch(/Piano/);
    });

    it("shows disconnected dot and Connect keyboard when status is no-device", () => {
      renderBar({ mode: "midi", midiStatus: "no-device" });
      const chip = document.querySelector(".midi-status-chip");
      expect(chip).toBeInTheDocument();
      expect(chip?.textContent).toMatch(/○/);
      expect(chip?.textContent).toMatch(/Connect keyboard/);
    });

    it("does not show the status chip in play mode", () => {
      renderBar({ mode: "play" });
      expect(document.querySelector(".midi-status-chip")).toBeNull();
    });
  });

  it("renders the TopBarReadout chip group in the slack region", () => {
    renderBar();
    // Tempo chip is always present once the readout renders
    expect(screen.getByText(/♩ =/)).toBeInTheDocument();
  });

  it("count-in: play button disabled during count-in then clock plays after", () => {
    vi.useFakeTimers();
    try {
      const { transport } = renderBar({ mode: "midi", countInBars: 1 });
      fireEvent.click(getPlayBtn());
      expect(getPlayBtn()).toBeDisabled();
      expect(transport.clock.playing).toBe(false);
      act(() => {
        vi.advanceTimersByTime(2600);
      });
      expect(transport.clock.playing).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
