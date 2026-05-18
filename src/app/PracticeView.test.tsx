import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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
  createAudioEngine: vi
    .fn()
    .mockResolvedValue({ update: vi.fn(), metronome: { enabled: false } }),
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
    fillText: vi.fn(),
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

describe("PracticeView", () => {
  it("renders the transport bar and the falldown canvas", () => {
    render(<PracticeView score={score} pieceId="test-piece" onExit={() => {}} />);
    expect(screen.getByRole("button", { name: /play/i })).toBeInTheDocument();
    expect(document.querySelector("canvas")).toBeInTheDocument();
  });

  it("renders the practice control panel once the renderer mounts", () => {
    render(<PracticeView score={score} pieceId="test-piece" onExit={() => {}} />);
    expect(screen.getByLabelText(/tempo \(bpm\)/i)).toBeInTheDocument();
  });
});
