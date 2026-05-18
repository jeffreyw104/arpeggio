import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ControlPanel } from "./ControlPanel";
import { Transport } from "../transport/transport";
import { FalldownRenderer } from "../falldown/renderer";
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
  render(
    <ControlPanel
      transport={transport}
      falldown={falldown}
    />,
  );
  return { transport, falldown };
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

  it("flattens tempo changes on the transport", () => {
    const { transport } = renderPanel();
    fireEvent.click(screen.getByLabelText(/flatten tempo/i));
    expect(transport.tempoMode).toBe("flatten");
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
    expect(
      screen.getByRole("checkbox", { name: /flatten tempo/i }),
    ).toBeInTheDocument();
  });
});
