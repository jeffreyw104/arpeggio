import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PracticeView } from "./PracticeView";
import type { Score } from "../model/score";

// Verovio + Tone are heavy/async; stub them so the component mounts in jsdom.
vi.mock("../score-view/verovio", () => ({
  renderScore: vi.fn().mockResolvedValue({
    svgPages: ['<svg><g class="measure"></g></svg>'],
    timemap: [],
  }),
}));
vi.mock("../audio/engine", () => ({
  createAudioEngine: vi.fn().mockResolvedValue({
    update: vi.fn(),
    metronomeSound: "click",
    metronome: {
      enabled: false,
      subdivision: 1,
      pulse: 0,
      timeSignature: { numerator: 4, denominator: 4 },
      setTimeSignature: () => {},
    },
  }),
  startAudioContext: vi.fn().mockResolvedValue(undefined),
  METRONOME_SOUNDS: [
    { value: "click", label: "Click" },
    { value: "woodblock", label: "Woodblock" },
    { value: "beep", label: "Beep" },
    { value: "hitick", label: "Hi-tick" },
  ],
}));

const score = {
  source: "midi",
  notes: [{ midi: 60, start: 0, duration: 1, velocity: 0.7, hand: "right" }],
  measures: [{ index: 0, start: 0, end: 2, numerator: 4, denominator: 4 }],
  pedalEvents: [],
  timeSignatures: [{ start: 0, numerator: 4, denominator: 4 }],
  tempoMap: [{ start: 0, bpm: 120 }],
  durationSeconds: 2,
  musicXml: "<score-partwise></score-partwise>",
  qualityWarning: null,
} satisfies Score;

beforeEach(() => {
  // jsdom canvas has no 2D context; stub it so FalldownRenderer can construct.
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    clearRect: vi.fn(), fillRect: vi.fn(), strokeRect: vi.fn(),
    beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
    fillText: vi.fn(), fill: vi.fn(), roundRect: vi.fn(),
    save: vi.fn(), restore: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

describe("PracticeView", () => {
  it("renders the transport HUD and the falldown canvas", () => {
    render(
      <PracticeView
        score={score}
        pieceId="test-piece"
        pieceName="moonlight-sonata.mid"
        onExit={() => {}}
      />,
    );
    expect(screen.getAllByRole("button", { name: /play/i }).length).toBeGreaterThan(0);
    expect(document.querySelector("canvas")).toBeInTheDocument();
  });

  it("the Tools popover exposes General settings (note labels)", async () => {
    render(
      <PracticeView
        score={score}
        pieceId="test-piece"
        pieceName="moonlight-sonata.mid"
        onExit={() => {}}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Tools" }));
    expect(await screen.findByLabelText(/note labels/i)).toBeInTheDocument();
  });

  it("shows the piece name in the top bar", () => {
    render(
      <PracticeView
        score={score}
        pieceId="test-piece"
        pieceName="moonlight-sonata.mid"
        onExit={() => {}}
      />,
    );
    expect(screen.getByText("moonlight-sonata")).toBeInTheDocument();
  });

  it("shows the Tools button, and opening it reveals Loop and Metronome sections", async () => {
    render(
      <PracticeView
        score={score}
        pieceId="redesign-ext"
        pieceName="moonlight.mid"
        onExit={() => {}}
      />,
    );
    // The Tools button is always visible in the top bar.
    const toolsBtn = await screen.findByRole("button", { name: "Tools" });
    expect(toolsBtn).toBeInTheDocument();

    // Open the popover.
    fireEvent.click(toolsBtn);

    // Wait for practiceReady so PlayTools is rendered inside the popover.
    expect(
      await screen.findByRole("button", { name: "Loop" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Metronome" }),
    ).toBeInTheDocument();
  });

  it("ArrowRight does not throw and keeps the view mounted", async () => {
    render(
      <PracticeView
        score={score}
        pieceId="redesign-arrow"
        pieceName="moonlight.mid"
        onExit={() => {}}
      />,
    );
    await screen.findByRole("button", { name: "MIDI Practice" });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(document.querySelector(".practice-view")).toBeInTheDocument();
  });

  it("spacebar toggles play/pause on the transport clock", async () => {
    const { Clock } = await import("../transport/clock");
    const toggleSpy = vi.spyOn(Clock.prototype, "toggle");

    render(
      <PracticeView
        score={score}
        pieceId="spacebar-toggle"
        pieceName="test.mid"
        onExit={() => {}}
      />,
    );

    await screen.findByRole("button", { name: "MIDI Practice" });

    expect(toggleSpy).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: " " });
    expect(toggleSpy).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: " " });
    expect(toggleSpy).toHaveBeenCalledTimes(2);

    toggleSpy.mockRestore();
  });

  it("spacebar does not toggle when a form field is focused", async () => {
    const { Clock } = await import("../transport/clock");
    const toggleSpy = vi.spyOn(Clock.prototype, "toggle");

    render(
      <PracticeView
        score={score}
        pieceId="spacebar-guard"
        pieceName="test.mid"
        onExit={() => {}}
      />,
    );

    await screen.findByRole("button", { name: "MIDI Practice" });

    // Add a text input, append to body, and dispatch keydown on it so e.target
    // is the input when the event bubbles up to the window listener.
    const input = document.createElement("input");
    input.type = "text";
    document.body.appendChild(input);

    fireEvent.keyDown(input, { key: " ", bubbles: true });
    expect(toggleSpy).not.toHaveBeenCalled();

    document.body.removeChild(input);
    toggleSpy.mockRestore();
  });

  it("reading-lane strip is present after switching to MIDI mode", async () => {
    render(
      <PracticeView
        score={score}
        pieceId="reading-lane-present"
        pieceName="moonlight.mid"
        onExit={() => {}}
      />,
    );
    // Switch to MIDI Practice tab.
    const midiBtn = await screen.findByRole("button", { name: "MIDI Practice" });
    fireEvent.click(midiBtn);

    // The reading-lane element is rendered (score panel gets the reading-lane class).
    expect(screen.getByTestId("reading-lane")).toBeInTheDocument();
  });

  it("TopBar layout buttons switch between reading-lane and split layouts", async () => {
    render(
      <PracticeView
        score={score}
        pieceId="reading-lane-toggle"
        pieceName="moonlight.mid"
        onExit={() => {}}
      />,
    );
    // Switch to MIDI Practice tab.
    const midiBtn = await screen.findByRole("button", { name: "MIDI Practice" });
    fireEvent.click(midiBtn);

    // Default layout is "lane": Reading lane button aria-pressed=true, Split=false.
    const laneBtn = screen.getByRole("button", { name: /reading lane/i });
    const splitBtn = screen.getByRole("button", { name: /split/i });
    expect(laneBtn).toHaveAttribute("aria-pressed", "true");
    expect(splitBtn).toHaveAttribute("aria-pressed", "false");

    // The content wrapper has layout-lane class.
    const contentWrapper = document.querySelector(".practice-content--midi");
    expect(contentWrapper).toHaveClass("layout-lane");
    expect(contentWrapper).not.toHaveClass("layout-split");

    // Click Split to switch layout.
    fireEvent.click(splitBtn);

    expect(laneBtn).toHaveAttribute("aria-pressed", "false");
    expect(splitBtn).toHaveAttribute("aria-pressed", "true");
    expect(contentWrapper).toHaveClass("layout-split");
    expect(contentWrapper).not.toHaveClass("layout-lane");
  });
});
