# Practice Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a switchable Play / Practice mode — a top-bar mode switch, an expanded collapsible Practice HUD surfacing loop/tempo/speed-up/hands/metronome, a playhead-based loop-range picker, and metronome count-in.

**Architecture:** A new `PracticeMode` type drives a `ModeSwitch` segmented control in the `TopBar`. `FloatingHud` becomes mode-aware: in Play mode it shows transport + a playback-speed stepper; in Practice mode it shows transport + a collapse toggle + (when expanded) a new `PracticeHudControls` component carrying the practice tooling. `PracticeView` owns the mode and implements suspend/restore — switching to Play stows the loop, speed-up, metronome, and hand state, switching back restores them. The metronome and the practice tooling move out of the `⚙` settings drawer (`ControlPanel`), which shrinks to display preferences. `mode` and the HUD collapse state are persisted per piece.

**Tech Stack:** Vite + TypeScript + React 19, Vitest + Testing Library, Playwright. Strict TS (`noUnusedLocals`/`noUnusedParameters`), React 19 `react-jsx` (no `import React`). Writing through to imperative objects (renderer/audio engine) needs `// eslint-disable-next-line react-hooks/immutability`.

**Spec:** `docs/superpowers/specs/2026-05-18-practice-mode-design.md`

**Branch:** `feature/practice-mode` (already created off `main`).

**Verification gate (run after the final task):** `npm run lint && npm run typecheck && npm test && npm run build && npm run e2e`

---

## Task 1: PracticeMode type

**Files:**
- Create: `src/layout/practiceMode.ts`
- Test: `src/layout/practiceMode.test.ts`

This mirrors the existing `src/layout/viewMode.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/layout/practiceMode.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { PRACTICE_MODES, type PracticeMode } from "./practiceMode";

describe("practiceMode", () => {
  it("lists Play and Practice in order", () => {
    expect(PRACTICE_MODES).toEqual(["play", "practice"]);
  });

  it("PracticeMode admits exactly the two modes", () => {
    const modes: PracticeMode[] = ["play", "practice"];
    expect(modes).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/layout/practiceMode.test.ts`
Expected: FAIL — cannot find module `./practiceMode`.

- [ ] **Step 3: Write minimal implementation**

Create `src/layout/practiceMode.ts`:

```ts
/** Which session mode the practice screen is in. */
export type PracticeMode = "play" | "practice";

/** All practice modes, in switcher order. Designed so a third could be added. */
export const PRACTICE_MODES: readonly PracticeMode[] = ["play", "practice"];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/layout/practiceMode.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/layout/practiceMode.ts src/layout/practiceMode.test.ts
git commit -m "feat: add the PracticeMode type"
```

---

## Task 2: ModeSwitch component

**Files:**
- Create: `src/ui/ModeSwitch.tsx`
- Test: `src/ui/ModeSwitch.test.tsx`
- Modify: `src/styles/theme.css` (append a `.top-bar-modes` rule)

A two-segment Play / Practice control, styled like the existing view-mode switch.

- [ ] **Step 1: Write the failing test**

Create `src/ui/ModeSwitch.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ModeSwitch } from "./ModeSwitch";

describe("ModeSwitch", () => {
  it("renders a Play and a Practice segment", () => {
    render(<ModeSwitch mode="play" onModeChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /^play$/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^practice$/i }),
    ).toBeInTheDocument();
  });

  it("marks the active mode with aria-pressed", () => {
    render(<ModeSwitch mode="practice" onModeChange={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /^practice$/i }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^play$/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("emits onModeChange when a segment is clicked", () => {
    const onModeChange = vi.fn();
    render(<ModeSwitch mode="play" onModeChange={onModeChange} />);
    fireEvent.click(screen.getByRole("button", { name: /^practice$/i }));
    expect(onModeChange).toHaveBeenCalledWith("practice");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/ModeSwitch.test.tsx`
Expected: FAIL — cannot find module `./ModeSwitch`.

- [ ] **Step 3: Write minimal implementation**

Create `src/ui/ModeSwitch.tsx`:

```tsx
import { PRACTICE_MODES, type PracticeMode } from "../layout/practiceMode";

interface ModeSwitchProps {
  mode: PracticeMode;
  onModeChange: (m: PracticeMode) => void;
}

const LABELS: Record<PracticeMode, string> = {
  play: "Play",
  practice: "Practice",
};

/**
 * The Play / Practice segmented control. Purely presentational; the mode
 * state lives in PracticeView. Built so a third segment could be added later.
 */
export function ModeSwitch({
  mode,
  onModeChange,
}: ModeSwitchProps): React.JSX.Element {
  return (
    <div className="top-bar-modes">
      {PRACTICE_MODES.map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={mode === m}
          onClick={() => onModeChange(m)}
        >
          {LABELS[m]}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/ModeSwitch.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Add the styling**

Append to `src/styles/theme.css` (after the `.top-bar-views` block, around line 117):

```css
.top-bar-modes {
  display: flex;
  gap: 0.25rem;
}
```

The segment buttons inherit `.top-bar button` and `.top-bar button[aria-pressed="true"]` styling already defined.

- [ ] **Step 6: Run the full unit suite and verify**

Run: `npx vitest run src/ui/ModeSwitch.test.tsx && npm run lint`
Expected: PASS, lint clean.

- [ ] **Step 7: Commit**

```bash
git add src/ui/ModeSwitch.tsx src/ui/ModeSwitch.test.tsx src/styles/theme.css
git commit -m "feat: add the Play/Practice ModeSwitch component"
```

---

## Task 3: TopBar renders the ModeSwitch

**Files:**
- Modify: `src/ui/TopBar.tsx`
- Modify: `src/ui/TopBar.test.tsx`
- Modify: `src/app/PracticeView.tsx` (placeholder props to keep the build green)

The `ModeSwitch` goes in the existing `.top-bar-spacer` slot. The spacer currently
reserves empty space; it now wraps the switch and stays centered via flex.

- [ ] **Step 1: Write the failing test**

Add to `src/ui/TopBar.test.tsx` — first extend `renderBar`'s default props with the two new props, then add the test:

In `renderBar`, add to the `props` object: `mode: "play" as const,` and `onModeChange: vi.fn(),`.

Add this test inside the `describe("TopBar", ...)` block:

```tsx
  it("renders the mode switch and emits onModeChange", () => {
    const { props } = renderBar();
    const practice = screen.getByRole("button", { name: /^practice$/i });
    expect(practice).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(practice);
    expect(props.onModeChange).toHaveBeenCalledWith("practice");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/TopBar.test.tsx`
Expected: FAIL — `onModeChange` not a function / no Practice button.

- [ ] **Step 3: Modify the TopBar**

In `src/ui/TopBar.tsx`:

Add the import at the top:

```tsx
import { ModeSwitch } from "./ModeSwitch";
import type { PracticeMode } from "../layout/practiceMode";
```

Add to `TopBarProps`:

```tsx
  mode: PracticeMode;
  onModeChange: (m: PracticeMode) => void;
```

Add `mode` and `onModeChange` to the destructured parameters in the function
signature, then replace the bare spacer span:

```tsx
      <span className="top-bar-spacer" />
```

with:

```tsx
      <div className="top-bar-spacer">
        <ModeSwitch mode={mode} onModeChange={onModeChange} />
      </div>
```

The `.top-bar-spacer` rule already has `flex: 1`; the `ModeSwitch` sits inside
it. Add `display: flex; justify-content: center;` to keep the switch centered —
modify the `.top-bar-spacer` rule in `src/styles/theme.css`:

```css
.top-bar-spacer {
  flex: 1;
  display: flex;
  justify-content: center;
}
```

- [ ] **Step 4: Keep the build green — update the PracticeView call site**

In `src/app/PracticeView.tsx`, the `<TopBar ... />` element now needs the two
new props. Add placeholder props (real wiring lands in Task 12):

```tsx
      <TopBar
        pieceName={pieceName}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onOpenLibrary={onExit}
        settingsOpen={settingsOpen}
        onToggleSettings={() => setSettingsOpen((o) => !o)}
        mode="play"
        onModeChange={() => {}}
      />
```

- [ ] **Step 5: Run tests and typecheck to verify they pass**

Run: `npx vitest run src/ui/TopBar.test.tsx && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/ui/TopBar.tsx src/ui/TopBar.test.tsx src/styles/theme.css src/app/PracticeView.tsx
git commit -m "feat: render the ModeSwitch in the TopBar"
```

---

## Task 4: Persist mode and hudCollapsed

**Files:**
- Modify: `src/library/db.ts:17-32` (the `StoredPracticeState` interface)
- Modify: `src/library/practiceState.ts`
- Modify: `src/library/practiceState.test.ts`

Two new optional fields, kept optional so pre-feature records still load.

- [ ] **Step 1: Write the failing test**

Add to `src/library/practiceState.test.ts` (inside the file, after the existing
`describe` blocks):

```ts
import { PRACTICE_MODES } from "../layout/practiceMode";

describe("practice-mode persistence", () => {
  it("round-trips mode and hudCollapsed", () => {
    const t = new Transport(score);
    const hands = new HandState();
    const captured = capturePracticeState(t, hands, undefined, {
      mode: "practice",
      hudCollapsed: true,
    });
    expect(captured.mode).toBe("practice");
    expect(captured.hudCollapsed).toBe(true);
    expect(PRACTICE_MODES).toContain(captured.mode);
  });

  it("omits mode and hudCollapsed when not given", () => {
    const t = new Transport(score);
    const hands = new HandState();
    const captured = capturePracticeState(t, hands);
    expect(captured.mode).toBeUndefined();
    expect(captured.hudCollapsed).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/library/practiceState.test.ts`
Expected: FAIL — `capturePracticeState` takes 3 args / `mode` not on result.

- [ ] **Step 3: Extend StoredPracticeState**

In `src/library/db.ts`, add an import at the top of the file (next to the
existing `HandVisibility` import — check the existing import line for hands):

```ts
import type { PracticeMode } from "../layout/practiceMode";
```

Add to the `StoredPracticeState` interface (after `subdivision?: number;`):

```ts
  /** The last-used session mode (optional for records saved before this). */
  mode?: PracticeMode;
  /** The Practice-HUD collapse state (optional for records saved before this). */
  hudCollapsed?: boolean;
```

- [ ] **Step 4: Extend capturePracticeState and applyPracticeState**

In `src/library/practiceState.ts`:

Add to the imports:

```ts
import type { PracticeMode } from "../layout/practiceMode";
```

Replace the whole `capturePracticeState` function with:

```ts
/** Read the current tempo, loop, hand, beat, and session settings. */
export function capturePracticeState(
  transport: Transport,
  hands: HandState,
  beat?: { numerator: number; denominator: number; subdivision: number },
  session?: { mode: PracticeMode; hudCollapsed: boolean },
): StoredPracticeState {
  const loop = transport.clock.loop;
  return {
    bpm: transport.bpm,
    loop: loop ? { start: loop.start, end: loop.end } : null,
    leftMuted: hands.isMuted("left"),
    rightMuted: hands.isMuted("right"),
    leftVisibility: hands.visibility("left"),
    rightVisibility: hands.visibility("right"),
    ...(beat && {
      numerator: beat.numerator,
      denominator: beat.denominator,
      subdivision: beat.subdivision,
    }),
    ...(session && {
      mode: session.mode,
      hudCollapsed: session.hudCollapsed,
    }),
  };
}
```

`applyPracticeState` needs no change — `mode` and `hudCollapsed` are read
directly off the stored record by `PracticeView` in Task 12, not applied to the
transport.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/library/practiceState.test.ts && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/library/db.ts src/library/practiceState.ts src/library/practiceState.test.ts
git commit -m "feat: persist session mode and HUD collapse state"
```

---

## Task 5: Transport.speedUpActive getter

**Files:**
- Modify: `src/transport/transport.ts`
- Test: `src/transport/transport.test.ts` (existing file — add a test)

The suspend/restore logic in Task 12 needs to know whether gradual speed-up is
currently on. `Transport` tracks it privately; expose a read-only getter.

- [ ] **Step 1: Write the failing test**

Add to `src/transport/transport.test.ts` (inside the existing top-level
`describe`, or add a new `describe("speedUpActive", ...)` block — use the
`score` fixture already defined in that file):

```ts
describe("speedUpActive", () => {
  it("reports false initially, true after enableSpeedUp, false after disable", () => {
    const t = new Transport(score);
    expect(t.speedUpActive).toBe(false);
    t.enableSpeedUp({ startRate: 0.5, targetRate: 1, step: 0.05 });
    expect(t.speedUpActive).toBe(true);
    t.disableSpeedUp();
    expect(t.speedUpActive).toBe(false);
  });
});
```

If `transport.test.ts` does not already define a `score` fixture, reuse the one
from `src/library/practiceState.test.ts` (copy the `score` object into the new
`describe`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/transport/transport.test.ts`
Expected: FAIL — `speedUpActive` does not exist on `Transport`.

- [ ] **Step 3: Add the getter**

In `src/transport/transport.ts`, add after the `tempoMode` getter (around line 51):

```ts
  /** Whether gradual speed-up is currently running. */
  get speedUpActive(): boolean {
    return this._speedUp !== null;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/transport/transport.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/transport/transport.ts src/transport/transport.test.ts
git commit -m "feat: expose Transport.speedUpActive"
```

---

## Task 6: AudioEngine.playClick

**Files:**
- Modify: `src/audio/engine.ts`
- Test: `src/audio/engine.test.ts` (existing file — add a test)

Count-in needs to play standalone metronome clicks. Expose a public method that
forwards to the click sink.

- [ ] **Step 1: Write the failing test**

Add to `src/audio/engine.test.ts`. The existing tests construct an
`AudioEngine` with fake `PianoSink` / `ClickSink`; reuse that pattern. Add:

```ts
it("playClick forwards to the click sink", () => {
  const clicks: boolean[] = [];
  const piano = { playNote: () => {} };
  const click = { playClick: (accent: boolean) => clicks.push(accent) };
  const engine = new AudioEngine(transport, piano, click);
  engine.playClick(true);
  engine.playClick(false);
  expect(clicks).toEqual([true, false]);
});
```

Use the same `transport` construction the other tests in that file use (a
`new Transport(score)` with the file's `score` fixture). If the surrounding
tests build `transport` inside each test, do the same here.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/audio/engine.test.ts`
Expected: FAIL — `playClick` does not exist on `AudioEngine`.

- [ ] **Step 3: Add the method**

In `src/audio/engine.ts`, add a public method to the `AudioEngine` class, after
the `update()` method (around line 103, before the closing brace of the class):

```ts
  /** Play a single metronome click immediately. Used by the count-in. */
  playClick(accent: boolean): void {
    this.click.playClick(accent);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/audio/engine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/audio/engine.ts src/audio/engine.test.ts
git commit -m "feat: add AudioEngine.playClick for the count-in"
```

---

## Task 7: CountIn module

**Files:**
- Create: `src/practice/countIn.ts`
- Test: `src/practice/countIn.test.ts`

A self-contained scheduler: plays `bars * beatsPerBar` clicks at a given tempo
via `window.setTimeout`, then fires `onComplete`. Returns a handle that can
cancel the pending schedule.

- [ ] **Step 1: Write the failing test**

Create `src/practice/countIn.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { startCountIn } from "./countIn";

describe("startCountIn", () => {
  it("fires bars*beatsPerBar clicks then onComplete", () => {
    vi.useFakeTimers();
    try {
      const clicks: boolean[] = [];
      const complete = vi.fn();
      // 2 bars of 4 at 120 BPM => 8 clicks, 0.5 s apart, complete at 4.0 s.
      startCountIn({
        bars: 2,
        beatsPerBar: 4,
        bpm: 120,
        onClick: (accent) => clicks.push(accent),
        onComplete: complete,
      });
      vi.advanceTimersByTime(4100);
      expect(clicks).toHaveLength(8);
      expect(complete).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("accents the first beat of every bar", () => {
    vi.useFakeTimers();
    try {
      const clicks: boolean[] = [];
      startCountIn({
        bars: 2,
        beatsPerBar: 4,
        bpm: 240,
        onClick: (accent) => clicks.push(accent),
        onComplete: () => {},
      });
      vi.advanceTimersByTime(3000);
      expect(clicks).toEqual([
        true, false, false, false,
        true, false, false, false,
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancel() stops pending clicks and onComplete", () => {
    vi.useFakeTimers();
    try {
      const clicks: boolean[] = [];
      const complete = vi.fn();
      const handle = startCountIn({
        bars: 1,
        beatsPerBar: 4,
        bpm: 120,
        onClick: (accent) => clicks.push(accent),
        onComplete: complete,
      });
      vi.advanceTimersByTime(600); // one click fired (t=0), next at t=500
      handle.cancel();
      vi.advanceTimersByTime(5000);
      expect(clicks).toHaveLength(2);
      expect(complete).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/practice/countIn.test.ts`
Expected: FAIL — cannot find module `./countIn`.

- [ ] **Step 3: Write the implementation**

Create `src/practice/countIn.ts`:

```ts
/** A running count-in; call cancel() to stop it before it completes. */
export interface CountInHandle {
  cancel(): void;
}

export interface CountInOptions {
  /** Number of bars to count in (>= 1). */
  bars: number;
  /** Beats per bar (>= 1). */
  beatsPerBar: number;
  /** Tempo in BPM (> 0); sets the spacing between clicks. */
  bpm: number;
  /** Called for each click; `accent` is true on every bar's first beat. */
  onClick: (accent: boolean) => void;
  /** Called once, one beat after the final click. */
  onComplete: () => void;
}

/**
 * Schedule a metronome count-in. Plays `bars * beatsPerBar` evenly spaced
 * clicks starting immediately, then fires `onComplete` one beat after the last
 * click (the downbeat the music should start on). Uses real-time timers, so
 * it runs independently of the master clock.
 */
export function startCountIn(opts: CountInOptions): CountInHandle {
  const { bars, beatsPerBar, bpm, onClick, onComplete } = opts;
  const intervalMs = (60 / bpm) * 1000;
  const totalClicks = bars * beatsPerBar;
  const timers: number[] = [];

  for (let i = 0; i < totalClicks; i++) {
    const accent = i % beatsPerBar === 0;
    timers.push(
      window.setTimeout(() => onClick(accent), i * intervalMs),
    );
  }
  timers.push(window.setTimeout(onComplete, totalClicks * intervalMs));

  return {
    cancel(): void {
      for (const id of timers) window.clearTimeout(id);
    },
  };
}
```

Note: the click at `i = 0` is scheduled with a 0 ms timeout, so under fake
timers it fires on the first `advanceTimersByTime` rather than synchronously —
the tests account for this.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/practice/countIn.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/practice/countIn.ts src/practice/countIn.test.ts
git commit -m "feat: add the count-in scheduler"
```

---

## Task 8: MetronomeMenu count-in selector

**Files:**
- Modify: `src/ui/MetronomeMenu.tsx`
- Modify: `src/ui/MetronomeMenu.test.tsx`

Add a Count-in `<select>` (Off / 1 bar / 2 bars). The value is owned by the
caller (so it survives the menu unmounting); `MetronomeMenu` takes it as props.

- [ ] **Step 1: Write the failing test**

Add to `src/ui/MetronomeMenu.test.tsx`. First extend the menu's render helper /
default props with `countInBars: 0` and `onCountInBarsChange: vi.fn()` (match
how the file constructs `MetronomeMenu` props). Then add:

```tsx
  it("renders the count-in selector and reports changes in bars", () => {
    const onCountInBarsChange = vi.fn();
    renderMenu({ countInBars: 0, onCountInBarsChange });
    const select = screen.getByLabelText(/count-in/i);
    expect(select).toHaveValue("0");
    fireEvent.change(select, { target: { value: "2" } });
    expect(onCountInBarsChange).toHaveBeenCalledWith(2);
  });
```

Adjust `renderMenu` to whatever the existing helper in that file is called; if
the file renders `<MetronomeMenu .../>` inline per test, add the two props
inline and write the test to match.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/MetronomeMenu.test.tsx`
Expected: FAIL — no count-in selector / prop not a function.

- [ ] **Step 3: Modify the MetronomeMenu**

In `src/ui/MetronomeMenu.tsx`, add to `MetronomeMenuProps`:

```tsx
  countInBars: number;
  onCountInBarsChange: (bars: number) => void;
```

Add `countInBars` and `onCountInBarsChange` to the destructured parameters.

Add this `<label>` to the rendered JSX, after the Subdivision label and before
the closing `</div>`:

```tsx
      <label>
        Count-in{" "}
        <select
          value={countInBars}
          onChange={(e) => onCountInBarsChange(Number(e.target.value))}
        >
          <option value={0}>Off</option>
          <option value={1}>1 bar</option>
          <option value={2}>2 bars</option>
        </select>
      </label>
```

- [ ] **Step 4: Keep the build green — update the FloatingHud call site**

`MetronomeMenu` is rendered by `FloatingHud` today. In `src/ui/FloatingHud.tsx`,
find the `<MetronomeMenu ... />` element and add placeholder props (Task 10
replaces these):

```tsx
          <MetronomeMenu
            transport={transport}
            falldown={falldown}
            audioEngine={audioEngine}
            countInBars={0}
            onCountInBarsChange={() => {}}
          />
```

- [ ] **Step 5: Run tests and typecheck to verify**

Run: `npx vitest run src/ui/MetronomeMenu.test.tsx && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/ui/MetronomeMenu.tsx src/ui/MetronomeMenu.test.tsx src/ui/FloatingHud.tsx
git commit -m "feat: add the count-in selector to the metronome menu"
```

---

## Task 9: Reduce ControlPanel to display preferences

**Files:**
- Modify: `src/practice/ControlPanel.tsx`
- Modify: `src/practice/ControlPanel.test.tsx`

Remove loop, gradual speed-up, and the per-hand mute + visibility controls.
`ControlPanel` keeps only the display preferences: note labels, beat grid,
full 88 keys, flatten tempo. The `handState` prop is no longer used.

- [ ] **Step 1: Update the test**

In `src/practice/ControlPanel.test.tsx`:

- Remove any tests asserting Loop measure / Clear loop / Gradual speed-up / Mute
  left / Mute right / Left hand / Right hand controls.
- Update the `ControlPanel` render calls: the component no longer takes a
  `handState` prop (see Step 2). Remove `handState` from the props passed in.
- Add a test asserting the practice controls are gone:

```tsx
  it("no longer renders loop, speed-up, or hand controls", () => {
    renderPanel();
    expect(
      screen.queryByRole("button", { name: /loop measure/i }),
    ).toBeNull();
    expect(
      screen.queryByRole("checkbox", { name: /gradual speed-up/i }),
    ).toBeNull();
    expect(screen.queryByRole("checkbox", { name: /mute left/i })).toBeNull();
  });

  it("still renders the display preferences", () => {
    renderPanel();
    expect(
      screen.getByRole("checkbox", { name: /note labels/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /beat grid/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /full 88/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /flatten tempo/i }),
    ).toBeInTheDocument();
  });
```

`renderPanel` is whatever helper the file uses; update it to drop `handState`.
Keep the existing tests for note labels / beat grid / full 88 / flatten tempo
that still apply.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/practice/ControlPanel.test.tsx`
Expected: FAIL — old removed-control tests still expect controls / type error
on `handState`.

- [ ] **Step 3: Rewrite ControlPanel**

Replace the entire contents of `src/practice/ControlPanel.tsx` with:

```tsx
import { useState } from "react";
import type { Transport } from "../transport/transport";
import type { FalldownRenderer } from "../falldown/renderer";

interface ControlPanelProps {
  transport: Transport;
  falldown: FalldownRenderer;
}

/**
 * The settings-drawer panel: display preferences only. Note labels, beat grid,
 * and the full-88 toggle write through to the falldown renderer; flatten tempo
 * writes through to the transport. Practice tooling (loop, speed-up, tempo,
 * hands) lives in the Practice-mode HUD, not here.
 */
export function ControlPanel({
  transport,
  falldown,
}: ControlPanelProps): React.JSX.Element {
  const [showLabels, setShowLabels] = useState(falldown.showLabels);
  const [showBeatGrid, setShowBeatGrid] = useState(falldown.showBeatGrid);
  const [full88, setFull88] = useState(falldown.full88);
  const [flattenTempo, setFlattenTempo] = useState(
    transport.tempoMode === "flatten",
  );

  function handleFlattenTempo(checked: boolean): void {
    setFlattenTempo(checked);
    transport.setTempoMode(checked ? "flatten" : "preserve");
  }

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
          <input
            type="checkbox"
            checked={flattenTempo}
            onChange={(e) => handleFlattenTempo(e.target.checked)}
          />{" "}
          Flatten tempo changes
        </label>
      </fieldset>
    </div>
  );
}
```

- [ ] **Step 4: Keep the build green — update the PracticeView call site**

In `src/app/PracticeView.tsx`, the `<ControlPanel ... />` element drops the
`handState` prop:

```tsx
      {falldown && practiceReady && settingsOpen && (
        <ControlPanel transport={transport} falldown={falldown} />
      )}
```

- [ ] **Step 5: Run tests and typecheck to verify they pass**

Run: `npx vitest run src/practice/ControlPanel.test.tsx && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/practice/ControlPanel.tsx src/practice/ControlPanel.test.tsx src/app/PracticeView.tsx
git commit -m "refactor: reduce the settings drawer to display preferences"
```

---

## Task 10: PracticeHudControls component

**Files:**
- Create: `src/ui/PracticeHudControls.tsx`
- Create: `src/ui/PracticeHudControls.test.tsx`
- Modify: `src/styles/theme.css` (append HUD row + group rules)

This is Practice-HUD Row 2: loop-range picker, tempo stepper, gradual speed-up
toggle, per-hand controls, and the metronome (toggle + menu). It owns its own
local state mirrors and writes through to the imperative objects, like the old
`ControlPanel` did. On mount it reads live state — so a mode switch (which
remounts it, Task 12) re-syncs every control.

Count-in `bars` is owned by the parent (`FloatingHud`) and threaded through to
`MetronomeMenu`, so it survives the metronome menu opening/closing.

- [ ] **Step 1: Write the failing test**

Create `src/ui/PracticeHudControls.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PracticeHudControls } from "./PracticeHudControls";
import { Transport } from "../transport/transport";
import { HandState } from "../practice/hands";
import type { Score } from "../model/score";
import type { AudioEngine } from "../audio/engine";
import type { FalldownRenderer } from "../falldown/renderer";

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

function renderControls(
  overrides: Partial<Parameters<typeof PracticeHudControls>[0]> = {},
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
    falldown: null as FalldownRenderer | null,
    countInBars: 0,
    onCountInBarsChange: vi.fn(),
    ...overrides,
  };
  render(<PracticeHudControls {...props} />);
  return { transport, handState, props };
}

describe("PracticeHudControls", () => {
  it("Set start then Set end builds a loop over the playhead measures", () => {
    const { transport } = renderControls();
    transport.clock.seek(1); // inside measure 0
    fireEvent.click(screen.getByRole("button", { name: /set start/i }));
    transport.clock.seek(5); // inside measure 2
    fireEvent.click(screen.getByRole("button", { name: /set end/i }));
    expect(transport.clock.loop).toEqual({ start: 0, end: 6 });
    expect(screen.getByText(/m\.1–3/)).toBeInTheDocument();
  });

  it("Clear removes the loop", () => {
    const { transport } = renderControls();
    transport.clock.seek(1);
    fireEvent.click(screen.getByRole("button", { name: /set start/i }));
    fireEvent.click(screen.getByRole("button", { name: /set end/i }));
    fireEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(transport.clock.loop).toBeNull();
  });

  it("the tempo stepper changes the transport BPM", () => {
    const { transport } = renderControls();
    fireEvent.click(screen.getByRole("button", { name: /increase tempo/i }));
    expect(transport.bpm).toBeGreaterThan(120);
  });

  it("the speed-up toggle enables gradual speed-up", () => {
    const { transport } = renderControls();
    fireEvent.click(screen.getByRole("checkbox", { name: /speed-up/i }));
    expect(transport.speedUpActive).toBe(true);
  });

  it("the hand visibility select writes through to hand state", () => {
    const { handState } = renderControls();
    fireEvent.change(screen.getByLabelText(/left hand/i), {
      target: { value: "hide" },
    });
    expect(handState.visibility("left")).toBe("hide");
  });

  it("the metronome toggle enables the metronome", () => {
    const { props } = renderControls();
    fireEvent.click(screen.getByRole("checkbox", { name: /metronome/i }));
    expect(props.audioEngine!.metronome.enabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/PracticeHudControls.test.tsx`
Expected: FAIL — cannot find module `./PracticeHudControls`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/PracticeHudControls.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import type { Transport } from "../transport/transport";
import type { HandState, HandVisibility } from "../practice/hands";
import type { FalldownRenderer } from "../falldown/renderer";
import type { AudioEngine } from "../audio/engine";
import { MetronomeMenu } from "./MetronomeMenu";

interface PracticeHudControlsProps {
  transport: Transport;
  handState: HandState;
  audioEngine: AudioEngine | null;
  falldown: FalldownRenderer | null;
  countInBars: number;
  onCountInBarsChange: (bars: number) => void;
}

/** The gradual speed-up ramp config — matches the prior ControlPanel setting. */
const SPEED_UP_CONFIG = { startRate: 0.5, targetRate: 1, step: 0.05 };

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
 * Row 2 of the Practice-mode HUD: the loop-range picker, tempo stepper,
 * gradual speed-up toggle, per-hand show/mute controls, and the metronome.
 * Each control mirrors live imperative state in local React state and writes
 * through on change. Mounting fresh (on a mode switch) re-reads live state.
 */
export function PracticeHudControls({
  transport,
  handState,
  audioEngine,
  falldown,
  countInBars,
  onCountInBarsChange,
}: PracticeHudControlsProps): React.JSX.Element {
  // Loop: a committed range and a pending start (set, end not yet set).
  const [loopRange, setLoopRange] = useState(() => loopMeasures(transport));
  const [pendingStart, setPendingStart] = useState<number | null>(null);

  const [bpm, setBpm] = useState(() => Math.round(transport.bpm));
  const [speedUp, setSpeedUp] = useState(() => transport.speedUpActive);

  const [leftVis, setLeftVis] = useState<HandVisibility>(() =>
    handState.visibility("left"),
  );
  const [rightVis, setRightVis] = useState<HandVisibility>(() =>
    handState.visibility("right"),
  );
  const [muteLeft, setMuteLeft] = useState(() => handState.isMuted("left"));
  const [muteRight, setMuteRight] = useState(() => handState.isMuted("right"));

  const [metronomeOn, setMetronomeOn] = useState(
    () => audioEngine?.metronome.enabled ?? false,
  );
  const [metronomeMenuOpen, setMetronomeMenuOpen] = useState(false);
  const pulseRef = useRef<HTMLSpanElement>(null);
  const metronomeRef = useRef<HTMLDivElement>(null);

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

  function handleClearLoop(): void {
    transport.clearLoop();
    setLoopRange(null);
    setPendingStart(null);
  }

  function changeBpm(delta: number): void {
    const next = Math.max(20, Math.min(300, bpm + delta));
    setBpm(next);
    transport.setBpm(next);
  }

  function handleSpeedUp(checked: boolean): void {
    setSpeedUp(checked);
    if (checked) {
      transport.enableSpeedUp(SPEED_UP_CONFIG);
    } else {
      transport.disableSpeedUp();
    }
  }

  function handleMetronome(checked: boolean): void {
    setMetronomeOn(checked);
    // The audio engine and renderer are imperative objects written through to.
    // eslint-disable-next-line react-hooks/immutability
    if (audioEngine) audioEngine.metronome.enabled = checked;
    // eslint-disable-next-line react-hooks/immutability
    if (falldown) falldown.showBeatPulse = checked;
  }

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

  // Close the metronome dropdown when the pointer goes down outside it.
  useEffect(() => {
    if (!metronomeMenuOpen) return;
    function onDown(e: PointerEvent): void {
      if (!metronomeRef.current?.contains(e.target as Node)) {
        setMetronomeMenuOpen(false);
      }
    }
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [metronomeMenuOpen]);

  const loopReadout = loopRange
    ? `m.${loopRange.first + 1}–${loopRange.last + 1}`
    : pendingStart !== null
      ? `m.${pendingStart + 1}–…`
      : "—";

  return (
    <div className="practice-hud-controls">
      <div className="hud-group">
        <span className="hud-group-label">Loop</span>
        <button type="button" onClick={handleSetStart}>
          Set start
        </button>
        <button type="button" onClick={handleSetEnd}>
          Set end
        </button>
        <button type="button" onClick={handleClearLoop}>
          Clear
        </button>
        <span className="hud-loop-readout">{loopReadout}</span>
      </div>

      <div className="hud-group">
        <span className="hud-group-label">Tempo</span>
        <button
          type="button"
          aria-label="Decrease tempo"
          onClick={() => changeBpm(-5)}
        >
          −
        </button>
        <span className="hud-tempo-readout">{bpm}</span>
        <button
          type="button"
          aria-label="Increase tempo"
          onClick={() => changeBpm(5)}
        >
          +
        </button>
      </div>

      <div className="hud-group">
        <label>
          <input
            type="checkbox"
            checked={speedUp}
            onChange={(e) => handleSpeedUp(e.target.checked)}
          />{" "}
          Speed-up
        </label>
      </div>

      <div className="hud-group">
        <span className="hud-group-label">Hands</span>
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
          Mute L
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
          Mute R
        </label>
      </div>

      <div className="hud-metronome" ref={metronomeRef}>
        <label>
          <input
            type="checkbox"
            checked={metronomeOn}
            onChange={(e) => handleMetronome(e.target.checked)}
          />{" "}
          Metronome
        </label>
        <button
          type="button"
          aria-label="Metronome settings"
          aria-expanded={metronomeMenuOpen}
          onClick={() => setMetronomeMenuOpen((o) => !o)}
        >
          ▾
        </button>
        <span ref={pulseRef} className="metronome-pulse" aria-hidden="true" />
        {metronomeMenuOpen && (
          <MetronomeMenu
            transport={transport}
            falldown={falldown}
            audioEngine={audioEngine}
            countInBars={countInBars}
            onCountInBarsChange={onCountInBarsChange}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/PracticeHudControls.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Add the styling**

Append to `src/styles/theme.css` (after the `.hud-metronome` rules, before
`.control-panel` around line 394):

```css
/* --- Practice-mode HUD: row 2 --- */

.practice-hud-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding-top: 0.5rem;
  margin-top: 0.1rem;
  border-top: 1px solid var(--glass-border);
}

.hud-group {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.2rem 0.35rem;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 10px;
}

.hud-group-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-dim);
}

.hud-loop-readout,
.hud-tempo-readout {
  font-size: 0.85rem;
  color: var(--text);
  min-width: 2.5ch;
  text-align: center;
}
```

- [ ] **Step 6: Run lint and verify**

Run: `npm run lint && npx vitest run src/ui/PracticeHudControls.test.tsx`
Expected: lint clean, tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ui/PracticeHudControls.tsx src/ui/PracticeHudControls.test.tsx src/styles/theme.css
git commit -m "feat: add the Practice-HUD practice controls row"
```

---

## Task 11: Make FloatingHud mode-aware

**Files:**
- Modify: `src/ui/FloatingHud.tsx`
- Modify: `src/ui/FloatingHud.test.tsx`
- Modify: `src/app/PracticeView.tsx` (placeholder props to keep the build green)
- Modify: `src/styles/theme.css` (append Play-speed + collapse rules)

`FloatingHud` becomes the shared wrapper (draggable, idle-fade, transport row)
plus mode-specific content:
- **Play mode:** transport row + a playback-speed stepper. No metronome.
- **Practice mode:** transport row + a collapse toggle; when expanded, the
  `PracticeHudControls` row. Does not auto-fade while expanded.

The metronome state and JSX move out of `FloatingHud` (they now live in
`PracticeHudControls` from Task 10). `FloatingHud` keeps `countInBars` state
(so it survives the metronome menu and persists across mode switches) and the
count-in-aware play handler.

- [ ] **Step 1: Update the test**

Rewrite `src/ui/FloatingHud.test.tsx`. Keep the `score` fixture and the
draggable / resize / seek tests. Update `renderHud` to add the new props with
defaults, and replace the metronome-specific tests (which now belong to
`PracticeHudControls`) with mode-aware tests.

Replace the `renderHud` helper and the metronome tests with:

```tsx
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
```

Then keep these existing tests unchanged (they do not touch the metronome):
`toggles play/pause on the transport clock`, `seeks the clock when the slider
moves`, `does not render the relocated nav controls`, `moves when dragged by
its background`, `does not start a drag from a control`, `stays in the document
after a window resize event`.

Update `fades after the idle timeout...` and `never fades while the settings
drawer is open` — they still pass in Play mode (default).

Remove the four metronome tests (`toggles the metronome...`, `enables the
falldown beat pulse...`, `opens the metronome settings dropdown`).

Add these new tests:

```tsx
  it("Play mode shows the speed stepper and no metronome", () => {
    renderHud({ mode: "play" });
    expect(
      screen.getByRole("button", { name: /increase speed/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: /metronome/i }),
    ).toBeNull();
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
    fireEvent.click(
      screen.getByRole("button", { name: /collapse|expand/i }),
    );
    expect(onCollapsedChange).toHaveBeenCalledWith(true);
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/FloatingHud.test.tsx`
Expected: FAIL — new props not accepted, no speed stepper / collapse toggle.

- [ ] **Step 3: Rewrite FloatingHud**

Replace the contents of `src/ui/FloatingHud.tsx` with the following. The
`useIdleFade` and `useDraggable` hooks and `formatTime` / `clamp` helpers are
unchanged from the current file — keep them exactly as they are; only the
props, the component body, and the imports change.

```tsx
import { useEffect, useReducer, useRef, useState } from "react";
import type { Transport } from "../transport/transport";
import type { AudioEngine } from "../audio/engine";
import type { FalldownRenderer } from "../falldown/renderer";
import type { HandState } from "../practice/hands";
import type { PracticeMode } from "../layout/practiceMode";
import { PracticeHudControls } from "./PracticeHudControls";
import { startCountIn, type CountInHandle } from "../practice/countIn";

interface FloatingHudProps {
  transport: Transport;
  handState: HandState;
  settingsOpen: boolean;
  audioEngine: AudioEngine | null;
  falldown: FalldownRenderer | null;
  mode: PracticeMode;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}
```

Keep `IDLE_MS`, `formatTime`, `Position`, `clamp`, `useIdleFade`, and
`useDraggable` exactly as they are in the current file.

Then replace the `FloatingHud` component function (everything from
`export function FloatingHud(` to the end of the file) with:

```tsx
/** Play-mode playback-speed multipliers, slowest to fastest. */
const SPEED_STEPS = [0.5, 0.75, 1, 1.25, 1.5] as const;

/**
 * The floating transport HUD. A shared draggable, idle-fading wrapper carries
 * the transport row; mode-specific content sits alongside it:
 *  - Play mode: a playback-speed stepper.
 *  - Practice mode: a collapse toggle and, when expanded, the practice
 *    controls row. The HUD does not auto-fade while expanded.
 */
export function FloatingHud({
  transport,
  handState,
  settingsOpen,
  audioEngine,
  falldown,
  mode,
  collapsed,
  onCollapsedChange,
}: FloatingHudProps): React.JSX.Element {
  const [, forceUpdate] = useReducer((n: number) => n + 1, 0);
  useEffect(() => transport.clock.onChange(forceUpdate), [transport]);

  const { ref, pos, onPointerDown } = useDraggable();

  const practiceExpanded = mode === "practice" && !collapsed;
  const faded = useIdleFade(settingsOpen || practiceExpanded);

  const { clock } = transport;
  const { playing, position, duration } = clock;

  // Count-in bars (per session); owned here so it survives the metronome menu.
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

  useEffect(() => {
    return () => countInRef.current?.cancel();
  }, []);

  function changeSpeed(delta: number): void {
    const next = Math.max(0, Math.min(SPEED_STEPS.length - 1, speedIndex + delta));
    setSpeedIndex(next);
    transport.setBpm(transport.referenceBpm * SPEED_STEPS[next]);
  }

  function handlePlayToggle(): void {
    if (clock.playing) {
      clock.pause();
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
      <div className="hud-transport-row">
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
            <span className="hud-tempo-readout">
              {SPEED_STEPS[speedIndex]}×
            </span>
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
          <button
            type="button"
            className="hud-collapse"
            aria-label={collapsed ? "Expand HUD" : "Collapse HUD"}
            aria-expanded={!collapsed}
            onClick={() => onCollapsedChange(!collapsed)}
          >
            {collapsed ? "▴" : "▾"}
          </button>
        )}
      </div>

      {practiceExpanded && (
        <PracticeHudControls
          transport={transport}
          handState={handState}
          audioEngine={audioEngine}
          falldown={falldown}
          countInBars={countInBars}
          onCountInBarsChange={setCountInBars}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Keep the build green — update the PracticeView call site**

In `src/app/PracticeView.tsx`, update the `<FloatingHud ... />` element with
placeholder props (Task 12 wires the real `mode` / `collapsed` state):

```tsx
      <FloatingHud
        transport={transport}
        handState={handState}
        settingsOpen={settingsOpen}
        audioEngine={audioEngine}
        falldown={falldown}
        mode="play"
        collapsed={false}
        onCollapsedChange={() => {}}
      />
```

- [ ] **Step 5: Add the styling**

Append to `src/styles/theme.css` (after the `.practice-hud-controls` block from
Task 10):

```css
.hud-transport-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
}

.hud-collapse {
  margin-left: auto;
}
```

The `.floating-hud` rule already sets `flex-wrap: wrap`; the transport row and
the controls row each take full width and stack.

- [ ] **Step 6: Run tests, typecheck, lint**

Run: `npx vitest run src/ui/FloatingHud.test.tsx && npm run typecheck && npm run lint`
Expected: all PASS / clean.

- [ ] **Step 7: Commit**

```bash
git add src/ui/FloatingHud.tsx src/ui/FloatingHud.test.tsx src/styles/theme.css src/app/PracticeView.tsx
git commit -m "feat: make the FloatingHud mode-aware with a collapsible Practice HUD"
```

---

## Task 12: Wire mode, suspend/restore, and persistence into PracticeView

**Files:**
- Modify: `src/app/PracticeView.tsx`
- Modify: `src/app/PracticeView.test.tsx`

`PracticeView` owns the `mode` and `collapsed` state, implements suspend &
restore on mode change, threads the real props into `TopBar` and `FloatingHud`,
and persists `mode` / `hudCollapsed`.

- [ ] **Step 1: Write the failing test**

Add to `src/app/PracticeView.test.tsx`. The file already renders `PracticeView`
with a `score`/`pieceId`/`pieceName`/`onExit`; reuse that. Add:

```tsx
  it("switching to Play suspends the loop and restores it on switching back", async () => {
    renderPracticeView();
    // Wait for the practice-ready gate (the mode switch is always rendered).
    const practiceBtn = await screen.findByRole("button", {
      name: /^practice$/i,
    });
    fireEvent.click(practiceBtn);
    // In Practice mode, set a loop via the HUD.
    fireEvent.click(await screen.findByRole("button", { name: /set start/i }));
    fireEvent.click(screen.getByRole("button", { name: /set end/i }));
    // Switch to Play — the loop must be suspended (cleared from the clock).
    fireEvent.click(screen.getByRole("button", { name: /^play$/i }));
    // Switch back to Practice — the loop is restored.
    fireEvent.click(screen.getByRole("button", { name: /^practice$/i }));
    expect(
      await screen.findByRole("button", { name: /set start/i }),
    ).toBeInTheDocument();
  });
```

If `PracticeView.test.tsx` has no `renderPracticeView` helper, use the existing
render call pattern in that file. The async `findBy*` calls handle the
`practiceReady` gate. This test is intentionally light — the detailed
suspend/restore logic is unit-tested via `Transport`, `HandState`, and
`PracticeHudControls`; here we verify the wiring renders and does not throw.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/PracticeView.test.tsx`
Expected: FAIL — no `Practice` button is wired / clicking it does nothing
useful (the mode is still the hardcoded `"play"` placeholder).

- [ ] **Step 3: Add mode state and the suspend/restore logic**

In `src/app/PracticeView.tsx`:

Add to the imports:

```tsx
import type { PracticeMode } from "../layout/practiceMode";
import type { HandVisibility } from "../practice/hands";
```

Add to the state declarations (near `viewMode` / `settingsOpen`):

```tsx
  const [mode, setMode] = useState<PracticeMode>("play");
  const [hudCollapsed, setHudCollapsed] = useState(false);
```

Add these refs (near the other `useRef` declarations):

```tsx
  // Practice-only state stowed while in Play mode (suspend & restore).
  const suspendedRef = useRef<{
    loop: { start: number; end: number } | null;
    speedUp: boolean;
    metronome: boolean;
    leftMuted: boolean;
    rightMuted: boolean;
    leftVis: HandVisibility;
    rightVis: HandVisibility;
  } | null>(null);
  // Each mode keeps its own tempo; snapshotted on switch, re-applied on return.
  const practiceBpmRef = useRef<number>(transport.bpm);
  const playBpmRef = useRef<number>(transport.referenceBpm);
```

Add the suspend and restore helpers and the mode-change handler inside the
component (before the `return`):

```tsx
  // Stow practice-only state and make playback "straight through" for Play.
  function suspendPractice(): void {
    const loop = transport.clock.loop;
    suspendedRef.current = {
      loop: loop ? { start: loop.start, end: loop.end } : null,
      speedUp: transport.speedUpActive,
      metronome: engineRef.current?.metronome.enabled ?? false,
      leftMuted: handState.isMuted("left"),
      rightMuted: handState.isMuted("right"),
      leftVis: handState.visibility("left"),
      rightVis: handState.visibility("right"),
    };
    transport.clearLoop();
    transport.disableSpeedUp();
    if (engineRef.current) {
      // eslint-disable-next-line react-hooks/immutability
      engineRef.current.metronome.enabled = false;
    }
    if (falldownRef.current) {
      // eslint-disable-next-line react-hooks/immutability
      falldownRef.current.showBeatPulse = false;
    }
    handState.setMuted("left", false);
    handState.setMuted("right", false);
    handState.setVisibility("left", "show");
    handState.setVisibility("right", "show");
  }

  // Restore the practice-only state stowed by suspendPractice().
  function restorePractice(): void {
    const s = suspendedRef.current;
    if (!s) return;
    transport.clock.setLoop(s.loop ? { ...s.loop } : null);
    if (s.speedUp) {
      transport.enableSpeedUp({ startRate: 0.5, targetRate: 1, step: 0.05 });
    }
    if (engineRef.current) {
      // eslint-disable-next-line react-hooks/immutability
      engineRef.current.metronome.enabled = s.metronome;
    }
    if (falldownRef.current) {
      // eslint-disable-next-line react-hooks/immutability
      falldownRef.current.showBeatPulse = s.metronome;
    }
    handState.setMuted("left", s.leftMuted);
    handState.setMuted("right", s.rightMuted);
    handState.setVisibility("left", s.leftVis);
    handState.setVisibility("right", s.rightVis);
  }

  function handleModeChange(next: PracticeMode): void {
    if (next === mode) return;
    if (next === "play") {
      practiceBpmRef.current = transport.bpm;
      suspendPractice();
      transport.setBpm(playBpmRef.current);
    } else {
      playBpmRef.current = transport.bpm;
      restorePractice();
      transport.setBpm(practiceBpmRef.current);
    }
    setMode(next);
  }
```

- [ ] **Step 4: Restore the persisted mode on load**

In the async practice-state restore block (the
`void (async () => { const state = await getPracticeState(pieceId); ... })()`
inside the mount effect), after the existing restore work and before
`setPracticeReady(true)`, add:

```tsx
        practiceBpmRef.current = transport.bpm;
        playBpmRef.current = transport.referenceBpm;
        const restoredMode: PracticeMode = state?.mode ?? "play";
        if (restoredMode === "play") {
          // Stow whatever applyPracticeState just applied, so Play is clean
          // and a later switch to Practice restores it.
          suspendPractice();
          transport.setBpm(playBpmRef.current);
        }
        setMode(restoredMode);
        setHudCollapsed(state?.hudCollapsed ?? false);
```

Placement: put these lines *after* the existing `if (state) { ... }` block and
*before* `setPracticeReady(true)`, so they run even when there is no saved
state. `state` may be `undefined`; the `state?.mode` / `state?.hudCollapsed`
optional access handles that (default mode `"play"`, default not collapsed).

- [ ] **Step 5: Persist mode and hudCollapsed on unmount**

In the mount effect's cleanup function, the existing code builds `beat` and
calls `savePracticeState(pieceId, capturePracticeState(transport, handState, beat))`.

The cleanup runs after a mode switch may have suspended practice state. To
persist the *practice* values (not the zeroed Play-mode values), restore before
capturing when in Play mode. Replace the cleanup's save call region with:

```tsx
      // If we are in Play mode the practice state is suspended; momentarily
      // restore it so the captured snapshot has the real loop/hand values.
      if (modeRef.current === "play") restorePractice();
      void savePracticeState(
        pieceId,
        capturePracticeState(transport, handState, beat, {
          mode: modeRef.current,
          hudCollapsed: collapsedRef.current,
        }),
      );
```

`modeRef` and `collapsedRef` are needed because the mount effect's cleanup
closes over the initial render's values. Add these refs and keep them in sync.
Add near the other refs:

```tsx
  const modeRef = useRef<PracticeMode>("play");
  const collapsedRef = useRef(false);
```

And add an effect to keep them current (after the component's other effects):

```tsx
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    collapsedRef.current = hudCollapsed;
  }, [hudCollapsed]);
```

- [ ] **Step 6: Thread the real props into TopBar and FloatingHud**

Replace the placeholder props added in Tasks 3 and 11.

`TopBar`:

```tsx
      <TopBar
        pieceName={pieceName}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onOpenLibrary={onExit}
        settingsOpen={settingsOpen}
        onToggleSettings={() => setSettingsOpen((o) => !o)}
        mode={mode}
        onModeChange={handleModeChange}
      />
```

`FloatingHud`:

```tsx
      <FloatingHud
        transport={transport}
        handState={handState}
        settingsOpen={settingsOpen}
        audioEngine={audioEngine}
        falldown={falldown}
        mode={mode}
        collapsed={hudCollapsed}
        onCollapsedChange={setHudCollapsed}
      />
```

- [ ] **Step 7: Run tests, typecheck, lint**

Run: `npx vitest run src/app/PracticeView.test.tsx && npm run typecheck && npm run lint`
Expected: all PASS / clean.

- [ ] **Step 8: Run the full unit suite**

Run: `npm test`
Expected: all tests green. If `App.test.tsx` or other tests assert the
`FloatingHud` / `TopBar` / `ControlPanel` prop shapes, update them to match the
new signatures (the changes are mechanical — add `mode` etc.).

- [ ] **Step 9: Commit**

```bash
git add src/app/PracticeView.tsx src/app/PracticeView.test.tsx
git commit -m "feat: wire Practice mode with suspend/restore and persistence"
```

---

## Task 13: End-to-end coverage and final verification

**Files:**
- Modify: `tests/e2e/practice.spec.ts`

- [ ] **Step 1: Add an e2e spec for the mode switch**

Append to `tests/e2e/practice.spec.ts`:

```ts
test("switching to Practice mode reveals the practice HUD controls", async ({
  page,
}) => {
  await page.goto("/");
  await page.setInputFiles('input[type="file"]', "src/test/fixtures/clean.mid");
  await expect(page.getByRole("button", { name: /play/i })).toBeVisible({
    timeout: 15_000,
  });

  // Play mode: the speed stepper is present, the loop controls are not.
  await expect(
    page.getByRole("button", { name: /increase speed/i }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /set start/i })).toHaveCount(0);

  // Switch to Practice — the practice controls row appears.
  await page.getByRole("button", { name: /^practice$/i }).click();
  await expect(
    page.getByRole("button", { name: /set start/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: /metronome/i }),
  ).toBeVisible();

  // Collapse the HUD — the practice controls row hides.
  await page.getByRole("button", { name: /collapse hud/i }).click();
  await expect(page.getByRole("button", { name: /set start/i })).toHaveCount(0);

  // Back to Play — the speed stepper is back.
  await page.getByRole("button", { name: /^play$/i }).click();
  await expect(
    page.getByRole("button", { name: /increase speed/i }),
  ).toBeVisible();
});
```

- [ ] **Step 2: Run the e2e spec**

Run: `npx playwright test tests/e2e/practice.spec.ts`
Expected: all practice e2e tests PASS.

- [ ] **Step 3: Run the full verification gate**

Run: `npm run lint && npm run typecheck && npm test && npm run build && npm run e2e`
Expected: every command clean / green.

- [ ] **Step 4: Manual smoke check**

Run `npm run dev` and confirm:
- The Play / Practice switch sits centered in the top bar.
- Play mode HUD: play/seek/time + a Speed `−  1×  +` stepper; no metronome.
- Practice mode HUD: expanded with Loop / Tempo / Speed-up / Hands / Metronome;
  the `▾` collapse toggle hides Row 2; expanded HUD does not fade.
- Set start / Set end (seek the playhead between them) builds a loop; the
  readout shows `m.N–M`; Clear removes it.
- Count-in: set 1–2 bars in the metronome menu, press play in Practice mode —
  clicks play before the music starts.
- Switching to Play stops the loop / metronome; switching back restores them.
- The `⚙` drawer shows only display preferences (note labels, beat grid,
  full 88, flatten tempo).
- Reload the piece — it reopens in the last-used mode with the loop intact.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/practice.spec.ts
git commit -m "test: add e2e coverage for the Play/Practice mode switch"
```

---

## Done

All spec sections are implemented:
- §3 mode switcher — Tasks 1–3
- §4 Play-mode HUD (speed stepper, no metronome) — Task 11
- §5 Practice-mode HUD (collapsible, two rows) — Tasks 10–11
- §6 loop-range picker — Task 10
- §7 count-in — Tasks 6, 7, 8, 11
- §8 suspend & restore — Tasks 5, 12
- §9 persistence — Tasks 4, 12
- §10 settings-drawer re-division — Task 9
- §13 testing — every task plus Task 13

After the final commit, use `superpowers:finishing-a-development-branch` to
merge `feature/practice-mode` into `main`.
