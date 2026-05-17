# Feature G — Layout & View Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Assemble Arpeggio into a working app: load a file, see the falldown and the engraved score side-by-side synced to one clock, play/pause/seek, resize the split, and toggle Both / Falldown-only / Score-only.

**Architecture:** This is the integration feature. A single `FrameLoop` owns the `requestAnimationFrame` cycle — it ticks the master clock once per frame (with a clamped delta) and calls every registered consumer (audio engine, falldown renderer, score view). React provides the shell: `App` shows the file-import view until a piece is loaded, then the `PracticeView`, which builds the `Transport`/`AudioEngine`/renderers, runs the `FrameLoop`, and lays everything out via `Layout` + `TransportBar`. Pure logic (`viewMode`, `FrameLoop`) is unit-tested; React components are tested with React Testing Library; the full flow gets a Playwright e2e.

**Tech Stack:** React 19, TypeScript, Canvas2D + SVG, Vitest + React Testing Library, Playwright. Composes Features B-F.

**Branch:** `feature/g-layout-view-modes`

---

## Notes for the implementer

- Repo root and working directory: `/Users/jeffreywan/Desktop/arpeggio`. Run all commands from there.
- Work on branch `feature/g-layout-view-modes` (the controller creates it before Task 1).
- Features A-F are merged into `main`. `npm test` (119 tests), lint, typecheck, build all green.
- Key APIs to read and use:
  - `src/import/importFile.ts` → `importFile(file: File): Promise<Score>`.
  - `src/transport/transport.ts` → `new Transport(score)`; `.clock` (`position`, `playing`, `play()`, `pause()`, `toggle()`, `seek(s)`, `duration`, `tick(dt)`, `onChange(fn)`); `.score`.
  - `src/audio/engine.ts` → `createAudioEngine(transport): Promise<AudioEngine>`; `AudioEngine.update()`, `.metronome`.
  - `src/falldown/renderer.ts` → `new FalldownRenderer(ctx, transport, { width, height })`; `.renderFrame()`, `.start()`, `.stop()`, `.full88`, `.showLabels`, `.showBeatGrid`.
  - `src/score-view/verovio.ts` → `renderScore(musicXml): Promise<{ svg, timemap }>`.
  - `src/score-view/scoreView.ts` → `new ScoreView(container, transport, svg, timemap)`; `.renderFrame()`, `.destroy()`.
- `strict` TypeScript + `noUnusedLocals`/`noUnusedParameters` on. React components: `react-jsx` runtime, no `import React` needed.
- Vitest jsdom: React Testing Library is installed (`@testing-library/react`, `@testing-library/jest-dom`). `src/test/setup.ts` already imports jest-dom and clears `document.body` after each test.
- Commit after every task with the exact messages given.

---

## File / Folder Structure

```
src/
  layout/
    viewMode.ts        # ViewMode type + cycling helper (pure)
    Divider.tsx        # draggable resize divider
    Layout.tsx         # side-by-side falldown|score with divider + view mode
  ui/
    TransportBar.tsx   # play/pause, seek, time, view-mode toggle
    ImportView.tsx     # file drop / picker -> importFile
  app/
    frameLoop.ts       # the single rAF clock-tick + consumer loop (pure-ish)
    PracticeView.tsx   # owns Transport/audio/renderers, runs the loop
  App.tsx              # ImportView <-> PracticeView switch  (modified)
  styles/theme.css     # + layout / highlight styles  (modified)
```

---

## Task 1: View-mode state — `viewMode.ts`

**Files:** Create `src/layout/viewMode.ts`, `src/layout/viewMode.test.ts`

- [ ] **Step 1: Write the failing test — `src/layout/viewMode.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { VIEW_MODES, nextViewMode, type ViewMode } from "./viewMode";

describe("viewMode", () => {
  it("lists the three modes", () => {
    expect(VIEW_MODES).toEqual(["both", "falldown", "score"]);
  });

  it("cycles through the modes and wraps", () => {
    let m: ViewMode = "both";
    m = nextViewMode(m);
    expect(m).toBe("falldown");
    m = nextViewMode(m);
    expect(m).toBe("score");
    m = nextViewMode(m);
    expect(m).toBe("both");
  });
});
```

- [ ] **Step 2: Run it — confirm it fails**

Run: `npm test -- viewMode`
Expected: FAIL.

- [ ] **Step 3: Implement `src/layout/viewMode.ts`**

```ts
/** Which panels the practice view shows. */
export type ViewMode = "both" | "falldown" | "score";

/** All view modes, in toggle order. */
export const VIEW_MODES: readonly ViewMode[] = ["both", "falldown", "score"];

/** The next view mode in the cycle, wrapping around. */
export function nextViewMode(mode: ViewMode): ViewMode {
  const i = VIEW_MODES.indexOf(mode);
  return VIEW_MODES[(i + 1) % VIEW_MODES.length];
}
```

- [ ] **Step 4: Run the tests — confirm they pass**

Run: `npm test -- viewMode`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/layout/viewMode.ts src/layout/viewMode.test.ts
git commit -m "feat: add view-mode state and cycling"
```

---

## Task 2: The single frame loop — `frameLoop.ts`

**Files:** Create `src/app/frameLoop.ts`, `src/app/frameLoop.test.ts`

`FrameLoop` is the one `requestAnimationFrame` cycle. Each frame it advances the
clock by the real delta (clamped, so a backgrounded tab cannot produce one giant
tick) and calls every registered per-frame consumer.

- [ ] **Step 1: Write the failing test — `src/app/frameLoop.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { FrameLoop } from "./frameLoop";
import { Clock } from "../transport/clock";

describe("FrameLoop", () => {
  it("ticks the clock by the real delta between frames", () => {
    let now = 1000;
    const raf = vi
      .spyOn(globalThis, "requestAnimationFrame")
      .mockImplementation(() => 1);
    const clock = new Clock(100);
    clock.play();
    const loop = new FrameLoop(clock);
    loop.start();
    // FrameLoop calls requestAnimationFrame(cb); grab and invoke cb manually.
    const cb = raf.mock.calls[0][0];
    cb(now); // first frame: establishes the baseline, no advance
    expect(clock.position).toBeCloseTo(0, 6);
    now = 1500;
    cb(now); // 0.5 s later
    expect(clock.position).toBeCloseTo(0.5, 6);
    raf.mockRestore();
  });

  it("clamps a huge delta (backgrounded tab) to the max frame delta", () => {
    let now = 0;
    const raf = vi
      .spyOn(globalThis, "requestAnimationFrame")
      .mockImplementation(() => 1);
    const clock = new Clock(1000);
    clock.play();
    const loop = new FrameLoop(clock);
    loop.start();
    const cb = raf.mock.calls[0][0];
    cb(now);
    now = 60_000; // 60 s gap
    cb(now);
    expect(clock.position).toBeLessThanOrEqual(0.25); // clamped, not 60
    raf.mockRestore();
  });

  it("calls registered consumers each frame", () => {
    const raf = vi
      .spyOn(globalThis, "requestAnimationFrame")
      .mockImplementation(() => 1);
    const clock = new Clock(100);
    const loop = new FrameLoop(clock);
    const consumer = vi.fn();
    loop.onFrame(consumer);
    loop.start();
    const cb = raf.mock.calls[0][0];
    cb(0);
    cb(16);
    expect(consumer).toHaveBeenCalledTimes(2);
    raf.mockRestore();
  });

  it("stop() cancels the loop", () => {
    const raf = vi
      .spyOn(globalThis, "requestAnimationFrame")
      .mockImplementation(() => 7);
    const caf = vi
      .spyOn(globalThis, "cancelAnimationFrame")
      .mockImplementation(() => {});
    const clock = new Clock(100);
    const loop = new FrameLoop(clock);
    loop.start();
    loop.stop();
    expect(caf).toHaveBeenCalledWith(7);
    raf.mockRestore();
    caf.mockRestore();
  });
});
```

- [ ] **Step 2: Run it — confirm it fails**

Run: `npm test -- frameLoop`
Expected: FAIL.

- [ ] **Step 3: Implement `src/app/frameLoop.ts`**

```ts
import type { Clock } from "../transport/clock";

/** A per-frame consumer — e.g. an audio update or a renderer draw. */
export type FrameConsumer = () => void;

/** Largest per-frame delta in seconds; caps catch-up after a stalled tab. */
const MAX_DELTA = 0.25;

/**
 * The single requestAnimationFrame loop. Advances the master clock by the real
 * inter-frame delta (clamped) and invokes every registered consumer in order.
 */
export class FrameLoop {
  private consumers: FrameConsumer[] = [];
  private handle: number | null = null;
  private lastTime: number | null = null;

  constructor(private readonly clock: Clock) {}

  /** Register a per-frame consumer (renderer/audio). */
  onFrame(consumer: FrameConsumer): void {
    this.consumers.push(consumer);
  }

  /** Begin the loop. */
  start(): void {
    if (this.handle !== null) return;
    this.lastTime = null;
    const frame = (time: number): void => {
      if (this.lastTime !== null) {
        const delta = Math.min((time - this.lastTime) / 1000, MAX_DELTA);
        if (delta > 0) this.clock.tick(delta);
      }
      this.lastTime = time;
      for (const consumer of this.consumers) consumer();
      this.handle = requestAnimationFrame(frame);
    };
    this.handle = requestAnimationFrame(frame);
  }

  /** Stop the loop. */
  stop(): void {
    if (this.handle !== null) {
      cancelAnimationFrame(this.handle);
      this.handle = null;
    }
  }
}
```

- [ ] **Step 4: Run the tests — confirm they pass**

Run: `npm test -- frameLoop`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/frameLoop.ts src/app/frameLoop.test.ts
git commit -m "feat: add the single master frame loop"
```

---

## Task 3: Resizable divider — `Divider.tsx`

**Files:** Create `src/layout/Divider.tsx`, `src/layout/Divider.test.tsx`

A thin vertical bar the user drags to resize the split. It is a controlled
component: it reports the new split fraction (0-1) via `onChange`.

- [ ] **Step 1: Write the failing test — `src/layout/Divider.test.tsx`**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Divider } from "./Divider";

describe("Divider", () => {
  it("renders a separator with an accessible role", () => {
    render(<Divider fraction={0.65} onChange={() => {}} />);
    expect(screen.getByRole("separator")).toBeInTheDocument();
  });

  it("reports a new fraction while dragging", () => {
    const onChange = vi.fn();
    render(<Divider fraction={0.5} onChange={onChange} />);
    const handle = screen.getByRole("separator");
    // The Divider measures against window.innerWidth; jsdom defaults to 1024.
    fireEvent.mouseDown(handle, { clientX: 512 });
    fireEvent.mouseMove(window, { clientX: 700 });
    expect(onChange).toHaveBeenCalled();
    const reported = onChange.mock.calls.at(-1)![0] as number;
    expect(reported).toBeGreaterThan(0.5);
    expect(reported).toBeLessThanOrEqual(1);
    fireEvent.mouseUp(window);
  });

  it("does not report after the drag ends", () => {
    const onChange = vi.fn();
    render(<Divider fraction={0.5} onChange={onChange} />);
    const handle = screen.getByRole("separator");
    fireEvent.mouseDown(handle, { clientX: 512 });
    fireEvent.mouseUp(window);
    onChange.mockClear();
    fireEvent.mouseMove(window, { clientX: 900 });
    expect(onChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it — confirm it fails**

Run: `npm test -- Divider`
Expected: FAIL.

- [ ] **Step 3: Implement `src/layout/Divider.tsx`**

Design:

- Props: `{ fraction: number; onChange: (fraction: number) => void }`.
- Render a `<div role="separator" aria-orientation="vertical">` with a class
  `divider` (styled in Task 8's CSS) — a thin draggable bar.
- On `mousedown` on the handle: begin a drag. Add `mousemove` and `mouseup`
  listeners to `window` (via `useEffect` keyed on a `dragging` state, or attach
  imperatively in the handler and remove on mouseup).
- On `mousemove` while dragging: compute `fraction = clamp(e.clientX /
window.innerWidth, 0.15, 0.85)` and call `onChange(fraction)`.
- On `mouseup`: end the drag, remove the listeners.
- Use a small `clamp` helper. The component is controlled — it does not store
  the fraction itself, just reports it.

- [ ] **Step 4: Run the tests — confirm they pass**

Run: `npm test -- Divider`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/layout/Divider.tsx src/layout/Divider.test.tsx
git commit -m "feat: add resizable layout divider"
```

---

## Task 4: Side-by-side layout — `Layout.tsx`

**Files:** Create `src/layout/Layout.tsx`, `src/layout/Layout.test.tsx`

`Layout` arranges the falldown panel and the score panel side-by-side with the
`Divider` between them, honoring the view mode. In `falldown`/`score` mode the
chosen panel fills the full width and the divider is hidden.

- [ ] **Step 1: Write the failing test — `src/layout/Layout.test.tsx`**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Layout } from "./Layout";

const falldown = <div data-testid="falldown-panel">falldown</div>;
const scorePanel = <div data-testid="score-panel">score</div>;

describe("Layout", () => {
  it("shows both panels and the divider in 'both' mode", () => {
    render(
      <Layout
        viewMode="both"
        split={0.65}
        onSplitChange={() => {}}
        falldown={falldown}
        score={scorePanel}
      />,
    );
    expect(screen.getByTestId("falldown-panel")).toBeInTheDocument();
    expect(screen.getByTestId("score-panel")).toBeInTheDocument();
    expect(screen.getByRole("separator")).toBeInTheDocument();
  });

  it("shows only the falldown (no divider) in 'falldown' mode", () => {
    render(
      <Layout
        viewMode="falldown"
        split={0.65}
        onSplitChange={() => {}}
        falldown={falldown}
        score={scorePanel}
      />,
    );
    expect(screen.getByTestId("falldown-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("score-panel")).not.toBeInTheDocument();
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
  });

  it("shows only the score in 'score' mode", () => {
    render(
      <Layout
        viewMode="score"
        split={0.65}
        onSplitChange={() => {}}
        falldown={falldown}
        score={scorePanel}
      />,
    );
    expect(screen.queryByTestId("falldown-panel")).not.toBeInTheDocument();
    expect(screen.getByTestId("score-panel")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it — confirm it fails**

Run: `npm test -- Layout`
Expected: FAIL.

- [ ] **Step 3: Implement `src/layout/Layout.tsx`**

Design:

- Props: `{ viewMode: ViewMode; split: number; onSplitChange: (f: number) =>
void; falldown: ReactNode; score: ReactNode }` (import `ViewMode` from
  `./viewMode`, `ReactNode` from `react`).
- `both`: a flex row — left panel `flex-basis: ${split * 100}%`, the `<Divider
fraction={split} onChange={onSplitChange} />`, right panel `flex: 1`. Left
  holds `falldown`, right holds `score`.
- `falldown`: render only the falldown panel, full width; no divider, no score.
- `score`: render only the score panel, full width; no divider, no falldown.
- The root is a full-height flex container (`class="layout"`, styled in Task 8).
- Keep it a pure presentational component — it owns no state.

- [ ] **Step 4: Run the tests — confirm they pass**

Run: `npm test -- Layout`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/layout/Layout.tsx src/layout/Layout.test.tsx
git commit -m "feat: add side-by-side layout with view modes"
```

---

## Task 5: Transport bar — `TransportBar.tsx`

**Files:** Create `src/ui/TransportBar.tsx`, `src/ui/TransportBar.test.tsx`

`TransportBar` is the control strip: a play/pause button, a seek slider showing
position, and the Both/Falldown/Score view-mode toggle.

- [ ] **Step 1: Write the failing test — `src/ui/TransportBar.test.tsx`**

```tsx
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
```

- [ ] **Step 2: Run it — confirm it fails**

Run: `npm test -- TransportBar`
Expected: FAIL.

- [ ] **Step 3: Implement `src/ui/TransportBar.tsx`**

Design:

- Props: `{ transport: Transport; viewMode: ViewMode; onViewModeChange:
(m: ViewMode) => void }`.
- Subscribe to `transport.clock.onChange` in a `useEffect` and force a re-render
  (a `useReducer`/`useState` tick) so the play/pause label and slider position
  track the clock. Clean up the subscription on unmount.
- Play/pause `<button>`: label/`aria-label` is `"Pause"` when
  `transport.clock.playing` else `"Play"`; `onClick` → `transport.clock.toggle()`.
- Seek `<input type="range">` (role `slider`): `min=0`, `max=transport.clock.duration`,
  `step=0.01`, `value=transport.clock.position`; `onChange` →
  `transport.clock.seek(Number(e.target.value))`.
- A time read-out: `formatTime(position) / formatTime(duration)` where
  `formatTime` is a small `m:ss` helper.
- Three view-mode `<button>`s — labels "Both", "Falldown only", "Score only";
  each `onClick` calls `onViewModeChange("both" | "falldown" | "score")`. Mark
  the active one with `aria-pressed`.
- Wrap in a `<div class="transport-bar">` (styled in Task 8).

- [ ] **Step 4: Run the tests — confirm they pass**

Run: `npm test -- TransportBar`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/ui/TransportBar.tsx src/ui/TransportBar.test.tsx
git commit -m "feat: add transport bar with play/seek and view toggle"
```

---

## Task 6: File-import view — `ImportView.tsx`

**Files:** Create `src/ui/ImportView.tsx`, `src/ui/ImportView.test.tsx`

`ImportView` is the landing screen: a drop zone / file picker that runs
`importFile` and reports the resulting `Score` (or an error message).

- [ ] **Step 1: Write the failing test — `src/ui/ImportView.test.tsx`**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { ImportView } from "./ImportView";

function fileOf(name: string): File {
  return new File([readFileSync(`src/test/fixtures/${name}`)], name);
}

describe("ImportView", () => {
  it("shows a file input and a prompt", () => {
    render(<ImportView onLoaded={() => {}} />);
    expect(screen.getByText(/midi or musicxml/i)).toBeInTheDocument();
  });

  it("imports a chosen file and reports the Score", async () => {
    const onLoaded = vi.fn();
    render(<ImportView onLoaded={onLoaded} />);
    const input = screen.getByLabelText(/choose a file/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [fileOf("clean.mid")] } });
    await waitFor(() => expect(onLoaded).toHaveBeenCalled());
    const score = onLoaded.mock.calls[0][0];
    expect(score.notes.length).toBeGreaterThan(0);
  });

  it("shows an error for an unrecognized file", async () => {
    render(<ImportView onLoaded={() => {}} />);
    const input = screen.getByLabelText(/choose a file/i) as HTMLInputElement;
    const junk = new File(["nope"], "notes.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [junk] } });
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /unsupported|unrecognized/i,
      ),
    );
  });
});
```

- [ ] **Step 2: Run it — confirm it fails**

Run: `npm test -- ImportView`
Expected: FAIL.

- [ ] **Step 3: Implement `src/ui/ImportView.tsx`**

Design:

- Props: `{ onLoaded: (score: Score) => void }` (import `Score` from
  `../model/score`, `importFile` from `../import/importFile`).
- Render a labelled `<input type="file">` — the label text includes "Choose a
  file" (so `getByLabelText(/choose a file/i)` finds it) and a prompt mentioning
  "MIDI or MusicXML". Also make the wrapper a drop zone (`onDragOver`
  preventDefault, `onDrop` → take `e.dataTransfer.files[0]`).
- A shared `handleFile(file: File)`: set a `loading` state, `await
importFile(file)`, on success call `onLoaded(score)`, on a thrown error set an
  `error` state string.
- While `loading`, show a "Loading…" indicator. On error, show the message in a
  `<div role="alert">`.
- Wrap in `<div class="import-view">` (styled in Task 8).

- [ ] **Step 4: Run the tests — confirm they pass**

Run: `npm test -- ImportView`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/ui/ImportView.tsx src/ui/ImportView.test.tsx
git commit -m "feat: add file-import landing view"
```

---

## Task 7: Audio-context resume helper — `engine.ts`

**Files:** Modify `src/audio/engine.ts`; create no new test file (covered by build/typecheck).

The browser suspends the audio context until a user gesture. Add a helper the
play button calls so audio actually sounds.

- [ ] **Step 1: Add `startAudioContext` to `src/audio/engine.ts`**

Append this exported function (it dynamically imports Tone, like
`createAudioEngine`, so test files are unaffected):

```ts
/**
 * Resume the Web Audio context. Browsers keep it suspended until a user
 * gesture, so the UI calls this from the play-button click handler.
 */
export async function startAudioContext(): Promise<void> {
  const Tone = await import("tone");
  await Tone.start();
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all pass (no test change — `startAudioContext` is exercised manually).

- [ ] **Step 3: Commit**

```bash
git add src/audio/engine.ts
git commit -m "feat: add audio-context resume helper"
```

---

## Task 8: Practice view, App wiring, and styles

**Files:** Create `src/app/PracticeView.tsx`, `src/app/PracticeView.test.tsx`;
modify `src/App.tsx`, `src/styles/theme.css`; create `tests/e2e/practice.spec.ts`.

`PracticeView` is the assembled practice screen. `App` switches between
`ImportView` and `PracticeView`.

- [ ] **Step 1: Implement `src/app/PracticeView.tsx`**

Design:

- Props: `{ score: Score }`.
- On mount (`useEffect`, empty deps):
  - Create `const transport = new Transport(score)` (store in a `useRef` so it
    is stable).
  - Create `const loop = new FrameLoop(transport.clock)`.
  - Get the falldown `<canvas>` 2D context from a `useRef<HTMLCanvasElement>`;
    size the canvas to its client box; create `new FalldownRenderer(ctx,
transport, { width, height })`. Register `() => falldown.renderFrame()` with
    `loop.onFrame`.
  - `createAudioEngine(transport)` is async — `await` it, then register
    `() => engine.update()` with `loop.onFrame`. Keep the engine in a ref.
  - `renderScore(score.musicXml)` is async — `await` it; when it resolves, build
    `new ScoreView(scoreContainerRef.current, transport, svg, timemap)` and
    register `() => scoreView.renderFrame()`.
  - `loop.start()`.
  - Cleanup: `loop.stop()`, `scoreView?.destroy()`.
  - While the async audio/score are still loading, it is fine for the loop to
    run with only the falldown registered; render a small "Loading score…"
    overlay until the ScoreView is ready (a `useState` flag).
- State: `viewMode` (`useState<ViewMode>("both")`), `split`
  (`useState(0.65)` — piano-favoring default).
- Render:
  - A `<TransportBar transport={transport} viewMode={viewMode}
onViewModeChange={setViewMode} />`. The play button must also call
    `startAudioContext()` once — wrap: pass a prop or have PracticeView call it.
    Simplest: PracticeView calls `startAudioContext()` itself the first time
    `transport.clock.playing` becomes true (subscribe via `clock.onChange`).
  - A `<Layout viewMode={viewMode} split={split} onSplitChange={setSplit}
falldown={<canvas ref={canvasRef} class="falldown-canvas" />}
score={<div ref={scoreContainerRef} class="score-container" />} />`.
  - If `score.qualityWarning` is set, show it once as a dismissible banner.
- Keep `PracticeView` focused; extract small helpers if it grows. It is
  inherently integration-heavy — that is expected.

- [ ] **Step 2: Write `src/app/PracticeView.test.tsx`**

A light React Testing Library test — the deep behavior is covered by the unit
tests of the pieces and the e2e. Verify:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { PracticeView } from "./PracticeView";
import type { Score } from "../model/score";

// Verovio + Tone are heavy/async; stub them so the component mounts in jsdom.
vi.mock("../score-view/verovio", () => ({
  renderScore: vi.fn().mockResolvedValue({
    svg: '<svg><g class="measure"></g></svg>',
    timemap: [],
  }),
}));
vi.mock("../audio/engine", () => ({
  createAudioEngine: vi
    .fn()
    .mockResolvedValue({ update: vi.fn(), metronome: {} }),
  startAudioContext: vi.fn().mockResolvedValue(undefined),
}));

const score = {
  source: "midi",
  notes: [{ midi: 60, start: 0, duration: 1, velocity: 0.7, hand: "right" }],
  measures: [{ index: 0, start: 0, end: 2, numerator: 4, denominator: 4 }],
  pedalEvents: [],
  timeSignatures: [{ start: 0, numerator: 4, denominator: 4 }],
  tempoMap: [{ start: 0, bpm: 120 }],
  durationSeconds: 2,
  musicXml: "<score-partwise></score-partwise>",
  qualityWarning: null,
} satisfies Score;

beforeEach(() => {
  // jsdom canvas has no 2D context; stub it so FalldownRenderer can construct.
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

describe("PracticeView", () => {
  it("renders the transport bar and the falldown canvas", () => {
    render(<PracticeView score={score} />);
    expect(screen.getByRole("button", { name: /play/i })).toBeInTheDocument();
    expect(document.querySelector("canvas")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Modify `src/App.tsx`**

```tsx
import { useState } from "react";
import type { Score } from "./model/score";
import { ImportView } from "./ui/ImportView";
import { PracticeView } from "./app/PracticeView";

export default function App() {
  const [score, setScore] = useState<Score | null>(null);
  return score ? (
    <PracticeView score={score} />
  ) : (
    <ImportView onLoaded={setScore} />
  );
}
```

- [ ] **Step 4: Add styles to `src/styles/theme.css`**

Append styles for: `.layout` (full-height flex row), `.falldown-canvas`
(fills its panel), `.score-container` (scrollable, white-ish page background so
the engraving reads), `.divider` (thin, `--border`, `col-resize` cursor, a wider
invisible hit area), `.transport-bar` (flex row, `--panel` background),
`.import-view` (centered drop zone), and the score highlight classes
`.current-measure` (subtle `--accent` background tint on the measure) and
`.current-note` (fill the note `--accent`). Keep the dark theme. Use the
existing CSS custom properties.

- [ ] **Step 5: Write the e2e test — `tests/e2e/practice.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

test("import a MIDI file and see the practice view", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/midi or musicxml/i)).toBeVisible();
  await page.setInputFiles('input[type="file"]', "src/test/fixtures/clean.mid");
  // After import the transport bar appears.
  await expect(page.getByRole("button", { name: /play/i })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator("canvas")).toBeVisible();
});
```

- [ ] **Step 6: Run the smoke e2e from Feature A plus the new one**

The Feature A smoke test (`tests/e2e/smoke.spec.ts`) asserts an `<h1>Arpeggio</h1>`
heading. App no longer renders that heading — UPDATE `tests/e2e/smoke.spec.ts`
so it asserts the import prompt instead: change the assertion to
`await expect(page.getByText(/midi or musicxml/i)).toBeVisible();` and the test
title accordingly. (The `App.test.tsx` unit test from Feature A likewise asserts
the heading — update it to assert the import prompt text, or replace it with a
trivial render check, so `npm test` stays green.)

- [ ] **Step 7: Full verification**

Run: `npm run lint && npm run typecheck && npm test && npm run build && npm run e2e`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/app/PracticeView.tsx src/app/PracticeView.test.tsx src/App.tsx \
  src/App.test.tsx src/styles/theme.css tests/e2e/practice.spec.ts \
  tests/e2e/smoke.spec.ts
git commit -m "feat: assemble the practice view, app shell, and styles"
```

---

## Feature G — Definition of Done

- Loading a file shows the practice view; the falldown and score render
  side-by-side synced to one clock.
- Play/pause/seek work from the transport bar; the frame loop drives clock +
  audio + both renderers.
- The divider resizes the split; the Both / Falldown / Score toggle works.
- All unit + component tests pass; `npm run lint`, `npm run typecheck`,
  `npm test`, `npm run build`, `npm run e2e` all green.
- `docs/features/G-layout-view-modes.md` updated: status Done, changes log +
  testing.

## Manual-test checklist (for the feature doc)

- Import a real MIDI file: falldown notes fall and the engraved score renders;
  pressing play scrolls/animates both in sync; audio sounds; seeking via the
  slider or a measure click moves everything together; the divider drags; the
  view-mode toggle switches layouts.
