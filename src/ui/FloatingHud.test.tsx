import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { FloatingHud } from "./FloatingHud";
import { Transport } from "../transport/transport";
import type { Score } from "../model/score";
import type { AudioEngine } from "../audio/engine";
import type { FalldownRenderer } from "../falldown/renderer";

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
  const audioEngine = {
    metronome: { timeSignature: { numerator: 4, denominator: 4 } },
    playClick: vi.fn(),
  } as unknown as AudioEngine;
  const falldown = { zoom: 1 } as unknown as FalldownRenderer;
  const props = {
    transport,
    settingsOpen: false,
    audioEngine,
    falldown,
    mode: "play" as const,
    countInBars: 0,
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
    fireEvent.change(screen.getByRole("slider", { name: /seek/i }), {
      target: { value: "2" },
    });
    expect(transport.clock.position).toBeCloseTo(2, 3);
  });

  it("no speed stepper is shown in either mode", () => {
    renderHud({ mode: "play" });
    expect(
      screen.queryByRole("button", { name: /increase speed/i }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /decrease speed/i }),
    ).toBeNull();
  });

  it("no metronome control is shown in the HUD", () => {
    renderHud({ mode: "practice" });
    expect(screen.queryByRole("checkbox", { name: /metronome/i })).toBeNull();
  });

  it("moves when dragged by its background", () => {
    renderHud();
    const hud = document.querySelector(".floating-hud") as HTMLElement;
    fireEvent.pointerDown(hud, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 150, clientY: 130 });
    fireEvent.pointerUp(window);
    expect(hud.style.left).toBe("50px");
    expect(hud.style.top).toBe("30px");
  });

  it("does not start a drag from a control", () => {
    renderHud();
    const hud = document.querySelector(".floating-hud") as HTMLElement;
    const before = hud.style.left;
    fireEvent.pointerDown(screen.getByRole("slider", { name: /seek/i }), {
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(window, { clientX: 200, clientY: 200 });
    fireEvent.pointerUp(window);
    expect(hud.style.left).toBe(before);
  });

  it("count-in: play button disabled during count-in then clock plays after", () => {
    vi.useFakeTimers();
    try {
      const { transport } = renderHud({ mode: "practice", countInBars: 1 });
      fireEvent.click(screen.getByRole("button", { name: /play/i }));
      expect(screen.getByRole("button", { name: /play/i })).toBeDisabled();
      expect(transport.clock.playing).toBe(false);
      act(() => {
        vi.advanceTimersByTime(2600);
      });
      expect(transport.clock.playing).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("fades after the idle timeout and restores on pointer movement", () => {
    vi.useFakeTimers();
    try {
      renderHud();
      const hud = document.querySelector(".floating-hud") as HTMLElement;
      expect(hud.className).not.toContain("faded");
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(hud.className).toContain("faded");
      fireEvent.pointerMove(window, { clientX: 5, clientY: 5 });
      expect(hud.className).not.toContain("faded");
    } finally {
      vi.useRealTimers();
    }
  });

  it("never fades while the settings drawer is open", () => {
    vi.useFakeTimers();
    try {
      renderHud({ settingsOpen: true });
      const hud = document.querySelector(".floating-hud") as HTMLElement;
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(hud.className).not.toContain("faded");
    } finally {
      vi.useRealTimers();
    }
  });
});
