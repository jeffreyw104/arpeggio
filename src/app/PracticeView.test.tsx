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
    metronome: {
      enabled: false,
      subdivision: 1,
      pulse: 0,
      timeSignature: { numerator: 4, denominator: 4 },
      setTimeSignature: () => {},
    },
  }),
  startAudioContext: vi.fn().mockResolvedValue(undefined),
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
    expect(screen.getByRole("button", { name: /play/i })).toBeInTheDocument();
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
});
