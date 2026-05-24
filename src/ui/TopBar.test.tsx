import { describe, it, expect, vi, test, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { TopBar } from "./TopBar";
import { Transport } from "../transport/transport";
import type { Score } from "../model/score";
import type { AudioEngine } from "../audio/engine";

vi.mock("../responsive/useIsTouchDevice", () => ({
  useIsTouchDevice: vi.fn(() => false), // default: desktop
}));

vi.mock("../responsive/useIsNarrowViewport", () => ({
  useIsNarrowViewport: vi.fn(() => false), // default: wide
}));

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
    fireEvent.click(screen.getByRole("button", { name: /view:/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /score only/i }));
    expect(props.onViewModeChange).toHaveBeenCalledWith("score");
  });

  it("marks the active view mode with aria-current when menu is open", () => {
    renderBar({ viewMode: "falldown" });
    // Open the menu
    fireEvent.click(screen.getByRole("button", { name: /view:/i }));
    // The active item should have aria-current="true"
    expect(
      screen.getByRole("menuitem", { name: /falldown only/i }),
    ).toHaveAttribute("aria-current", "true");
    // Inactive items should not have aria-current
    expect(
      screen.getByRole("menuitem", { name: /^both$/i }),
    ).not.toHaveAttribute("aria-current");
  });

  it("renders the Play/MIDI Practice switch", () => {
    const { props } = renderBar();
    const allPlayBtns = screen.getAllByRole("button", { name: /Play/ });
    const modeBtn = allPlayBtns.find((btn) => btn.hasAttribute("aria-haspopup"));
    expect(modeBtn).toBeInTheDocument();
    fireEvent.click(modeBtn!);
    fireEvent.click(screen.getByRole("menuitem", { name: /MIDI Practice/ }));
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

  it("MIDI Practice mode: layout pill opens menu with both sections", () => {
    renderBar({ mode: "midi", practiceLayout: "lane", laneTheme: "dark" });
    fireEvent.click(screen.getByRole("button", { name: /Layout: Reading lane/ }));
    expect(screen.getByRole("menuitem", { name: /Reading lane/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Split/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Light/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Dark/ })).toBeInTheDocument();
  });

  it("picking a Lane theme from Split auto-switches to Reading lane", () => {
    const onPracticeLayoutChange = vi.fn();
    const onLaneThemeChange = vi.fn();
    renderBar({
      mode: "midi",
      practiceLayout: "split",
      laneTheme: "dark",
      onPracticeLayoutChange,
      onLaneThemeChange,
    });
    fireEvent.click(screen.getByRole("button", { name: /Layout: Split/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Light/ }));
    expect(onLaneThemeChange).toHaveBeenCalledWith("paper");
    expect(onPracticeLayoutChange).toHaveBeenCalledWith("lane");
  });

  test("MIDI Practice tab Layout pill exposes Falldown only and Score only", () => {
    const onPracticeLayoutChange = vi.fn();
    renderBar({
      mode: "midi",
      practiceLayout: "split",
      laneTheme: "dark",
      onPracticeLayoutChange,
    });

    // Open the Layout pill.
    fireEvent.click(screen.getByRole("button", { name: /Layout: Split/ }));

    // All four options are listed.
    expect(screen.getByRole("menuitem", { name: /Reading lane/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Split/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Falldown only/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Score only/ })).toBeInTheDocument();

    // Selecting "Falldown only" fires the callback with "falldown".
    fireEvent.click(screen.getByRole("menuitem", { name: /Falldown only/ }));
    expect(onPracticeLayoutChange).toHaveBeenCalledWith("falldown");

    // Re-open and select "Score only".
    fireEvent.click(screen.getByRole("button", { name: /Layout:/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Score only/ }));
    expect(onPracticeLayoutChange).toHaveBeenCalledWith("score");
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

  describe("TopBarReadout visibility by device type", () => {
    beforeEach(async () => {
      const { useIsTouchDevice } = await import("../responsive/useIsTouchDevice");
      vi.mocked(useIsTouchDevice).mockReturnValue(false);
    });

    test("on touch device, TopBarReadout is NOT rendered in the bar", async () => {
      const { useIsTouchDevice } = await import("../responsive/useIsTouchDevice");
      vi.mocked(useIsTouchDevice).mockReturnValue(true);

      renderBar({ mode: "midi" });
      expect(screen.queryByTestId("top-bar-readout")).not.toBeInTheDocument();
    });

    test("on desktop, TopBarReadout IS rendered in the bar", async () => {
      const { useIsTouchDevice } = await import("../responsive/useIsTouchDevice");
      vi.mocked(useIsTouchDevice).mockReturnValue(false);

      renderBar({ mode: "midi" });
      expect(screen.getByTestId("top-bar-readout")).toBeInTheDocument();
    });
  });

  describe("MIDI status chip — touch-specific copy", () => {
    beforeEach(async () => {
      // Ensure we start each sub-test with a clean mock state.
      const { useIsTouchDevice } = await import("../responsive/useIsTouchDevice");
      vi.mocked(useIsTouchDevice).mockReturnValue(false);
    });

    test("on touch device, MIDI 'unsupported' status shows iPadOS hint", async () => {
      const { useIsTouchDevice } = await import("../responsive/useIsTouchDevice");
      vi.mocked(useIsTouchDevice).mockReturnValue(true);

      renderBar({ mode: "midi", midiStatus: "unsupported" });
      const chip = document.querySelector(".midi-status-chip");
      expect(chip?.textContent).toMatch(/iPadOS.*17\.4/i);
    });

    test("on touch device, MIDI 'denied' status shows Safari settings hint", async () => {
      const { useIsTouchDevice } = await import("../responsive/useIsTouchDevice");
      vi.mocked(useIsTouchDevice).mockReturnValue(true);

      renderBar({ mode: "midi", midiStatus: "denied" });
      const chip = document.querySelector(".midi-status-chip");
      expect(chip?.textContent).toMatch(/Safari Settings/i);
    });

    test("on desktop, MIDI 'unsupported' status shows generic copy", async () => {
      const { useIsTouchDevice } = await import("../responsive/useIsTouchDevice");
      vi.mocked(useIsTouchDevice).mockReturnValue(false);

      renderBar({ mode: "midi", midiStatus: "unsupported" });
      // Should NOT show the iPadOS hint on desktop
      const chip = document.querySelector(".midi-status-chip");
      expect(chip?.textContent).not.toMatch(/iPadOS.*17\.4/i);
      // Should show the generic "Connect keyboard" text
      expect(chip?.textContent).toMatch(/Connect keyboard/);
    });
  });

  describe("narrow viewport hiding", () => {
    beforeEach(async () => {
      const { useIsNarrowViewport } = await import("../responsive/useIsNarrowViewport");
      vi.mocked(useIsNarrowViewport).mockReturnValue(false);
    });

    test("on narrow viewport, time text is hidden", async () => {
      const { useIsNarrowViewport } = await import("../responsive/useIsNarrowViewport");
      vi.mocked(useIsNarrowViewport).mockReturnValue(true);

      renderBar({});
      expect(screen.queryByText(/\d+:\d+ \/ \d+:\d+/)).not.toBeInTheDocument();
    });

    test("on wide viewport, time text is shown", async () => {
      const { useIsNarrowViewport } = await import("../responsive/useIsNarrowViewport");
      vi.mocked(useIsNarrowViewport).mockReturnValue(false);

      renderBar({});
      expect(screen.getByText(/\d+:\d+ \/ \d+:\d+/)).toBeInTheDocument();
    });

    test("on narrow viewport, connected MIDI chip shows only the dot", async () => {
      const { useIsNarrowViewport } = await import("../responsive/useIsNarrowViewport");
      vi.mocked(useIsNarrowViewport).mockReturnValue(true);

      renderBar({ mode: "midi", midiStatus: "connected", midiDeviceName: "KeyboardX" });
      expect(screen.queryByText("KeyboardX")).not.toBeInTheDocument();
      // The chip itself should still be present
      expect(document.querySelector(".midi-status-chip")).toBeInTheDocument();
    });

    test("on wide viewport, connected MIDI chip shows device name", async () => {
      const { useIsNarrowViewport } = await import("../responsive/useIsNarrowViewport");
      vi.mocked(useIsNarrowViewport).mockReturnValue(false);

      renderBar({ mode: "midi", midiStatus: "connected", midiDeviceName: "KeyboardX" });
      const chip = document.querySelector(".midi-status-chip");
      expect(chip?.textContent).toMatch(/KeyboardX/);
    });
  });
});
