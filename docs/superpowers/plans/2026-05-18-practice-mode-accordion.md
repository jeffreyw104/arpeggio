# Practice-mode Accordion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Play/Practice switch into a slider toggle beside Library, make the HUD draggable again, rebuild the extended bar as a collapsible accordion with oldest-first auto-collapse, move the metronome into it, give speed-up configurable BPM fields nested under Loop, and fix a bug where toggling Flatten loses the active loop.

**Architecture:** `ModeSwitch` becomes a slider; `TopBar` hosts it on the left. A reusable `CollapsibleSection` wraps each accordion section with an animated open/close. `ExtendedTopBar` is rebuilt as the accordion: it owns per-section open state, an open-order queue, and overflow-driven oldest-first auto-collapse. The metronome (toggle + pulse + `MetronomeSettings`) becomes the fourth section; speed-up becomes a BPM-configured sub-group of the Loop section. `FloatingHud` regains `useDraggable` and sheds the metronome. `Transport.setTempoMode` is fixed to convert the loop through musical beats.

**Tech Stack:** Vite + TypeScript + React 19, Vitest + Testing Library, Playwright. Strict TS (`noUnusedLocals`/`noUnusedParameters`), React 19 `react-jsx` (no `import React`). Write-throughs to imperative objects need `// eslint-disable-next-line react-hooks/immutability`.

**Spec:** `docs/superpowers/specs/2026-05-18-practice-mode-accordion-design.md`

**Branch:** `feature/practice-mode` (current HEAD `911b15f`).

**Verification gate (after the final task):** `npm run lint && npm run typecheck && npm test && npm run build && npm run e2e`

---

## Task 1: Fix setTempoMode dropping the active loop

**Files:**
- Modify: `src/transport/transport.ts` (the `setTempoMode` method)
- Modify: `src/transport/transport.test.ts`

`setTempoMode` re-times the score and converts the playhead position through musical beats, but not the loop — so an active loop is lost when Flatten is toggled. Convert the loop the same way.

- [ ] **Step 1: Write the failing test** — Add to `src/transport/transport.test.ts` a test using a score whose tempo genuinely varies (so `flatten` re-times it). Add this fixture and test (place the fixture near the file's other fixtures; if the file already has a `describe("Transport")`, put the test inside it):

```ts
// A score with a varying tempo map — its measures sit at different second
// times under preserve vs. flatten, so the loop must be re-mapped.
const varyingScore = {
  source: "midi",
  notes: [],
  measures: [
    { index: 0, start: 0, end: 2, numerator: 4, denominator: 4 },
    { index: 1, start: 2, end: 6, numerator: 4, denominator: 4 },
    { index: 2, start: 6, end: 8, numerator: 4, denominator: 4 },
  ],
  pedalEvents: [],
  timeSignatures: [{ start: 0, numerator: 4, denominator: 4 }],
  tempoMap: [
    { start: 0, bpm: 120 },
    { start: 4, bpm: 60 },
  ],
  durationSeconds: 8,
  musicXml: "",
  qualityWarning: null,
} satisfies Score;

describe("setTempoMode loop preservation", () => {
  it("keeps an active loop across a flatten toggle", () => {
    const t = new Transport(varyingScore);
    t.loopMeasures(0, 1);
    const loopBefore = t.clock.loop;
    expect(loopBefore).not.toBeNull();
    t.setTempoMode("flatten");
    const loopAfter = t.clock.loop;
    expect(loopAfter).not.toBeNull();
    // The loop must still be a valid range inside the re-timed piece.
    expect(loopAfter!.start).toBeGreaterThanOrEqual(0);
    expect(loopAfter!.end).toBeGreaterThan(loopAfter!.start);
    expect(loopAfter!.end).toBeLessThanOrEqual(t.score.durationSeconds);
  });

  it("does nothing to the loop when none is set", () => {
    const t = new Transport(varyingScore);
    t.setTempoMode("flatten");
    expect(t.clock.loop).toBeNull();
  });
});
```

If `transport.test.ts` does not import `Score`, add `import type { Score } from "../model/score";` to its imports.

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/transport/transport.test.ts` — Expected: the first test FAILS (the loop after a flatten toggle is no longer a valid range — its `end` exceeds the new duration). If the first test PASSES already, the `varyingScore` fixture is not producing a real re-time — adjust the `tempoMap` so preserve and flatten differ, and confirm the test fails before continuing.

- [ ] **Step 3: Implement** — In `src/transport/transport.ts`, replace the `setTempoMode` method with:

```ts
  /**
   * Switch preserve/flatten; rebuilds the score from the original import.
   * The clock position AND any active loop are converted through musical
   * beats — invariant across tempo modes — so playback and the loop region
   * stay at the same musical point.
   */
  setTempoMode(mode: TempoMode): void {
    const oldScore = this._score;
    const oldPosition = this.clock.position;
    const oldLoop = this.clock.loop;
    const beats = secondsToBeats(oldScore.tempoMap, oldPosition);

    this._tempoMode = mode;
    this._score = applyTempoMode(this._baseScore, mode);

    const newPosition = beatsToSeconds(this._score.tempoMap, beats);
    this.clock.setDuration(this._score.durationSeconds);
    this.clock.seek(Math.min(newPosition, this._score.durationSeconds));

    if (oldLoop) {
      const startBeats = secondsToBeats(oldScore.tempoMap, oldLoop.start);
      const endBeats = secondsToBeats(oldScore.tempoMap, oldLoop.end);
      this.clock.setLoop({
        start: beatsToSeconds(this._score.tempoMap, startBeats),
        end: beatsToSeconds(this._score.tempoMap, endBeats),
      });
    }
  }
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run src/transport/transport.test.ts && npm run typecheck` — Expected: PASS, clean.

- [ ] **Step 5: Commit:**

```bash
git add src/transport/transport.ts src/transport/transport.test.ts
git commit -m "fix: preserve the active loop across a tempo-mode toggle"
```

---

## Task 2: ModeSwitch as a slider toggle

**Files:**
- Modify: `src/ui/ModeSwitch.tsx`
- Modify: `src/ui/ModeSwitch.test.tsx`
- Modify: `src/styles/theme.css` (slider styling)

`ModeSwitch` becomes a sliding on/off toggle between Play and Practice. Its props (`mode`, `onModeChange`) are unchanged, so `TopBar` keeps working without edits in this task.

- [ ] **Step 1: Update the test** — In `src/ui/ModeSwitch.test.tsx`: read it first. The component is no longer two `aria-pressed` buttons; it is one toggle. Replace the test body with:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ModeSwitch } from "./ModeSwitch";

describe("ModeSwitch", () => {
  it("renders a Play/Practice toggle reflecting the current mode", () => {
    render(<ModeSwitch mode="play" onModeChange={vi.fn()} />);
    const toggle = screen.getByRole("switch", { name: /play.*practice/i });
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  it("reads aria-checked true in Practice mode", () => {
    render(<ModeSwitch mode="practice" onModeChange={vi.fn()} />);
    expect(
      screen.getByRole("switch", { name: /play.*practice/i }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("flips to Practice when clicked from Play", () => {
    const onModeChange = vi.fn();
    render(<ModeSwitch mode="play" onModeChange={onModeChange} />);
    fireEvent.click(screen.getByRole("switch", { name: /play.*practice/i }));
    expect(onModeChange).toHaveBeenCalledWith("practice");
  });

  it("flips to Play when clicked from Practice", () => {
    const onModeChange = vi.fn();
    render(<ModeSwitch mode="practice" onModeChange={onModeChange} />);
    fireEvent.click(screen.getByRole("switch", { name: /play.*practice/i }));
    expect(onModeChange).toHaveBeenCalledWith("play");
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/ui/ModeSwitch.test.tsx`.

- [ ] **Step 3: Rewrite `src/ui/ModeSwitch.tsx`:**

```tsx
import type { PracticeMode } from "../layout/practiceMode";

interface ModeSwitchProps {
  mode: PracticeMode;
  onModeChange: (m: PracticeMode) => void;
}

/**
 * The Play / Practice toggle — a sliding on/off switch. "Practice" is the
 * checked state. Clicking it (or the labels) flips the mode. Purely
 * presentational; the mode state lives in PracticeView.
 */
export function ModeSwitch({
  mode,
  onModeChange,
}: ModeSwitchProps): React.JSX.Element {
  const practice = mode === "practice";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={practice}
      aria-label="Play / Practice"
      className="mode-switch"
      onClick={() => onModeChange(practice ? "play" : "practice")}
    >
      <span className="mode-switch-label">Play</span>
      <span className="mode-switch-track">
        <span className="mode-switch-knob" />
      </span>
      <span className="mode-switch-label">Practice</span>
    </button>
  );
}
```

The `PRACTICE_MODES` / `LABELS` constants are no longer used — they are removed by this rewrite.

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run src/ui/ModeSwitch.test.tsx`.

- [ ] **Step 5: Add the styling** — Append to `src/styles/theme.css` (after the `.top-bar-modes` rule, or wherever the top-bar rules sit):

```css
/* Play / Practice slider toggle. */
.mode-switch {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  background: var(--bg);
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  padding: 0.2rem 0.5rem;
  cursor: pointer;
  font-family: inherit;
  font-size: 0.78rem;
  color: var(--text-dim);
}

.mode-switch-label {
  transition: color 0.2s ease;
}

/* The active side's label brightens. */
.mode-switch[aria-checked="false"] .mode-switch-label:first-of-type,
.mode-switch[aria-checked="true"] .mode-switch-label:last-of-type {
  color: var(--text);
}

.mode-switch-track {
  position: relative;
  width: 34px;
  height: 16px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
}

.mode-switch-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--accent);
  transition: left 0.2s ease;
}

.mode-switch[aria-checked="true"] .mode-switch-knob {
  left: 20px;
}
```

- [ ] **Step 6: Run lint, typecheck** — `npm run lint && npm run typecheck && npx vitest run src/ui/ModeSwitch.test.tsx`.

- [ ] **Step 7: Commit:**

```bash
git add src/ui/ModeSwitch.tsx src/ui/ModeSwitch.test.tsx src/styles/theme.css
git commit -m "feat: turn the Play/Practice switch into a slider toggle"
```

---

## Task 3: Relocate ModeSwitch, drop the extended-bar collapse toggle

**Files:**
- Modify: `src/ui/TopBar.tsx`
- Modify: `src/ui/TopBar.test.tsx`
- Modify: `src/app/PracticeView.tsx` (drop the two collapse-toggle props)

`ModeSwitch` moves into the left group right after Library. The Practice-mode extended-bar collapse toggle (`top-bar-extended-toggle`) and its props (`extendedCollapsed`, `onToggleExtended`) are removed — the accordion's per-section collapse replaces it.

- [ ] **Step 1: Update the test** — In `src/ui/TopBar.test.tsx`: read it first. Remove `extendedCollapsed` and `onToggleExtended` from the render helper's default props. Remove the two tests about the collapse toggle ("shows the extended-bar collapse toggle…" and "hides the collapse toggle…"). Keep the wordmark test, the mode-switch test, the Library/view-mode/settings tests. The mode-switch test should still work — it queries the switch by role; update it if it used the old segmented-button query. Ensure a test like this exists:

```tsx
  it("renders the Play/Practice toggle", () => {
    const { props } = renderBar();
    fireEvent.click(screen.getByRole("switch", { name: /play.*practice/i }));
    expect(props.onModeChange).toHaveBeenCalled();
  });
```

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
 * The fixed top bar. Left: the arpeggio wordmark, the Library button, and the
 * Play/Practice toggle. Center: the now-playing piece name. Right: the
 * view-mode switch and the settings gear. Purely presentational.
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
}: TopBarProps): React.JSX.Element {
  return (
    <div className="top-bar">
      <span className="top-bar-logo">arpeggio</span>
      <button type="button" onClick={onOpenLibrary}>
        Library
      </button>
      <ModeSwitch mode={mode} onModeChange={onModeChange} />
      <span className="top-bar-piece">{displayName(pieceName)}</span>
      <span className="top-bar-spacer" />
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
    </div>
  );
}
```

- [ ] **Step 4: Update the PracticeView call site** — In `src/app/PracticeView.tsx`, the `<TopBar ... />` element currently passes `extendedCollapsed={hudCollapsed}` and `onToggleExtended={...}`. Remove those two props from the `<TopBar>` element. Leave the rest of `<TopBar>`'s props. (Other uses of `hudCollapsed` in `PracticeView` are cleaned up in Task 6 — leave them for now; this task only removes the two `<TopBar>` props.)

- [ ] **Step 5: Run tests, typecheck** — `npx vitest run src/ui/TopBar.test.tsx && npm run typecheck`. NOTE: `hudCollapsed` may now be flagged by lint as set-but-not-fully-used — if `npm run lint` complains, leave it; Task 6 removes `hudCollapsed`. The TopBar test and typecheck must pass.

- [ ] **Step 6: Commit:**

```bash
git add src/ui/TopBar.tsx src/ui/TopBar.test.tsx src/app/PracticeView.tsx
git commit -m "feat: move the mode toggle beside Library and drop the bar collapse toggle"
```

---

## Task 4: CollapsibleSection component

**Files:**
- Create: `src/ui/CollapsibleSection.tsx`
- Create: `src/ui/CollapsibleSection.test.tsx`
- Modify: `src/styles/theme.css` (accordion-section styling)

A reusable accordion-section wrapper: a clickable chip (label + caret) and a body that animates open/closed. The body stays mounted in both states (clipped when closed) so its controls keep live state and the open/close can animate.

- [ ] **Step 1: Write the failing test** — Create `src/ui/CollapsibleSection.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CollapsibleSection } from "./CollapsibleSection";

describe("CollapsibleSection", () => {
  it("renders the label and the body", () => {
    render(
      <CollapsibleSection label="Loop" open={false} onToggle={vi.fn()}>
        <button type="button">Set start</button>
      </CollapsibleSection>,
    );
    expect(screen.getByText("Loop")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /set start/i }),
    ).toBeInTheDocument();
  });

  it("reflects open state via aria-expanded on the chip", () => {
    const { rerender } = render(
      <CollapsibleSection label="Loop" open={false} onToggle={vi.fn()}>
        <span>body</span>
      </CollapsibleSection>,
    );
    expect(
      screen.getByRole("button", { name: /loop/i }),
    ).toHaveAttribute("aria-expanded", "false");
    rerender(
      <CollapsibleSection label="Loop" open={true} onToggle={vi.fn()}>
        <span>body</span>
      </CollapsibleSection>,
    );
    expect(
      screen.getByRole("button", { name: /loop/i }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("calls onToggle when the chip is clicked", () => {
    const onToggle = vi.fn();
    render(
      <CollapsibleSection label="Loop" open={false} onToggle={onToggle}>
        <span>body</span>
      </CollapsibleSection>,
    );
    fireEvent.click(screen.getByRole("button", { name: /loop/i }));
    expect(onToggle).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/ui/CollapsibleSection.test.tsx`.

- [ ] **Step 3: Implement** — Create `src/ui/CollapsibleSection.tsx`:

```tsx
interface CollapsibleSectionProps {
  /** The chip label, also the accessible name of the toggle. */
  label: string;
  /** Whether the section is expanded. */
  open: boolean;
  /** Toggle handler — the parent owns the open state. */
  onToggle: () => void;
  /** The section's controls, revealed when open. */
  children: React.ReactNode;
}

/**
 * One section of the accordion control bar: a clickable chip (label + caret)
 * and a body that slides open/closed. The body stays mounted in both states
 * so its controls keep their live state; CSS clips it to zero width when
 * closed and animates the width change.
 */
export function CollapsibleSection({
  label,
  open,
  onToggle,
  children,
}: CollapsibleSectionProps): React.JSX.Element {
  return (
    <div className={`accordion-section${open ? " open" : ""}`}>
      <button
        type="button"
        className="accordion-chip"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="accordion-label">{label}</span>
        <span className="accordion-caret" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
      </button>
      <div className="accordion-body">
        <div className="accordion-body-inner">{children}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run src/ui/CollapsibleSection.test.tsx`.

- [ ] **Step 5: Add the styling** — Append to `src/styles/theme.css`:

```css
/* One accordion section: a chip plus a width-animated body. */
.accordion-section {
  display: inline-flex;
  align-items: stretch;
  border: 1px solid var(--glass-border);
  border-radius: 10px;
  overflow: hidden;
}

.accordion-section.open {
  border-color: rgba(122, 162, 255, 0.5);
  background: rgba(122, 162, 255, 0.1);
}

.accordion-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-family: inherit;
  font-size: 0.78rem;
  background: transparent;
  color: var(--text);
  border: none;
  padding: 0.3rem 0.6rem;
  cursor: pointer;
  white-space: nowrap;
}

.accordion-caret {
  font-size: 0.6rem;
  color: var(--text-dim);
}

/* The body animates its width via a 0fr/1fr grid column — a smooth slide
   from zero to content width without needing a measured pixel value. */
.accordion-body {
  display: grid;
  grid-template-columns: 0fr;
  transition: grid-template-columns 0.22s ease;
}

.accordion-section.open .accordion-body {
  grid-template-columns: 1fr;
}

.accordion-body-inner {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  padding-right: 0.4rem;
}
```

- [ ] **Step 6: Run lint, typecheck** — `npm run lint && npm run typecheck && npx vitest run src/ui/CollapsibleSection.test.tsx`.

- [ ] **Step 7: Commit:**

```bash
git add src/ui/CollapsibleSection.tsx src/ui/CollapsibleSection.test.tsx src/styles/theme.css
git commit -m "feat: add the CollapsibleSection accordion wrapper"
```

---

## Task 5: FloatingHud — restore drag, remove the metronome

**Files:**
- Modify: `src/ui/FloatingHud.tsx`
- Modify: `src/ui/FloatingHud.test.tsx`
- Modify: `src/app/PracticeView.tsx`

`FloatingHud` regains `useDraggable` and drops the metronome (it moves to the accordion in Task 6). `countInBars` becomes a prop owned by `PracticeView` (so the count-in-aware play handler still works while the count-in selector lives in the accordion). The `collapsed` and `falldown` props are removed.

- [ ] **Step 1: Replace `src/ui/FloatingHud.test.tsx` entirely:**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { FloatingHud } from "./FloatingHud";
import { Transport } from "../transport/transport";
import type { Score } from "../model/score";
import type { AudioEngine } from "../audio/engine";

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
  const props = {
    transport,
    settingsOpen: false,
    audioEngine,
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
    fireEvent.change(screen.getByRole("slider"), { target: { value: "2" } });
    expect(transport.clock.position).toBeCloseTo(2, 3);
  });

  it("Play mode shows the speed stepper", () => {
    renderHud({ mode: "play" });
    expect(
      screen.getByRole("button", { name: /increase speed/i }),
    ).toBeInTheDocument();
  });

  it("the Play-mode speed stepper changes the transport BPM", () => {
    const { transport } = renderHud({ mode: "play" });
    const ref = transport.referenceBpm;
    fireEvent.click(screen.getByRole("button", { name: /increase speed/i }));
    expect(transport.bpm).toBeGreaterThan(ref);
  });

  it("Practice mode shows no speed stepper and no metronome", () => {
    renderHud({ mode: "practice" });
    expect(
      screen.queryByRole("button", { name: /increase speed/i }),
    ).toBeNull();
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
    fireEvent.pointerDown(screen.getByRole("slider"), {
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
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/ui/FloatingHud.test.tsx`.

- [ ] **Step 3: Replace `src/ui/FloatingHud.tsx` entirely:**

```tsx
import {
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import type { Transport } from "../transport/transport";
import type { AudioEngine } from "../audio/engine";
import type { PracticeMode } from "../layout/practiceMode";
import { startCountIn, type CountInHandle } from "../practice/countIn";

interface FloatingHudProps {
  transport: Transport;
  settingsOpen: boolean;
  audioEngine: AudioEngine | null;
  mode: PracticeMode;
  /** Count-in bars (owned by PracticeView; the metronome section sets it). */
  countInBars: number;
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

interface Position {
  x: number;
  y: number;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * Returns whether the HUD should be faded: true after `IDLE_MS` with no
 * pointer movement. Never fades while `disabled` is true.
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
 * Makes the HUD draggable within its offset parent. The initial position
 * depends on `mode`: Play spawns top-left, Practice spawns top-center. A drag
 * is ignored when it starts on an interactive control.
 */
function useDraggable(mode: PracticeMode): {
  ref: React.RefObject<HTMLDivElement | null>;
  pos: Position | null;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
} {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Position | null>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (el && parent && parent.clientWidth > 0 && parent.clientHeight > 0) {
      const x =
        mode === "play" ? 10 : (parent.clientWidth - el.offsetWidth) / 2;
      setPos({ x, y: 70 });
    } else {
      setPos({ x: 16, y: 70 });
    }
    // Initial placement only — once placed, the user owns the position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    if ((e.target as HTMLElement).closest("button, input, select, label"))
      return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    drag.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
  }

  useEffect(() => {
    function move(e: PointerEvent): void {
      const el = ref.current;
      const d = drag.current;
      if (!el || !d) return;
      const parent = el.offsetParent as HTMLElement | null;
      let x = e.clientX - d.dx;
      let y = e.clientY - d.dy;
      if (parent && parent.clientWidth > 0 && parent.clientHeight > 0) {
        x = clamp(x, 0, parent.clientWidth - el.offsetWidth);
        y = clamp(y, 0, parent.clientHeight - el.offsetHeight);
      }
      setPos({ x, y });
    }
    function up(): void {
      drag.current = null;
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, []);

  return { ref, pos, onPointerDown };
}

/**
 * The draggable transport HUD. Play mode adds a playback-speed stepper;
 * Practice mode is transport-only (loop/tempo/hands/metronome live in the
 * accordion bar). Idle-fades when untouched.
 */
export function FloatingHud({
  transport,
  settingsOpen,
  audioEngine,
  mode,
  countInBars,
}: FloatingHudProps): React.JSX.Element {
  const [, forceUpdate] = useReducer((n: number) => n + 1, 0);
  useEffect(() => transport.clock.onChange(forceUpdate), [transport]);

  const { ref, pos, onPointerDown } = useDraggable(mode);
  const faded = useIdleFade(settingsOpen);

  const { clock } = transport;
  const { playing, position, duration } = clock;

  const [countingIn, setCountingIn] = useState(false);
  const countInRef = useRef<CountInHandle | null>(null);

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

  function changeSpeed(delta: number): void {
    const next = Math.max(
      0,
      Math.min(SPEED_STEPS.length - 1, speedIndex + delta),
    );
    setSpeedIndex(next);
    transport.setBpm(transport.referenceBpm * SPEED_STEPS[next]);
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

  return (
    <div
      ref={ref}
      className={`floating-hud${faded ? " faded" : ""}`}
      style={pos ? { left: pos.x, top: pos.y } : undefined}
      onPointerDown={onPointerDown}
    >
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
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run src/ui/FloatingHud.test.tsx`.

- [ ] **Step 5: Update PracticeView** — In `src/app/PracticeView.tsx`, replace the
`<FloatingHud ... />` element. It currently passes `transport`, `settingsOpen`,
`audioEngine`, `falldown`, `mode`, `collapsed`. Change it to:
```tsx
      <FloatingHud
        transport={transport}
        settingsOpen={settingsOpen}
        audioEngine={audioEngine}
        mode={mode}
        countInBars={0}
      />
```

`countInBars={0}` is a placeholder — Task 6 introduces the real `countInBars`
state in `PracticeView` (owned there, set by the accordion's metronome section)
and replaces this `0`. Do not add the state in this task; passing the literal
`0` keeps the build green without an unused setter.

- [ ] **Step 6: Run tests, typecheck, lint** — `npx vitest run src/ui/FloatingHud.test.tsx && npm run typecheck && npm run lint`.

- [ ] **Step 7: Commit:**

```bash
git add src/ui/FloatingHud.tsx src/ui/FloatingHud.test.tsx src/app/PracticeView.tsx
git commit -m "feat: make the HUD draggable again and move the metronome out"
```

---

## Task 6: ExtendedTopBar as the accordion

**Files:**
- Modify: `src/ui/ExtendedTopBar.tsx` (full rebuild)
- Modify: `src/ui/ExtendedTopBar.test.tsx` (full rewrite)
- Modify: `src/app/PracticeView.tsx`
- Modify: `src/styles/theme.css`

`ExtendedTopBar` is rebuilt as the accordion: four `CollapsibleSection`s — **Loop** (loop controls + a Speed-up BPM sub-group), **Tempo**, **Hands**, **Metronome** (toggle + pulse + `MetronomeSettings`). It owns per-section open state, an open-order queue, and overflow-driven oldest-first auto-collapse. New props add `audioEngine`, `falldown`, `countInBars`, `onCountInBarsChange`.

- [ ] **Step 1: Rewrite `src/ui/ExtendedTopBar.test.tsx` entirely:**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExtendedTopBar } from "./ExtendedTopBar";
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

function renderBar(
  overrides: Partial<Parameters<typeof ExtendedTopBar>[0]> = {},
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
  render(<ExtendedTopBar {...props} />);
  return { transport, handState, props };
}

describe("ExtendedTopBar accordion", () => {
  it("renders the four section chips", () => {
    renderBar();
    expect(screen.getByRole("button", { name: /^loop/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^tempo/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^hands/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^metronome/i }),
    ).toBeInTheDocument();
  });

  it("a section chip toggles its aria-expanded", () => {
    renderBar();
    const loop = screen.getByRole("button", { name: /^loop/i });
    expect(loop).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(loop);
    expect(loop).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(loop);
    expect(loop).toHaveAttribute("aria-expanded", "false");
  });

  it("Loop measure loops the single measure under the playhead", () => {
    const { transport } = renderBar();
    transport.clock.seek(5);
    fireEvent.click(screen.getByRole("button", { name: /loop measure/i }));
    expect(transport.clock.loop).toEqual({ start: 4, end: 6 });
  });

  it("the exact tempo input sets an arbitrary BPM", () => {
    const { transport } = renderBar();
    fireEvent.change(screen.getByRole("spinbutton", { name: /tempo/i }), {
      target: { value: "137" },
    });
    expect(transport.bpm).toBe(137);
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

  it("speed-up reads the start/target/increment BPM fields", () => {
    const { transport } = renderBar();
    fireEvent.change(screen.getByRole("spinbutton", { name: /start bpm/i }), {
      target: { value: "80" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /speed-up/i }));
    // startRate = 80 / referenceBpm — speed-up is active and the clock rate
    // reflects the configured start, not the default 0.5.
    expect(transport.speedUpActive).toBe(true);
  });

  it("the hand visibility select writes through to hand state", () => {
    const { handState } = renderBar();
    fireEvent.change(screen.getByLabelText(/left hand/i), {
      target: { value: "hide" },
    });
    expect(handState.visibility("left")).toBe("hide");
  });

  it("the metronome toggle enables the metronome", () => {
    const { props } = renderBar();
    fireEvent.click(screen.getByRole("checkbox", { name: /metronome/i }));
    expect(props.audioEngine!.metronome.enabled).toBe(true);
  });

  it("the count-in selector reports changes through onCountInBarsChange", () => {
    const onCountInBarsChange = vi.fn();
    renderBar({ onCountInBarsChange });
    fireEvent.change(screen.getByLabelText(/count-in/i), {
      target: { value: "2" },
    });
    expect(onCountInBarsChange).toHaveBeenCalledWith(2);
  });
});
```

Note: all sections' bodies stay mounted (the accordion clips them with CSS, it does not unmount them), so controls inside collapsed sections are still found by queries — no need to open a section before interacting with its controls in these tests.

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/ui/ExtendedTopBar.test.tsx`.

- [ ] **Step 3: Implement** — Replace `src/ui/ExtendedTopBar.tsx` entirely:

```tsx
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Transport } from "../transport/transport";
import type { HandState, HandVisibility } from "../practice/hands";
import type { AudioEngine } from "../audio/engine";
import type { FalldownRenderer } from "../falldown/renderer";
import { CollapsibleSection } from "./CollapsibleSection";
import { MetronomeSettings } from "./MetronomeSettings";

interface ExtendedTopBarProps {
  transport: Transport;
  handState: HandState;
  audioEngine: AudioEngine | null;
  falldown: FalldownRenderer | null;
  countInBars: number;
  onCountInBarsChange: (bars: number) => void;
}

/** The accordion section ids, in display order. */
type SectionId = "loop" | "tempo" | "hands" | "metronome";

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
 * The Practice-mode accordion control bar. Four collapsible sections — Loop
 * (with a Speed-up sub-group), Tempo, Hands, and Metronome. The bar tracks
 * which sections are open and in what order; when opening one would overflow
 * the bar's width, the oldest-opened section auto-collapses to make room.
 * Every section's body stays mounted (CSS clips it) so controls keep their
 * live state regardless of open/closed.
 */
export function ExtendedTopBar({
  transport,
  handState,
  audioEngine,
  falldown,
  countInBars,
  onCountInBarsChange,
}: ExtendedTopBarProps): React.JSX.Element {
  // Open sections, oldest first. The newest open section is last.
  const [openOrder, setOpenOrder] = useState<SectionId[]>([]);
  const barRef = useRef<HTMLDivElement>(null);

  function toggleSection(id: SectionId): void {
    setOpenOrder((order) =>
      order.includes(id) ? order.filter((s) => s !== id) : [...order, id],
    );
  }

  // After a section opens, if the row overflows the bar, collapse the
  // oldest-opened section and re-measure — repeating until it fits (or only
  // the newest section remains open).
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    if (bar.scrollWidth > bar.clientWidth && openOrder.length > 1) {
      setOpenOrder((order) => order.slice(1));
    }
  }, [openOrder]);

  // --- Loop state ---
  const [loopRange, setLoopRange] = useState(() => loopMeasures(transport));
  const [pendingStart, setPendingStart] = useState<number | null>(null);

  function applyLoop(start: number, end: number): void {
    const first = Math.min(start, end);
    const last = Math.max(start, end);
    transport.loopMeasures(first, last);
    setLoopRange({ first, last });
  }
  function handleSetStart(): void {
    const m = measureAt(transport, transport.clock.position);
    if (loopRange) applyLoop(m, loopRange.last);
    else setPendingStart(m);
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
  const loopReadout = loopRange
    ? `m.${loopRange.first + 1}–${loopRange.last + 1}`
    : pendingStart !== null
      ? `m.${pendingStart + 1}–…`
      : "—";

  // --- Speed-up state (BPM-configured) ---
  const refBpm = transport.referenceBpm;
  const [speedUp, setSpeedUp] = useState(() => transport.speedUpActive);
  const [startBpm, setStartBpm] = useState(() =>
    String(Math.round(0.5 * refBpm)),
  );
  const [targetBpm, setTargetBpm] = useState(() => String(Math.round(refBpm)));
  const [incBpm, setIncBpm] = useState(() =>
    String(Math.max(1, Math.round(0.05 * refBpm))),
  );

  function applySpeedUp(
    on: boolean,
    start = startBpm,
    target = targetBpm,
    inc = incBpm,
  ): void {
    if (!on) {
      transport.disableSpeedUp();
      return;
    }
    const s = clamp(Number(start) || 0.5 * refBpm, 20, 300);
    const t = clamp(Number(target) || refBpm, 20, 300);
    const i = clamp(Number(inc) || 1, 1, 100);
    transport.enableSpeedUp({
      startRate: s / refBpm,
      targetRate: t / refBpm,
      step: i / refBpm,
    });
  }
  function handleSpeedUpToggle(checked: boolean): void {
    setSpeedUp(checked);
    applySpeedUp(checked);
  }

  // --- Tempo state ---
  const [bpm, setBpm] = useState(() => String(Math.round(transport.bpm)));
  const [flatten, setFlatten] = useState(
    () => transport.tempoMode === "flatten",
  );
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

  // --- Hands state ---
  const [leftVis, setLeftVis] = useState<HandVisibility>(() =>
    handState.visibility("left"),
  );
  const [rightVis, setRightVis] = useState<HandVisibility>(() =>
    handState.visibility("right"),
  );
  const [muteLeft, setMuteLeft] = useState(() => handState.isMuted("left"));
  const [muteRight, setMuteRight] = useState(() => handState.isMuted("right"));

  // --- Metronome state ---
  const [metronomeOn, setMetronomeOn] = useState(
    () => audioEngine?.metronome.enabled ?? false,
  );
  const pulseRef = useRef<HTMLSpanElement>(null);
  function handleMetronome(checked: boolean): void {
    setMetronomeOn(checked);
    // eslint-disable-next-line react-hooks/immutability
    if (audioEngine) audioEngine.metronome.enabled = checked;
    // eslint-disable-next-line react-hooks/immutability
    if (falldown) falldown.showBeatPulse = checked;
  }
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

  return (
    <div className="extended-top-bar" ref={barRef}>
      <CollapsibleSection
        label="Loop"
        open={openOrder.includes("loop")}
        onToggle={() => toggleSection("loop")}
      >
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
        <span className="ext-divider" aria-hidden="true" />
        <span className="ext-sub-label">Speed-up</span>
        <label>
          <input
            type="checkbox"
            checked={speedUp}
            onChange={(e) => handleSpeedUpToggle(e.target.checked)}
          />{" "}
          on
        </label>
        <label>
          Start BPM{" "}
          <input
            type="number"
            className="ext-tempo-input"
            value={startBpm}
            onChange={(e) => setStartBpm(e.target.value)}
          />
        </label>
        <label>
          Target BPM{" "}
          <input
            type="number"
            className="ext-tempo-input"
            value={targetBpm}
            onChange={(e) => setTargetBpm(e.target.value)}
          />
        </label>
        <label>
          +BPM / loop{" "}
          <input
            type="number"
            className="ext-tempo-input"
            value={incBpm}
            onChange={(e) => setIncBpm(e.target.value)}
          />
        </label>
      </CollapsibleSection>

      <CollapsibleSection
        label="Tempo"
        open={openOrder.includes("tempo")}
        onToggle={() => toggleSection("tempo")}
      >
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
      </CollapsibleSection>

      <CollapsibleSection
        label="Hands"
        open={openOrder.includes("hands")}
        onToggle={() => toggleSection("hands")}
      >
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
      </CollapsibleSection>

      <CollapsibleSection
        label="Metronome"
        open={openOrder.includes("metronome")}
        onToggle={() => toggleSection("metronome")}
      >
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
          onCountInBarsChange={onCountInBarsChange}
        />
      </CollapsibleSection>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run src/ui/ExtendedTopBar.test.tsx`.

- [ ] **Step 5: Update PracticeView** — In `src/app/PracticeView.tsx`:

(a0) Add the real `countInBars` state near the other state declarations:
```tsx
  const [countInBars, setCountInBars] = useState(0);
```
and change the `<FloatingHud>` element's placeholder `countInBars={0}` (added in
Task 5) to `countInBars={countInBars}`.

(a) The `<ExtendedTopBar ... />` element currently passes `transport` and `handState`. Change it to:
```tsx
        <ExtendedTopBar
          transport={transport}
          handState={handState}
          audioEngine={audioEngine}
          falldown={falldown}
          countInBars={countInBars}
          onCountInBarsChange={setCountInBars}
        />
```

(b) The render condition for `ExtendedTopBar` and the `practice-view--extended` root class currently use `extendedBarShown = mode === "practice" && !hudCollapsed && practiceReady`. The whole-bar collapse is gone — change the derived flag to:
```tsx
  const extendedBarShown = mode === "practice" && practiceReady;
```

(c) Remove the now-dead `hudCollapsed` state: delete `const [hudCollapsed, setHudCollapsed] = useState(false);` and any remaining reference to `hudCollapsed` / `setHudCollapsed` (there should be none left after Task 3 removed the `<TopBar>` props and step (b) above). Also remove the `collapsedRef` ref and its sync effect if present, and stop passing `hudCollapsed` to `capturePracticeState` — the `capturePracticeState` call's `session` argument currently includes `hudCollapsed: collapsedRef.current`; change that object to just `{ mode: modeRef.current }` (the `hudCollapsed` field on `StoredPracticeState` stays optional in the type and is simply no longer written).

- [ ] **Step 6: Run tests, typecheck, lint** — `npx vitest run src/ui/ExtendedTopBar.test.tsx src/app/PracticeView.test.tsx && npm run typecheck && npm run lint`. Fix any `PracticeView.test.tsx` fallout from the removed `hudCollapsed` mechanically.

- [ ] **Step 7: Run the full unit suite** — `npm test`. All green; fix mechanical fallout in other suites.

- [ ] **Step 8: Add accordion-bar styling** — Append to `src/styles/theme.css`. The `.extended-top-bar` rule already exists from the prior redesign (absolute, top:68px, left/right:10px, glass, `display:flex; flex-wrap:wrap`). Add the sub-controls styling used by the section bodies:

```css
/* A thin divider between the loop controls and the speed-up sub-group. */
.ext-divider {
  width: 1px;
  align-self: stretch;
  background: var(--glass-border);
  margin: 0 0.2rem;
}

.ext-sub-label {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-dim);
}
```

The `.ext-tempo-input`, `.ext-loop-readout`, `.ext-box`-era rules from the prior redesign remain; `.ext-box` itself is no longer used (the accordion replaces the boxes) — leave the rule (harmless) or delete it. The `.accordion-*` rules from Task 4 style the sections.

- [ ] **Step 9: Commit:**

```bash
git add src/ui/ExtendedTopBar.tsx src/ui/ExtendedTopBar.test.tsx src/app/PracticeView.tsx src/styles/theme.css
git commit -m "feat: rebuild the extended bar as a collapsible accordion"
```

---

## Task 7: Styling polish + score clearance

**Files:**
- Modify: `src/styles/theme.css`

The fixed-HUD position classes (`.floating-hud--play`, `.floating-hud--practice`, `.floating-hud--raised`) are dead now that the HUD is drag-positioned — remove them. Confirm the score still clears the accordion bar in Practice mode.

- [ ] **Step 1: Remove dead HUD position rules** — In `src/styles/theme.css`, delete the `.floating-hud--play`, `.floating-hud--practice`, and `.floating-hud--practice.floating-hud--raised` rules. The base `.floating-hud` rule keeps `position: absolute` (the drag sets `left`/`top` inline). The HUD must re-gain `cursor: grab` — add `cursor: grab;` to the `.floating-hud` rule.

- [ ] **Step 2: Confirm score clearance** — The `.practice-view--extended .score-container { padding-top: 120px; }` rule from the prior redesign still applies (Task 6 keeps the `practice-view--extended` root class, now meaning simply "Practice mode"). The accordion bar is roughly the same height as the old extended bar (one row of chips; open sections grow wider, not taller, and the bar `flex-wrap`s if truly full). Leave the 120px clearance. No change needed unless the build/visual check shows a collision.

- [ ] **Step 3: Build + test** — `npm run build && npm test && npm run lint && npm run typecheck` — all clean/green.

- [ ] **Step 4: Commit:**

```bash
git add src/styles/theme.css
git commit -m "style: drop the dead fixed-HUD position rules"
```

---

## Task 8: End-to-end coverage and final verification

**Files:**
- Modify: `tests/e2e/practice.spec.ts`

- [ ] **Step 1: Update the mode-switch e2e test** — READ `tests/e2e/practice.spec.ts`. The test `switching to Practice mode reveals the extended control bar` used the old `.top-bar-modes`-scoped "Practice" button and a "Collapse control bar" button. The mode switch is now a single `role="switch"` toggle (accessible name "Play / Practice"); there is no whole-bar collapse button; the accordion sections are chips. Rewrite that test body to:

```ts
  await page.goto("/");
  await page.setInputFiles('input[type="file"]', "src/test/fixtures/clean.mid");
  await expect(page.locator("canvas.falldown-canvas")).toBeVisible({
    timeout: 15_000,
  });

  // Play mode: speed stepper present, no accordion.
  await expect(
    page.getByRole("button", { name: /increase speed/i }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^loop/i })).toHaveCount(0);

  // Flip the toggle to Practice — the accordion section chips appear.
  await page.getByRole("switch", { name: /play.*practice/i }).click();
  await expect(page.getByRole("button", { name: /^loop/i })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^metronome/i }),
  ).toBeVisible();

  // Open the Loop section — its controls become reachable.
  await page.getByRole("button", { name: /^loop/i }).click();
  await expect(
    page.getByRole("button", { name: /loop measure/i }),
  ).toBeVisible();

  // Flip back to Play.
  await page.getByRole("switch", { name: /play.*practice/i }).click();
  await expect(
    page.getByRole("button", { name: /increase speed/i }),
  ).toBeVisible();
```

Keep the test name accurate (e.g. `"the Play/Practice toggle reveals the accordion control bar"`).

Note: the accordion section bodies stay in the DOM even when collapsed, so `getByRole("button", { name: /loop measure/i })` may be present but visually clipped. Use `.toBeVisible()` only after opening the section; before opening, prefer asserting the chip itself. If `toBeVisible()` on `loop measure` is flaky because the clipped body still reports as visible to Playwright, assert instead that clicking the Loop chip toggles its `aria-expanded` to `"true"`: `await expect(page.getByRole("button", { name: /^loop/i })).toHaveAttribute("aria-expanded", "true")`.

- [ ] **Step 2: Check the other e2e tests** — Run `npx playwright test tests/e2e/practice.spec.ts` and the whole `npm run e2e`. The arrow-key test and view-mode test should be unaffected. If any spec used the old `.top-bar-modes` selector or the segmented mode buttons, update it to the new `role="switch"` toggle.

- [ ] **Step 3: Full verification gate** — run all five, confirm clean/green:

```
npm run lint
npm run typecheck
npm test
npm run build
npm run e2e
```

If any fails, find the root cause and fix it minimally; describe any real bug found.

- [ ] **Step 4: Manual smoke check** — `npm run dev`:
  - Top bar: `arpeggio` · Library · Play/Practice slider on the left; piece name centered; view modes + ⚙ on the right.
  - The HUD is draggable in both modes; idle-fades.
  - Practice mode: the accordion bar shows Loop / Tempo / Hands / Metronome chips. Clicking a chip slides it open; clicking again shuts it. Opening enough sections that they would overflow collapses the oldest-opened one.
  - The Loop section contains the loop controls plus the Speed-up sub-group (on toggle + start/target/increment BPM).
  - The Metronome section has the on/off toggle, the pulse, and the metronome settings (incl. count-in); count-in still plays before the music.
  - Toggling Flatten while a loop is set keeps the loop.
  - ⚙ drawer and arrow-key measure jumping still work.

- [ ] **Step 5: Commit:**

```bash
git add tests/e2e/practice.spec.ts
git commit -m "test: cover the mode toggle and accordion control bar end-to-end"
```

---

## Done

Spec coverage: §2 mode slider — Tasks 2, 3; §3 movable HUD — Task 5; §4 accordion + auto-collapse — Tasks 4, 6; §5 Loop + BPM speed-up — Task 6; §6 metronome section — Task 6; §7 Tempo/Hands sections — Task 6; §8 flatten/loop bug — Task 1; §10 persistence (`hudCollapsed` retired) — Task 6; §11 testing — every task plus Task 8.

After the final commit, the controller merges `feature/practice-mode` to `main` and pushes (auto-deploys), per the user's "move straight to production" instruction.
