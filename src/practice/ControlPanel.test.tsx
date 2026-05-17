import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ControlPanel } from "./ControlPanel";
import { Transport } from "../transport/transport";
import { HandState } from "./hands";
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

function setup() {
  const transport = new Transport(score);
  const handState = new HandState();
  const falldown = new FalldownRenderer(fakeCtx(), transport, {
    width: 800,
    height: 600,
  });
  render(
    <ControlPanel
      transport={transport}
      handState={handState}
      falldown={falldown}
      audioEngine={null}
    />,
  );
  return { transport, handState, falldown };
}

describe("ControlPanel", () => {
  it("changes the tempo via the BPM input", () => {
    const { transport } = setup();
    const bpm = screen.getByLabelText(/tempo/i);
    fireEvent.change(bpm, { target: { value: "90" } });
    expect(transport.bpm).toBeCloseTo(90, 3);
  });

  it("mutes a hand via the hand controls", () => {
    const { handState } = setup();
    fireEvent.click(screen.getByLabelText(/mute left/i));
    expect(handState.isMuted("left")).toBe(true);
  });

  it("hides a hand via the hand controls", () => {
    const { handState } = setup();
    fireEvent.click(screen.getByLabelText(/hide right/i));
    expect(handState.isHidden("right")).toBe(true);
  });

  it("toggles note labels on the falldown renderer", () => {
    const { falldown } = setup();
    fireEvent.click(screen.getByLabelText(/note labels/i));
    expect(falldown.showLabels).toBe(true);
  });

  it("toggles the full-88 key range", () => {
    const { falldown } = setup();
    fireEvent.click(screen.getByLabelText(/full 88/i));
    expect(falldown.full88).toBe(true);
  });

  it("loops the current measure and clears the loop", () => {
    const { transport } = setup();
    transport.clock.seek(0.5); // inside measure 0
    fireEvent.click(screen.getByRole("button", { name: /loop measure/i }));
    expect(transport.clock.loop).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /clear loop/i }));
    expect(transport.clock.loop).toBeNull();
  });

  it("enables gradual speed-up", () => {
    const { transport } = setup();
    fireEvent.click(screen.getByLabelText(/gradual speed-up/i));
    // with speed-up enabled the clock rate starts below 1
    expect(transport.clock.rate).toBeLessThan(1);
  });
});
