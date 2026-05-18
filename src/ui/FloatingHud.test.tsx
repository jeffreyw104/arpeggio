import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FloatingHud } from "./FloatingHud";
import { Transport } from "../transport/transport";
import type { Score } from "../model/score";

const score = {
  source: "midi",
  notes: [],
  measures: [{ index: 0, start: 0, end: 4, numerator: 4, denominator: 4 }],
  pedalEvents: [],
  timeSignatures: [{ start: 0, numerator: 4, denominator: 4 }],
  tempoMap: [{ start: 0, bpm: 120 }],
  durationSeconds: 4,
  musicXml: "",
  qualityWarning: null,
} satisfies Score;

function renderHud(overrides: Partial<Parameters<typeof FloatingHud>[0]> = {}) {
  const transport = new Transport(score);
  const props = {
    transport,
    viewMode: "both" as const,
    onViewModeChange: vi.fn(),
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onExit: vi.fn(),
    settingsOpen: false,
    onToggleSettings: vi.fn(),
    ...overrides,
  };
  render(<FloatingHud {...props} />);
  return { transport, props };
}

describe("FloatingHud", () => {
  it("toggles play/pause on the transport clock", () => {
    const { transport } = renderHud();
    fireEvent.click(screen.getByRole("button", { name: /play/i }));
    expect(transport.clock.playing).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /pause/i }));
    expect(transport.clock.playing).toBe(false);
  });

  it("seeks the clock when the slider moves", () => {
    const { transport } = renderHud();
    fireEvent.change(screen.getByRole("slider"), { target: { value: "2" } });
    expect(transport.clock.position).toBeCloseTo(2, 3);
  });

  it("calls onViewModeChange when a view-mode button is clicked", () => {
    const { props } = renderHud();
    fireEvent.click(screen.getByRole("button", { name: /score only/i }));
    expect(props.onViewModeChange).toHaveBeenCalledWith("score");
  });

  it("calls the zoom and exit callbacks", () => {
    const { props } = renderHud();
    fireEvent.click(screen.getByRole("button", { name: /zoom in/i }));
    fireEvent.click(screen.getByRole("button", { name: /zoom out/i }));
    fireEvent.click(screen.getByRole("button", { name: /library/i }));
    expect(props.onZoomIn).toHaveBeenCalled();
    expect(props.onZoomOut).toHaveBeenCalled();
    expect(props.onExit).toHaveBeenCalled();
  });

  it("toggles the settings drawer", () => {
    const { props } = renderHud();
    fireEvent.click(screen.getByRole("button", { name: /settings/i }));
    expect(props.onToggleSettings).toHaveBeenCalled();
  });
});
