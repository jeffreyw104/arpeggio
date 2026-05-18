import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { FloatingHud } from "./FloatingHud";
import { Transport } from "../transport/transport";
import { HandState } from "../practice/hands";
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
  const handState = new HandState();
  const audioEngine = {
    metronome: {
      enabled: false,
      accentDownbeat: false,
      subdivision: 1,
      pulse: 0,
      timeSignature: { numerator: 4, denominator: 4 },
    },
  } as unknown as AudioEngine;
  const props = {
    transport,
    handState,
    settingsOpen: false,
    audioEngine,
    falldown: null as FalldownRenderer | null,
    mode: "play" as const,
    collapsed: false,
    onCollapsedChange: vi.fn(),
    ...overrides,
  };
  render(<FloatingHud {...props} />);
  return { transport, handState, props };
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

  it("Play mode shows the speed stepper and no metronome", () => {
    renderHud({ mode: "play" });
    expect(
      screen.getByRole("button", { name: /increase speed/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /metronome/i })).toBeNull();
  });

  it("the Play-mode speed stepper changes the transport BPM", () => {
    const { transport } = renderHud({ mode: "play" });
    const ref = transport.referenceBpm;
    fireEvent.click(screen.getByRole("button", { name: /increase speed/i }));
    expect(transport.bpm).toBeGreaterThan(ref);
  });

  it("Practice mode expanded shows the practice controls row", () => {
    renderHud({ mode: "practice", collapsed: false });
    expect(
      screen.getByRole("button", { name: /set start/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /metronome/i }),
    ).toBeInTheDocument();
  });

  it("Practice mode collapsed hides the practice controls row", () => {
    renderHud({ mode: "practice", collapsed: true });
    expect(screen.queryByRole("button", { name: /set start/i })).toBeNull();
  });

  it("the collapse toggle reports the new state", () => {
    const onCollapsedChange = vi.fn();
    renderHud({ mode: "practice", collapsed: false, onCollapsedChange });
    fireEvent.click(screen.getByRole("button", { name: /collapse|expand/i }));
    expect(onCollapsedChange).toHaveBeenCalledWith(true);
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

  it("does not fade in Practice mode while expanded", () => {
    vi.useFakeTimers();
    try {
      renderHud({ mode: "practice", collapsed: false });
      const hud = document.querySelector(".floating-hud") as HTMLElement;
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(hud.className).not.toContain("faded");
    } finally {
      vi.useRealTimers();
    }
  });

  it("stays in the document after a window resize event", () => {
    renderHud();
    const hud = document.querySelector(".floating-hud") as HTMLElement;
    fireEvent(window, new Event("resize"));
    expect(hud).toBeInTheDocument();
  });
});
