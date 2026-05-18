import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MetronomeMenu } from "./MetronomeMenu";
import type { FalldownRenderer } from "../falldown/renderer";
import type { AudioEngine } from "../audio/engine";

function fakes() {
  const falldown = {
    beatMeter: { numerator: 4, denominator: 4 },
  } as unknown as FalldownRenderer;
  const setTimeSignature = vi.fn();
  const audioEngine = {
    metronome: { accentDownbeat: false, subdivision: 1, setTimeSignature },
  } as unknown as AudioEngine;
  return { falldown, audioEngine, setTimeSignature };
}

function renderMenu(
  overrides: Partial<{
    falldown: FalldownRenderer;
    audioEngine: AudioEngine;
    countInBars: number;
    onCountInBarsChange: (bars: number) => void;
  }> = {},
) {
  const { falldown, audioEngine } = fakes();
  return render(
    <MetronomeMenu
      falldown={overrides.falldown ?? falldown}
      audioEngine={overrides.audioEngine ?? audioEngine}
      countInBars={overrides.countInBars ?? 0}
      onCountInBarsChange={overrides.onCountInBarsChange ?? vi.fn()}
    />,
  );
}

describe("MetronomeMenu", () => {
  it("initialises the time signature from the renderer's beat meter", () => {
    const { audioEngine } = fakes();
    const falldown = {
      beatMeter: { numerator: 3, denominator: 4 },
    } as unknown as FalldownRenderer;
    render(
      <MetronomeMenu
        falldown={falldown}
        audioEngine={audioEngine}
        countInBars={0}
        onCountInBarsChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/time signature/i)).toHaveValue("3/4");
  });

  it("writes a new time signature to the renderer and audio engine", () => {
    const { falldown, audioEngine, setTimeSignature } = fakes();
    render(
      <MetronomeMenu
        falldown={falldown}
        audioEngine={audioEngine}
        countInBars={0}
        onCountInBarsChange={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText(/time signature/i), {
      target: { value: "6/8" },
    });
    expect(falldown.beatMeter).toEqual({ numerator: 6, denominator: 8 });
    expect(setTimeSignature).toHaveBeenCalledWith(6, 8);
  });

  it("leaves the time signature unchanged for an invalid value", () => {
    const { falldown, audioEngine, setTimeSignature } = fakes();
    render(
      <MetronomeMenu
        falldown={falldown}
        audioEngine={audioEngine}
        countInBars={0}
        onCountInBarsChange={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText(/time signature/i), {
      target: { value: "abc" },
    });
    expect(falldown.beatMeter).toEqual({ numerator: 4, denominator: 4 });
    expect(setTimeSignature).not.toHaveBeenCalled();
  });

  it("toggles the downbeat accent on the audio engine", () => {
    const { falldown, audioEngine } = fakes();
    render(
      <MetronomeMenu
        falldown={falldown}
        audioEngine={audioEngine}
        countInBars={0}
        onCountInBarsChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText(/accent/i));
    expect(audioEngine.metronome.accentDownbeat).toBe(true);
  });

  it("sets the subdivision on the audio engine", () => {
    const { falldown, audioEngine } = fakes();
    render(
      <MetronomeMenu
        falldown={falldown}
        audioEngine={audioEngine}
        countInBars={0}
        onCountInBarsChange={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText(/subdivision/i), {
      target: { value: "4" },
    });
    expect(audioEngine.metronome.subdivision).toBe(4);
  });

  it("renders the count-in selector and reports changes in bars", () => {
    const onCountInBarsChange = vi.fn();
    renderMenu({ countInBars: 0, onCountInBarsChange });
    const select = screen.getByLabelText(/count-in/i);
    expect(select).toHaveValue("0");
    fireEvent.change(select, { target: { value: "2" } });
    expect(onCountInBarsChange).toHaveBeenCalledWith(2);
  });
});
