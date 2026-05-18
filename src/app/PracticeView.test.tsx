import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PracticeView } from "./PracticeView";
import type { Score } from "../model/score";

// Verovio + Tone are heavy/async; stub them so the component mounts in jsdom.
vi.mock("../score-view/verovio", () => ({
  renderScore: vi.fn().mockResolvedValue({
    svg: '<svg><g class="measure"></g></svg>',
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

  it("renders the practice control panel when the settings drawer opens", async () => {
    render(
      <PracticeView
        score={score}
        pieceId="test-piece"
        pieceName="moonlight-sonata.mid"
        onExit={() => {}}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
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

  it("in-lane collapse button collapses the reading lane, and TopBar toggle re-expands it", async () => {
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

    // The in-lane collapse button is present when the lane is expanded.
    const collapseBtn = screen.getByRole("button", { name: /collapse reading lane/i });
    expect(collapseBtn).toBeInTheDocument();
    expect(collapseBtn).toHaveAttribute("aria-expanded", "true");

    // Collapse via the in-lane button.
    fireEvent.click(collapseBtn);

    // After collapsing the in-lane button is gone (it would be clipped).
    expect(screen.queryByRole("button", { name: /collapse reading lane/i })).toBeNull();

    // The lane wrapper now has the collapsed modifier class.
    expect(screen.getByTestId("reading-lane")).toHaveClass("reading-lane--collapsed");

    // The TopBar "Reading lane" button now shows aria-pressed=false.
    const topBarToggle = screen.getByRole("button", { name: /toggle reading lane/i });
    expect(topBarToggle).toHaveAttribute("aria-pressed", "false");

    // Click the TopBar toggle to re-expand.
    fireEvent.click(topBarToggle);

    // The in-lane collapse button is visible again.
    expect(screen.getByRole("button", { name: /collapse reading lane/i })).toBeInTheDocument();
    expect(screen.getByTestId("reading-lane")).not.toHaveClass("reading-lane--collapsed");
  });
});
