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
      timeSignature: { numerator: 4, denominator: 4 },
    },
    playClick: vi.fn(),
  } as unknown as AudioEngine;
  const props = {
    transport,
    settingsOpen: false,
    audioEngine,
    falldown: null as FalldownRenderer | null,
    mode: "play" as const,
    collapsed: false,
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

  it("Practice mode shows the metronome and no speed stepper", () => {
    renderHud({ mode: "practice" });
    expect(
      screen.getByRole("checkbox", { name: /metronome/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /increase speed/i }),
    ).toBeNull();
  });

  it("the metronome toggle enables the metronome", () => {
    const { props } = renderHud({ mode: "practice" });
    fireEvent.click(screen.getByRole("checkbox", { name: /metronome/i }));
    expect(props.audioEngine!.metronome.enabled).toBe(true);
  });

  it("Play mode is positioned top-left, Practice top-center", () => {
    const { rerender } = render(
      <FloatingHud
        transport={new Transport(score)}
        settingsOpen={false}
        audioEngine={null}
        falldown={null}
        mode="play"
        collapsed={false}
      />,
    );
    expect(document.querySelector(".floating-hud")?.className).toContain(
      "floating-hud--play",
    );
    rerender(
      <FloatingHud
        transport={new Transport(score)}
        settingsOpen={false}
        audioEngine={null}
        falldown={null}
        mode="practice"
        collapsed={false}
      />,
    );
    expect(document.querySelector(".floating-hud")?.className).toContain(
      "floating-hud--practice",
    );
  });

  it("raises the Practice HUD when the extended bar is collapsed", () => {
    renderHud({ mode: "practice", collapsed: true });
    expect(document.querySelector(".floating-hud")?.className).toContain(
      "floating-hud--raised",
    );
  });

  it("count-in: play button disabled during count-in then clock plays after", () => {
    vi.useFakeTimers();
    try {
      const { transport } = renderHud({ mode: "practice" });
      fireEvent.change(screen.getByLabelText(/count-in/i), {
        target: { value: "1" },
      });
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
