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

  it("loop readout survives the Play-mode suspend/restore round-trip", async () => {
    render(
      <PracticeView
        score={score}
        pieceId="test-piece"
        pieceName="moonlight-sonata.mid"
        onExit={() => {}}
      />,
    );

    // Switch to Practice mode (ModeSwitch slider toggle; one click from Play→Practice).
    const modeSwitch = await screen.findByRole("switch", { name: /play.*practice/i });
    fireEvent.click(modeSwitch);

    // Set a loop: Set start then Set end both snap to the playhead measure
    // (position 0 → measure 1).  The readout becomes m.1–1.
    fireEvent.click(await screen.findByRole("button", { name: /set start/i }));
    fireEvent.click(screen.getByRole("button", { name: /set end/i }));

    // Confirm a loop is now shown in the readout.
    expect(screen.getByText(/m\.\d/)).toBeInTheDocument();

    // Switch to Play mode — PracticeHudControls unmounts, loop is suspended.
    fireEvent.click(screen.getByRole("switch", { name: /play.*practice/i }));

    // Switch back to Practice mode — PracticeHudControls remounts with the
    // restored loop; wait for it to appear.
    fireEvent.click(
      await screen.findByRole("switch", { name: /play.*practice/i }),
    );

    // The readout must show a measure range again — proving the loop was
    // restored.  If suspend/restore dropped the loop it would show "—" instead.
    expect(await screen.findByText(/m\.\d/)).toBeInTheDocument();
  });

  it("shows the extended top bar in Practice mode", async () => {
    render(
      <PracticeView
        score={score}
        pieceId="redesign-ext"
        pieceName="moonlight.mid"
        onExit={() => {}}
      />,
    );
    fireEvent.click(
      await screen.findByRole("switch", { name: /play.*practice/i }),
    );
    expect(
      await screen.findByRole("button", { name: /loop measure/i }),
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
    await screen.findByRole("switch", { name: /play.*practice/i });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(document.querySelector(".practice-view")).toBeInTheDocument();
  });
});
