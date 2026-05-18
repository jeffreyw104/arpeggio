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
    metronome: {
      enabled: false,
      accentDownbeat: false,
      subdivision: 1,
      pulse: 0,
    },
  } as unknown as AudioEngine;
  const props = {
    transport,
    settingsOpen: false,
    audioEngine,
    falldown: null,
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

  it("does not render the relocated nav controls", () => {
    renderHud();
    expect(screen.queryByRole("button", { name: /library/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /score only/i })).toBeNull();
    expect(screen.queryByRole("button", { name: "Settings" })).toBeNull();
  });

  it("toggles the metronome on the audio engine", () => {
    const { props } = renderHud();
    fireEvent.click(screen.getByRole("checkbox", { name: /metronome/i }));
    expect(props.audioEngine!.metronome.enabled).toBe(true);
  });

  it("enables the falldown beat pulse with the metronome toggle", () => {
    const falldown = { showBeatPulse: false } as unknown as FalldownRenderer;
    renderHud({ falldown });
    fireEvent.click(screen.getByRole("checkbox", { name: /metronome/i }));
    expect(falldown.showBeatPulse).toBe(true);
  });

  it("opens the metronome settings dropdown", () => {
    renderHud();
    expect(screen.queryByLabelText(/time signature/i)).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: /metronome settings/i }),
    );
    expect(screen.getByLabelText(/time signature/i)).toBeInTheDocument();
  });

  it("moves when dragged by its background", () => {
    renderHud();
    const hud = document.querySelector(".floating-hud") as HTMLElement;
    fireEvent.pointerDown(hud, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 150, clientY: 130 });
    fireEvent.pointerUp(window);
    // The HUD shifted by the pointer delta (+50, +30).
    // In jsdom getBoundingClientRect() returns zeros, so dx=100,dy=100 and
    // final pos = {x: 150-100=50, y: 130-100=30} (no clamping: parent has no size).
    expect(hud.style.left).toBe("50px");
    expect(hud.style.top).toBe("30px");
  });

  it("does not start a drag from a control", () => {
    renderHud();
    const hud = document.querySelector(".floating-hud") as HTMLElement;
    const before = hud.style.left;
    fireEvent.pointerDown(screen.getByRole("slider"), {
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(window, { clientX: 200, clientY: 200 });
    fireEvent.pointerUp(window);
    expect(hud.style.left).toBe(before);
  });

  it("fades after the idle timeout and restores on pointer movement", () => {
    vi.useFakeTimers();
    try {
      renderHud();
      const hud = document.querySelector(".floating-hud") as HTMLElement;
      expect(hud.className).not.toContain("faded");
      act(() => { vi.advanceTimersByTime(3000); }); // past the 2500ms idle-fade threshold
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
      act(() => { vi.advanceTimersByTime(3000); }); // past the 2500ms idle-fade threshold
      expect(hud.className).not.toContain("faded");
    } finally {
      vi.useRealTimers();
    }
  });

  it("stays in the document after a window resize event", () => {
    renderHud();
    const hud = document.querySelector(".floating-hud") as HTMLElement;
    // jsdom has zero-size parents so the clamp is a no-op; this confirms the
    // resize handler does not throw and the component remains mounted.
    fireEvent(window, new Event("resize"));
    expect(hud).toBeInTheDocument();
  });
});
