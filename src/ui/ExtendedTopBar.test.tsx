import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExtendedTopBar } from "./ExtendedTopBar";
import { Transport } from "../transport/transport";
import { HandState } from "../practice/hands";
import type { Score } from "../model/score";

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

function renderBar() {
  const transport = new Transport(score);
  const handState = new HandState();
  render(<ExtendedTopBar transport={transport} handState={handState} />);
  return { transport, handState };
}

describe("ExtendedTopBar", () => {
  it("Loop measure loops the single measure under the playhead", () => {
    const { transport } = renderBar();
    transport.clock.seek(5); // inside measure 2
    fireEvent.click(screen.getByRole("button", { name: /loop measure/i }));
    expect(transport.clock.loop).toEqual({ start: 4, end: 6 });
  });

  it("Set start then Set end builds a loop range", () => {
    const { transport } = renderBar();
    transport.clock.seek(1);
    fireEvent.click(screen.getByRole("button", { name: /set start/i }));
    transport.clock.seek(5);
    fireEvent.click(screen.getByRole("button", { name: /set end/i }));
    expect(transport.clock.loop).toEqual({ start: 0, end: 6 });
  });

  it("Clear removes the loop", () => {
    const { transport } = renderBar();
    transport.clock.seek(1);
    fireEvent.click(screen.getByRole("button", { name: /loop measure/i }));
    fireEvent.click(screen.getByRole("button", { name: /clear loop/i }));
    expect(transport.clock.loop).toBeNull();
  });

  it("the exact tempo input sets an arbitrary BPM", () => {
    const { transport } = renderBar();
    fireEvent.change(screen.getByRole("spinbutton"), {
      target: { value: "137" },
    });
    expect(transport.bpm).toBe(137);
  });

  it("the tempo + button steps the BPM up", () => {
    const { transport } = renderBar();
    fireEvent.click(screen.getByRole("button", { name: /increase tempo/i }));
    expect(transport.bpm).toBe(125);
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

  it("the hand visibility select writes through to hand state", () => {
    const { handState } = renderBar();
    fireEvent.change(screen.getByLabelText(/left hand/i), {
      target: { value: "hide" },
    });
    expect(handState.visibility("left")).toBe("hide");
  });

  it("the mute checkbox writes through to hand state", () => {
    const { handState } = renderBar();
    fireEvent.click(screen.getByRole("checkbox", { name: /mute left/i }));
    expect(handState.isMuted("left")).toBe(true);
  });
});
