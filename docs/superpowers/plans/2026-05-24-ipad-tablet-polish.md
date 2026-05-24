# iPad / Touch-Tablet Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Arpeggio usable on iPad (touch tablets) without touching the desktop experience. Three independently-shippable phases — foundation+layout, touch gestures+PWA polish, and TopBar single-row guarantee.

**Architecture:** Every behavior change is gated behind one of two new hooks (`useIsTouchDevice`, `useIsNarrowViewport`) so desktop code paths run no new logic. Apple PWA meta tags ship unconditionally (inert on non-Apple).

**Tech Stack:** TypeScript (strict), React, Vitest + React Testing Library, plain CSS, vite-plugin-pwa (already configured).

---

## File Structure

**New files:**
- `src/responsive/useIsTouchDevice.ts` (+ test)
- `src/responsive/useIsNarrowViewport.ts` (+ test)
- `src/responsive/useLongPress.ts` (+ test)
- `src/responsive/SplitWarningToast.tsx` (+ test)
- `public/icons/apple-touch-icon.png` (built asset, generated from existing SVG)

**Modified files:**
- `src/App.tsx` — apply `.app--touch` class to a root wrapper based on `useIsTouchDevice()`.
- `src/layout/Layout.tsx` (+ test) — accept `orientation` prop.
- `src/layout/Divider.tsx` (+ test) — accept `orientation` prop, horizontal-axis drag.
- `src/app/PracticeView.tsx` — pass `orientation` to Layout/Divider, mount SplitWarningToast.
- `src/section-strip/SectionStrip.tsx` (+ test) — long-press wiring under touch.
- `src/styles/theme.css` — `.layout--column`, `.app--touch`, safe-area-inset, TopBar single-row rules.
- `src/styles/section-strip.css` — `.section-strip--touch` rules.
- `src/ui/TopBar.tsx` (+ test) — hide labels/readout/time under touch.
- `src/ui/ToolsPopover.tsx` or per-tab (`PlayTools.tsx` / `MidiTools.tsx`) — host TopBarReadout under touch.
- `index.html` — Apple meta tags, viewport-fit=cover, apple-touch-icon link.

**Feature docs updated** (per CLAUDE.md self-check):
- `docs/features/A-scaffold-deploy.md` (PWA meta tags)
- `docs/features/G-layout-view-modes.md` (column-stack)
- `docs/features/J-midi-section-navigator.md` (long-press)
- `docs/features/H-practice-controls.md` (TopBarReadout location)

---

## Phase 1 — Foundation (Tasks 1-4)

Ships nothing user-visible on its own; subsequent phases depend on it.

### Task 1: `useIsTouchDevice` hook

**Files:**
- Create: `src/responsive/useIsTouchDevice.ts`
- Test: `src/responsive/useIsTouchDevice.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/responsive/useIsTouchDevice.test.ts`:

```ts
import { describe, test, expect, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useIsTouchDevice } from "./useIsTouchDevice";

describe("useIsTouchDevice", () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(
    Navigator.prototype,
    "maxTouchPoints",
  );

  afterEach(() => {
    if (originalDescriptor) {
      Object.defineProperty(Navigator.prototype, "maxTouchPoints", originalDescriptor);
    }
  });

  test("returns true when maxTouchPoints > 1", () => {
    Object.defineProperty(Navigator.prototype, "maxTouchPoints", {
      value: 5,
      configurable: true,
    });
    const { result } = renderHook(() => useIsTouchDevice());
    expect(result.current).toBe(true);
  });

  test("returns false when maxTouchPoints is 0", () => {
    Object.defineProperty(Navigator.prototype, "maxTouchPoints", {
      value: 0,
      configurable: true,
    });
    const { result } = renderHook(() => useIsTouchDevice());
    expect(result.current).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- useIsTouchDevice`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

Create `src/responsive/useIsTouchDevice.ts`:

```ts
import { useEffect, useState } from "react";

/**
 * Returns true if the current device reports multi-touch capability.
 * Stable per session — reads once on mount; no resize/orientation listener.
 * Reliable across iPadOS Safari's desktop-spoof UA (where UA sniffing fails).
 */
export function useIsTouchDevice(): boolean {
  const [value, setValue] = useState<boolean>(() => detect());
  useEffect(() => {
    setValue(detect());
  }, []);
  return value;
}

function detect(): boolean {
  if (typeof navigator === "undefined") return false;
  return (navigator.maxTouchPoints ?? 0) > 1;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- useIsTouchDevice`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add src/responsive/useIsTouchDevice.ts src/responsive/useIsTouchDevice.test.ts
git commit -m "feat(responsive): useIsTouchDevice hook"
```

---

### Task 2: `useIsNarrowViewport` hook

**Files:**
- Create: `src/responsive/useIsNarrowViewport.ts`
- Test: `src/responsive/useIsNarrowViewport.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, test, expect, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useIsNarrowViewport } from "./useIsNarrowViewport";

describe("useIsNarrowViewport", () => {
  const originalInnerWidth = window.innerWidth;

  afterEach(() => {
    Object.defineProperty(window, "innerWidth", {
      value: originalInnerWidth,
      configurable: true,
    });
  });

  function setWidth(w: number): void {
    Object.defineProperty(window, "innerWidth", { value: w, configurable: true });
    window.dispatchEvent(new Event("resize"));
  }

  test("returns true when width below threshold", () => {
    setWidth(800);
    const { result } = renderHook(() => useIsNarrowViewport(1024));
    expect(result.current).toBe(true);
  });

  test("returns false when width at or above threshold", () => {
    setWidth(1366);
    const { result } = renderHook(() => useIsNarrowViewport(1024));
    expect(result.current).toBe(false);
  });

  test("updates on resize", () => {
    setWidth(1200);
    const { result } = renderHook(() => useIsNarrowViewport(1024));
    expect(result.current).toBe(false);
    act(() => setWidth(800));
    expect(result.current).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- useIsNarrowViewport`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

Create `src/responsive/useIsNarrowViewport.ts`:

```ts
import { useEffect, useState } from "react";

/**
 * Returns true when `window.innerWidth < threshold`. Subscribes to `resize`
 * so orientation changes flip the value.
 */
export function useIsNarrowViewport(threshold = 1024): boolean {
  const [narrow, setNarrow] = useState<boolean>(() => isNarrow(threshold));
  useEffect(() => {
    const handler = (): void => setNarrow(isNarrow(threshold));
    handler();
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [threshold]);
  return narrow;
}

function isNarrow(threshold: number): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth < threshold;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- useIsNarrowViewport`
Expected: PASS (all three cases).

- [ ] **Step 5: Commit**

```bash
git add src/responsive/useIsNarrowViewport.ts src/responsive/useIsNarrowViewport.test.ts
git commit -m "feat(responsive): useIsNarrowViewport hook"
```

---

### Task 3: `useLongPress` hook

**Files:**
- Create: `src/responsive/useLongPress.ts`
- Test: `src/responsive/useLongPress.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useLongPress } from "./useLongPress";

describe("useLongPress", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function pe(type: string, init: Partial<PointerEvent> = {}): React.PointerEvent {
    return Object.assign(
      { type, clientX: 0, clientY: 0, target: document.createElement("div") },
      init,
    ) as unknown as React.PointerEvent;
  }

  test("fires onLongPress after threshold", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress, { thresholdMs: 500 }));
    result.current.onPointerDown(pe("pointerdown", { clientX: 10, clientY: 20 }));
    vi.advanceTimersByTime(500);
    expect(onLongPress).toHaveBeenCalledOnce();
    expect(onLongPress.mock.calls[0][0]).toMatchObject({ clientX: 10, clientY: 20 });
  });

  test("does not fire if pointerup before threshold", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));
    result.current.onPointerDown(pe("pointerdown"));
    vi.advanceTimersByTime(200);
    result.current.onPointerUp(pe("pointerup"));
    vi.advanceTimersByTime(1000);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  test("cancels on pointermove beyond tolerance", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() =>
      useLongPress(onLongPress, { thresholdMs: 500, moveTolerancePx: 8 }),
    );
    result.current.onPointerDown(pe("pointerdown", { clientX: 0, clientY: 0 }));
    result.current.onPointerMove(pe("pointermove", { clientX: 20, clientY: 0 }));
    vi.advanceTimersByTime(500);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  test("cancels on pointercancel", () => {
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));
    result.current.onPointerDown(pe("pointerdown"));
    result.current.onPointerCancel(pe("pointercancel"));
    vi.advanceTimersByTime(1000);
    expect(onLongPress).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- useLongPress`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

Create `src/responsive/useLongPress.ts`:

```ts
import { useRef } from "react";
import type React from "react";

export interface LongPressEvent {
  clientX: number;
  clientY: number;
  target: EventTarget;
}

export interface UseLongPressOptions {
  thresholdMs?: number;
  moveTolerancePx?: number;
}

export interface LongPressHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
}

/**
 * Fire `onLongPress` after a pointer is held down for `thresholdMs` without
 * moving more than `moveTolerancePx` in any direction. Coordinates passed
 * to the callback are the original pointerdown coordinates.
 */
export function useLongPress(
  onLongPress: (e: LongPressEvent) => void,
  options: UseLongPressOptions = {},
): LongPressHandlers {
  const { thresholdMs = 500, moveTolerancePx = 8 } = options;
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<{ x: number; y: number; target: EventTarget } | null>(null);

  function cancel(): void {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startRef.current = null;
  }

  return {
    onPointerDown(e) {
      cancel();
      startRef.current = { x: e.clientX, y: e.clientY, target: e.target };
      timerRef.current = window.setTimeout(() => {
        if (startRef.current) {
          onLongPress({
            clientX: startRef.current.x,
            clientY: startRef.current.y,
            target: startRef.current.target,
          });
        }
        cancel();
      }, thresholdMs);
    },
    onPointerMove(e) {
      const s = startRef.current;
      if (!s) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (Math.hypot(dx, dy) > moveTolerancePx) cancel();
    },
    onPointerUp() { cancel(); },
    onPointerCancel() { cancel(); },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- useLongPress`
Expected: PASS (all four cases).

- [ ] **Step 5: Commit**

```bash
git add src/responsive/useLongPress.ts src/responsive/useLongPress.test.ts
git commit -m "feat(responsive): useLongPress hook"
```

---

### Task 4: `.app--touch` body-level class

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Wire up the class**

Edit `src/App.tsx`. Add the import and wrap the return in a div that applies `.app--touch` based on `useIsTouchDevice()`. Replace the top of the file:

```tsx
import { useState } from "react";
import type { Score } from "./model/score";
import { ImportView } from "./ui/ImportView";
import { PracticeView } from "./app/PracticeView";
import { LibraryBrowser } from "./library/LibraryBrowser";
import { savePiece, getPiece } from "./library/db";
import { importFile } from "./import/importFile";
import { useIsTouchDevice } from "./responsive/useIsTouchDevice";

interface Session {
  score: Score;
  pieceId: string;
  pieceName: string;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const isTouch = useIsTouchDevice();
  const appClass = "app" + (isTouch ? " app--touch" : "");

  async function handleImported(score: Score, file: File) {
    // ... existing body unchanged ...
  }

  // ... rest of file ...

  if (session) {
    return (
      <div className={appClass}>
        <PracticeView
          score={session.score}
          pieceId={session.pieceId}
          pieceName={session.pieceName}
          onExit={() => setSession(null)}
        />
      </div>
    );
  }

  return (
    <div className={`${appClass} landing-wrapper`}>
      <ImportView onLoaded={handleImported} />
      <LibraryBrowser onOpen={(id) => void handleOpen(id)} />
    </div>
  );
}
```

Keep existing `handleImported` / `handleOpen` bodies as-is — only the wrapper divs are added.

- [ ] **Step 2: Run typecheck + existing App test**

Run: `npm run typecheck && npm test -- App.test`
Expected: PASS — the wrapper is structurally additive.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat(app): apply .app--touch class wrapper based on useIsTouchDevice"
```

---

## Phase 2 — Column-stack layout + Split warning (Tasks 5-7)

After Phase 2, the iPad portrait Split shows falldown above engraved score, fully readable. First time a user picks Split on a tablet, a one-shot toast appears.

### Task 5: `Layout` + `Divider` orientation prop

**Files:**
- Modify: `src/layout/Layout.tsx`
- Modify: `src/layout/Divider.tsx`
- Test: `src/layout/Layout.test.tsx`
- Test: `src/layout/Divider.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `src/layout/Layout.test.tsx`:

```tsx
test("orientation='column' applies layout--column class", () => {
  const { container } = render(
    <Layout
      viewMode="both"
      split={0.5}
      onSplitChange={() => {}}
      falldown={<div>F</div>}
      score={<div>S</div>}
      orientation="column"
    />,
  );
  expect(container.querySelector(".layout")?.classList.contains("layout--column")).toBe(true);
});

test("orientation defaults to row (no class added)", () => {
  const { container } = render(
    <Layout
      viewMode="both"
      split={0.5}
      onSplitChange={() => {}}
      falldown={<div>F</div>}
      score={<div>S</div>}
    />,
  );
  expect(container.querySelector(".layout")?.classList.contains("layout--column")).toBe(false);
});
```

Append to `src/layout/Divider.test.tsx`:

```tsx
test("orientation='horizontal' updates fraction from clientY", () => {
  const onChange = vi.fn();
  Object.defineProperty(window, "innerHeight", { value: 1000, configurable: true });
  const { container } = render(<Divider fraction={0.5} onChange={onChange} orientation="horizontal" />);
  const separator = container.querySelector('[role="separator"]')!;
  fireEvent.mouseDown(separator);
  fireEvent.mouseMove(window, { clientY: 400 });
  expect(onChange).toHaveBeenLastCalledWith(0.4);
  fireEvent.mouseUp(window);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- Layout.test Divider.test`
Expected: FAIL.

- [ ] **Step 3: Update `Divider` to accept `orientation`**

Replace `src/layout/Divider.tsx` with:

```tsx
import { useEffect, useState } from "react";

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

export type DividerOrientation = "vertical" | "horizontal";

export interface DividerProps {
  fraction: number;
  onChange: (fraction: number) => void;
  /** Drag axis. `"vertical"` resizes width (clientX/innerWidth); `"horizontal"`
   *  resizes height (clientY/innerHeight). Default `"vertical"`. */
  orientation?: DividerOrientation;
}

export function Divider({ fraction, onChange, orientation = "vertical" }: DividerProps) {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return;
    function handleMouseMove(e: MouseEvent) {
      const value =
        orientation === "vertical"
          ? e.clientX / window.innerWidth
          : e.clientY / window.innerHeight;
      onChange(clamp(value, 0.15, 0.85));
    }
    function handleMouseUp() { setDragging(false); }
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, onChange, orientation]);

  return (
    <div
      role="separator"
      aria-orientation={orientation}
      aria-valuenow={Math.round(fraction * 100)}
      className={`divider divider--${orientation}`}
      onMouseDown={() => setDragging(true)}
    />
  );
}
```

- [ ] **Step 4: Update `Layout` to accept `orientation`**

Replace `src/layout/Layout.tsx` with:

```tsx
import type { ReactNode } from "react";
import type { ViewMode } from "./viewMode";
import { Divider, type DividerOrientation } from "./Divider";

interface LayoutProps {
  viewMode: ViewMode;
  split: number;
  onSplitChange: (f: number) => void;
  falldown: ReactNode;
  score: ReactNode;
  /** `"row"` (default) lays out panels left/right; `"column"` lays them
   *  top/bottom (e.g. tablet portrait). */
  orientation?: "row" | "column";
}

export function Layout({
  viewMode,
  split,
  onSplitChange,
  falldown,
  score,
  orientation = "row",
}: LayoutProps) {
  const showFalldown = viewMode !== "score";
  const showScore = viewMode !== "falldown";
  const dividerAxis: DividerOrientation = orientation === "column" ? "horizontal" : "vertical";

  const falldownStyle =
    viewMode === "both"
      ? {
          display: showFalldown ? undefined : "none",
          flexBasis: `${split * 100}%`,
          flexGrow: 0,
          flexShrink: 0,
        }
      : { display: showFalldown ? undefined : "none", flex: 1 };

  const className = "layout" + (orientation === "column" ? " layout--column" : "");

  return (
    <div className={className}>
      <div className="layout-panel" style={falldownStyle}>
        {falldown}
      </div>
      {viewMode === "both" && (
        <Divider fraction={split} onChange={onSplitChange} orientation={dividerAxis} />
      )}
      <div
        className="layout-panel"
        style={{ display: showScore ? undefined : "none", flex: 1 }}
      >
        {score}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Add `.layout--column` and `.divider--horizontal` CSS**

Append to `src/styles/theme.css`:

```css
.layout--column { flex-direction: column; }
.layout--column .layout-panel { flex-basis: auto; }

.divider--horizontal {
  width: 100%;
  height: 4px;
  cursor: row-resize;
}
/* keep existing .divider (vertical) rules unchanged */
```

(Inspect the existing `.divider` rule block in `theme.css` and ensure the
new `.divider--horizontal` overrides only width/height/cursor — colors,
hit-zone, hover states should be inherited.)

- [ ] **Step 6: Run all tests**

Run: `npm test -- Layout.test Divider.test`
Expected: PASS (new + existing).

- [ ] **Step 7: Commit**

```bash
git add src/layout/Layout.tsx src/layout/Divider.tsx src/layout/Layout.test.tsx src/layout/Divider.test.tsx src/styles/theme.css
git commit -m "feat(layout): orientation prop on Layout and Divider"
```

---

### Task 6: `PracticeView` passes orientation under touch+narrow

**Files:**
- Modify: `src/app/PracticeView.tsx`

Note: `PracticeView` uses an inlined layout (`.practice-content` with manual panel rendering — line 667+) for MIDI mode, not the `<Layout>` component directly. For MIDI Practice the column-stack is applied via a CSS class on `.practice-content`. For Play mode the `<Layout>` component IS used (around line 814+ in `PracticeView` — verify exact line during implementation since later phases may shift it).

This task wires both code paths.

- [ ] **Step 1: Import the hooks at the top of `PracticeView.tsx`**

Add to the imports near line 18-50:

```tsx
import { useIsTouchDevice } from "../responsive/useIsTouchDevice";
import { useIsNarrowViewport } from "../responsive/useIsNarrowViewport";
```

- [ ] **Step 2: Compute orientation inside the component**

After the existing state hooks (around line 130+):

```tsx
const isTouchDevice = useIsTouchDevice();
const isNarrowViewport = useIsNarrowViewport(1024);
const layoutOrientation: "row" | "column" =
  isTouchDevice && isNarrowViewport ? "column" : "row";
```

- [ ] **Step 3: Apply orientation to the MIDI practice-content class**

Edit the `.practice-content` className block (around line 667-675). Add the modifier:

```tsx
<div
  className={[
    "practice-content",
    `practice-content--${mode}`,
    isMidi ? `layout-${practiceLayout}` : "",
    isMidiSource ? "practice-content--midi-source" : "",
    layoutOrientation === "column" ? "practice-content--column" : "",
  ]
    .filter(Boolean)
    .join(" ")}
  onContextMenu={handlePracticeContextMenu}
>
```

- [ ] **Step 4: Apply orientation to the Play-mode `<Layout>` (if mounted)**

Grep within `PracticeView.tsx` for a `<Layout` usage; if found, add `orientation={layoutOrientation}`. If `Layout` is no longer used in `PracticeView` (the file has evolved to inline rendering), skip this sub-step — the `.practice-content--column` CSS class will be the single switch.

```bash
grep -n "<Layout\b" src/app/PracticeView.tsx
```

- [ ] **Step 5: Add `.practice-content--column` CSS for MIDI split**

Append to `src/styles/theme.css`:

```css
/* iPad / touch tablet narrow-viewport stacking. Applies only when
   .app--touch is present (touch device) AND .practice-content--column
   is set (narrow viewport). Desktop browsers, even when resized narrow,
   never get .app--touch and therefore never trigger this rule. */
.app--touch .practice-content--midi.layout-split.practice-content--column {
  flex-direction: column;
}

.app--touch .practice-content--midi.layout-split.practice-content--column
  .practice-falldown-panel,
.app--touch .practice-content--midi.layout-split.practice-content--column
  .practice-score-panel {
  flex-basis: auto !important;
  min-height: 0;
  height: 50%;
}
```

(The `!important` is targeted at the inline `flexBasis: ${split * 100}%` style that PracticeView sets — without it the inline style wins. Alternatively, gate the inline style on `layoutOrientation === "row"` so no `!important` is needed; pick the cleaner option during implementation.)

- [ ] **Step 6: Run the full gate**

Run: `npm run lint && npm run typecheck && npm test`
Expected: PASS — existing tests unaffected.

- [ ] **Step 7: Commit**

```bash
git add src/app/PracticeView.tsx src/styles/theme.css
git commit -m "feat(practice-view): column-stack layout for narrow touch tablets"
```

---

### Task 7: `SplitWarningToast` + mount in PracticeView

**Files:**
- Create: `src/responsive/SplitWarningToast.tsx`
- Test: `src/responsive/SplitWarningToast.test.tsx`
- Modify: `src/app/PracticeView.tsx`
- Modify: `src/styles/theme.css`

- [ ] **Step 1: Write the failing test**

Create `src/responsive/SplitWarningToast.test.tsx`:

```tsx
import { describe, test, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { SplitWarningToast } from "./SplitWarningToast";

const KEY = "arpeggio:tablet:split-warning-seen";

describe("SplitWarningToast", () => {
  beforeEach(() => {
    localStorage.removeItem(KEY);
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  test("renders when shouldShow becomes true and localStorage empty", () => {
    render(<SplitWarningToast shouldShow={true} />);
    expect(screen.getByRole("status")).toHaveTextContent(/split.*tablet/i);
  });

  test("does not render after dismissal persists", () => {
    const { rerender } = render(<SplitWarningToast shouldShow={true} />);
    fireEvent.click(screen.getByRole("status"));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    rerender(<SplitWarningToast shouldShow={true} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(localStorage.getItem(KEY)).toBe("1");
  });

  test("auto-dismisses after 6 seconds", () => {
    render(<SplitWarningToast shouldShow={true} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(6000));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  test("does not render when shouldShow is false", () => {
    render(<SplitWarningToast shouldShow={false} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- SplitWarningToast`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `src/responsive/SplitWarningToast.tsx`:

```tsx
import { useEffect, useState } from "react";

const STORAGE_KEY = "arpeggio:tablet:split-warning-seen";
const AUTO_DISMISS_MS = 6000;

export interface SplitWarningToastProps {
  /** When true, the toast may render (still gated by localStorage). */
  shouldShow: boolean;
}

/**
 * One-shot warning toast for tablet users who select the Split layout.
 * Persists dismissal in localStorage; once seen it never reappears.
 */
export function SplitWarningToast({ shouldShow }: SplitWarningToastProps) {
  const [visible, setVisible] = useState<boolean>(() => {
    if (!shouldShow) return false;
    return localStorage.getItem(STORAGE_KEY) !== "1";
  });

  useEffect(() => {
    if (!visible) return;
    const t = window.setTimeout(() => dismiss(), AUTO_DISMISS_MS);
    return () => window.clearTimeout(t);
  }, [visible]);

  function dismiss(): void {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="status"
      className="split-warning-toast"
      onClick={dismiss}
    >
      Split view stacks vertically on tablets — pinch out / use Falldown only
      if the score panel feels cramped.
    </div>
  );
}
```

- [ ] **Step 4: Add toast CSS**

Append to `src/styles/theme.css`:

```css
.split-warning-toast {
  position: fixed;
  bottom: max(16px, env(safe-area-inset-bottom));
  left: 50%;
  transform: translateX(-50%);
  max-width: min(420px, calc(100vw - 32px));
  padding: 12px 16px;
  background: var(--surface-elevated, #1f1f24);
  color: var(--text-primary, #fff);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.3);
  z-index: 1000;
  font-size: 14px;
  line-height: 1.4;
  cursor: pointer;
}
```

(Variable names may differ — inspect `theme.css` and substitute the
project's actual color tokens.)

- [ ] **Step 5: Mount the toast in `PracticeView`**

In `src/app/PracticeView.tsx`, near the other overlays at the end of the
return:

```tsx
import { SplitWarningToast } from "../responsive/SplitWarningToast";
// ...

const showSplitWarning =
  isTouchDevice &&
  ((isMidi && practiceLayout === "split") || (!isMidi && viewMode === "both"));

return (
  <div className="practice-view" /* existing */>
    {/* existing children */}
    <SplitWarningToast shouldShow={showSplitWarning} />
  </div>
);
```

- [ ] **Step 6: Run the full gate**

Run: `npm run lint && npm run typecheck && npm test`
Expected: PASS — Toast tests + existing PracticeView tests.

- [ ] **Step 7: Commit**

```bash
git add src/responsive/SplitWarningToast.tsx src/responsive/SplitWarningToast.test.tsx src/app/PracticeView.tsx src/styles/theme.css
git commit -m "feat(responsive): one-shot Split warning toast on touch tablets"
```

---

## Phase 3 — SectionStrip touch gestures + Apple PWA (Tasks 8-11)

### Task 8: Long-press wiring on SectionStrip

**Files:**
- Modify: `src/section-strip/SectionStrip.tsx`
- Test: `src/section-strip/SectionStrip.test.tsx`

The existing `bookmarkOnRightClickAtEvent` (line 300) and per-element
`onContextMenu` handlers stay. We add a `useLongPress` handler that calls
the same internal helpers (`createBookmarkAtClientX`, `setMenu`).

- [ ] **Step 1: Write the failing test**

Add to `src/section-strip/SectionStrip.test.tsx`. First, mock the touch hook:

```tsx
import { vi } from "vitest";
vi.mock("../responsive/useIsTouchDevice", () => ({ useIsTouchDevice: () => true }));
```

Then:

```tsx
test("long-press on empty strip background creates a bookmark", async () => {
  vi.useFakeTimers();
  const onChange = vi.fn();
  const { container } = render(<SectionStrip
    state={baseState}            // existing test fixture
    transport={fakeTransport}    // existing test fixture
    position="bottom"
    onChange={onChange}
    canUndo={false}
  />);
  const bookmarks = container.querySelector(".section-strip__bookmarks")!;
  fireEvent.pointerDown(bookmarks, { clientX: 200, clientY: 10 });
  vi.advanceTimersByTime(500);
  expect(onChange).toHaveBeenCalledOnce();
  expect(onChange.mock.calls[0][0].bookmarks).toHaveLength(baseState.bookmarks.length + 1);
  vi.useRealTimers();
});

test("long-press on a bookmark pin opens the context menu", async () => {
  vi.useFakeTimers();
  const { container } = render(<SectionStrip
    state={stateWithOneBookmark}
    transport={fakeTransport}
    position="bottom"
    onChange={vi.fn()}
    canUndo={false}
  />);
  const pin = container.querySelector(".section-strip__bookmark")!;
  fireEvent.pointerDown(pin, { clientX: 100, clientY: 10 });
  vi.advanceTimersByTime(500);
  expect(screen.getByRole("menu")).toBeInTheDocument();  // ContextMenu opened
  vi.useRealTimers();
});
```

Adapt to whatever fixtures `SectionStrip.test.tsx` already uses
(`baseState`, `fakeTransport`, etc., or render helpers).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- SectionStrip.test`
Expected: FAIL — long-press not wired.

- [ ] **Step 3: Wire long-press in `SectionStrip`**

Edit `src/section-strip/SectionStrip.tsx`. Imports:

```tsx
import { useIsTouchDevice } from "../responsive/useIsTouchDevice";
import { useLongPress } from "../responsive/useLongPress";
```

Inside the `SectionStrip` component body (near the existing state hooks,
before the `bookmarkOnRightClickAtEvent` function), add **only the single
strip-background `useLongPress` call**. Per-bookmark / per-section
long-press is wired inside the `BookmarkPin` / `SectionBlock`
subcomponents in Step 5 (each subcomponent renders once per instance, so
calling `useLongPress` there is rules-of-hooks-safe).

```tsx
const isTouchDevice = useIsTouchDevice();

// Touch: long-press in empty strip area → create bookmark. Mirrors the
// existing right-click / double-click background handlers.
const bgLongPress = useLongPress((e) => {
  const target = e.target as HTMLElement;
  if (target.closest(".section-strip__bookmark")) return;
  if (target.closest(".section-strip__boundary-handle")) return;
  if (target.closest(".section-strip__block")) return;
  createBookmarkAtClientX(e.clientX);
});
```

- [ ] **Step 4: Attach long-press to the strip containers**

In the `.section-strip__bookmarks` and `.section-strip__sections` JSX
(lines 326-329 and 346-355), spread the `bgLongPress` handlers only
when `isTouchDevice`:

```tsx
<div
  className="section-strip__bookmarks"
  onContextMenu={bookmarkOnRightClickAtEvent}
  onDoubleClick={bookmarkOnDoubleClickAtEvent}
  {...(isTouchDevice ? bgLongPress : {})}
>
```

Same for `.section-strip__sections`.

- [ ] **Step 5: Pass `isTouchDevice` to BookmarkPin / SectionBlock and wire long-press there**

In `BookmarkPin` (around line 596+) and `SectionBlock` (around line 645+),
accept `isTouchDevice` as a prop and call `useLongPress` at the top of the
function body:

```tsx
function BookmarkPin({ bookmark, /* existing */, isTouchDevice, onContextMenu }) {
  const longPress = useLongPress((e) => {
    onContextMenu({ ...e, clientX: e.clientX, clientY: e.clientY });
  });
  // ...
  return (
    <div
      /* existing */
      {...(isTouchDevice ? longPress : {})}
      onContextMenu={/* existing */}
    >...</div>
  );
}
```

Adapt `onContextMenu` shape so the long-press callback can invoke it
with `{clientX, clientY}` carrying the touch coordinates. The parent
`SectionStrip` already calls `setMenu({...x: e.clientX, y: e.clientY})`
— preserve that signature.

- [ ] **Step 6: Add `-webkit-touch-callout: none` for the touch class**

Append to `src/styles/section-strip.css`:

```css
.section-strip--touch,
.section-strip--touch .section-strip__bookmark,
.section-strip--touch .section-strip__block,
.section-strip--touch .section-strip__sections {
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
}
```

Add the modifier class in the SectionStrip JSX root (line 318):

```tsx
className={
  `section-strip section-strip--${position}` +
  (editingKind ? " section-strip--editing" : "") +
  (isTouchDevice ? " section-strip--touch" : "")
}
```

- [ ] **Step 7: Run tests**

Run: `npm test -- SectionStrip.test`
Expected: PASS — new long-press tests + every existing test.

- [ ] **Step 8: Commit**

```bash
git add src/section-strip/SectionStrip.tsx src/section-strip/SectionStrip.test.tsx src/styles/section-strip.css
git commit -m "feat(section-strip): long-press for bookmark + context menu under touch"
```

---

### Task 9: Apple PWA meta tags + viewport-fit=cover

**Files:**
- Modify: `index.html`
- Create: `public/icons/apple-touch-icon.png` (180×180, generated from existing icon.svg)

- [ ] **Step 1: Generate the apple-touch-icon PNG**

Use any tool that converts SVG → PNG at 180×180 (e.g., `npx svgexport`
or an online converter; this is a one-time asset). Place at
`public/icons/apple-touch-icon.png`.

```bash
# If svgexport is installable:
npx svgexport public/icons/icon.svg public/icons/apple-touch-icon.png 180:180
```

If the icon-export tool needs additional config, verify the resulting PNG
in Finder Preview: should be 180×180, opaque background OK (apple-touch
prefers no transparency).

- [ ] **Step 2: Update `index.html`**

Replace the existing `<head>` with:

```html
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="Arpeggio" />
  <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
  <title>Arpeggio</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link
    href="https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;700&display=swap"
    rel="stylesheet"
  />
</head>
```

- [ ] **Step 3: Add safe-area-inset CSS under `.app--touch`**

Append to `src/styles/theme.css`:

```css
.app--touch .top-bar {
  padding-left: max(12px, env(safe-area-inset-left));
  padding-right: max(12px, env(safe-area-inset-right));
  padding-top: max(0px, env(safe-area-inset-top));
}

.app--touch .practice-content {
  padding-bottom: env(safe-area-inset-bottom);
}
```

(Adjust selectors to match `theme.css` — `.top-bar`, `.practice-content`
are typical class names per the codebase. Substitute the actual class
names found in the file.)

- [ ] **Step 4: Run build to verify the icon is precached**

Run: `npm run build`
Expected: PASS — `vite-plugin-pwa` should include the new icon in the
precache manifest.

- [ ] **Step 5: Commit**

```bash
git add index.html public/icons/apple-touch-icon.png src/styles/theme.css
git commit -m "feat(pwa): apple meta tags, viewport-fit=cover, apple-touch-icon"
```

---

### Task 10: Touch-specific MIDI status copy

**Files:**
- Modify: `src/ui/TopBar.tsx`
- Test: `src/ui/TopBar.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `src/ui/TopBar.test.tsx`:

```tsx
test("on touch device, MIDI 'unsupported' status shows iPadOS hint", () => {
  vi.mock("../responsive/useIsTouchDevice", () => ({
    useIsTouchDevice: () => true,
  }));
  renderBar({ mode: "midi", midiStatus: "unsupported" });
  expect(screen.getByText(/iPadOS 17\.4/)).toBeInTheDocument();
});
```

(The mocking shape may need to be at the top of the file rather than inline
— pattern-match the existing test file's mocking style.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- TopBar.test`
Expected: FAIL.

- [ ] **Step 3: Wire touch-specific copy**

In `src/ui/TopBar.tsx`, import the hook and update the MIDI chip block
(lines 223-238):

```tsx
import { useIsTouchDevice } from "../responsive/useIsTouchDevice";

// ... inside the component body
const isTouchDevice = useIsTouchDevice();

// Replace the existing MIDI chip JSX:
{mode === "midi" && midiStatus !== undefined && (
  <span className="midi-status-chip" aria-label={chipAriaLabel(midiStatus, midiDeviceName, isTouchDevice)}>
    {midiStatusLabel(midiStatus, midiDeviceName, isTouchDevice)}
  </span>
)}
```

Add the helpers near the top of the file (after the existing
`formatTime`/`displayName` helpers):

```tsx
function midiStatusLabel(
  status: MidiStatus | undefined,
  deviceName: string | undefined,
  isTouch: boolean,
): React.ReactNode {
  if (status === "connected") return <>● {deviceName ?? "MIDI"}</>;
  if (status === "unsupported" && isTouch) return "Update iPadOS to 17.4+ for MIDI";
  if (status === "denied" && isTouch) return "Allow MIDI in Safari Settings";
  return <>○ Connect keyboard</>;
}

function chipAriaLabel(
  status: MidiStatus | undefined,
  deviceName: string | undefined,
  isTouch: boolean,
): string {
  if (status === "connected") return `MIDI connected: ${deviceName ?? "device"}`;
  if (status === "unsupported" && isTouch) return "MIDI not supported; update iPadOS to 17.4 or newer";
  if (status === "denied" && isTouch) return "MIDI access denied; allow in Safari Settings";
  return "MIDI: Connect keyboard";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- TopBar.test`
Expected: PASS — new + existing.

- [ ] **Step 5: Commit**

```bash
git add src/ui/TopBar.tsx src/ui/TopBar.test.tsx
git commit -m "feat(top-bar): touch-specific MIDI status copy on iPad"
```

---

### Task 11: Feature docs update for Phase 3

**Files:**
- Modify: `docs/features/A-scaffold-deploy.md`
- Modify: `docs/features/J-midi-section-navigator.md`

- [ ] **Step 1: Append bullets**

`A-scaffold-deploy.md` Changes log:

```markdown
- 2026-05-24 — PWA polish for iPad: `apple-mobile-web-app-capable`,
  `apple-mobile-web-app-status-bar-style`, `apple-touch-icon`, and
  `viewport-fit=cover` added to `index.html`. Generated
  `public/icons/apple-touch-icon.png` (180×180) from the existing SVG.
```

`J-midi-section-navigator.md` Changes log:

```markdown
- 2026-05-24 — Touch tablets get long-press equivalents for
  bookmark-create and context-menu actions on the SectionStrip via
  `useLongPress` (`src/responsive/useLongPress.ts`). Desktop
  right-click / double-click paths unchanged.
```

- [ ] **Step 2: Run the full gate**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add docs/features/A-scaffold-deploy.md docs/features/J-midi-section-navigator.md
git commit -m "docs(features): log iPad PWA polish + SectionStrip long-press"
```

---

## Phase 4 — TopBar single-row guarantee (Tasks 12-14)

After Phase 4, the TopBar never wraps and never clips at any iPad width
down to iPad mini portrait (744pt). The piece-name absorbs the remainder
via flex-shrink.

### Task 12: `flex-wrap: nowrap` + piece-name absorber

**Files:**
- Modify: `src/styles/theme.css`
- Modify: `src/ui/TopBar.tsx`

- [ ] **Step 1: Add the layout-invariant CSS**

Append to `src/styles/theme.css`:

```css
/* Touch-tablet TopBar: one-row invariant.
   Every control has flex-shrink: 0; the piece-name is the single
   flex-shrinkable item that absorbs the remainder and ellipsizes. */
.app--touch .top-bar {
  flex-wrap: nowrap;
}

.app--touch .top-bar > * {
  flex-shrink: 0;
}

.app--touch .top-bar .top-bar-piece {
  flex-shrink: 1;
  min-width: 0;
  overflow: hidden;
}

.app--touch .top-bar .top-bar-piece-label {
  display: none;
}

.app--touch .top-bar .top-bar-piece-title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 24ch;
}

/* Hit-target floor */
.app--touch .top-bar button,
.app--touch .top-bar input[type="range"],
.app--touch .top-bar .midi-status-chip {
  min-height: 44px;
}
```

- [ ] **Step 2: Run typecheck + manual visual check**

Run: `npm run dev` and load a piece. Resize the window to 744pt
(simulate iPad mini portrait via Chrome DevTools device-mode emulation).
The TopBar should remain on one row, piece-name should ellipsize.

(No automated test for visual layout in jsdom; the invariant is enforced
by CSS.)

- [ ] **Step 3: Commit**

```bash
git add src/styles/theme.css
git commit -m "feat(top-bar): nowrap + piece-name absorber under .app--touch"
```

---

### Task 13: Move TopBarReadout into Tools popover on touch

**Files:**
- Modify: `src/ui/TopBar.tsx`
- Modify: `src/ui/PlayTools.tsx` and `src/ui/MidiTools.tsx` (host the readout)
- Test: `src/ui/TopBar.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `src/ui/TopBar.test.tsx`:

```tsx
test("on touch device, TopBarReadout is NOT rendered in the bar", () => {
  vi.mock("../responsive/useIsTouchDevice", () => ({ useIsTouchDevice: () => true }));
  renderBar({ mode: "midi" });
  // The readout has its own role/testid in TopBarReadout — use the most
  // specific selector that doesn't double-match the popover version.
  expect(screen.queryByTestId("top-bar-readout")).not.toBeInTheDocument();
});

test("on desktop, TopBarReadout IS rendered in the bar", () => {
  vi.mock("../responsive/useIsTouchDevice", () => ({ useIsTouchDevice: () => false }));
  renderBar({ mode: "midi" });
  expect(screen.getByTestId("top-bar-readout")).toBeInTheDocument();
});
```

(If `TopBarReadout` doesn't currently have a `data-testid`, add one in
this task — see Step 3.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- TopBar.test`
Expected: FAIL.

- [ ] **Step 3: Hide TopBarReadout in TopBar under touch + ensure testid**

In `src/ui/TopBarReadout.tsx`, add `data-testid="top-bar-readout"` to the
root element if not already present.

In `src/ui/TopBar.tsx`, wrap the existing `<TopBarReadout ... />` (around
line 214):

```tsx
{!isTouchDevice && (
  <TopBarReadout
    mode={mode}
    transport={transport}
    audioEngine={audioEngine}
    waitEnabled={waitEnabled}
    onWaitEnabledChange={onWaitEnabledChange}
    handsIPlay={handsIPlay}
    onHandsIPlayChange={onHandsIPlayChange}
  />
)}
```

(`isTouchDevice` was wired in Task 10; if Task 10 was deferred, add the
import + `const isTouchDevice = useIsTouchDevice();` line here.)

- [ ] **Step 4: Add a "Now playing" section to PlayTools / MidiTools**

In `src/ui/PlayTools.tsx`, near the top of the panel content:

```tsx
import { useIsTouchDevice } from "../responsive/useIsTouchDevice";
import { TopBarReadout } from "./TopBarReadout";

// ... inside PlayTools render:
const isTouchDevice = useIsTouchDevice();

return (
  <div className="play-tools">
    {isTouchDevice && (
      <section className="tools-readout-section">
        <header className="tools-section-header">Now playing</header>
        <TopBarReadout
          mode="play"
          transport={transport}
          audioEngine={audioEngine}
        />
      </section>
    )}
    {/* existing PlayTools content */}
  </div>
);
```

Same shape in `src/ui/MidiTools.tsx`, passing `mode="midi"` and the
appropriate wait/hands props the readout needs (mirror what
`PracticeView` passes today). For each props the popover doesn't have,
either thread them through `PlayTools`/`MidiTools` props from
`PracticeView` (the cleanest) or duplicate the call site.

- [ ] **Step 5: Pass wait/hands props through `PlayTools` / `MidiTools` props if needed**

If `PlayTools` doesn't currently receive `waitEnabled`, `onWaitEnabledChange`,
`handsIPlay`, `onHandsIPlayChange`, extend its prop interface and
forward from `PracticeView`'s `<PlayTools ...>` call site (around
line 772-783).

(For brevity this step doesn't show every signature change — pattern-match
on how `transport` and `audioEngine` are currently threaded. If TypeScript
complains, the missing prop is the one to thread.)

- [ ] **Step 6: Run tests**

Run: `npm test -- TopBar.test PlayTools.test MidiTools.test`
Expected: PASS — new + existing.

- [ ] **Step 7: Commit**

```bash
git add src/ui/TopBar.tsx src/ui/TopBarReadout.tsx src/ui/PlayTools.tsx src/ui/MidiTools.tsx src/ui/TopBar.test.tsx src/app/PracticeView.tsx
git commit -m "feat(top-bar): move TopBarReadout into Tools popover under touch"
```

---

### Task 14: Hide Library text, narrow-width time + MIDI device name

**Files:**
- Modify: `src/ui/TopBar.tsx`
- Modify: `src/styles/theme.css`

- [ ] **Step 1: Hide the Library button text label on touch**

In `src/ui/TopBar.tsx`, find the Library button rendering (search for
`onOpenLibrary` or "Library"). Wrap the text label in a span and hide it
under touch:

```tsx
<button onClick={onOpenLibrary} className="top-bar-library">
  <LibraryIcon />
  <span className="top-bar-library-label">Library</span>
</button>
```

(If no icon component exists, add one or use a small inline SVG matching
the existing icon style elsewhere in `TopBar.tsx`.)

In `src/styles/theme.css`:

```css
.app--touch .top-bar-library-label { display: none; }
```

- [ ] **Step 2: Hide the time text on narrow viewports**

In `src/ui/TopBar.tsx`:

```tsx
import { useIsNarrowViewport } from "../responsive/useIsNarrowViewport";
// ...
const isNarrow = useIsNarrowViewport(900);

// Where the time span is rendered (around line 205):
{!isNarrow && (
  <span className="hud-time">
    {formatTime(position)} / {formatTime(duration)}
  </span>
)}
```

- [ ] **Step 3: Show MIDI chip as dot-only on narrow viewports**

In the `midiStatusLabel` helper added in Task 10, accept `isNarrow` as a
parameter:

```tsx
function midiStatusLabel(
  status: MidiStatus | undefined,
  deviceName: string | undefined,
  isTouch: boolean,
  isNarrow: boolean,
): React.ReactNode {
  if (status === "connected") {
    return isNarrow ? <span aria-hidden>●</span> : <>● {deviceName ?? "MIDI"}</>;
  }
  // ... rest unchanged
}
```

Update the call site to pass `isNarrow`.

- [ ] **Step 4: Run full gate**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/TopBar.tsx src/styles/theme.css
git commit -m "feat(top-bar): hide secondary labels on touch + narrow widths"
```

---

## Phase 5 — Verification (Task 15)

### Task 15: Manual verification on iPad + final feature-doc updates

**Files:**
- Modify: `docs/features/G-layout-view-modes.md`
- Modify: `docs/features/H-practice-controls.md`

- [ ] **Step 1: Append bullets**

`G-layout-view-modes.md` Changes log:

```markdown
- 2026-05-24 — Touch-tablet column-stack: when `useIsTouchDevice() &&
  useIsNarrowViewport(1024)`, the MIDI split (and Play "Both") layout
  flips to flex-column. `Layout` and `Divider` accept an `orientation`
  prop. A one-shot `SplitWarningToast` appears the first time a tablet
  user picks Split.
```

`H-practice-controls.md` Changes log:

```markdown
- 2026-05-24 — Under `.app--touch`, the TopBar enforces a single-row
  invariant (`flex-wrap: nowrap`); the piece-name container is the only
  flex-shrinkable element. TopBarReadout is moved into a "Now playing"
  section at the top of PlayTools/MidiTools. Library text label, time
  text, and MIDI device name are hidden on narrow tablet widths.
```

- [ ] **Step 2: Run full verify gate one final time**

Run: `npm run lint && npm run typecheck && npm test && npm run build && npm run e2e`
Expected: PASS.

- [ ] **Step 3: Manual checklist on physical iPad (REQUIRED before claiming complete)**

Per the spec's testing section:

- [ ] iPad mini portrait: Split shows falldown stacked on engraved score; Divider drags vertically.
- [ ] iPad Pro 12.9 landscape: Split stays side-by-side; long-press still works on the section strip.
- [ ] First Split selection on iPad shows the warning toast; reload, pick Split again — toast does not reappear.
- [ ] Long-press on empty SectionStrip area creates a bookmark.
- [ ] Long-press on a bookmark / section block opens the context menu.
- [ ] Long-press selection menu (system) does NOT appear on strip elements.
- [ ] "Add to Home Screen" launches the app fullscreen with no Safari chrome; status bar respects safe-area.
- [ ] MIDI via USB-C cable → device shows in chip (Safari prompts).
- [ ] MIDI via Bluetooth → device appears in Web MIDI.
- [ ] (If available) iPadOS < 17.4 shows "Update iPadOS to 17.4+ for MIDI".

- [ ] **Step 4: Commit feature-doc updates**

```bash
git add docs/features/G-layout-view-modes.md docs/features/H-practice-controls.md
git commit -m "docs(features): log iPad tablet polish completion"
```

---

## Self-Review Summary

- **Spec coverage:**
  - Spec §"Detection" (`useIsTouchDevice`, `useIsNarrowViewport`) → Tasks 1, 2.
  - Spec §"Part A Column-stack" → Tasks 5, 6.
  - Spec §"Part A5 Split-warning toast" → Task 7.
  - Spec §"Part B Long-press" → Tasks 3, 8.
  - Spec §"Part C Apple PWA + safe-area" → Task 9.
  - Spec §"Part D TopBar single-row" → Tasks 12, 13, 14.
  - Spec §"Part E MIDI status copy" → Task 10.
  - Spec §"Architecture summary file list" → realized across Tasks 1-14.
- **Placeholder scan:** every step shows actual code or commands.
- **Type consistency:** `useIsTouchDevice`, `useIsNarrowViewport`, `useLongPress`, `LongPressEvent`, `DividerOrientation`, `SplitWarningToastProps`, `midiStatusLabel`, `chipAriaLabel` named identically across tasks.
- **Frequent commits:** one commit per task; verify gate at the end of every phase.

## Phase deliverables

- **End of Phase 1** (Tasks 1-4): foundation in place, no user-visible change.
- **End of Phase 2** (Tasks 5-7): iPad portrait Split is readable; warning toast appears once.
- **End of Phase 3** (Tasks 8-11): touch gestures work on SectionStrip; "Add to Home Screen" feels native.
- **End of Phase 4** (Tasks 12-14): TopBar never wraps/clips on iPad.
- **End of Phase 5** (Task 15): physically verified on device.
