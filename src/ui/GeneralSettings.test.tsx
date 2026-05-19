import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GeneralSettings } from "./GeneralSettings";
import type { FalldownRenderer } from "../falldown/renderer";
import type { AudioEngine } from "../audio/engine";

function renderSettings() {
  const falldown = {
    showLabels: false,
    showBeatGrid: true,
    full88: false,
    zoom: 1,
  } as unknown as FalldownRenderer;
  const audioEngine = { setVolume: vi.fn() } as unknown as AudioEngine;
  render(<GeneralSettings falldown={falldown} audioEngine={audioEngine} />);
  return { falldown, audioEngine };
}

describe("GeneralSettings", () => {
  it("the Note labels toggle writes through to the renderer", () => {
    const { falldown } = renderSettings();
    fireEvent.click(screen.getByLabelText(/note labels/i));
    expect(falldown.showLabels).toBe(true);
  });

  it("the Beat grid toggle writes through to the renderer", () => {
    const { falldown } = renderSettings();
    fireEvent.click(screen.getByLabelText(/beat grid/i));
    expect(falldown.showBeatGrid).toBe(false);
  });

  it("the Full 88 keys toggle writes through to the renderer", () => {
    const { falldown } = renderSettings();
    fireEvent.click(screen.getByLabelText(/full 88/i));
    expect(falldown.full88).toBe(true);
  });

  it("the Volume slider calls audioEngine.setVolume", () => {
    const { audioEngine } = renderSettings();
    fireEvent.change(screen.getByRole("slider", { name: /volume/i }), {
      target: { value: "0.4" },
    });
    expect(audioEngine.setVolume).toHaveBeenCalledWith(0.4);
  });

  it("the Note zoom slider writes through to the renderer", () => {
    const { falldown } = renderSettings();
    fireEvent.change(screen.getByRole("slider", { name: /note zoom/i }), {
      target: { value: "1.5" },
    });
    expect(falldown.zoom).toBe(1.5);
  });

  it("does not crash with a null falldown or audio engine", () => {
    render(<GeneralSettings falldown={null} audioEngine={null} />);
    fireEvent.click(screen.getByLabelText(/note labels/i));
    fireEvent.change(screen.getByRole("slider", { name: /volume/i }), {
      target: { value: "0.5" },
    });
  });
});
