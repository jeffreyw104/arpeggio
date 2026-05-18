import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExtendedTopBar } from "./ExtendedTopBar";
import { Transport } from "../transport/transport";
import { HandState } from "../practice/hands";
import type { Score } from "../model/score";
import type { AudioEngine } from "../audio/engine";

const score = {
  source: "midi",
  notes: [],
  measures: [
    { index: 0, start: 0, end: 2, numerator: 4, denominator: 4 },
    { index: 1, start: 2, end: 4, numerator: 4, denominator: 4 },
    { index: 2, start: 4, end: 6, numerator: 4, denominator: 4 },
  ],
  pedalEvents: [],
  timeSignatures: [{ start: 0, numerator: 4, denominator: 4 }],
  tempoMap: [{ start: 0, bpm: 120 }],
  durationSeconds: 6,
  musicXml: "",
  qualityWarning: null,
} satisfies Score;

function renderBar(
  overrides: Partial<Parameters<typeof ExtendedTopBar>[0]> = {},
) {
  const transport = new Transport(score);
  const handState = new HandState();
  const audioEngine = {
    metronome: {
      enabled: false,
      accentDownbeat: false,
      subdivision: 1,
      pulse: 0,
      timeSignature: { numerator: 4, denominator: 4 },
    },
  } as unknown as AudioEngine;
  const props = {
    transport,
    handState,
    audioEngine,
    falldown: null,
    countInBars: 0,
    onCountInBarsChange: vi.fn(),
    ...overrides,
  };
  render(<ExtendedTopBar {...props} />);
  return { transport, handState, props };
}

describe("ExtendedTopBar accordion", () => {
  it("renders the four section chips", () => {
    renderBar();
    expect(screen.getByRole("button", { name: /^loop/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^tempo/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^hands/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^metronome/i }),
    ).toBeInTheDocument();
  });

  it("a section chip toggles its aria-expanded", () => {
    renderBar();
    const loop = screen.getByRole("button", { name: /^loop/i });
    expect(loop).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(loop);
    expect(loop).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(loop);
    expect(loop).toHaveAttribute("aria-expanded", "false");
  });

  it("Loop measure loops the single measure under the playhead", () => {
    const { transport } = renderBar();
    transport.clock.seek(5);
    fireEvent.click(screen.getByRole("button", { name: /loop measure/i }));
    expect(transport.clock.loop).toEqual({ start: 4, end: 6 });
  });

  it("the exact tempo input sets an arbitrary BPM", () => {
    const { transport } = renderBar();
    fireEvent.change(screen.getByRole("spinbutton", { name: /tempo/i }), {
      target: { value: "137" },
    });
    expect(transport.bpm).toBe(137);
  });

  it("the flatten checkbox switches the tempo mode", () => {
    const { transport } = renderBar();
    fireEvent.click(screen.getByRole("checkbox", { name: /flatten/i }));
    expect(transport.tempoMode).toBe("flatten");
  });

  it("the speed-up toggle enables gradual speed-up", () => {
    const { transport } = renderBar();
    fireEvent.click(screen.getByRole("checkbox", { name: /speed-up/i }));
    expect(transport.speedUpActive).toBe(true);
  });

  it("speed-up reads the start BPM field", () => {
    const { transport } = renderBar();
    fireEvent.change(screen.getByRole("spinbutton", { name: /start bpm/i }), {
      target: { value: "80" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /speed-up/i }));
    expect(transport.speedUpActive).toBe(true);
  });

  it("the hand visibility select writes through to hand state", () => {
    const { handState } = renderBar();
    fireEvent.change(screen.getByLabelText(/left hand/i), {
      target: { value: "hide" },
    });
    expect(handState.visibility("left")).toBe("hide");
  });

  it("the metronome toggle enables the metronome", () => {
    const { props } = renderBar();
    fireEvent.click(screen.getByRole("checkbox", { name: /metronome/i }));
    expect(props.audioEngine!.metronome.enabled).toBe(true);
  });

  it("the count-in selector reports changes through onCountInBarsChange", () => {
    const onCountInBarsChange = vi.fn();
    renderBar({ onCountInBarsChange });
    fireEvent.change(screen.getByLabelText(/count-in/i), {
      target: { value: "2" },
    });
    expect(onCountInBarsChange).toHaveBeenCalledWith(2);
  });
});
