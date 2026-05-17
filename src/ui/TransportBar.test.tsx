import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TransportBar } from "./TransportBar";
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

describe("TransportBar", () => {
  it("toggles play/pause on the transport clock", () => {
    const transport = new Transport(score);
    render(
      <TransportBar
        transport={transport}
        viewMode="both"
        onViewModeChange={() => {}}
      />,
    );
    const btn = screen.getByRole("button", { name: /play/i });
    fireEvent.click(btn);
    expect(transport.clock.playing).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /pause/i }));
    expect(transport.clock.playing).toBe(false);
  });

  it("seeks the clock when the slider moves", () => {
    const transport = new Transport(score);
    render(
      <TransportBar
        transport={transport}
        viewMode="both"
        onViewModeChange={() => {}}
      />,
    );
    const slider = screen.getByRole("slider");
    fireEvent.change(slider, { target: { value: "2" } });
    expect(transport.clock.position).toBeCloseTo(2, 3);
  });

  it("calls onViewModeChange when a view-mode button is clicked", () => {
    const transport = new Transport(score);
    const onViewModeChange = vi.fn();
    render(
      <TransportBar
        transport={transport}
        viewMode="both"
        onViewModeChange={onViewModeChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /score only/i }));
    expect(onViewModeChange).toHaveBeenCalledWith("score");
  });
});
