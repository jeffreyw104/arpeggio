import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PracticeHudControls } from "./PracticeHudControls";
import { Transport } from "../transport/transport";
import { HandState } from "../practice/hands";
import type { Score } from "../model/score";
import type { AudioEngine } from "../audio/engine";
import type { FalldownRenderer } from "../falldown/renderer";

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

function renderControls(
  overrides: Partial<Parameters<typeof PracticeHudControls>[0]> = {},
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
    falldown: null as FalldownRenderer | null,
    countInBars: 0,
    onCountInBarsChange: vi.fn(),
    ...overrides,
  };
  render(<PracticeHudControls {...props} />);
  return { transport, handState, props };
}

describe("PracticeHudControls", () => {
  it("Set start then Set end builds a loop over the playhead measures", () => {
    const { transport } = renderControls();
    transport.clock.seek(1); // inside measure 0
    fireEvent.click(screen.getByRole("button", { name: /set start/i }));
    transport.clock.seek(5); // inside measure 2
    fireEvent.click(screen.getByRole("button", { name: /set end/i }));
    expect(transport.clock.loop).toEqual({ start: 0, end: 6 });
    expect(screen.getByText(/m\.1–3/)).toBeInTheDocument();
  });

  it("Clear removes the loop", () => {
    const { transport } = renderControls();
    transport.clock.seek(1);
    fireEvent.click(screen.getByRole("button", { name: /set start/i }));
    fireEvent.click(screen.getByRole("button", { name: /set end/i }));
    fireEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(transport.clock.loop).toBeNull();
  });

  it("the tempo stepper changes the transport BPM", () => {
    const { transport } = renderControls();
    fireEvent.click(screen.getByRole("button", { name: /increase tempo/i }));
    expect(transport.bpm).toBeGreaterThan(120);
  });

  it("the speed-up toggle enables gradual speed-up", () => {
    const { transport } = renderControls();
    fireEvent.click(screen.getByRole("checkbox", { name: /speed-up/i }));
    expect(transport.speedUpActive).toBe(true);
  });

  it("the hand visibility select writes through to hand state", () => {
    const { handState } = renderControls();
    fireEvent.click(screen.getByRole("button", { name: /hand settings/i }));
    fireEvent.change(screen.getByLabelText(/left hand/i), {
      target: { value: "hide" },
    });
    expect(handState.visibility("left")).toBe("hide");
  });

  it("the metronome toggle enables the metronome", () => {
    const { props } = renderControls();
    fireEvent.click(screen.getByRole("checkbox", { name: /metronome/i }));
    expect(props.audioEngine!.metronome.enabled).toBe(true);
  });
});
