import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PlayTools } from "./PlayTools";
import { Transport } from "../transport/transport";
import { HandState } from "../practice/hands";
import type { Score } from "../model/score";
import type { AudioEngine } from "../audio/engine";

const score = {
  source: "midi",
  notes: [],
  measures: [
    { index: 0, start: 0, end: 2, numerator: 4, denominator: 4 },
    { index: 1, start: 2, end: 4, numerator: 4, denominator: 4 },
    { index: 2, start: 4, end: 6, numerator: 4, denominator: 4 },
  ],
  pedalEvents: [],
  timeSignatures: [{ start: 0, numerator: 4, denominator: 4 }],
  tempoMap: [{ start: 0, bpm: 120 }],
  durationSeconds: 6,
  musicXml: "",
  qualityWarning: null,
} satisfies Score;

function renderTools(
  overrides: Partial<Parameters<typeof PlayTools>[0]> = {},
) {
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
    setVolume: vi.fn(),
  } as unknown as AudioEngine;
  const props = {
    transport,
    handState,
    audioEngine,
    falldown: null,
    countInBars: 0,
    onCountInBarsChange: vi.fn(),
    ...overrides,
  };
  render(<PlayTools {...props} />);
  return { transport, handState, props };
}

/** Click a collapsible section chip to toggle it. */
function toggle(label: string): void {
  fireEvent.click(screen.getByRole("button", { name: label }));
}

const SECTION_LABELS = [
  "Loop",
  "Tempo",
  "Hands",
  "Metronome",
  "General settings",
];

describe("PlayTools", () => {
  it("renders the five section chips", () => {
    renderTools();
    for (const label of SECTION_LABELS) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("every section starts open", () => {
    renderTools();
    for (const label of SECTION_LABELS) {
      expect(screen.getByRole("button", { name: label })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
    }
  });

  it("a chip toggles its section open and closed", () => {
    renderTools();
    const loop = screen.getByRole("button", { name: "Loop" });
    expect(loop).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(loop);
    expect(loop).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(loop);
    expect(loop).toHaveAttribute("aria-expanded", "true");
  });

  it("sections collapse independently of one another", () => {
    renderTools();
    toggle("Loop"); // collapse Loop only
    expect(screen.getByRole("button", { name: "Loop" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByRole("button", { name: "Tempo" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("Loop measure loops the measure under the playhead", () => {
    const { transport } = renderTools();
    transport.clock.seek(5);
    fireEvent.click(screen.getByRole("button", { name: /loop measure/i }));
    expect(transport.clock.loop).toEqual({ start: 4, end: 6 });
  });

  it("Set start then Set end builds a loop range", () => {
    const { transport } = renderTools();
    transport.clock.seek(1); // measure 0
    fireEvent.click(screen.getByRole("button", { name: /set start/i }));
    transport.clock.seek(5); // measure 2
    fireEvent.click(screen.getByRole("button", { name: /set end/i }));
    expect(transport.clock.loop).toEqual({ start: 0, end: 6 });
  });

  it("Clear removes the loop", () => {
    const { transport } = renderTools();
    transport.clock.seek(1);
    fireEvent.click(screen.getByRole("button", { name: /loop measure/i }));
    fireEvent.click(screen.getByRole("button", { name: /clear loop/i }));
    expect(transport.clock.loop).toBeNull();
  });

  it("the speed-up toggle enables gradual speed-up", () => {
    const { transport } = renderTools();
    fireEvent.click(screen.getByRole("checkbox", { name: /speed-up/i }));
    expect(transport.speedUpActive).toBe(true);
  });

  it("the Tempo + button steps the BPM up", () => {
    const { transport } = renderTools();
    fireEvent.click(screen.getByRole("button", { name: /increase tempo/i }));
    expect(transport.bpm).toBe(125);
  });

  it("the exact tempo input sets an arbitrary BPM", () => {
    const { transport } = renderTools();
    fireEvent.change(
      screen.getByRole("spinbutton", { name: /tempo \(bpm\)/i }),
      { target: { value: "137" } },
    );
    expect(transport.bpm).toBe(137);
  });

  it("the flatten checkbox switches the tempo mode", () => {
    const { transport } = renderTools();
    fireEvent.click(screen.getByRole("checkbox", { name: /flatten/i }));
    expect(transport.tempoMode).toBe("flatten");
  });

  it("the hand visibility select writes through to hand state", () => {
    const { handState } = renderTools();
    fireEvent.change(screen.getByLabelText(/left hand/i), {
      target: { value: "hide" },
    });
    expect(handState.visibility("left")).toBe("hide");
  });

  it("the metronome toggle enables the metronome", () => {
    const { props } = renderTools();
    // The Tempo section now also has a "Metronome always on" checkbox; the
    // on/off toggle has aria-label "Metronome" exactly.
    fireEvent.click(screen.getByRole("checkbox", { name: "Metronome" }));
    expect(props.audioEngine!.metronome.enabled).toBe(true);
  });

  it("the count-in selector reports changes through onCountInBarsChange", () => {
    const onCountInBarsChange = vi.fn();
    renderTools({ onCountInBarsChange });
    fireEvent.change(screen.getByLabelText(/count-in/i), {
      target: { value: "2" },
    });
    expect(onCountInBarsChange).toHaveBeenCalledWith(2);
  });

  it("the Volume slider calls audioEngine.setVolume", () => {
    const { props } = renderTools();
    fireEvent.change(screen.getByRole("slider", { name: /volume/i }), {
      target: { value: "0.5" },
    });
    expect(props.audioEngine!.setVolume).toHaveBeenCalledWith(0.5);
  });

  it("the Note zoom slider does not crash with null falldown", () => {
    renderTools({ falldown: null });
    fireEvent.change(screen.getByRole("slider", { name: /note zoom/i }), {
      target: { value: "1.5" },
    });
  });

  it("collapsing a section removes its controls from the DOM", () => {
    renderTools();
    // Loop starts open — its controls are present.
    expect(
      screen.getByRole("button", { name: /loop measure/i }),
    ).toBeInTheDocument();
    // Collapsing the Loop section unmounts the body.
    toggle("Loop");
    expect(
      screen.queryByRole("button", { name: /loop measure/i }),
    ).toBeNull();
  });

  it("enabling Speed-up after typing a Start BPM uses the typed value", () => {
    const { transport } = renderTools();
    fireEvent.change(screen.getByRole("spinbutton", { name: /start bpm/i }), {
      target: { value: "80" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /speed-up/i }));
    expect(transport.speedUpActive).toBe(true);
    expect(
      (
        screen.getByRole("spinbutton", {
          name: /start bpm/i,
        }) as HTMLInputElement
      ).value,
    ).toBe("80");
  });
});
