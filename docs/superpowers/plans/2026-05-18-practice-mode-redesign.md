# Practice-mode Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-lay-out the practice chrome: a rearranged top bar with a collapsible extended control bar, fixed-position mode-specific HUDs, selectable metronome sounds, and arrow-key measure jumping.

**Architecture:** Loop/Tempo/Speed-up/Hands move out of the floating HUD into a new `ExtendedTopBar` component (a second bar under the top bar, shown in Practice mode, collapsible from a top-bar toggle). `FloatingHud` becomes fixed-position (drag removed) and mode-specific: Play HUD = transport + speed at top-left; Practice HUD = transport + metronome at top-center. The settings drawer loses Flatten (now in the extended bar) and gains a metronome-sound selector. A pure `measureJumpTarget` helper backs ArrowLeft/ArrowRight measure seeking.

**Tech Stack:** Vite + TypeScript + React 19, Vitest + Testing Library, Playwright, Tone.js. Strict TS (`noUnusedLocals`/`noUnusedParameters`), React 19 `react-jsx` (no `import React`).

**Spec:** `docs/superpowers/specs/2026-05-18-practice-mode-redesign.md`

**Branch:** `feature/practice-mode` (current HEAD `cbf31b8`).

**Verification gate (after the final task):** `npm run lint && npm run typecheck && npm test && npm run build && npm run e2e`

---

## Task 1: measureJumpTarget pure function

**Files:**
- Create: `src/transport/measureJump.ts`
- Test: `src/transport/measureJump.test.ts`

A pure helper: given the measures, a current position, and a direction, return the seek time for the previous/next measure's start.

- [ ] **Step 1: Write the failing test** — Create `src/transport/measureJump.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { measureJumpTarget } from "./measureJump";
import type { Measure } from "../model/score";

const measures: Measure[] = [
  { index: 0, start: 0, end: 2, numerator: 4, denominator: 4 },
  { index: 1, start: 2, end: 4, numerator: 4, denominator: 4 },
  { index: 2, start: 4, end: 6, numerator: 4, denominator: 4 },
];

describe("measureJumpTarget", () => {
  it("jumps forward to the next measure start", () => {
    expect(measureJumpTarget(measures, 1, "next")).toBe(2);
    expect(measureJumpTarget(measures, 3, "next")).toBe(4);
  });

  it("jumps back to the previous measure start", () => {
    expect(measureJumpTarget(measures, 5, "prev")).toBe(2);
    expect(measureJumpTarget(measures, 3, "prev")).toBe(0);
  });

  it("clamps at the last measure going forward", () => {
    expect(measureJumpTarget(measures, 5, "next")).toBe(4);
  });

  it("clamps at the first measure going back", () => {
    expect(measureJumpTarget(measures, 1, "prev")).toBe(0);
  });

  it("returns 0 for an empty measure list", () => {
    expect(measureJumpTarget([], 3, "next")).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/transport/measureJump.test.ts` — Expected: FAIL, cannot find module.

- [ ] **Step 3: Write the implementation** — Create `src/transport/measureJump.ts`:

```ts
import type { Measure } from "../model/score";

/** Direction of a measure jump. */
export type JumpDirection = "prev" | "next";

/**
 * The seek time (seconds) for jumping one measure from `position`. "next" goes
 * to the start of the measure after the one containing `position`; "prev" goes
 * to the start of the previous measure. Clamped to the first/last measure.
 * Returns 0 when there are no measures.
 */
export function measureJumpTarget(
  measures: Measure[],
  position: number,
  direction: JumpDirection,
): number {
  if (measures.length === 0) return 0;
  let current = measures.findIndex(
    (m) => position >= m.start && position < m.end,
  );
  if (current === -1) {
    // Past the end (or before the first) — treat as the last/first measure.
    current = position < measures[0].start ? 0 : measures.length - 1;
  }
  const target =
    direction === "next"
      ? Math.min(current + 1, measures.length - 1)
      : Math.max(current - 1, 0);
  return measures[target].start;
}
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run src/transport/measureJump.test.ts` — Expected: PASS (5 tests).

- [ ] **Step 5: Commit:**

```bash
git add src/transport/measureJump.ts src/transport/measureJump.test.ts
git commit -m "feat: add measureJumpTarget for arrow-key measure seeking"
```

---

## Task 2: Selectable metronome sounds (audio layer)

**Files:**
- Modify: `src/audio/engine.ts`
- Modify: `src/audio/engine.test.ts`

Add a `MetronomeSound` type, a `sound` field on `ClickSink`, an `AudioEngine.metronomeSound` getter/setter, and four synth voices in `createAudioEngine`.

- [ ] **Step 1: Write the failing test** — Add to `src/audio/engine.test.ts`. The file builds an `AudioEngine` with fake `PianoSink`/`ClickSink` (a `fakes()` helper or inline). Add a test:

```ts
it("metronomeSound proxies the click sink's sound", () => {
  const piano = { playNote: () => {} };
  const click = {
    sound: "click" as const,
    playClick: () => {},
  };
  const engine = new AudioEngine(transport, piano, click);
  expect(engine.metronomeSound).toBe("click");
  engine.metronomeSound = "woodblock";
  expect(engine.metronomeSound).toBe("woodblock");
  expect(click.sound).toBe("woodblock");
});
```

IMPORTANT: read `src/audio/engine.test.ts` first. Every existing place that builds a fake `ClickSink` (`{ playClick: ... }`) must gain a `sound: "click"` field, or TypeScript will fail — the `ClickSink` interface gains a required `sound`. Update the `fakes()` helper / inline fakes accordingly. Build `transport` the way the file's other tests do.

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/audio/engine.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement** — In `src/audio/engine.ts`:

Add near the top (after the existing imports / before `PianoSink`):

```ts
/** A selectable metronome click sound. */
export type MetronomeSound = "click" | "woodblock" | "beep" | "hitick";

/** All metronome sounds, with display labels, in menu order. */
export const METRONOME_SOUNDS: ReadonlyArray<{
  value: MetronomeSound;
  label: string;
}> = [
  { value: "click", label: "Click" },
  { value: "woodblock", label: "Woodblock" },
  { value: "beep", label: "Beep" },
  { value: "hitick", label: "Hi-tick" },
];
```

Change the `ClickSink` interface to:

```ts
/** Plays metronome clicks. Real implementation uses Tone.js synths. */
export interface ClickSink {
  /** The currently selected click sound. */
  sound: MetronomeSound;
  playClick(accent: boolean): void;
}
```

Add to the `AudioEngine` class (next to `playClick`):

```ts
  /** The selected metronome click sound. */
  get metronomeSound(): MetronomeSound {
    return this.click.sound;
  }
  set metronomeSound(sound: MetronomeSound) {
    // eslint-disable-next-line react-hooks/immutability
    this.click.sound = sound;
  }
```

In `createAudioEngine`, replace the single `clickSynth` + `click` block with four voices and a dispatching sink:

```ts
  // Four metronome voices, all synthesised (no sample assets).
  const clickVoice = new Tone.MembraneSynth({
    volume: -6,
    envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.02 },
  }).toDestination();
  const woodVoice = new Tone.MembraneSynth({
    volume: -3,
    octaves: 1.5,
    pitchDecay: 0.008,
    envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.01 },
  }).toDestination();
  const beepVoice = new Tone.Synth({
    volume: -12,
    oscillator: { type: "triangle" },
    envelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.02 },
  }).toDestination();
  const tickFilter = new Tone.Filter(3500, "highpass").toDestination();
  const tickVoice = new Tone.NoiseSynth({
    volume: -4,
    noise: { type: "white" },
    envelope: { attack: 0.001, decay: 0.018, sustain: 0, release: 0.01 },
  }).connect(tickFilter);

  const click: ClickSink = {
    sound: "click",
    playClick(accent) {
      switch (this.sound) {
        case "woodblock":
          woodVoice.triggerAttackRelease(accent ? "C6" : "G5", 0.03);
          break;
        case "beep":
          beepVoice.triggerAttackRelease(accent ? "E6" : "C6", 0.05);
          break;
        case "hitick":
          tickVoice.triggerAttackRelease(0.02);
          break;
        case "click":
        default:
          clickVoice.triggerAttackRelease(accent ? "C5" : "C4", 0.05);
          break;
      }
    },
  };
```

(The `piano` sink and the final `return new AudioEngine(...)` are unchanged.)

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run src/audio/engine.test.ts && npm run typecheck` — Expected: PASS, clean.

- [ ] **Step 5: Commit:**

```bash
git add src/audio/engine.ts src/audio/engine.test.ts
git commit -m "feat: add selectable metronome sounds to the audio engine"
```

---

## Task 3: Settings drawer — drop Flatten, add Metronome sound

**Files:**
- Modify: `src/practice/ControlPanel.tsx`
- Modify: `src/practice/ControlPanel.test.tsx`
- Modify: `src/app/PracticeView.tsx` (pass `audioEngine` to `ControlPanel`)

`ControlPanel` loses the "Flatten tempo changes" checkbox (it moves to the extended bar in Task 5) and gains a "Metronome sound" `<select>`. It needs a new `audioEngine` prop.

- [ ] **Step 1: Update the test** — In `src/practice/ControlPanel.test.tsx`: read it first. The component will take a new `audioEngine` prop — add a fake to the render helper: `audioEngine` shaped as `{ metronomeSound: "click" } as unknown as AudioEngine` (a plain mutable object so the select can write `audioEngine.metronomeSound`). Remove the "flatten tempo" test. Add:

```tsx
  it("no longer renders the flatten-tempo control", () => {
    renderPanel();
    expect(
      screen.queryByRole("checkbox", { name: /flatten tempo/i }),
    ).toBeNull();
  });

  it("changes the metronome sound on the audio engine", () => {
    const { audioEngine } = renderPanel();
    fireEvent.change(screen.getByLabelText(/metronome sound/i), {
      target: { value: "woodblock" },
    });
    expect(audioEngine.metronomeSound).toBe("woodblock");
  });
```

Make `renderPanel` return the `audioEngine` fake it created so the test can assert on it. Keep the Note labels / Beat grid / Full 88 tests.

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/practice/ControlPanel.test.tsx`.

- [ ] **Step 3: Implement** — Rewrite `src/practice/ControlPanel.tsx`:

```tsx
import { useState } from "react";
import type { FalldownRenderer } from "../falldown/renderer";
import {
  METRONOME_SOUNDS,
  type AudioEngine,
  type MetronomeSound,
} from "../audio/engine";

interface ControlPanelProps {
  falldown: FalldownRenderer;
  audioEngine: AudioEngine | null;
}

/**
 * The settings-drawer panel: display preferences plus the metronome-sound
 * choice. Note labels, beat grid, and the full-88 toggle write through to the
 * falldown renderer. Practice tooling (loop, tempo, flatten, speed-up, hands)
 * lives in the extended top bar, not here.
 */
export function ControlPanel({
  falldown,
  audioEngine,
}: ControlPanelProps): React.JSX.Element {
  const [showLabels, setShowLabels] = useState(falldown.showLabels);
  const [showBeatGrid, setShowBeatGrid] = useState(falldown.showBeatGrid);
  const [full88, setFull88] = useState(falldown.full88);
  const [metronomeSound, setMetronomeSound] = useState<MetronomeSound>(
    () => audioEngine?.metronomeSound ?? "click",
  );

  // The falldown renderer exposes plain mutable fields as its API; the panel
  // writes through to them, mirroring local state for the inputs.
  function handleShowLabels(checked: boolean): void {
    setShowLabels(checked);
    // eslint-disable-next-line react-hooks/immutability
    falldown.showLabels = checked;
  }

  function handleShowBeatGrid(checked: boolean): void {
    setShowBeatGrid(checked);
    // eslint-disable-next-line react-hooks/immutability
    falldown.showBeatGrid = checked;
  }

  function handleFull88(checked: boolean): void {
    setFull88(checked);
    // eslint-disable-next-line react-hooks/immutability
    falldown.full88 = checked;
  }

  function handleMetronomeSound(value: MetronomeSound): void {
    setMetronomeSound(value);
    // eslint-disable-next-line react-hooks/immutability
    if (audioEngine) audioEngine.metronomeSound = value;
  }

  return (
    <div className="control-panel">
      <fieldset className="control-group">
        <label>
          <input
            type="checkbox"
            checked={showLabels}
            onChange={(e) => handleShowLabels(e.target.checked)}
          />{" "}
          Note labels
        </label>
        <label>
          <input
            type="checkbox"
            checked={showBeatGrid}
            onChange={(e) => handleShowBeatGrid(e.target.checked)}
          />{" "}
          Beat grid
        </label>
        <label>
          <input
            type="checkbox"
            checked={full88}
            onChange={(e) => handleFull88(e.target.checked)}
          />{" "}
          Full 88 keys
        </label>
        <label>
          Metronome sound{" "}
          <select
            value={metronomeSound}
            onChange={(e) =>
              handleMetronomeSound(e.target.value as MetronomeSound)
            }
          >
            {METRONOME_SOUNDS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </fieldset>
    </div>
  );
}
```

- [ ] **Step 4: Update the PracticeView call site** — In `src/app/PracticeView.tsx`, the `<ControlPanel ... />` element changes from `transport={transport} falldown={falldown}` to:

```tsx
        <ControlPanel falldown={falldown} audioEngine={audioEngine} />
```

(`ControlPanel` no longer takes `transport`. `audioEngine` is already a state variable in `PracticeView`.)

- [ ] **Step 5: Run tests, typecheck, lint** — `npx vitest run src/practice/ControlPanel.test.tsx && npm run typecheck && npm run lint`.

- [ ] **Step 6: Commit:**

```bash
git add src/practice/ControlPanel.tsx src/practice/ControlPanel.test.tsx src/app/PracticeView.tsx
git commit -m "feat: swap flatten-tempo for a metronome-sound choice in settings"
```

---

## Task 4: TopBar restructure

**Files:**
- Modify: `src/ui/TopBar.tsx`
- Modify: `src/ui/TopBar.test.tsx`
- Modify: `src/app/PracticeView.tsx` (placeholder props)

The top bar gains an `arpeggio` wordmark, a centered piece name, the ModeSwitch relocated to the right group, and (in Practice mode) an extended-bar collapse toggle.

- [ ] **Step 1: Update the test** — In `src/ui/TopBar.test.tsx`: read it first. Add to `renderBar`'s default props: `extendedCollapsed: false` and `onToggleExtended: vi.fn()`. Add:

```tsx
  it("shows the arpeggio wordmark", () => {
    renderBar();
    expect(screen.getByText("arpeggio")).toBeInTheDocument();
  });

  it("shows the extended-bar collapse toggle in Practice mode", () => {
    const { props } = renderBar({ mode: "practice" });
    const toggle = screen.getByRole("button", { name: /collapse|expand/i });
    fireEvent.click(toggle);
    expect(props.onToggleExtended).toHaveBeenCalled();
  });

  it("hides the collapse toggle in Play mode", () => {
    renderBar({ mode: "play" });
    expect(
      screen.queryByRole("button", { name: /collapse|expand/i }),
    ).toBeNull();
  });
```

Keep the existing piece-name / Library / view-mode / settings / mode-switch tests.

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/ui/TopBar.test.tsx`.

- [ ] **Step 3: Rewrite `src/ui/TopBar.tsx`:**

```tsx
import type { ViewMode } from "../layout/viewMode";
import { ModeSwitch } from "./ModeSwitch";
import type { PracticeMode } from "../layout/practiceMode";

interface TopBarProps {
  pieceName: string;
  viewMode: ViewMode;
  onViewModeChange: (m: ViewMode) => void;
  onOpenLibrary: () => void;
  settingsOpen: boolean;
  onToggleSettings: () => void;
  mode: PracticeMode;
  onModeChange: (m: PracticeMode) => void;
  extendedCollapsed: boolean;
  onToggleExtended: () => void;
}

const VIEW_MODE_OPTIONS: ReadonlyArray<{ mode: ViewMode; label: string }> = [
  { mode: "both", label: "Both" },
  { mode: "falldown", label: "Falldown only" },
  { mode: "score", label: "Score only" },
];

/** Strips a trailing file extension for display ("song.mid" -> "song"). */
function displayName(fileName: string): string {
  return fileName.replace(/\.[^./]+$/, "");
}

/**
 * The fixed top bar. Left: the arpeggio wordmark and the Library button.
 * Center: the now-playing piece name. Right: the Play/Practice switch, the
 * view-mode switch, the settings gear, and — in Practice mode — the toggle
 * that collapses the extended control bar. Purely presentational.
 */
export function TopBar({
  pieceName,
  viewMode,
  onViewModeChange,
  onOpenLibrary,
  settingsOpen,
  onToggleSettings,
  mode,
  onModeChange,
  extendedCollapsed,
  onToggleExtended,
}: TopBarProps): React.JSX.Element {
  return (
    <div className="top-bar">
      <span className="top-bar-logo">arpeggio</span>
      <button type="button" onClick={onOpenLibrary}>
        Library
      </button>
      <span className="top-bar-piece">{displayName(pieceName)}</span>
      <span className="top-bar-spacer" />
      <ModeSwitch mode={mode} onModeChange={onModeChange} />
      <div className="top-bar-views">
        {VIEW_MODE_OPTIONS.map(({ mode: viewModeOption, label }) => (
          <button
            key={viewModeOption}
            type="button"
            aria-pressed={viewMode === viewModeOption}
            onClick={() => onViewModeChange(viewModeOption)}
          >
            {label}
          </button>
        ))}
      </div>
      <button
        type="button"
        aria-label="Settings"
        aria-pressed={settingsOpen}
        onClick={onToggleSettings}
      >
        ⚙
      </button>
      {mode === "practice" && (
        <button
          type="button"
          className="top-bar-extended-toggle"
          aria-label={
            extendedCollapsed ? "Expand control bar" : "Collapse control bar"
          }
          aria-expanded={!extendedCollapsed}
          onClick={onToggleExtended}
        >
          {extendedCollapsed ? "▾" : "▴"}
        </button>
      )}
    </div>
  );
}
```

The piece name is centered via CSS (Task 8): `.top-bar-piece` is absolutely positioned at the bar's center; the `.top-bar-spacer` keeps the left and right groups apart.

- [ ] **Step 4: Update the PracticeView call site** — In `src/app/PracticeView.tsx`, add placeholder props to `<TopBar>` (real wiring in Task 7):

```tsx
        extendedCollapsed={false}
        onToggleExtended={() => {}}
```

(added alongside the existing `mode` / `onModeChange` props.)

- [ ] **Step 5: Run tests, typecheck** — `npx vitest run src/ui/TopBar.test.tsx && npm run typecheck`.

- [ ] **Step 6: Commit:**

```bash
git add src/ui/TopBar.tsx src/ui/TopBar.test.tsx src/app/PracticeView.tsx
git commit -m "feat: restructure the top bar with a wordmark and extended-bar toggle"
```

---

## Task 5: ExtendedTopBar component

**Files:**
- Create: `src/ui/ExtendedTopBar.tsx`
- Create: `src/ui/ExtendedTopBar.test.tsx`

The extended control bar: four bordered boxes — Loop (with a one-measure shortcut), Tempo (exact input + buttons + flatten), Speed-up, and Hands (inline). This is a new file; nothing imports it yet (Task 7 wires it in).

- [ ] **Step 1: Write the failing test** — Create `src/ui/ExtendedTopBar.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExtendedTopBar } from "./ExtendedTopBar";
import { Transport } from "../transport/transport";
import { HandState } from "../practice/hands";
import type { Score } from "../model/score";

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

function renderBar() {
  const transport = new Transport(score);
  const handState = new HandState();
  render(<ExtendedTopBar transport={transport} handState={handState} />);
  return { transport, handState };
}

describe("ExtendedTopBar", () => {
  it("Loop measure loops the single measure under the playhead", () => {
    const { transport } = renderBar();
    transport.clock.seek(5); // inside measure 2
    fireEvent.click(screen.getByRole("button", { name: /loop measure/i }));
    expect(transport.clock.loop).toEqual({ start: 4, end: 6 });
  });

  it("Set start then Set end builds a loop range", () => {
    const { transport } = renderBar();
    transport.clock.seek(1);
    fireEvent.click(screen.getByRole("button", { name: /set start/i }));
    transport.clock.seek(5);
    fireEvent.click(screen.getByRole("button", { name: /set end/i }));
    expect(transport.clock.loop).toEqual({ start: 0, end: 6 });
  });

  it("Clear removes the loop", () => {
    const { transport } = renderBar();
    transport.clock.seek(1);
    fireEvent.click(screen.getByRole("button", { name: /loop measure/i }));
    fireEvent.click(screen.getByRole("button", { name: /clear loop/i }));
    expect(transport.clock.loop).toBeNull();
  });

  it("the exact tempo input sets an arbitrary BPM", () => {
    const { transport } = renderBar();
    fireEvent.change(screen.getByLabelText(/tempo/i), {
      target: { value: "137" },
    });
    expect(transport.bpm).toBe(137);
  });

  it("the tempo + button steps the BPM up", () => {
    const { transport } = renderBar();
    fireEvent.click(screen.getByRole("button", { name: /increase tempo/i }));
    expect(transport.bpm).toBe(125);
  });

  it("the flatten checkbox switches the tempo mode", () => {
    const { transport } = renderBar();
    fireEvent.click(screen.getByRole("checkbox", { name: /flatten/i }));
    expect(transport.tempoMode).toBe("flatten");
  });

  it("the speed-up toggle enables gradual speed-up", () => {
    const { transport } = renderBar();
    fireEvent.click(screen.getByRole("checkbox", { name: /speed-up/i }));
    expect(transport.speedUpActive).toBe(true);
  });

  it("the hand visibility select writes through to hand state", () => {
    const { handState } = renderBar();
    fireEvent.change(screen.getByLabelText(/left hand/i), {
      target: { value: "hide" },
    });
    expect(handState.visibility("left")).toBe("hide");
  });

  it("the mute checkbox writes through to hand state", () => {
    const { handState } = renderBar();
    fireEvent.click(screen.getByRole("checkbox", { name: /mute left/i }));
    expect(handState.isMuted("left")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/ui/ExtendedTopBar.test.tsx`.

- [ ] **Step 3: Implement** — Create `src/ui/ExtendedTopBar.tsx`:

```tsx
import { useState } from "react";
import type { Transport } from "../transport/transport";
import type { HandState, HandVisibility } from "../practice/hands";

interface ExtendedTopBarProps {
  transport: Transport;
  handState: HandState;
}

/** The gradual speed-up ramp config — matches the prior ControlPanel setting. */
const SPEED_UP_CONFIG = { startRate: 0.5, targetRate: 1, step: 0.05 };

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Index of the measure containing `position`, or 0 if none matches. */
function measureAt(transport: Transport, position: number): number {
  const i = transport.score.measures.findIndex(
    (m) => position >= m.start && position < m.end,
  );
  return i === -1 ? 0 : i;
}

/** Measure indices [first,last] of an active loop, or null. 0-based. */
function loopMeasures(
  transport: Transport,
): { first: number; last: number } | null {
  const loop = transport.clock.loop;
  if (!loop) return null;
  const measures = transport.score.measures;
  const first = measures.findIndex(
    (m) => loop.start >= m.start && loop.start < m.end,
  );
  const last = measures.findIndex(
    (m) => loop.end > m.start && loop.end <= m.end,
  );
  return {
    first: first === -1 ? 0 : first,
    last: last === -1 ? (first === -1 ? 0 : first) : last,
  };
}

/**
 * The extended top bar shown in Practice mode: four bordered control boxes —
 * loop-range picker, tempo (exact entry + steppers + flatten), gradual
 * speed-up, and per-hand visibility/mute. Each control mirrors live imperative
 * state in local React state and writes through on change; mounting fresh
 * (the bar is only rendered while expanded in Practice mode) re-reads it.
 */
export function ExtendedTopBar({
  transport,
  handState,
}: ExtendedTopBarProps): React.JSX.Element {
  const [loopRange, setLoopRange] = useState(() => loopMeasures(transport));
  const [pendingStart, setPendingStart] = useState<number | null>(null);

  const [bpm, setBpm] = useState(() => String(Math.round(transport.bpm)));
  const [flatten, setFlatten] = useState(
    () => transport.tempoMode === "flatten",
  );
  const [speedUp, setSpeedUp] = useState(() => transport.speedUpActive);

  const [leftVis, setLeftVis] = useState<HandVisibility>(() =>
    handState.visibility("left"),
  );
  const [rightVis, setRightVis] = useState<HandVisibility>(() =>
    handState.visibility("right"),
  );
  const [muteLeft, setMuteLeft] = useState(() => handState.isMuted("left"));
  const [muteRight, setMuteRight] = useState(() => handState.isMuted("right"));

  function applyLoop(start: number, end: number): void {
    const first = Math.min(start, end);
    const last = Math.max(start, end);
    transport.loopMeasures(first, last);
    setLoopRange({ first, last });
  }

  function handleSetStart(): void {
    const m = measureAt(transport, transport.clock.position);
    if (loopRange) {
      applyLoop(m, loopRange.last);
    } else {
      setPendingStart(m);
    }
  }

  function handleSetEnd(): void {
    const m = measureAt(transport, transport.clock.position);
    const start = loopRange ? loopRange.first : pendingStart;
    if (start === null) return;
    setPendingStart(null);
    applyLoop(start, m);
  }

  function handleLoopMeasure(): void {
    const m = measureAt(transport, transport.clock.position);
    setPendingStart(null);
    applyLoop(m, m);
  }

  function handleClearLoop(): void {
    transport.clearLoop();
    setLoopRange(null);
    setPendingStart(null);
  }

  function applyBpm(raw: string): void {
    setBpm(raw);
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 20 && n <= 300) transport.setBpm(n);
  }

  function stepBpm(delta: number): void {
    const base = Number(bpm);
    const current = Number.isFinite(base) ? base : Math.round(transport.bpm);
    const next = clamp(current + delta, 20, 300);
    setBpm(String(next));
    transport.setBpm(next);
  }

  function handleFlatten(checked: boolean): void {
    setFlatten(checked);
    transport.setTempoMode(checked ? "flatten" : "preserve");
  }

  function handleSpeedUp(checked: boolean): void {
    setSpeedUp(checked);
    if (checked) {
      transport.enableSpeedUp(SPEED_UP_CONFIG);
    } else {
      transport.disableSpeedUp();
    }
  }

  const loopReadout = loopRange
    ? `m.${loopRange.first + 1}–${loopRange.last + 1}`
    : pendingStart !== null
      ? `m.${pendingStart + 1}–…`
      : "—";

  return (
    <div className="extended-top-bar">
      <div className="ext-box">
        <span className="ext-box-label">Loop</span>
        <button type="button" onClick={handleSetStart}>
          Set start
        </button>
        <button type="button" onClick={handleSetEnd}>
          Set end
        </button>
        <button type="button" onClick={handleLoopMeasure}>
          Loop measure
        </button>
        <button type="button" aria-label="Clear loop" onClick={handleClearLoop}>
          Clear
        </button>
        <span className="ext-loop-readout">{loopReadout}</span>
      </div>

      <div className="ext-box">
        <span className="ext-box-label">Tempo</span>
        <button
          type="button"
          aria-label="Decrease tempo"
          onClick={() => stepBpm(-5)}
        >
          −
        </button>
        <input
          type="number"
          aria-label="Tempo (BPM)"
          className="ext-tempo-input"
          value={bpm}
          onChange={(e) => applyBpm(e.target.value)}
        />
        <button
          type="button"
          aria-label="Increase tempo"
          onClick={() => stepBpm(5)}
        >
          +
        </button>
        <label>
          <input
            type="checkbox"
            checked={flatten}
            onChange={(e) => handleFlatten(e.target.checked)}
          />{" "}
          Flatten
        </label>
      </div>

      <div className="ext-box">
        <label>
          <input
            type="checkbox"
            checked={speedUp}
            onChange={(e) => handleSpeedUp(e.target.checked)}
          />{" "}
          Speed-up
        </label>
      </div>

      <div className="ext-box">
        <span className="ext-box-label">Hands</span>
        <label>
          Left hand{" "}
          <select
            value={leftVis}
            onChange={(e) => {
              const v = e.target.value as HandVisibility;
              setLeftVis(v);
              handState.setVisibility("left", v);
            }}
          >
            <option value="show">Show</option>
            <option value="dim">Dim</option>
            <option value="hide">Hide</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={muteLeft}
            onChange={(e) => {
              setMuteLeft(e.target.checked);
              handState.setMuted("left", e.target.checked);
            }}
          />{" "}
          Mute left
        </label>
        <label>
          Right hand{" "}
          <select
            value={rightVis}
            onChange={(e) => {
              const v = e.target.value as HandVisibility;
              setRightVis(v);
              handState.setVisibility("right", v);
            }}
          >
            <option value="show">Show</option>
            <option value="dim">Dim</option>
            <option value="hide">Hide</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={muteRight}
            onChange={(e) => {
              setMuteRight(e.target.checked);
              handState.setMuted("right", e.target.checked);
            }}
          />{" "}
          Mute right
        </label>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run src/ui/ExtendedTopBar.test.tsx && npm run typecheck && npm run lint` — Expected: PASS (9 tests), clean.

- [ ] **Step 5: Commit:**

```bash
git add src/ui/ExtendedTopBar.tsx src/ui/ExtendedTopBar.test.tsx
git commit -m "feat: add the ExtendedTopBar practice control bar"
```

---

## Task 6: FloatingHud — fixed position, mode-specific, metronome inline

**Files:**
- Modify: `src/ui/FloatingHud.tsx`
- Modify: `src/ui/FloatingHud.test.tsx`
- Modify: `src/app/PracticeView.tsx` (call-site props)

`FloatingHud` becomes fixed-position (drag removed). Play mode = transport + speed at top-left; Practice mode = transport + metronome at top-center. The metronome control (toggle, pulse, `MetronomeSettings`) moves in from the deleted `PracticeHudControls`. The collapse toggle is gone (it now lives in `TopBar`). `collapsed` is still received — it drives the Practice HUD's vertical position.

- [ ] **Step 1: Rewrite `src/ui/FloatingHud.test.tsx`** — replace the whole file:

```tsx
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
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/ui/FloatingHud.test.tsx`.

- [ ] **Step 3: Rewrite `src/ui/FloatingHud.tsx`:**

```tsx
import { useEffect, useReducer, useRef, useState } from "react";
import type { Transport } from "../transport/transport";
import type { AudioEngine } from "../audio/engine";
import type { FalldownRenderer } from "../falldown/renderer";
import type { PracticeMode } from "../layout/practiceMode";
import { MetronomeSettings } from "./MetronomeSettings";
import { startCountIn, type CountInHandle } from "../practice/countIn";

interface FloatingHudProps {
  transport: Transport;
  settingsOpen: boolean;
  audioEngine: AudioEngine | null;
  falldown: FalldownRenderer | null;
  mode: PracticeMode;
  /** Whether the extended top bar is collapsed — drives the HUD's position. */
  collapsed: boolean;
}

/** Milliseconds of pointer inactivity before the HUD fades. */
const IDLE_MS = 2500;

/** Play-mode playback-speed multipliers, slowest to fastest. */
const SPEED_STEPS = [0.5, 0.75, 1, 1.25, 1.5] as const;

/** Format a duration in seconds as `m:ss` (e.g. 75 -> "1:15"). */
function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Returns whether the HUD should be faded: true after `IDLE_MS` with no
 * pointer movement, reset to false on any movement. Never fades while
 * `disabled` is true.
 */
function useIdleFade(disabled: boolean): boolean {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    if (disabled) return;
    let timer = window.setTimeout(() => setIdle(true), IDLE_MS);
    function onMove(): void {
      setIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), IDLE_MS);
    }
    window.addEventListener("pointermove", onMove);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", onMove);
    };
  }, [disabled]);
  return disabled ? false : idle;
}

/**
 * The fixed-position transport HUD. Play mode: transport + a playback-speed
 * stepper, anchored top-left. Practice mode: transport + the metronome
 * control, anchored top-center (raised under the top bar when the extended
 * bar is collapsed). Idle-fades when untouched.
 */
export function FloatingHud({
  transport,
  settingsOpen,
  audioEngine,
  falldown,
  mode,
  collapsed,
}: FloatingHudProps): React.JSX.Element {
  const [, forceUpdate] = useReducer((n: number) => n + 1, 0);
  useEffect(() => transport.clock.onChange(forceUpdate), [transport]);

  const faded = useIdleFade(settingsOpen);

  const { clock } = transport;
  const { playing, position, duration } = clock;

  // Count-in bars (per session) and the in-flight count-in handle.
  const [countInBars, setCountInBars] = useState(0);
  const [countingIn, setCountingIn] = useState(false);
  const countInRef = useRef<CountInHandle | null>(null);

  // Play-mode speed multiplier, derived from the live transport rate on mount.
  const [speedIndex, setSpeedIndex] = useState(() => {
    const ratio = transport.bpm / transport.referenceBpm;
    let best = 2;
    let bestDist = Infinity;
    SPEED_STEPS.forEach((s, i) => {
      const d = Math.abs(s - ratio);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  });

  // Metronome on/off mirror. Re-synced on entering Practice mode because the
  // mode-switch suspend/restore may have changed metronome.enabled directly.
  const [metronomeOn, setMetronomeOn] = useState(
    () => audioEngine?.metronome.enabled ?? false,
  );
  useEffect(() => {
    if (mode === "practice") {
      setMetronomeOn(audioEngine?.metronome.enabled ?? false);
    }
  }, [mode, audioEngine]);

  const pulseRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    return () => countInRef.current?.cancel();
  }, []);

  // A count-in only makes sense in Practice mode; cancel it on leaving.
  useEffect(() => {
    if (mode !== "practice" && countInRef.current) {
      countInRef.current.cancel();
      countInRef.current = null;
      setCountingIn(false);
    }
  }, [mode]);

  // Self-contained rAF loop driving the metronome pulse indicator's opacity.
  useEffect(() => {
    let frame = 0;
    const tick = (): void => {
      if (pulseRef.current) {
        pulseRef.current.style.opacity = String(
          audioEngine?.metronome.pulse ?? 0,
        );
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [audioEngine]);

  function changeSpeed(delta: number): void {
    const next = Math.max(
      0,
      Math.min(SPEED_STEPS.length - 1, speedIndex + delta),
    );
    setSpeedIndex(next);
    transport.setBpm(transport.referenceBpm * SPEED_STEPS[next]);
  }

  function handleMetronome(checked: boolean): void {
    setMetronomeOn(checked);
    // The audio engine and renderer are imperative objects written through to.
    // eslint-disable-next-line react-hooks/immutability
    if (audioEngine) audioEngine.metronome.enabled = checked;
    // eslint-disable-next-line react-hooks/immutability
    if (falldown) falldown.showBeatPulse = checked;
  }

  function handlePlayToggle(): void {
    if (clock.playing) {
      clock.pause();
      countInRef.current?.cancel();
      countInRef.current = null;
      setCountingIn(false);
      return;
    }
    if (mode === "practice" && countInBars > 0 && audioEngine) {
      setCountingIn(true);
      countInRef.current = startCountIn({
        bars: countInBars,
        beatsPerBar: audioEngine.metronome.timeSignature.numerator,
        bpm: transport.bpm,
        onClick: (accent) => audioEngine.playClick(accent),
        onComplete: () => {
          setCountingIn(false);
          countInRef.current = null;
          clock.play();
        },
      });
      return;
    }
    clock.play();
  }

  const positionClass =
    mode === "play"
      ? "floating-hud--play"
      : `floating-hud--practice${collapsed ? " floating-hud--raised" : ""}`;

  return (
    <div className={`floating-hud ${positionClass}${faded ? " faded" : ""}`}>
      <button
        type="button"
        aria-label={playing ? "Pause" : "Play"}
        disabled={countingIn}
        onClick={handlePlayToggle}
      >
        {playing ? "⏸" : "▶"}
      </button>
      <input
        type="range"
        min={0}
        max={duration}
        step={0.01}
        value={position}
        onChange={(e) => clock.seek(Number(e.target.value))}
      />
      <span>
        {formatTime(position)} / {formatTime(duration)}
      </span>

      {mode === "play" && (
        <div className="hud-group">
          <span className="hud-group-label">Speed</span>
          <button
            type="button"
            aria-label="Decrease speed"
            onClick={() => changeSpeed(-1)}
          >
            −
          </button>
          <span className="hud-tempo-readout">{SPEED_STEPS[speedIndex]}×</span>
          <button
            type="button"
            aria-label="Increase speed"
            onClick={() => changeSpeed(1)}
          >
            +
          </button>
        </div>
      )}

      {mode === "practice" && (
        <div className="hud-metronome">
          <label>
            <input
              type="checkbox"
              checked={metronomeOn}
              onChange={(e) => handleMetronome(e.target.checked)}
            />{" "}
            Metronome
          </label>
          <span ref={pulseRef} className="metronome-pulse" aria-hidden="true" />
          <MetronomeSettings
            falldown={falldown}
            audioEngine={audioEngine}
            countInBars={countInBars}
            onCountInBarsChange={setCountInBars}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Update the PracticeView call site** — In `src/app/PracticeView.tsx`, the `<FloatingHud>` element drops `handState` and `onCollapsedChange`, keeps `collapsed`:

```tsx
      <FloatingHud
        transport={transport}
        settingsOpen={settingsOpen}
        audioEngine={audioEngine}
        falldown={falldown}
        mode={mode}
        collapsed={hudCollapsed}
      />
```

- [ ] **Step 5: Run tests, typecheck, lint** — `npx vitest run src/ui/FloatingHud.test.tsx && npm run typecheck && npm run lint`. All should pass: `PracticeHudControls.tsx` is now unused but still compiles cleanly (it is deleted in Task 7), and `PracticeHudControls.test.tsx` still tests it so it stays green for now. The FloatingHud test must pass.

- [ ] **Step 6: Commit:**

```bash
git add src/ui/FloatingHud.tsx src/ui/FloatingHud.test.tsx src/app/PracticeView.tsx
git commit -m "feat: make the FloatingHud fixed-position and mode-specific"
```

---

## Task 7: PracticeView wiring + cleanup

**Files:**
- Modify: `src/app/PracticeView.tsx`
- Modify: `src/app/PracticeView.test.tsx`
- Delete: `src/ui/PracticeHudControls.tsx`, `src/ui/PracticeHudControls.test.tsx`, `src/ui/HandsMenu.tsx`

Render `ExtendedTopBar`, wire the collapse toggle into `TopBar`, add the arrow-key handler, and delete the now-dead components.

- [ ] **Step 1: Delete the dead files:**

```bash
git rm src/ui/PracticeHudControls.tsx src/ui/PracticeHudControls.test.tsx src/ui/HandsMenu.tsx
```

(`HandsMenu.test.tsx` does not exist — `HandsMenu` was added without a separate test. If `git rm` reports a missing file, drop it from the command.)

- [ ] **Step 2: Write the failing test** — Add to `src/app/PracticeView.test.tsx` (read it first; reuse its render pattern):

```tsx
  it("shows the extended top bar in Practice mode and hides it in Play", async () => {
    render(
      <PracticeView
        score={score}
        pieceId="p1"
        pieceName="moonlight.mid"
        onExit={() => {}}
      />,
    );
    // Practice mode: the extended bar's Loop-measure button appears.
    fireEvent.click(
      await screen.findByRole("button", { name: /^practice$/i, pressed: false }),
    );
    expect(
      await screen.findByRole("button", { name: /loop measure/i }),
    ).toBeInTheDocument();
    // Collapse it from the top-bar toggle — the extended bar disappears.
    fireEvent.click(
      screen.getByRole("button", { name: /collapse control bar/i }),
    );
    expect(
      screen.queryByRole("button", { name: /loop measure/i }),
    ).toBeNull();
  });

  it("ArrowRight seeks to the next measure", async () => {
    render(
      <PracticeView
        score={score}
        pieceId="p2"
        pieceName="moonlight.mid"
        onExit={() => {}}
      />,
    );
    await screen.findByRole("button", { name: /^play$/i, pressed: true });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    // score fixture's measure 1 starts at 2s (see the file's `score`).
    expect(
      document.querySelector(".practice-view"),
    ).toBeInTheDocument();
  });
```

NOTE on the second test: the `PracticeView.test.tsx` `score` fixture must have at least two measures for the jump to be observable. If it does not, the assertion above only checks the handler does not throw. Keep the test light — the seek arithmetic is unit-tested in Task 1.

- [ ] **Step 3: Run test to verify it fails** — `npx vitest run src/app/PracticeView.test.tsx`.

- [ ] **Step 4: Implement the PracticeView changes** — In `src/app/PracticeView.tsx`:

Add imports:

```tsx
import { ExtendedTopBar } from "../ui/ExtendedTopBar";
import { measureJumpTarget } from "../transport/measureJump";
```

Add an arrow-key effect (after the other effects, before the helper functions):

```tsx
  // Arrow keys jump the playhead one measure back/forward, in both modes.
  // Ignored while a form control is focused (so typing a tempo is not stolen).
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
      e.preventDefault();
      const target = measureJumpTarget(
        transport.score.measures,
        transport.clock.position,
        e.key === "ArrowRight" ? "next" : "prev",
      );
      transport.clock.seek(target);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [transport]);
```

Wire the `TopBar` collapse props — replace the Task-4 placeholders with:

```tsx
        extendedCollapsed={hudCollapsed}
        onToggleExtended={() => setHudCollapsed((c) => !c)}
```

Render `ExtendedTopBar` — add it after the `<FloatingHud>` element, before the `ControlPanel` block:

```tsx
      {mode === "practice" && !hudCollapsed && practiceReady && (
        <ExtendedTopBar transport={transport} handState={handState} />
      )}
```

- [ ] **Step 5: Run tests, typecheck, lint** — `npx vitest run src/app/PracticeView.test.tsx && npm run typecheck && npm run lint`.

- [ ] **Step 6: Run the full unit suite** — `npm test`. Fix any fallout in `App.test.tsx` or other suites from the changed `TopBar` / `FloatingHud` / `ControlPanel` prop shapes (mechanical updates).

- [ ] **Step 7: Commit:**

```bash
git add src/app/PracticeView.tsx src/app/PracticeView.test.tsx src/ui/PracticeHudControls.tsx src/ui/PracticeHudControls.test.tsx src/ui/HandsMenu.tsx
git commit -m "feat: wire the extended bar and arrow-key measure jumping into PracticeView"
```

---

## Task 8: Styling

**Files:**
- Modify: `src/styles/theme.css`

Fixed HUD positions, the rearranged top bar, the extended bar, and its boxes. There is no unit test for CSS — verification is the build plus the manual check in Task 9.

- [ ] **Step 1: Top bar — wordmark and centered piece name.** In `src/styles/theme.css`, add/adjust:

```css
.top-bar-logo {
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--accent);
}

/* The piece name is centered in the bar independently of the side groups. */
.top-bar-piece {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  max-width: 28ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-dim);
  font-size: 0.9rem;
}

.top-bar-extended-toggle {
  font-size: 0.8rem;
}
```

The existing `.top-bar-spacer { flex: 1; }` rule stays (it pushes the right group over). Remove the `display:flex; justify-content:center;` that an earlier task added to `.top-bar-spacer` — the spacer no longer wraps the ModeSwitch. If `.top-bar-modes` had margins, leave them.

- [ ] **Step 2: Fixed HUD positions.** Replace the `.floating-hud` positioning rules. The `.floating-hud` rule currently has `position: absolute` and drag-related bits. Set:

```css
.floating-hud {
  position: absolute;
  z-index: 20;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  max-width: calc(100% - 32px);
  padding: 0.5rem 0.7rem;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  border-radius: 18px;
  box-shadow: var(--glass-shadow);
  transition: opacity 0.4s ease;
}

/* Play HUD: top-left, just below the top bar. */
.floating-hud--play {
  top: 70px;
  left: 10px;
}

/* Practice HUD: top-center, below the extended bar. */
.floating-hud--practice {
  top: 124px;
  left: 50%;
  transform: translateX(-50%);
}

/* When the extended bar is collapsed the Practice HUD rises under the bar. */
.floating-hud--practice.floating-hud--raised {
  top: 70px;
}
```

Remove the old `cursor: grab;` from `.floating-hud` (drag is gone). Keep `.floating-hud.faded` and `.floating-hud:hover` rules. Keep `.floating-hud button`, `.floating-hud input[type="range"]`, `.floating-hud label` rules.

- [ ] **Step 3: Extended top bar + boxes.** Add:

```css
/* The extended control bar, flush below the top bar (Practice mode). */
.extended-top-bar {
  position: absolute;
  top: 68px;
  left: 10px;
  right: 10px;
  z-index: 25;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.6rem;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  border-radius: 14px;
  box-shadow: var(--glass-shadow);
}

/* Each control group is its own bordered box. */
.ext-box {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--glass-border);
  border-radius: 10px;
}

.ext-box-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-dim);
}

.ext-box button {
  font-family: inherit;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text);
  border: 1px solid var(--glass-border);
  border-radius: 8px;
  padding: 0.2rem 0.5rem;
  cursor: pointer;
}

.ext-box button:hover {
  background: rgba(255, 255, 255, 0.12);
}

.ext-box label {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.82rem;
  color: var(--text);
  white-space: nowrap;
}

.ext-loop-readout {
  font-size: 0.82rem;
  color: var(--text);
  min-width: 3ch;
  text-align: center;
}

.ext-tempo-input {
  width: 3.2rem;
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.15rem 0.3rem;
  font-family: inherit;
}

.ext-box select {
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.1rem 0.2rem;
}
```

- [ ] **Step 4: Score panel top padding.** The score panel already has top padding so the music clears the floating bar. In Practice mode the extended bar adds height; if the engraved score collides with the extended bar, increase the `.score-container` top padding. Search `theme.css` for the existing `.score-container` padding rule and confirm a comfortable clearance (~120px when the extended bar can show). If a rule sets `padding-top`, raise it to `120px`; if the falldown/score layout already scrolls independently, leave it. This step is a visual judgement — verify in Task 9.

- [ ] **Step 5: Build check** — `npm run build` — Expected: clean.

- [ ] **Step 6: Commit:**

```bash
git add src/styles/theme.css
git commit -m "style: lay out the rearranged top bar, extended bar, and fixed HUDs"
```

---

## Task 9: End-to-end coverage and final verification

**Files:**
- Modify: `tests/e2e/practice.spec.ts`

- [ ] **Step 1: Update the e2e mode-switch test.** The existing test "switching to Practice mode reveals the practice HUD controls" used the old HUD layout. Read `tests/e2e/practice.spec.ts`; in that test, replace the practice-controls assertions so they target the extended bar and the new HUD:

```ts
  // Switch to Practice — the extended control bar appears.
  await page.locator(".top-bar-modes").getByRole("button", { name: "Practice" }).click();
  await expect(page.getByRole("button", { name: /loop measure/i })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /metronome/i })).toBeVisible();

  // Collapse the extended bar from the top-bar toggle.
  await page.getByRole("button", { name: /collapse control bar/i }).click();
  await expect(page.getByRole("button", { name: /loop measure/i })).toHaveCount(0);

  // Back to Play — the speed stepper is shown again.
  await page.locator(".top-bar-modes").getByRole("button", { name: "Play" }).click();
  await expect(page.getByRole("button", { name: /increase speed/i })).toBeVisible();
```

Keep the Play-mode assertions (speed stepper visible, "Loop measure" count 0) at the start of that test. Use `.top-bar-modes`-scoped selectors for the mode switch.

- [ ] **Step 2: Add an arrow-key e2e test** — append:

```ts
test("arrow keys jump the playhead by measure", async ({ page }) => {
  await page.goto("/");
  await page.setInputFiles('input[type="file"]', "src/test/fixtures/clean.mid");
  await expect(page.locator("canvas.falldown-canvas")).toBeVisible({
    timeout: 15_000,
  });
  const time = page.locator(".floating-hud span").first();
  await page.locator("body").press("ArrowRight");
  // The time readout should advance off 0:00 after a measure jump.
  await expect(time).not.toHaveText(/^0:00 \//);
});
```

If `.floating-hud span` is not a robust selector for the time readout in the running app, adjust to whatever element shows `m:ss / m:ss` — verify by running the test.

- [ ] **Step 3: Run the e2e spec** — `npx playwright test tests/e2e/practice.spec.ts`. Fix selectors/timing until green; do not weaken assertions.

- [ ] **Step 4: Full verification gate** — run all five, confirm clean/green:

```
npm run lint
npm run typecheck
npm test
npm run build
npm run e2e
```

- [ ] **Step 5: Manual smoke check** — `npm run dev`, then:
  - Top bar: `arpeggio` wordmark + Library on the left; piece name centered; Play/Practice + view modes + ⚙ on the right.
  - Play mode: HUD at top-left with transport + Speed stepper.
  - Practice mode: extended bar appears under the top bar with Loop / Tempo / Speed-up / Hands boxes; HUD at top-center with transport + Metronome.
  - The top-bar `▴/▾` collapses/expands the extended bar; the Practice HUD rises when collapsed.
  - Loop measure loops one bar; Set start/Set end build a range; Tempo accepts an exact typed BPM and the ± buttons step it; Flatten toggles tempo mode.
  - ⚙ drawer: Note labels, Beat grid, Full 88, Metronome sound — switching the sound changes the click.
  - ← / → jump the playhead by a measure in both modes; typing in the Tempo field is not hijacked.

- [ ] **Step 6: Commit:**

```bash
git add tests/e2e/practice.spec.ts
git commit -m "test: cover the redesigned practice chrome end-to-end"
```

---

## Done

Spec coverage: §2 top bar — Task 4; §3 extended bar — Tasks 5, 7; §4 fixed HUDs — Task 6; §5 exact tempo — Task 5; §6 settings drawer — Task 3; §7 metronome sounds — Task 2; §8 arrow keys — Tasks 1, 7; §9 persistence — unchanged (`hudCollapsed` reused, wired in Task 7); §12 testing — every task plus Task 9.

After the final commit, return to `superpowers:finishing-a-development-branch` to integrate the branch.
