import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MetronomeMenu } from "./MetronomeMenu";
import type { Transport } from "../transport/transport";
import type { FalldownRenderer } from "../falldown/renderer";
import type { AudioEngine } from "../audio/engine";

function fakes() {
  const setBpm = vi.fn();
  const transport = { bpm: 120, setBpm } as unknown as Transport;
  const falldown = {
    beatMeter: { numerator: 4, denominator: 4 },
  } as unknown as FalldownRenderer;
  const setTimeSignature = vi.fn();
  const audioEngine = {
    metronome: { accentDownbeat: false, subdivision: 1, setTimeSignature },
  } as unknown as AudioEngine;
  return { transport, setBpm, falldown, audioEngine, setTimeSignature };
}

describe("MetronomeMenu", () => {
  it("initialises the tempo from the transport", () => {
    const { falldown, audioEngine } = fakes();
    const transport = { bpm: 90, setBpm: vi.fn() } as unknown as Transport;
    render(
      <MetronomeMenu
        transport={transport}
        falldown={falldown}
        audioEngine={audioEngine}
      />,
    );
    expect(screen.getByLabelText(/tempo/i)).toHaveValue(90);
  });

  it("changes the tempo on the transport", () => {
    const { transport, falldown, audioEngine, setBpm } = fakes();
    render(
      <MetronomeMenu
        transport={transport}
        falldown={falldown}
        audioEngine={audioEngine}
      />,
    );
    fireEvent.change(screen.getByLabelText(/tempo/i), {
      target: { value: "90" },
    });
    expect(setBpm).toHaveBeenCalledWith(90);
  });

  it("initialises the time signature from the renderer's beat meter", () => {
    const { transport, audioEngine } = fakes();
    const falldown = {
      beatMeter: { numerator: 3, denominator: 4 },
    } as unknown as FalldownRenderer;
    render(
      <MetronomeMenu
        transport={transport}
        falldown={falldown}
        audioEngine={audioEngine}
      />,
    );
    expect(screen.getByLabelText(/time signature/i)).toHaveValue("3/4");
  });

  it("writes a new time signature to the renderer and audio engine", () => {
    const { transport, falldown, audioEngine, setTimeSignature } = fakes();
    render(
      <MetronomeMenu
        transport={transport}
        falldown={falldown}
        audioEngine={audioEngine}
      />,
    );
    fireEvent.change(screen.getByLabelText(/time signature/i), {
      target: { value: "6/8" },
    });
    expect(falldown.beatMeter).toEqual({ numerator: 6, denominator: 8 });
    expect(setTimeSignature).toHaveBeenCalledWith(6, 8);
  });

  it("leaves the time signature unchanged for an invalid value", () => {
    const { transport, falldown, audioEngine, setTimeSignature } = fakes();
    render(
      <MetronomeMenu
        transport={transport}
        falldown={falldown}
        audioEngine={audioEngine}
      />,
    );
    fireEvent.change(screen.getByLabelText(/time signature/i), {
      target: { value: "abc" },
    });
    expect(falldown.beatMeter).toEqual({ numerator: 4, denominator: 4 });
    expect(setTimeSignature).not.toHaveBeenCalled();
  });

  it("toggles the downbeat accent on the audio engine", () => {
    const { transport, falldown, audioEngine } = fakes();
    render(
      <MetronomeMenu
        transport={transport}
        falldown={falldown}
        audioEngine={audioEngine}
      />,
    );
    fireEvent.click(screen.getByLabelText(/accent/i));
    expect(audioEngine.metronome.accentDownbeat).toBe(true);
  });

  it("sets the subdivision on the audio engine", () => {
    const { transport, falldown, audioEngine } = fakes();
    render(
      <MetronomeMenu
        transport={transport}
        falldown={falldown}
        audioEngine={audioEngine}
      />,
    );
    fireEvent.change(screen.getByLabelText(/subdivision/i), {
      target: { value: "4" },
    });
    expect(audioEngine.metronome.subdivision).toBe(4);
  });
});
