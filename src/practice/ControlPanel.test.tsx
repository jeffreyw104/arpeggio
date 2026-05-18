import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ControlPanel } from "./ControlPanel";
import { FalldownRenderer } from "../falldown/renderer";
import { Transport } from "../transport/transport";
import type { AudioEngine } from "../audio/engine";
import type { Score } from "../model/score";

const score = {
  source: "midi",
  notes: [
    { midi: 60, start: 0, duration: 1, velocity: 0.7, hand: "right" },
    { midi: 48, start: 0, duration: 1, velocity: 0.7, hand: "left" },
  ],
  measures: [{ index: 0, start: 0, end: 2, numerator: 4, denominator: 4 }],
  pedalEvents: [],
  timeSignatures: [{ start: 0, numerator: 4, denominator: 4 }],
  tempoMap: [{ start: 0, bpm: 120 }],
  durationSeconds: 2,
  musicXml: "",
  qualityWarning: null,
} satisfies Score;

function fakeCtx() {
  const noop = () => {};
  return {
    clearRect: noop, fillRect: noop, strokeRect: noop, beginPath: noop,
    moveTo: noop, lineTo: noop, stroke: noop, fillText: noop,
  } as unknown as CanvasRenderingContext2D;
}

function renderPanel() {
  const transport = new Transport(score);
  const falldown = new FalldownRenderer(fakeCtx(), transport, {
    width: 800,
    height: 600,
  });
  const audioEngine = { metronomeSound: "click" } as unknown as AudioEngine;
  render(
    <ControlPanel
      falldown={falldown}
      audioEngine={audioEngine}
    />,
  );
  return { falldown, audioEngine };
}

describe("ControlPanel", () => {
  it("toggles note labels on the falldown renderer", () => {
    const { falldown } = renderPanel();
    fireEvent.click(screen.getByLabelText(/note labels/i));
    expect(falldown.showLabels).toBe(true);
  });

  it("toggles the full-88 key range", () => {
    const { falldown } = renderPanel();
    fireEvent.click(screen.getByLabelText(/full 88/i));
    expect(falldown.full88).toBe(true);
  });

  it("no longer renders the flatten-tempo control", () => {
    renderPanel();
    expect(
      screen.queryByRole("checkbox", { name: /flatten tempo/i }),
    ).toBeNull();
  });

  it("changes the metronome sound on the audio engine", () => {
    const { audioEngine } = renderPanel();
    fireEvent.change(screen.getByLabelText(/metronome sound/i), {
      target: { value: "woodblock" },
    });
    expect(audioEngine.metronomeSound).toBe("woodblock");
  });

  it("no longer renders loop, speed-up, or hand controls", () => {
    renderPanel();
    expect(
      screen.queryByRole("button", { name: /loop measure/i }),
    ).toBeNull();
    expect(
      screen.queryByRole("checkbox", { name: /gradual speed-up/i }),
    ).toBeNull();
    expect(screen.queryByRole("checkbox", { name: /mute left/i })).toBeNull();
  });

  it("still renders the display preferences", () => {
    renderPanel();
    expect(
      screen.getByRole("checkbox", { name: /note labels/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /beat grid/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /full 88/i }),
    ).toBeInTheDocument();
  });
});
