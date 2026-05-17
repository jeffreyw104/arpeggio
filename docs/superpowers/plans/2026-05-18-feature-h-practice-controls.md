# Feature H — Practice Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the practice tooling UI — hands-separate (mute and/or hide the left or right hand independently) and a control panel for tempo (BPM), looping, gradual speed-up, the metronome, the beat grid, the full-88 toggle, and note-name labels.

**Architecture:** A `HandState` object holds the mute/hide flags for each hand. It is a shared `HandFilter` the already-built audio engine and falldown renderer consult — the `AudioEngine` skips muted-hand notes, the `FalldownRenderer` skips hidden-hand notes. Both expose a settable `handState` field (default: a no-op filter), so wiring `HandState` in does not change their constructors. The `ControlPanel` React component surfaces every practice control, writing through to the `Transport`, the `FalldownRenderer`, the `AudioEngine`'s metronome, and the `HandState`. `PracticeView` creates the `HandState`, wires it into the engines, and renders the `ControlPanel`.

**Tech Stack:** TypeScript, React 19, Vitest + React Testing Library. Modifies Features D/E/G; reads C.

**Branch:** `feature/h-practice-controls`

---

## Notes for the implementer

- Repo root and working directory: `/Users/jeffreywan/Desktop/arpeggio`. Run all commands from there.
- Work on branch `feature/h-practice-controls` (the controller creates it before Task 1).
- Features A-G are merged into `main`. `npm test` (138 tests), lint, typecheck, build, e2e all green.
- Key APIs to read:
  - `src/model/score.ts` — `Hand = "left" | "right"`.
  - `src/audio/engine.ts` — `AudioEngine` (`.update()`, `.metronome`), `createAudioEngine`.
  - `src/falldown/renderer.ts` — `FalldownRenderer` (`.renderFrame()`, `.full88`, `.showLabels`, `.showBeatGrid`).
  - `src/transport/transport.ts` — `Transport` (`.setBpm`, `.bpm`, `.loopMeasures`, `.clearLoop`, `.enableSpeedUp`, `.disableSpeedUp`, `.clock`).
  - `src/audio/metronome.ts` — `Metronome` (`.enabled`, `.subdivision`).
  - `src/app/PracticeView.tsx` — the practice screen to wire into.
- `strict` TypeScript + `noUnusedLocals`/`noUnusedParameters` on. React: `react-jsx`, no `import React`.
- Commit after every task with the exact messages given.

---

## File / Folder Structure

```
src/
  practice/
    hands.ts          # HandState (mute/hide flags), HandFilter, NO_HAND_FILTER
    ControlPanel.tsx  # the practice control-panel UI
  audio/engine.ts     # MODIFIED: AudioEngine consults a HandFilter for mute
  falldown/renderer.ts# MODIFIED: FalldownRenderer consults a HandFilter for hide
  app/PracticeView.tsx# MODIFIED: creates HandState, wires it, renders ControlPanel
```

---

## Task 1: Hand state — `hands.ts`

**Files:** Create `src/practice/hands.ts`, `src/practice/hands.test.ts`

- [ ] **Step 1: Write the failing test — `src/practice/hands.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { HandState, NO_HAND_FILTER } from "./hands";

describe("HandState", () => {
  it("starts with both hands audible and visible", () => {
    const h = new HandState();
    expect(h.isMuted("left")).toBe(false);
    expect(h.isMuted("right")).toBe(false);
    expect(h.isHidden("left")).toBe(false);
    expect(h.isHidden("right")).toBe(false);
  });

  it("mutes and hides each hand independently", () => {
    const h = new HandState();
    h.setMuted("left", true);
    h.setHidden("right", true);
    expect(h.isMuted("left")).toBe(true);
    expect(h.isMuted("right")).toBe(false);
    expect(h.isHidden("right")).toBe(true);
    expect(h.isHidden("left")).toBe(false);
  });

  it("notifies change listeners and supports unsubscribe", () => {
    const h = new HandState();
    const fn = vi.fn();
    const off = h.onChange(fn);
    h.setMuted("left", true);
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    h.setMuted("right", true);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("NO_HAND_FILTER", () => {
  it("mutes and hides nothing", () => {
    expect(NO_HAND_FILTER.isMuted("left")).toBe(false);
    expect(NO_HAND_FILTER.isHidden("right")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it — confirm it fails**

Run: `npm test -- practice/hands`
Expected: FAIL.

- [ ] **Step 3: Implement `src/practice/hands.ts`**

```ts
import type { Hand } from "../model/score";

/** Read-only view of which hands are muted (silent) / hidden (not drawn). */
export interface HandFilter {
  isMuted(hand: Hand): boolean;
  isHidden(hand: Hand): boolean;
}

/** A filter that mutes and hides nothing — the default for the engines. */
export const NO_HAND_FILTER: HandFilter = {
  isMuted: () => false,
  isHidden: () => false,
};

/**
 * Mutable per-hand mute/hide state for hands-separate practice. The audio
 * engine reads `isMuted`; the falldown renderer reads `isHidden`.
 */
export class HandState implements HandFilter {
  private muted: Record<Hand, boolean> = { left: false, right: false };
  private hidden: Record<Hand, boolean> = { left: false, right: false };
  private listeners = new Set<() => void>();

  isMuted(hand: Hand): boolean {
    return this.muted[hand];
  }

  isHidden(hand: Hand): boolean {
    return this.hidden[hand];
  }

  setMuted(hand: Hand, value: boolean): void {
    this.muted[hand] = value;
    this.emit();
  }

  setHidden(hand: Hand, value: boolean): void {
    this.hidden[hand] = value;
    this.emit();
  }

  /** Subscribe to any change. Returns an unsubscribe function. */
  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn());
  }
}
```

- [ ] **Step 4: Run the tests — confirm they pass**

Run: `npm test -- practice/hands`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/practice/hands.ts src/practice/hands.test.ts
git commit -m "feat: add per-hand mute/hide state"
```

---

## Task 2: Audio engine respects hand mute — `engine.ts`

**Files:** Modify `src/audio/engine.ts`, `src/audio/engine.test.ts`

The `AudioEngine` gains a public `handState: HandFilter` field (default
`NO_HAND_FILTER`), and skips triggering a note whose hand is muted.

- [ ] **Step 1: Add the failing test — append to `src/audio/engine.test.ts`**

Add a new `describe` block (keep all existing tests unchanged). It needs a score
with notes on BOTH hands; reuse the existing test `score` if it has both, else
add a local one. Add:

```ts
import { HandState } from "../practice/hands";

describe("AudioEngine hand mute", () => {
  it("does not trigger notes whose hand is muted", () => {
    // score's note 60 is right hand, note 64 is left hand (see the file's score)
    const t = new Transport(score);
    const { piano, click } = fakes();
    const engine = new AudioEngine(t, piano, click);
    const hands = new HandState();
    hands.setMuted("left", true);
    engine.handState = hands;
    t.clock.play();
    t.clock.tick(1.0); // advance past both notes (0.1 right, 0.6 left)
    engine.update();
    expect(piano.calls).toContain(60); // right hand still sounds
    expect(piano.calls).not.toContain(64); // left hand is muted
  });
});
```

(If the existing `score` const in `engine.test.ts` does not already have a
right-hand note at 0.1 and a left-hand note at 0.6, adjust this test to match
the actual fixture — the point is: one note on each hand, mute one, assert only
the other sounds.)

- [ ] **Step 2: Run it — confirm the new test fails**

Run: `npm test -- audio/engine`
Expected: the new test FAILS (`handState` does not exist yet); existing pass.

- [ ] **Step 3: Modify `src/audio/engine.ts`**

- Import `type HandFilter` and `NO_HAND_FILTER` from `../practice/hands`.
- Add a public field to `AudioEngine`: `handState: HandFilter = NO_HAND_FILTER;`.
- In `update()`, where notes are triggered (both the normal `notesToTrigger`
  loop AND the play-start boundary loop), skip a note when
  `this.handState.isMuted(note.hand)` — wrap the `piano.playNote(...)` call so a
  muted-hand note is not played.
- Leave `createAudioEngine` unchanged (the wiring sets `.handState` afterwards).

- [ ] **Step 4: Run the tests — confirm all pass**

Run: `npm test -- audio/engine`
Expected: PASS — existing tests plus the new mute test.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/audio/engine.ts src/audio/engine.test.ts
git commit -m "feat: skip muted-hand notes in the audio engine"
```

---

## Task 3: Falldown renderer respects hand hide — `renderer.ts`

**Files:** Modify `src/falldown/renderer.ts`, `src/falldown/renderer.test.ts`

The `FalldownRenderer` gains a public `handState: HandFilter` field (default
`NO_HAND_FILTER`); a hidden hand's notes are not drawn (and its keys do not
highlight).

- [ ] **Step 1: Add the failing test — append to `src/falldown/renderer.test.ts`**

Add a `describe` block (keep existing tests). The renderer test already builds a
`FalldownRenderer` with a fake recording ctx; the score has a right-hand and a
left-hand note. Add:

```ts
import { HandState } from "../practice/hands";

describe("FalldownRenderer hand hide", () => {
  it("draws fewer note rects when a hand is hidden", () => {
    const { transport, ctx, renderer } = makeRenderer();
    transport.clock.seek(0.5);
    renderer.renderFrame();
    const fullCount = ctx.calls.filter((c) => c.startsWith("fillRect")).length;

    const { transport: t2, ctx: ctx2, renderer: r2 } = makeRenderer();
    const hands = new HandState();
    hands.setHidden("left", true);
    r2.handState = hands;
    t2.clock.seek(0.5);
    r2.renderFrame();
    const hiddenCount = ctx2.calls.filter((c) =>
      c.startsWith("fillRect"),
    ).length;

    // Hiding a hand removes that hand's falling-note rects, so fewer fillRects.
    expect(hiddenCount).toBeLessThan(fullCount);
  });
});
```

(Adjust to the actual `makeRenderer`/`fakeCtx` helpers already in the file — the
existing test file has them. The score used by `makeRenderer` has notes on both
hands; if it does not, give it one note per hand so hiding one is observable.
The assertion is simply: hiding a hand strictly reduces the drawn `fillRect`
count.)

- [ ] **Step 2: Run it — confirm the new test fails**

Run: `npm test -- falldown/renderer`
Expected: the new test FAILS; existing pass.

- [ ] **Step 3: Modify `src/falldown/renderer.ts`**

- Import `type HandFilter` and `NO_HAND_FILTER` from `../practice/hands`.
- Add a public field: `handState: HandFilter = NO_HAND_FILTER;`.
- In `renderFrame`, before computing `noteRects` and `activeKeys`, build a
  filtered note list: `const visible = score.notes.filter((n) =>
!this.handState.isHidden(n.hand));` and pass `visible` to BOTH `noteRects` and
  `activeKeys` instead of `score.notes`.

- [ ] **Step 4: Run the tests — confirm all pass**

Run: `npm test -- falldown/renderer`
Expected: PASS — existing tests plus the new hide test.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/falldown/renderer.ts src/falldown/renderer.test.ts
git commit -m "feat: skip hidden-hand notes in the falldown renderer"
```

---

## Task 4: The control panel — `ControlPanel.tsx`

**Files:** Create `src/practice/ControlPanel.tsx`, `src/practice/ControlPanel.test.tsx`

`ControlPanel` is the practice-tooling UI. It writes through to the transport,
the falldown renderer, the metronome, and the `HandState`.

- [ ] **Step 1: Write the failing test — `src/practice/ControlPanel.test.tsx`**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ControlPanel } from "./ControlPanel";
import { Transport } from "../transport/transport";
import { HandState } from "./hands";
import { FalldownRenderer } from "../falldown/renderer";
import type { Score } from "../model/score";

const score = {
  source: "midi",
  notes: [
    { midi: 60, start: 0, duration: 1, velocity: 0.7, hand: "right" },
    { midi: 48, start: 0, duration: 1, velocity: 0.7, hand: "left" },
  ],
  measures: [{ index: 0, start: 0, end: 2, numerator: 4, denominator: 4 }],
  pedalEvents: [],
  timeSignatures: [{ start: 0, numerator: 4, denominator: 4 }],
  tempoMap: [{ start: 0, bpm: 120 }],
  durationSeconds: 2,
  musicXml: "",
  qualityWarning: null,
} satisfies Score;

function fakeCtx() {
  const noop = () => {};
  return {
    clearRect: noop,
    fillRect: noop,
    strokeRect: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    stroke: noop,
    fillText: noop,
  } as unknown as CanvasRenderingContext2D;
}

function setup() {
  const transport = new Transport(score);
  const handState = new HandState();
  const falldown = new FalldownRenderer(fakeCtx(), transport, {
    width: 800,
    height: 600,
  });
  render(
    <ControlPanel
      transport={transport}
      handState={handState}
      falldown={falldown}
      audioEngine={null}
    />,
  );
  return { transport, handState, falldown };
}

describe("ControlPanel", () => {
  it("changes the tempo via the BPM input", () => {
    const { transport } = setup();
    const bpm = screen.getByLabelText(/tempo/i);
    fireEvent.change(bpm, { target: { value: "90" } });
    expect(transport.bpm).toBeCloseTo(90, 3);
  });

  it("mutes a hand via the hand controls", () => {
    const { handState } = setup();
    fireEvent.click(screen.getByLabelText(/mute left/i));
    expect(handState.isMuted("left")).toBe(true);
  });

  it("hides a hand via the hand controls", () => {
    const { handState } = setup();
    fireEvent.click(screen.getByLabelText(/hide right/i));
    expect(handState.isHidden("right")).toBe(true);
  });

  it("toggles note labels on the falldown renderer", () => {
    const { falldown } = setup();
    fireEvent.click(screen.getByLabelText(/note labels/i));
    expect(falldown.showLabels).toBe(true);
  });

  it("toggles the full-88 key range", () => {
    const { falldown } = setup();
    fireEvent.click(screen.getByLabelText(/full 88/i));
    expect(falldown.full88).toBe(true);
  });

  it("loops the current measure and clears the loop", () => {
    const { transport } = setup();
    transport.clock.seek(0.5); // inside measure 0
    fireEvent.click(screen.getByRole("button", { name: /loop measure/i }));
    expect(transport.clock.loop).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /clear loop/i }));
    expect(transport.clock.loop).toBeNull();
  });

  it("enables gradual speed-up", () => {
    const { transport } = setup();
    fireEvent.click(screen.getByLabelText(/gradual speed-up/i));
    // with speed-up enabled the clock rate starts below 1
    expect(transport.clock.rate).toBeLessThan(1);
  });
});
```

- [ ] **Step 2: Run it — confirm it fails**

Run: `npm test -- ControlPanel`
Expected: FAIL.

- [ ] **Step 3: Implement `src/practice/ControlPanel.tsx`**

Design:

- Props interface: `{ transport: Transport; handState: HandState; falldown:
FalldownRenderer; audioEngine: AudioEngine | null }` (import the types;
  `AudioEngine` from `../audio/engine`).
- The renderer/metronome/handState are imperative objects — keep a small piece
  of local React state per control to drive the checkbox `checked`/input
  `value`, and write through to the object in the change handler.
- Render `<div className="control-panel">` with labelled controls. Every control
  must be reachable by the test's `getByLabelText` / `getByRole`:
  - **Tempo:** `<label>Tempo (BPM) <input type="number" .../></label>` — initial
    value `Math.round(transport.bpm)`; on change `transport.setBpm(Number(value))`
    and update local state.
  - **Loop:** a `<button>Loop measure</button>` → on click, find the measure
    containing `transport.clock.position`
    (`transport.score.measures.find(m => pos>=m.start && pos<m.end)` ?? measure 0)
    and call `transport.loopMeasures(idx, idx)`. A `<button>Clear loop</button>`
    → `transport.clearLoop()`.
  - **Gradual speed-up:** a checkbox labelled "Gradual speed-up" → on check,
    `transport.enableSpeedUp({ startRate: 0.5, targetRate: 1, step: 0.05 })`; on
    uncheck, `transport.disableSpeedUp()`.
  - **Note labels:** a checkbox "Note labels" → `falldown.showLabels = checked`.
  - **Beat grid:** a checkbox "Beat grid" → `falldown.showBeatGrid = checked`
    (initial checked = `falldown.showBeatGrid`, which defaults true).
  - **Full 88:** a checkbox "Full 88 keys" → `falldown.full88 = checked`.
  - **Metronome:** a checkbox "Metronome" → if `audioEngine` is non-null,
    `audioEngine.metronome.enabled = checked`. (When `audioEngine` is null the
    checkbox still toggles its own state — it is harmless; or disable it. Keep it
    simple: toggle local state and set the metronome only when `audioEngine` is
    present.)
  - **Hands:** four checkboxes — "Mute left", "Mute right", "Hide left",
    "Hide right" → `handState.setMuted("left", checked)` etc.
- Use `<label>text <input/></label>` wrapping so `getByLabelText` resolves, OR
  `htmlFor`/`id` pairs. Labels must contain the substrings the test matches
  (case-insensitive): "tempo", "mute left", "hide right", "note labels",
  "full 88", "gradual speed-up", and buttons "Loop measure" / "Clear loop".
- The `control-panel` CSS class — add a small style block to
  `src/styles/theme.css` (a flex-wrap row of controls, `--panel` background).
  Keep it brief and on-theme.

- [ ] **Step 4: Run the tests — confirm they pass**

Run: `npm test -- ControlPanel`
Expected: PASS (7 tests).

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/practice/ControlPanel.tsx src/practice/ControlPanel.test.tsx src/styles/theme.css
git commit -m "feat: add the practice control panel"
```

---

## Task 5: Wire the control panel into the practice view

**Files:** Modify `src/app/PracticeView.tsx`, `src/app/PracticeView.test.tsx`

- [ ] **Step 1: Modify `src/app/PracticeView.tsx`**

- Create a stable `HandState`: `const [handState] = useState(() => new HandState());`
  (import `HandState` from `../practice/hands`).
- In the mount effect, after the `FalldownRenderer` is created, set
  `falldown.handState = handState;`.
- After `createAudioEngine` resolves, set `engine.handState = handState;` (before
  or after registering its `onFrame` — either is fine).
- Render `<ControlPanel transport={transport} handState={handState}
falldown={...} audioEngine={...} />`. The `FalldownRenderer` and `AudioEngine`
  are created inside the effect — to pass them to `ControlPanel` (which renders
  in JSX) keep them in React state set from the effect: e.g.
  `const [falldown, setFalldown] = useState<FalldownRenderer | null>(null)` and
  `const [audioEngine, setAudioEngine] = useState<AudioEngine | null>(null)`,
  set them once created. Render `ControlPanel` only once `falldown` is non-null
  (so the panel mounts after the renderer exists). `ControlPanel` already
  tolerates a null `audioEngine`.
- Place the `<ControlPanel>` in the header area — render it directly under the
  `<TransportBar>` (both above the `<Layout>`).

- [ ] **Step 2: Update `src/app/PracticeView.test.tsx`**

The existing PracticeView test mocks `../audio/engine` and `../score-view/verovio`.
Keep it working: the `createAudioEngine` mock already returns `{ update, metronome }`
— ControlPanel tolerates that. After the change, `ControlPanel` renders once
`falldown` state is set (synchronously in the mount effect). Add one assertion
to the existing test (or a second test) that a control-panel control is present,
e.g. `expect(screen.getByLabelText(/tempo/i)).toBeInTheDocument()`. If the mocked
`createAudioEngine`'s resolved object needs a richer `metronome` shape, give the
mock `metronome: { enabled: false }`.

- [ ] **Step 3: Full verification**

Run: `npm run lint && npm run typecheck && npm test && npm run build && npm run e2e`
Expected: all pass. (The existing e2e still loads the app and presses play — it
should be unaffected; if a control-panel element changed the DOM such that the
e2e's selectors break, fix the e2e minimally.)

- [ ] **Step 4: Commit**

```bash
git add src/app/PracticeView.tsx src/app/PracticeView.test.tsx
git commit -m "feat: wire the control panel and hand state into the practice view"
```

---

## Feature H — Definition of Done

- `HandState` mutes/hides each hand independently; the audio engine skips muted
  notes and the falldown renderer skips hidden notes.
- `ControlPanel` surfaces tempo (BPM), loop (loop current measure / clear),
  gradual speed-up, the metronome, the beat grid, full-88, note labels, and the
  four hand controls — all wired through.
- `ControlPanel` is mounted in `PracticeView`.
- All unit/component tests pass; `npm run lint`, `npm run typecheck`,
  `npm test`, `npm run build`, `npm run e2e` all green.
- `docs/features/H-practice-controls.md` updated: status Done, changes log +
  testing.

## Manual-test checklist (for the feature doc)

- With a piece loaded: changing the BPM input slows/speeds playback; "Loop
  measure" loops the current bar; gradual speed-up ramps the tempo across loop
  passes; the metronome clicks when enabled; muting a hand silences it while it
  still falls; hiding a hand removes it from the falldown; note labels, beat
  grid, and full-88 toggles all take effect.
