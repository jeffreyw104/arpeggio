import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ControlPanel } from "./ControlPanel";
import { Transport } from "../transport/transport";
import { HandState } from "./hands";
import { FalldownRenderer } from "../falldown/renderer";
import type { Score } from "../model/score";
import type { AudioEngine } from "../audio/engine";

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

function setup(audioEngine: AudioEngine | null = null) {
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
      audioEngine={audioEngine}
    />,
  );
  return { transport, handState, falldown };
}

describe("ControlPanel", () => {
  it("changes the tempo via the BPM input", () => {
    const { transport } = setup();
    const bpm = screen.getByLabelText(/tempo \(bpm\)/i);
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

  it("sets the metronome subdivision on the audio engine", () => {
    const fakeEngine = {
      metronome: { enabled: false, subdivision: 1, pulse: 0 },
    } as unknown as AudioEngine;
    setup(fakeEngine);
    fireEvent.change(screen.getByLabelText(/subdivision/i), {
      target: { value: "4" },
    });
    expect(fakeEngine.metronome.subdivision).toBe(4);
  });

  it("toggles the accent-downbeat option on the audio engine", () => {
    const fakeEngine = {
      metronome: {
        enabled: false,
        subdivision: 1,
        pulse: 0,
        accentDownbeat: false,
      },
    } as unknown as AudioEngine;
    setup(fakeEngine);
    fireEvent.click(screen.getByLabelText(/accent downbeat/i));
    expect(fakeEngine.metronome.accentDownbeat).toBe(true);
  });

  it("sets the time signature via the single N/D text box", () => {
    const { falldown } = setup();
    fireEvent.change(screen.getByLabelText(/time signature/i), {
      target: { value: "6/4" },
    });
    expect(falldown.beatMeter).toEqual({ numerator: 6, denominator: 4 });
    // An invalid value leaves the time signature unchanged.
    fireEvent.change(screen.getByLabelText(/time signature/i), {
      target: { value: "abc" },
    });
    expect(falldown.beatMeter).toEqual({ numerator: 6, denominator: 4 });
  });

  it("flattens tempo changes on the transport", () => {
    const { transport } = setup();
    fireEvent.click(screen.getByLabelText(/flatten tempo/i));
    expect(transport.tempoMode).toBe("flatten");
  });

  it("renders the metronome pulse indicator", () => {
    setup();
    expect(document.querySelector(".metronome-pulse")).toBeInTheDocument();
  });
});
