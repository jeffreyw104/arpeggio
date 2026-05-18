# Arpeggio UI Polish & Floating HUD — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the practice UI better — polish the Canvas2D falldown/keyboard rendering, and move the chrome into a draggable auto-fading floating HUD plus an overlay control drawer so the falldown and score fill the whole viewport.

**Architecture:** Part B is contained renderer work in `src/falldown/` + `src/practice/hands.ts`. Part A replaces the two stacked chrome bands in `PracticeView` with absolutely-positioned overlays: a `FloatingHud` (absorbing `TransportBar`) and the existing `ControlPanel` shown as a toggled drawer.

**Tech Stack:** Vite + TypeScript + React 19 · Canvas2D · Vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-05-18-arpeggio-ui-polish-design.md`

---

## File Structure

**Part B — renderer polish**
- Modify `src/falldown/notes.ts` — `NoteRect` gains `velocity`/`playing`/`dimmed`; new `activeKeyColors`.
- Modify `src/falldown/piano.ts` — keyboard depth; `DrawPianoOptions` uses `activeKeyColors`.
- Modify `src/falldown/renderer.ts` — rounded/glow/velocity/dim note drawing; builds the color map.
- Modify `src/practice/hands.ts` — 3-way `HandVisibility`.
- Modify `src/library/db.ts`, `src/library/practiceState.ts` — persist the 3-way value.
- Modify `src/practice/ControlPanel.tsx` — 3-way Show/Dim/Hide control.
- Test files alongside each.

**Part A — floating HUD**
- Create `src/ui/FloatingHud.tsx` + `src/ui/FloatingHud.test.tsx`.
- Delete `src/ui/TransportBar.tsx` + `src/ui/TransportBar.test.tsx`.
- Modify `src/app/PracticeView.tsx` + `src/app/PracticeView.test.tsx`.
- Modify `src/styles/theme.css`.

Each task ends with lint + typecheck + the test suite green.

---

## Task 1: Falling-note polish — rounded corners, velocity opacity, hit-line glow

**Files:**
- Modify: `src/falldown/notes.ts`
- Modify: `src/falldown/notes.test.ts`
- Modify: `src/falldown/renderer.ts`
- Modify: `src/falldown/renderer.test.ts`

- [ ] **Step 1: Write failing tests for the new `NoteRect` fields**

In `src/falldown/notes.test.ts`, add inside `describe("noteRects", ...)`:

```ts
  it("carries each note's velocity", () => {
    const rects = noteRects(notes, layout, 1, config);
    expect(rects.find((x) => x.midi === 60)!.velocity).toBeCloseTo(0.7, 6);
  });

  it("marks a note as playing only while it is sounding", () => {
    // note 60: start 1, duration 0.5 -> sounding on [1, 1.5)
    expect(noteRects(notes, layout, 1.2, config).find((x) => x.midi === 60)!.playing).toBe(true);
    expect(noteRects(notes, layout, 0.6, config).find((x) => x.midi === 60)!.playing).toBe(false);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/falldown/notes.test.ts`
Expected: FAIL — `velocity`/`playing` do not exist on `NoteRect`.

- [ ] **Step 3: Add the fields to `notes.ts`**

In `src/falldown/notes.ts`, extend the `NoteRect` interface:

```ts
/** A falling note's drawn rectangle. `bottom` is the onset (lower) edge. */
export interface NoteRect {
  midi: number;
  x: number;
  width: number;
  bottom: number;
  top: number;
  height: number;
  color: string;
  /** The note's velocity, 0-1 — drives draw opacity. */
  velocity: number;
  /** True while the note is sounding at the current clock time. */
  playing: boolean;
}
```

In `noteRects`, change the `rects.push({...})` call to include the new fields:

```ts
    rects.push({
      midi: note.midi,
      x: key.x,
      width: key.width,
      bottom,
      top,
      height,
      color: note.hand === "right" ? config.rightColor : config.leftColor,
      velocity: note.velocity,
      playing: t >= note.start && t < note.start + note.duration,
    });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/falldown/notes.test.ts`
Expected: PASS.

- [ ] **Step 5: Extend the renderer test's fake context, and fix note-count assertions**

In `src/falldown/renderer.test.ts`, the falling notes will switch from `fillRect` to `roundRect` + `fill`. Update `fakeCtx()` to record the new calls and accept the new setters:

```ts
  const ctx = {
    calls,
    clearRect: rec("clearRect"),
    fillRect: rec("fillRect"),
    strokeRect: rec("strokeRect"),
    beginPath: rec("beginPath"),
    moveTo: rec("moveTo"),
    lineTo: rec("lineTo"),
    stroke: rec("stroke"),
    fill: rec("fill"),
    roundRect: rec("roundRect"),
    save: rec("save"),
    restore: rec("restore"),
    fillText: rec("fillText"),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    set fillStyle(_v: string | CanvasGradient) {},
    set strokeStyle(_v: string) {},
    set lineWidth(_v: number) {},
    set font(_v: string) {},
    set textAlign(_v: string) {},
    set globalAlpha(_v: number) {},
    set shadowBlur(_v: number) {},
    set shadowColor(_v: string) {},
  };
```

In the test `"draws falling-note rectangles when notes are visible"`, the falling note is now a `roundRect`, not a `fillRect`. Replace the three `fillRect` filters with `roundRect`:

```ts
  it("draws falling-note rectangles when notes are visible", () => {
    const { transport, ctx, renderer } = makeRenderer();

    transport.clock.seek(100);
    renderer.renderFrame();
    const keyboardOnly = ctx.calls.filter((c) => c.startsWith("roundRect")).length;

    ctx.calls.length = 0;
    transport.clock.seek(0.4);
    renderer.renderFrame();
    const withNotes = ctx.calls.filter((c) => c.startsWith("roundRect")).length;

    expect(withNotes).toBeGreaterThan(keyboardOnly);
  });
```

The `"draws fewer note rects when a hand is hidden"` test (in `describe("FalldownRenderer hand hide", ...)`) also counts note draws — change both of its `fillRect` filters to `roundRect`:

```ts
    const fullCount = ctx.calls.filter((c) => c.startsWith("roundRect")).length;
    // ...
    const hiddenCount = ctx2.calls.filter((c) =>
      c.startsWith("roundRect"),
    ).length;
```

- [ ] **Step 6: Run the renderer tests to verify they fail**

Run: `npx vitest run src/falldown/renderer.test.ts`
Expected: FAIL — the renderer does not call `roundRect` yet.

- [ ] **Step 7: Implement rounded/velocity/glow drawing in the renderer**

In `src/falldown/renderer.ts`, add a constant near the top (after the existing color constants, around line 17):

```ts
/** Max corner radius for a falling note, in px. */
const NOTE_RADIUS = 4;
/** Shadow blur applied to a note while it is sounding. */
const GLOW_BLUR = 12;
```

Replace the `drawNotes` method body's draw loop:

```ts
    for (const rect of rects) {
      const radius = Math.min(NOTE_RADIUS, rect.width / 3, rect.height / 2);
      ctx.save();
      ctx.globalAlpha = 0.5 + 0.5 * rect.velocity;
      if (rect.playing) {
        ctx.shadowColor = rect.color;
        ctx.shadowBlur = GLOW_BLUR;
      }
      ctx.fillStyle = rect.color;
      ctx.beginPath();
      ctx.roundRect(rect.x, rect.top, rect.width, rect.height, radius);
      ctx.fill();
      ctx.restore();
      if (this.showLabels) {
        ctx.fillStyle = LABEL;
        ctx.font = "11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(
          midiToNoteName(rect.midi),
          rect.x + rect.width / 2,
          rect.bottom - 4,
        );
      }
    }
```

- [ ] **Step 8: Run the full suite to verify it passes**

Run: `npx vitest run src/falldown/`
Expected: PASS.

- [ ] **Step 9: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck
git add src/falldown/notes.ts src/falldown/notes.test.ts src/falldown/renderer.ts src/falldown/renderer.test.ts
git commit -m "feat: rounded notes with velocity opacity and a hit-line glow"
```

---

## Task 2: Keyboard depth

**Files:**
- Modify: `src/falldown/piano.ts`
- Modify: `src/falldown/piano.test.ts`

- [ ] **Step 1: Write a failing test for keyboard depth shading**

In `src/falldown/piano.test.ts`, extend the `drawPiano` fake context and add a test. Replace the existing `ctx` object in the `drawPiano` test with one that also records `createLinearGradient`, then add a new test after it:

```ts
  it("shades white keys with a vertical gradient for depth", () => {
    const layout = keyLayout({ low: 60, high: 72 }, 800);
    let gradients = 0;
    const ctx = {
      set fillStyle(_v: string | CanvasGradient) {},
      fillRect: () => {},
      strokeRect: () => {},
      set strokeStyle(_v: string) {},
      set lineWidth(_v: number) {},
      createLinearGradient: () => {
        gradients++;
        return { addColorStop: () => {} };
      },
    } as unknown as CanvasRenderingContext2D;
    drawPiano(ctx, layout, {
      y: 300,
      height: 100,
      activeKeys: new Set<number>(),
      activeColor: "#4a8",
      whiteColor: "#fff",
      blackColor: "#222",
    });
    expect(gradients).toBeGreaterThan(0);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/falldown/piano.test.ts`
Expected: FAIL — `createLinearGradient` is never called.

- [ ] **Step 3: Implement depth shading in `drawPiano`**

In `src/falldown/piano.ts`, replace the white-key and black-key loops in `drawPiano` with:

```ts
  // White keys first.
  for (const key of layout.keys) {
    if (key.black) continue;
    ctx.fillStyle = opts.activeKeys.has(key.midi)
      ? opts.activeColor
      : opts.whiteColor;
    ctx.fillRect(key.x, opts.y, key.width, opts.height);
    ctx.strokeRect(key.x, opts.y, key.width, opts.height);

    // Depth: a soft top highlight fading to a bottom shadow, lit from above.
    const grad = ctx.createLinearGradient(0, opts.y, 0, opts.y + opts.height);
    grad.addColorStop(0, "rgba(255,255,255,0.35)");
    grad.addColorStop(0.12, "rgba(255,255,255,0)");
    grad.addColorStop(0.85, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,0,0,0.22)");
    ctx.fillStyle = grad;
    ctx.fillRect(key.x, opts.y, key.width, opts.height);
  }

  // Black keys on top — shorter, with a top bevel highlight.
  for (const key of layout.keys) {
    if (!key.black) continue;
    const h = opts.height * 0.62;
    ctx.fillStyle = opts.activeKeys.has(key.midi)
      ? opts.activeColor
      : opts.blackColor;
    ctx.fillRect(key.x, opts.y, key.width, h);
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(key.x, opts.y, key.width, Math.max(1, h * 0.08));
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/falldown/piano.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck
git add src/falldown/piano.ts src/falldown/piano.test.ts
git commit -m "feat: shade the keyboard keys for depth"
```

---

## Task 3: Tinted active-key halo

Replaces `drawPiano`'s single `activeColor` + `activeKeys` set with an `activeKeyColors` map (midi → color), so a pressed key glows in its hand's color.

**Files:**
- Modify: `src/falldown/notes.ts`
- Modify: `src/falldown/notes.test.ts`
- Modify: `src/falldown/piano.ts`
- Modify: `src/falldown/piano.test.ts`
- Modify: `src/falldown/renderer.ts`

- [ ] **Step 1: Write a failing test for `activeKeyColors`**

In `src/falldown/notes.test.ts`, add a new import and `describe` block:

```ts
import { noteRects, activeKeys, activeKeyColors, type FalldownConfig } from "./notes";
```

```ts
describe("activeKeyColors", () => {
  it("maps each sounding note's midi to its hand color", () => {
    const map = activeKeyColors(notes, 1.2, "#4a90d9", "#e08a3c");
    expect(map.get(60)).toBe("#4a90d9"); // note 60 is right-hand, sounding
    expect(map.has(64)).toBe(false); // note 64 not sounding at t=1.2
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/falldown/notes.test.ts`
Expected: FAIL — `activeKeyColors` is not exported.

- [ ] **Step 3: Add `activeKeyColors` to `notes.ts`**

Append to `src/falldown/notes.ts`:

```ts
/**
 * Map of midi -> hand color for every note sounding at time `t`. If two notes
 * sound the same pitch the last one wins (rare; either color reads correctly).
 */
export function activeKeyColors(
  notes: Note[],
  t: number,
  rightColor: string,
  leftColor: string,
): Map<number, string> {
  const map = new Map<number, string>();
  for (const note of notes) {
    if (t >= note.start && t < note.start + note.duration) {
      map.set(note.midi, note.hand === "right" ? rightColor : leftColor);
    }
  }
  return map;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/falldown/notes.test.ts`
Expected: PASS.

- [ ] **Step 5: Write a failing test for the new `drawPiano` signature**

In `src/falldown/piano.test.ts`, replace the existing `"fills a rect for every key and highlights active keys"` test with one using `activeKeyColors`:

```ts
  it("fills a rect for every key and highlights active keys", () => {
    const layout = keyLayout({ low: 60, high: 72 }, 800);
    const calls: string[] = [];
    const ctx = {
      set fillStyle(v: string | CanvasGradient) {
        if (typeof v === "string") calls.push(`fill=${v}`);
      },
      fillRect: () => calls.push("fillRect"),
      strokeRect: () => calls.push("strokeRect"),
      set strokeStyle(_v: string) {},
      set lineWidth(_v: number) {},
      set shadowBlur(_v: number) {},
      set shadowColor(_v: string) {},
      save: () => {},
      restore: () => {},
      createLinearGradient: () => ({ addColorStop: () => {} }),
    } as unknown as CanvasRenderingContext2D;
    drawPiano(ctx, layout, {
      y: 300,
      height: 100,
      activeKeyColors: new Map([[64, "#e08a3c"]]),
      whiteColor: "#fff",
      blackColor: "#222",
    });
    expect(calls.filter((c) => c === "fillRect").length).toBeGreaterThanOrEqual(
      layout.keys.length,
    );
    expect(calls).toContain("fill=#e08a3c"); // the active key was tinted
  });
```

Also update the depth test from Task 2 (`"shades white keys with a vertical gradient for depth"`) to use the new options shape — replace its `drawPiano(...)` options with:

```ts
    drawPiano(ctx, layout, {
      y: 300,
      height: 100,
      activeKeyColors: new Map<number, string>(),
      whiteColor: "#fff",
      blackColor: "#222",
    });
```

And add `save`, `restore`, `shadowBlur`, `shadowColor` to that test's `ctx` object (no-op implementations) so the gradient test still runs.

- [ ] **Step 6: Run the piano tests to verify they fail**

Run: `npx vitest run src/falldown/piano.test.ts`
Expected: FAIL — `DrawPianoOptions` still has `activeKeys`/`activeColor`.

- [ ] **Step 7: Update `DrawPianoOptions` and `drawPiano`**

In `src/falldown/piano.ts`, replace `DrawPianoOptions`:

```ts
export interface DrawPianoOptions {
  y: number; // top of the keyboard
  height: number; // keyboard height in px
  /** Midi -> color for every key currently sounding; absent = inactive. */
  activeKeyColors: Map<number, string>;
  whiteColor: string;
  blackColor: string;
}
```

Replace the white-key and black-key loops in `drawPiano` (the version from Task 2) with:

```ts
  /** Outer glow drawn behind/around an active key. */
  const halo = (x: number, w: number, h: number, color: string): void => {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    ctx.fillStyle = color;
    ctx.fillRect(x, opts.y, w, h);
    ctx.restore();
  };

  // The white-key depth gradient is geometry-identical for every key, so
  // build it once per call rather than once per key.
  const grad = ctx.createLinearGradient(0, opts.y, 0, opts.y + opts.height);
  grad.addColorStop(0, "rgba(255,255,255,0.35)");
  grad.addColorStop(0.12, "rgba(255,255,255,0)");
  grad.addColorStop(0.85, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.22)");

  // White keys first.
  for (const key of layout.keys) {
    if (key.black) continue;
    const active = opts.activeKeyColors.get(key.midi);
    if (active) halo(key.x, key.width, opts.height, active);
    ctx.fillStyle = active ?? opts.whiteColor;
    ctx.fillRect(key.x, opts.y, key.width, opts.height);
    ctx.strokeRect(key.x, opts.y, key.width, opts.height);
    ctx.fillStyle = grad;
    ctx.fillRect(key.x, opts.y, key.width, opts.height);
  }

  // Black keys on top — shorter, with a top bevel highlight.
  for (const key of layout.keys) {
    if (!key.black) continue;
    const h = opts.height * 0.62;
    const active = opts.activeKeyColors.get(key.midi);
    if (active) halo(key.x, key.width, h, active);
    ctx.fillStyle = active ?? opts.blackColor;
    ctx.fillRect(key.x, opts.y, key.width, h);
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(key.x, opts.y, key.width, Math.max(1, h * 0.08));
  }
```

- [ ] **Step 8: Update the renderer to build and pass `activeKeyColors`**

In `src/falldown/renderer.ts`:

Update the import on line 3:

```ts
import { noteRects, activeKeyColors } from "./notes";
```

Delete the now-unused `ACTIVE` constant (line 11).

In `renderFrame`, replace the `drawPiano({...})` call (lines 100-107) with:

```ts
    drawPiano(ctx, layout, {
      y: this.hitLineY,
      height: this.pianoHeight,
      activeKeyColors: activeKeyColors(visible, t, RIGHT, LEFT),
      whiteColor: WHITE,
      blackColor: BLACK,
    });
```

- [ ] **Step 9: Run the suite to verify it passes**

Run: `npx vitest run src/falldown/`
Expected: PASS.

- [ ] **Step 10: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck
git add src/falldown/notes.ts src/falldown/notes.test.ts src/falldown/piano.ts src/falldown/piano.test.ts src/falldown/renderer.ts
git commit -m "feat: tint pressed keys with a hand-colored halo"
```

---

## Task 4: Hands-separate Dim (3-way visibility)

Replaces `HandState`'s hidden boolean with a 3-way `show | dim | hide`. Touches the hand model, persistence, renderer, and control panel together because removing `isHidden` breaks all callers at once.

**Files:**
- Modify: `src/practice/hands.ts`, `src/practice/hands.test.ts`
- Modify: `src/library/db.ts`
- Modify: `src/library/practiceState.ts`, `src/library/practiceState.test.ts`
- Modify: `src/falldown/notes.ts`, `src/falldown/notes.test.ts`
- Modify: `src/falldown/renderer.ts`, `src/falldown/renderer.test.ts`
- Modify: `src/practice/ControlPanel.tsx`, `src/practice/ControlPanel.test.tsx`

- [ ] **Step 1: Write failing tests for 3-way `HandState`**

Replace the body of `src/practice/hands.test.ts` with:

```ts
import { describe, it, expect, vi } from "vitest";
import { HandState, NO_HAND_FILTER } from "./hands";

describe("HandState", () => {
  it("starts with both hands audible and shown", () => {
    const h = new HandState();
    expect(h.isMuted("left")).toBe(false);
    expect(h.visibility("left")).toBe("show");
    expect(h.visibility("right")).toBe("show");
  });

  it("mutes and sets visibility for each hand independently", () => {
    const h = new HandState();
    h.setMuted("left", true);
    h.setVisibility("right", "dim");
    h.setVisibility("left", "hide");
    expect(h.isMuted("left")).toBe(true);
    expect(h.isMuted("right")).toBe(false);
    expect(h.visibility("right")).toBe("dim");
    expect(h.visibility("left")).toBe("hide");
  });

  it("notifies change listeners and supports unsubscribe", () => {
    const h = new HandState();
    const fn = vi.fn();
    const off = h.onChange(fn);
    h.setVisibility("left", "hide");
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    h.setMuted("right", true);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("NO_HAND_FILTER", () => {
  it("mutes nothing and shows everything", () => {
    expect(NO_HAND_FILTER.isMuted("left")).toBe(false);
    expect(NO_HAND_FILTER.visibility("right")).toBe("show");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/practice/hands.test.ts`
Expected: FAIL — `visibility`/`setVisibility` do not exist.

- [ ] **Step 3: Rewrite `hands.ts` with 3-way visibility**

Replace `src/practice/hands.ts` with:

```ts
import type { Hand } from "../model/score";

/** How a hand's notes are shown in the falldown. */
export type HandVisibility = "show" | "dim" | "hide";

/** Read-only view of which hands are muted (silent) and how visible they are. */
export interface HandFilter {
  isMuted(hand: Hand): boolean;
  visibility(hand: Hand): HandVisibility;
}

/** A filter that mutes nothing and shows everything — the engine default. */
export const NO_HAND_FILTER: HandFilter = {
  isMuted: () => false,
  visibility: () => "show",
};

/**
 * Mutable per-hand mute + visibility state for hands-separate practice. The
 * audio engine reads `isMuted`; the falldown renderer reads `visibility`
 * ("hide" skips the hand's notes, "dim" draws them faint).
 */
export class HandState implements HandFilter {
  private muted: Record<Hand, boolean> = { left: false, right: false };
  private visible: Record<Hand, HandVisibility> = {
    left: "show",
    right: "show",
  };
  private listeners = new Set<() => void>();

  isMuted(hand: Hand): boolean {
    return this.muted[hand];
  }

  visibility(hand: Hand): HandVisibility {
    return this.visible[hand];
  }

  setMuted(hand: Hand, value: boolean): void {
    this.muted[hand] = value;
    this.emit();
  }

  setVisibility(hand: Hand, value: HandVisibility): void {
    this.visible[hand] = value;
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

- [ ] **Step 4: Run hands tests to verify they pass**

Run: `npx vitest run src/practice/hands.test.ts`
Expected: PASS. (The wider suite is now broken — fixed in the next steps.)

- [ ] **Step 5: Update persistence — `db.ts` and `practiceState.ts`**

In `src/library/db.ts`, add a type import at the top and update `StoredPracticeState`:

```ts
import type { HandVisibility } from "../practice/hands";
```

```ts
/** Per-piece practice settings persisted across sessions. */
export interface StoredPracticeState {
  bpm: number;
  loop: { start: number; end: number } | null;
  leftMuted: boolean;
  rightMuted: boolean;
  /** 3-way visibility. Optional: records saved before this used the booleans below. */
  leftVisibility?: HandVisibility;
  rightVisibility?: HandVisibility;
  /** Legacy boolean visibility — read-only fallback for old records. */
  leftHidden?: boolean;
  rightHidden?: boolean;
  /** Beat-grid / metronome settings (optional for records saved before this). */
  numerator?: number;
  denominator?: number;
  subdivision?: number;
}
```

In `src/library/practiceState.ts`, replace the `leftHidden`/`rightHidden` lines in `capturePracticeState` and `applyPracticeState`:

`capturePracticeState` return object — replace the two `*Hidden` lines with:

```ts
    leftVisibility: hands.visibility("left"),
    rightVisibility: hands.visibility("right"),
```

`applyPracticeState` — replace the two `hands.setHidden(...)` lines with:

```ts
  hands.setVisibility(
    "left",
    state.leftVisibility ?? (state.leftHidden ? "hide" : "show"),
  );
  hands.setVisibility(
    "right",
    state.rightVisibility ?? (state.rightHidden ? "hide" : "show"),
  );
```

- [ ] **Step 6: Update `practiceState.test.ts`**

In `src/library/practiceState.test.ts`:

In `"captures tempo, loop, and hand settings"` replace `hands.setHidden("right", true)` with `hands.setVisibility("right", "hide")`, and replace `expect(state.rightHidden).toBe(true)` with `expect(state.rightVisibility).toBe("hide")`.

In `"restores tempo, loop, and hand settings"` replace the `leftHidden`/`rightHidden` fields in the passed object with `leftVisibility: "hide", rightVisibility: "show"`, and replace `expect(hands.isHidden("left")).toBe(true)` with `expect(hands.visibility("left")).toBe("hide")`.

Add a test for the legacy fallback:

```ts
  it("reads legacy leftHidden/rightHidden booleans", () => {
    const t = new Transport(score);
    const hands = new HandState();
    applyPracticeState(
      {
        bpm: 80,
        loop: null,
        leftMuted: false,
        rightMuted: false,
        leftHidden: true,
        rightHidden: false,
      },
      t,
      hands,
    );
    expect(hands.visibility("left")).toBe("hide");
    expect(hands.visibility("right")).toBe("show");
  });
```

- [ ] **Step 7: Write failing tests for `noteRects` hide/dim**

In `src/falldown/notes.test.ts`, add an import and tests:

```ts
import { HandState } from "../practice/hands";
```

```ts
describe("noteRects hand visibility", () => {
  it("skips a hidden hand's notes and flags a dimmed hand's notes", () => {
    const hands = new HandState();
    hands.setVisibility("right", "hide"); // note 60 is right-hand
    hands.setVisibility("left", "dim"); // note 64 is left-hand
    const rects = noteRects(notes, layout, 5, config, hands);
    expect(rects.find((x) => x.midi === 60)).toBeUndefined();
    expect(rects.find((x) => x.midi === 64)!.dimmed).toBe(true);
  });

  it("defaults to drawing every note undimmed", () => {
    const r = noteRects(notes, layout, 1, config).find((x) => x.midi === 60)!;
    expect(r.dimmed).toBe(false);
  });
});
```

- [ ] **Step 8: Run to verify it fails**

Run: `npx vitest run src/falldown/notes.test.ts`
Expected: FAIL — `noteRects` takes no filter and `dimmed` does not exist.

- [ ] **Step 9: Add `dimmed` + the `handFilter` parameter to `noteRects`**

In `src/falldown/notes.ts`, add the import:

```ts
import { type HandFilter, NO_HAND_FILTER } from "../practice/hands";
```

Add `dimmed` to `NoteRect`:

```ts
  /** True while the note is sounding at the current clock time. */
  playing: boolean;
  /** True when the note's hand is set to "dim" — draw it faint. */
  dimmed: boolean;
}
```

Change the `noteRects` signature and loop:

```ts
export function noteRects(
  notes: Note[],
  layout: KeyboardLayout,
  t: number,
  config: FalldownConfig,
  handFilter: HandFilter = NO_HAND_FILTER,
): NoteRect[] {
  const rects: NoteRect[] = [];
  for (const note of notes) {
    const vis = handFilter.visibility(note.hand);
    if (vis === "hide") continue;
    const key = layout.byMidi(note.midi);
    if (!key) continue;
    const bottom = config.hitLineY - (note.start - t) * config.pixelsPerSecond;
    const height = note.duration * config.pixelsPerSecond;
    const top = bottom - height;
    if (top > config.hitLineY || bottom < 0) continue;
    rects.push({
      midi: note.midi,
      x: key.x,
      width: key.width,
      bottom,
      top,
      height,
      color: note.hand === "right" ? config.rightColor : config.leftColor,
      velocity: note.velocity,
      playing: t >= note.start && t < note.start + note.duration,
      dimmed: vis === "dim",
    });
  }
  return rects;
}
```

- [ ] **Step 10: Update the renderer for dim**

In `src/falldown/renderer.ts`:

Add a constant near `GLOW_BLUR`:

```ts
/** Opacity multiplier for a "dim"-visibility hand's notes. */
const DIM_ALPHA = 0.3;
```

In `renderFrame`, replace the `visible` line (line 93-95) with:

```ts
    const allNotes = this.transport.score.notes;
    const lit = allNotes.filter(
      (n) => this.handState.visibility(n.hand) !== "hide",
    );
```

Update the two call sites in `renderFrame`: `this.drawNotes(layout, t, allNotes)` and `activeKeyColors(lit, t, RIGHT, LEFT)`.

In `drawNotes`, pass the hand filter to `noteRects` and apply the dim multiplier. Change the `noteRects(...)` call to include `this.handState` as the 5th argument, and change the `globalAlpha` line:

```ts
      ctx.globalAlpha =
        (0.5 + 0.5 * rect.velocity) * (rect.dimmed ? DIM_ALPHA : 1);
```

- [ ] **Step 11: Update `renderer.test.ts` for the renamed visibility API**

In `src/falldown/renderer.test.ts`, in `describe("FalldownRenderer hand hide", ...)`, replace `hands.setHidden("left", true)` with `hands.setVisibility("left", "hide")`. (The `roundRect` count change was already made in Task 1.)

- [ ] **Step 12: Update the ControlPanel test for the 3-way control**

In `src/practice/ControlPanel.test.tsx`, replace the existing `"hides a hand via the hand controls"` test (which clicks `/hide right/i` and asserts `handState.isHidden`) with a test of the new select. The file already has a `setup()` helper:

```tsx
  it("sets a hand to dim via the visibility control", () => {
    const { handState } = setup();
    fireEvent.change(screen.getByLabelText(/left hand/i), {
      target: { value: "dim" },
    });
    expect(handState.visibility("left")).toBe("dim");
  });
```

The `"mutes a hand via the hand controls"` test is unchanged (Mute checkboxes stay).

- [ ] **Step 13: Run to verify it fails**

Run: `npx vitest run src/practice/ControlPanel.test.tsx`
Expected: FAIL — no `left hand` labelled select exists.

- [ ] **Step 14: Replace the hide checkboxes in `ControlPanel.tsx`**

In `src/practice/ControlPanel.tsx`:

Extend the existing hands import (currently `import type { HandState } from "./hands";`) to also pull in the visibility type:

```ts
import type { HandState, HandVisibility } from "./hands";
```

Replace the `hideLeft`/`hideRight` state (lines 42-43):

```ts
  const [leftVis, setLeftVis] = useState<HandVisibility>(
    handState.visibility("left"),
  );
  const [rightVis, setRightVis] = useState<HandVisibility>(
    handState.visibility("right"),
  );
```

Replace the two "Hide left"/"Hide right" `<label>` blocks in the last `<fieldset>` with:

```tsx
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
```

- [ ] **Step 15: Run the full suite**

Run: `npx vitest run`
Expected: PASS. If `PracticeView.test.tsx` references `setHidden`/`isHidden`, update it to `setVisibility`/`visibility` the same way.

- [ ] **Step 16: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck
git add src/practice/hands.ts src/practice/hands.test.ts src/library/db.ts src/library/practiceState.ts src/library/practiceState.test.ts src/falldown/notes.ts src/falldown/notes.test.ts src/falldown/renderer.ts src/falldown/renderer.test.ts src/practice/ControlPanel.tsx src/practice/ControlPanel.test.tsx
git commit -m "feat: 3-way Show/Dim/Hide visibility for hands-separate practice"
```

---

## Task 5: FloatingHud component (static)

Creates the floating HUD with all transport controls migrated from `TransportBar`, plus a settings-toggle button. No drag or fade yet — positioned by CSS.

**Files:**
- Create: `src/ui/FloatingHud.tsx`
- Create: `src/ui/FloatingHud.test.tsx`

- [ ] **Step 1: Write the FloatingHud tests**

Create `src/ui/FloatingHud.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FloatingHud } from "./FloatingHud";
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

function renderHud(overrides: Partial<Parameters<typeof FloatingHud>[0]> = {}) {
  const transport = new Transport(score);
  const props = {
    transport,
    viewMode: "both" as const,
    onViewModeChange: vi.fn(),
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onExit: vi.fn(),
    settingsOpen: false,
    onToggleSettings: vi.fn(),
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

  it("calls onViewModeChange when a view-mode button is clicked", () => {
    const { props } = renderHud();
    fireEvent.click(screen.getByRole("button", { name: /score only/i }));
    expect(props.onViewModeChange).toHaveBeenCalledWith("score");
  });

  it("calls the zoom and exit callbacks", () => {
    const { props } = renderHud();
    fireEvent.click(screen.getByRole("button", { name: /zoom in/i }));
    fireEvent.click(screen.getByRole("button", { name: /zoom out/i }));
    fireEvent.click(screen.getByRole("button", { name: /library/i }));
    expect(props.onZoomIn).toHaveBeenCalled();
    expect(props.onZoomOut).toHaveBeenCalled();
    expect(props.onExit).toHaveBeenCalled();
  });

  it("toggles the settings drawer", () => {
    const { props } = renderHud();
    fireEvent.click(screen.getByRole("button", { name: /settings/i }));
    expect(props.onToggleSettings).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/ui/FloatingHud.test.tsx`
Expected: FAIL — `FloatingHud` does not exist.

- [ ] **Step 3: Create `FloatingHud.tsx`**

Create `src/ui/FloatingHud.tsx`:

```tsx
import { useEffect, useReducer } from "react";
import type { Transport } from "../transport/transport";
import type { ViewMode } from "../layout/viewMode";

interface FloatingHudProps {
  transport: Transport;
  viewMode: ViewMode;
  onViewModeChange: (m: ViewMode) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onExit: () => void;
  settingsOpen: boolean;
  onToggleSettings: () => void;
}

/** Format a duration in seconds as `m:ss` (e.g. 75 -> "1:15"). */
function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

const VIEW_MODE_OPTIONS: ReadonlyArray<{ mode: ViewMode; label: string }> = [
  { mode: "both", label: "Both" },
  { mode: "falldown", label: "Falldown only" },
  { mode: "score", label: "Score only" },
];

/**
 * The floating transport HUD: a compact overlay carrying every playback
 * control. Replaces the old fixed header band. Drag and idle-fade behavior
 * are layered on in later tasks.
 */
export function FloatingHud({
  transport,
  viewMode,
  onViewModeChange,
  onZoomIn,
  onZoomOut,
  onExit,
  settingsOpen,
  onToggleSettings,
}: FloatingHudProps): React.JSX.Element {
  const [, forceUpdate] = useReducer((n: number) => n + 1, 0);
  useEffect(() => transport.clock.onChange(forceUpdate), [transport]);

  const { clock } = transport;
  const { playing, position, duration } = clock;

  return (
    <div className="floating-hud">
      <button type="button" onClick={onExit}>
        Library
      </button>
      <button type="button" onClick={() => clock.toggle()}>
        {playing ? "Pause" : "Play"}
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
      {VIEW_MODE_OPTIONS.map(({ mode, label }) => (
        <button
          key={mode}
          type="button"
          aria-pressed={viewMode === mode}
          onClick={() => onViewModeChange(mode)}
        >
          {label}
        </button>
      ))}
      <button type="button" aria-label="Zoom out" onClick={onZoomOut}>
        −
      </button>
      <button type="button" aria-label="Zoom in" onClick={onZoomIn}>
        +
      </button>
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

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/ui/FloatingHud.test.tsx`
Expected: PASS.

- [ ] **Step 5: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck
git add src/ui/FloatingHud.tsx src/ui/FloatingHud.test.tsx
git commit -m "feat: add the floating transport HUD component"
```

---

## Task 6: Make the HUD draggable

**Files:**
- Modify: `src/ui/FloatingHud.tsx`
- Modify: `src/ui/FloatingHud.test.tsx`

- [ ] **Step 1: Write a failing drag test**

Add to `src/ui/FloatingHud.test.tsx`:

```tsx
  it("moves when dragged by its background", () => {
    renderHud();
    const hud = document.querySelector(".floating-hud") as HTMLElement;
    fireEvent.pointerDown(hud, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 150, clientY: 130 });
    fireEvent.pointerUp(window);
    // The HUD shifted by the pointer delta (+50, +30).
    expect(hud.style.left).not.toBe("");
    expect(hud.style.top).not.toBe("");
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/ui/FloatingHud.test.tsx`
Expected: FAIL — the HUD has no inline `left`/`top` and no drag handling.

- [ ] **Step 3: Add a `useDraggable` hook and wire it into the HUD**

In `src/ui/FloatingHud.tsx`, add to the imports:

```tsx
import { useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
```

Add the hook above the `FloatingHud` component:

```tsx
interface Position {
  x: number;
  y: number;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * Makes an element draggable within its offset parent. Returns the element
 * ref, its position, and a pointerdown handler. Dragging is ignored when the
 * pointer goes down on an interactive control (button/input/select). When the
 * parent has no measured size (e.g. jsdom) the position is left unclamped.
 */
function useDraggable() {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Position | null>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  // Center horizontally near the top once the element has been measured.
  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (el && parent && parent.clientWidth > 0) {
      setPos({ x: (parent.clientWidth - el.offsetWidth) / 2, y: 16 });
    } else {
      setPos({ x: 16, y: 16 });
    }
  }, []);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    if ((e.target as HTMLElement).closest("button, input, select")) return;
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
      if (parent && parent.clientWidth > 0) {
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
```

In the `FloatingHud` component body, call the hook and apply it to the root `<div>`:

```tsx
  const { ref, pos, onPointerDown } = useDraggable();
```

```tsx
    <div
      ref={ref}
      className="floating-hud"
      style={pos ? { left: pos.x, top: pos.y } : undefined}
      onPointerDown={onPointerDown}
    >
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/ui/FloatingHud.test.tsx`
Expected: PASS.

- [ ] **Step 5: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck
git add src/ui/FloatingHud.tsx src/ui/FloatingHud.test.tsx
git commit -m "feat: make the floating HUD draggable"
```

---

## Task 7: Idle-fade the HUD

**Files:**
- Modify: `src/ui/FloatingHud.tsx`
- Modify: `src/ui/FloatingHud.test.tsx`

- [ ] **Step 1: Write a failing idle-fade test**

Add to `src/ui/FloatingHud.test.tsx` (imports `vi` already present):

```tsx
  it("fades after the idle timeout and restores on pointer movement", () => {
    vi.useFakeTimers();
    try {
      renderHud();
      const hud = document.querySelector(".floating-hud") as HTMLElement;
      expect(hud.className).not.toContain("faded");
      vi.advanceTimersByTime(3000);
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
      vi.advanceTimersByTime(3000);
      expect(hud.className).not.toContain("faded");
    } finally {
      vi.useRealTimers();
    }
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/ui/FloatingHud.test.tsx`
Expected: FAIL — the HUD never gets a `faded` class.

- [ ] **Step 3: Add a `useIdleFade` hook and apply it**

In `src/ui/FloatingHud.tsx`, add the constant near the top:

```tsx
/** Milliseconds of pointer inactivity before the HUD fades. */
const IDLE_MS = 2500;
```

Add the hook above the `FloatingHud` component:

```tsx
/**
 * Returns whether the HUD should be faded: true after `IDLE_MS` with no
 * pointer movement, reset to false on any movement. Never fades while
 * `disabled` is true (e.g. the settings drawer is open).
 */
function useIdleFade(disabled: boolean): boolean {
  const [faded, setFaded] = useState(false);

  useEffect(() => {
    if (disabled) {
      setFaded(false);
      return;
    }
    let timer = window.setTimeout(() => setFaded(true), IDLE_MS);
    function onMove(): void {
      setFaded(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setFaded(true), IDLE_MS);
    }
    window.addEventListener("pointermove", onMove);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", onMove);
    };
  }, [disabled]);

  return faded;
}
```

In the `FloatingHud` component body:

```tsx
  const faded = useIdleFade(settingsOpen);
```

Update the root `<div>` `className`:

```tsx
      className={`floating-hud${faded ? " faded" : ""}`}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/ui/FloatingHud.test.tsx`
Expected: PASS.

- [ ] **Step 5: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck
git add src/ui/FloatingHud.tsx src/ui/FloatingHud.test.tsx
git commit -m "feat: idle-fade the floating HUD"
```

---

## Task 8: Integrate the HUD, reclaim layout space, delete TransportBar

**Files:**
- Modify: `src/app/PracticeView.tsx`
- Modify: `src/app/PracticeView.test.tsx`
- Modify: `src/styles/theme.css`
- Delete: `src/ui/TransportBar.tsx`, `src/ui/TransportBar.test.tsx`

- [ ] **Step 1: Rewrite the `PracticeView` chrome**

In `src/app/PracticeView.tsx`:

Replace the `TransportBar` import with:

```ts
import { FloatingHud } from "../ui/FloatingHud";
```

Add a settings-drawer state next to the other `useState` calls (near line 67):

```ts
  const [settingsOpen, setSettingsOpen] = useState(false);
```

Add zoom handlers near the other handlers, before the `return` (these replace the inline logic in the old header buttons):

```ts
  function zoomIn(): void {
    const next = Math.min(2.5, Math.round((scoreZoom + 0.25) * 100) / 100);
    setScoreZoom(next);
    scoreViewRef.current?.setZoom(next);
  }

  function zoomOut(): void {
    const next = Math.max(0.5, Math.round((scoreZoom - 0.25) * 100) / 100);
    setScoreZoom(next);
    scoreViewRef.current?.setZoom(next);
  }
```

Replace the entire `return (...)` JSX with:

```tsx
  return (
    <div className="practice-view">
      <Layout
        viewMode={viewMode}
        split={split}
        onSplitChange={setSplit}
        falldown={<canvas ref={canvasRef} className="falldown-canvas" />}
        score={
          <div
            ref={scoreContainerRef}
            className={
              viewMode === "score"
                ? "score-container horizontal-pages"
                : "score-container"
            }
          />
        }
      />
      <FloatingHud
        transport={transport}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onExit={onExit}
        settingsOpen={settingsOpen}
        onToggleSettings={() => setSettingsOpen((o) => !o)}
      />
      {falldown && practiceReady && settingsOpen && (
        <ControlPanel
          transport={transport}
          handState={handState}
          falldown={falldown}
          audioEngine={audioEngine}
        />
      )}
      {!scoreReady && <div className="score-loading">Loading score…</div>}
      {score.qualityWarning && (
        <div className="quality-warning">{score.qualityWarning}</div>
      )}
    </div>
  );
```

This removes the `.practice-header` `<div>` (Library + zoom buttons now live in the HUD) and the old `<TransportBar>`.

- [ ] **Step 2: Update `theme.css`**

In `src/styles/theme.css`:

Replace the `.practice-view` rule:

```css
.practice-view {
  position: relative;
  height: 100%;
  overflow: hidden;
}
```

Replace the entire `.transport-bar` block (the `.transport-bar`, `.transport-bar input[type="range"]`, `.transport-bar button`, `.transport-bar button:hover`, `.transport-bar button[aria-pressed="true"]` rules) with:

```css
/* --- Floating transport HUD --- */

.floating-hud {
  position: absolute;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.6rem;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
  cursor: grab;
  transition: opacity 0.4s ease;
}

.floating-hud.faded {
  opacity: 0.2;
}

/* Hover must beat .faded — keep this rule after it (equal specificity). */
.floating-hud:hover {
  opacity: 1;
}

.floating-hud input[type="range"] {
  width: 180px;
}

.floating-hud button {
  background: var(--panel);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.35rem 0.7rem;
  cursor: pointer;
}

.floating-hud button:hover {
  border-color: var(--accent);
}

.floating-hud button[aria-pressed="true"] {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--bg);
}
```

Replace the `.layout` rule so it fills the now-relative `.practice-view`:

```css
.layout {
  display: flex;
  flex-direction: row;
  height: 100%;
  min-height: 0;
}
```

Replace the `.control-panel` rule (keep the `.control-panel .control-group`, `.control-panel label`, `.control-panel input`, `.control-panel button` rules as they are) so the panel is a floating drawer:

```css
.control-panel {
  position: absolute;
  top: 64px;
  right: 16px;
  z-index: 19;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 18rem;
  max-height: calc(100% - 88px);
  overflow-y: auto;
  padding: 0.75rem;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
}
```

Replace the `.quality-warning` rule so it overlays at the bottom instead of taking a layout band:

```css
.quality-warning {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 18;
  padding: 0.4rem 0.75rem;
  font-size: 0.85rem;
  color: var(--hand-left);
  background: rgba(224, 138, 60, 0.12);
  border-top: 1px solid var(--border);
}
```

- [ ] **Step 3: Update `PracticeView.test.tsx`**

In `src/app/PracticeView.test.tsx`:

Add `fireEvent` to the testing-library import:

```ts
import { render, screen, fireEvent } from "@testing-library/react";
```

The renderer now calls `roundRect`/`fill`/`save`/`restore`/`createLinearGradient` and the frame loop runs in this test, so extend the `getContext` stub in `beforeEach`:

```ts
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    clearRect: vi.fn(), fillRect: vi.fn(), strokeRect: vi.fn(),
    beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
    fillText: vi.fn(), fill: vi.fn(), roundRect: vi.fn(),
    save: vi.fn(), restore: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
```

The control panel is now a toggled drawer, so the second test must open it first. Replace the second test with:

```tsx
  it("renders the practice control panel when the settings drawer opens", async () => {
    render(<PracticeView score={score} pieceId="test-piece" onExit={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /settings/i }));
    expect(await screen.findByLabelText(/tempo \(bpm\)/i)).toBeInTheDocument();
  });
```

The first test still passes (the HUD has a Play button) — optionally rename it to `"renders the transport HUD and the falldown canvas"`.

Run: `npx vitest run src/app/PracticeView.test.tsx`
Expected: PASS.

- [ ] **Step 4: Delete TransportBar**

```bash
git rm src/ui/TransportBar.tsx src/ui/TransportBar.test.tsx
```

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: PASS — no remaining references to `TransportBar`.

- [ ] **Step 6: Lint, typecheck, build, commit**

```bash
npm run lint && npm run typecheck && npm run build
git add src/app/PracticeView.tsx src/app/PracticeView.test.tsx src/styles/theme.css
git commit -m "feat: float the transport HUD and control drawer to reclaim space"
```

---

## Final verification

- [ ] **Run the full gate**

```bash
npm run lint && npm run typecheck && npm test && npm run build && npm run e2e
```

Expected: all green. If an e2e spec drives the old header/transport bar, update its selectors to the `.floating-hud` overlay.

- [ ] **Manual smoke test** (`npm run dev`)

  - Falling notes are rounded, fainter when low-velocity, and glow as they cross the keyboard.
  - Keys look shaded; a pressed key glows in blue (right) or orange (left).
  - The HUD floats, drags around, and fades after ~2.5 s idle; moving the pointer restores it.
  - The ⚙ button opens/closes the control drawer; the falldown and score fill the viewport otherwise.
  - In the drawer, setting a hand to Dim draws that hand's notes faint; Hide removes them.
