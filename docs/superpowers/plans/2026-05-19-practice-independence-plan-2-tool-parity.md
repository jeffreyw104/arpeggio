# Tool Parity — Implementation Plan (Plan 2 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the MIDI Practice tab's Tools popover every shared Play tool — Loop, Tempo, Metronome, and General settings — in addition to its MIDI controls.

**Architecture:** Extract the four sections shared by both tabs (Loop, Tempo, Metronome, General settings) from `PlayTools` into a new `CommonTools` component that renders them as a fragment. `PlayTools` then renders its Play-only Hands section plus `CommonTools`; `MidiTools` renders its MIDI sections plus `CommonTools`. Play's Hands section stays Play-only — the Practice tab's "Hands I play" is its hand control, and Play's per-hand mute would fight the MIDI session's automatic hand-muting.

**Tech Stack:** TypeScript (strict), React 19. Spec: `docs/superpowers/specs/2026-05-19-practice-mode-independence-design.md` §2. There are no unit tests for these UI components in this repo; tasks are verified by the gate (lint/typecheck/test/build) plus a Playwright e2e test.

---

### Task 1: Extract `CommonTools`, slim down `PlayTools`

**Files:**
- Create: `src/ui/CommonTools.tsx`
- Modify (rewrite): `src/ui/PlayTools.tsx`

Background — the current `src/ui/PlayTools.tsx` is a ~385-line component rendering five `CollapsibleSection`s in this order: **Loop** (with a Speed-up sub-group), **Tempo**, **Hands**, **Metronome** (containing `<MetronomeSettings/>`), and `<GeneralSettings/>`. It owns all their state. We split it: four sections move into `CommonTools`; the Hands section stays in `PlayTools`.

- [ ] **Step 1: Create `src/ui/CommonTools.tsx` by deriving it from `PlayTools.tsx`**

First read the current `src/ui/PlayTools.tsx` in full. Create `src/ui/CommonTools.tsx` as a copy of it, then apply exactly these changes to the copy:

1. Imports: remove `import type { HandState, HandVisibility } from "../practice/hands";` (CommonTools does not use hand state). Keep all other imports (`useEffect, useRef, useState`, `Transport`, `AudioEngine`, `FalldownRenderer`, `CollapsibleSection`, `MetronomeSettings`, `GeneralSettings`).
2. Rename the props interface `PlayToolsProps` → `CommonToolsProps` and remove its `handState: HandState;` member. The remaining members are: `transport: Transport; audioEngine: AudioEngine | null; falldown: FalldownRenderer | null; countInBars: number; onCountInBarsChange: (bars: number) => void;`.
3. Rename the exported function `PlayTools` → `CommonTools`, typed `({ ... }: CommonToolsProps): React.JSX.Element`. Remove `handState` from its destructured parameters.
4. Delete the four Hands-section state hooks: `handsOpen`/`setHandsOpen`, `leftVis`/`setLeftVis`, `rightVis`/`setRightVis`, `muteLeft`/`setMuteLeft`, `muteRight`/`setMuteRight`. Keep every other hook (`loopOpen`, `tempoOpen`, `metronomeOpen`, the loop/speed-up/tempo/metronome state, `pulseRef`, the pulse `useEffect`) and every helper function (`clamp`, `measureAt`, `loopMeasures`, `applyLoop`, `handleSetStart`, `handleSetEnd`, `handleLoopMeasure`, `handleClearLoop`, `loopReadout`, `applySpeedUp`, `handleSpeedUpToggle`, `applyBpm`, `stepBpm`, `handleFlatten`, `handleMetronome`).
5. Delete the entire `<CollapsibleSection label="Hands" ...> ... </CollapsibleSection>` block from the returned JSX.
6. Change the returned root element from `<div className="play-tools"> ... </div>` to a fragment `<> ... </>`. The children become: the Loop `<CollapsibleSection>`, the Tempo `<CollapsibleSection>`, the Metronome `<CollapsibleSection>`, and `<GeneralSettings falldown={falldown} audioEngine={audioEngine} />` — in that order.
7. Replace the component's doc comment with:

```
/**
 * The Tools-popover sections shared by the Play and MIDI Practice tabs: Loop
 * (with a Speed-up sub-group), Tempo, Metronome, and General settings.
 * Rendered as a fragment so the host popover owns the wrapper element. All
 * sections start open; each can be collapsed.
 */
```

Do NOT change any logic inside the kept sections — the Loop/Tempo/Metronome JSX and handlers must be byte-for-byte the same as in the current `PlayTools`.

- [ ] **Step 2: Rewrite `src/ui/PlayTools.tsx` as the slim Play wrapper**

Replace the ENTIRE contents of `src/ui/PlayTools.tsx` with:

```tsx
import { useState } from "react";
import type { Transport } from "../transport/transport";
import type { HandState, HandVisibility } from "../practice/hands";
import type { AudioEngine } from "../audio/engine";
import type { FalldownRenderer } from "../falldown/renderer";
import { CollapsibleSection } from "./CollapsibleSection";
import { CommonTools } from "./CommonTools";

interface PlayToolsProps {
  transport: Transport;
  handState: HandState;
  audioEngine: AudioEngine | null;
  falldown: FalldownRenderer | null;
  countInBars: number;
  onCountInBarsChange: (bars: number) => void;
}

/**
 * The Tools popover body for the Play tab: the Play-only per-hand
 * visibility / mute section, followed by the sections shared with the MIDI
 * Practice tab (`CommonTools`).
 */
export function PlayTools({
  transport,
  handState,
  audioEngine,
  falldown,
  countInBars,
  onCountInBarsChange,
}: PlayToolsProps): React.JSX.Element {
  const [handsOpen, setHandsOpen] = useState(true);
  const [leftVis, setLeftVis] = useState<HandVisibility>(() =>
    handState.visibility("left"),
  );
  const [rightVis, setRightVis] = useState<HandVisibility>(() =>
    handState.visibility("right"),
  );
  const [muteLeft, setMuteLeft] = useState(() => handState.isMuted("left"));
  const [muteRight, setMuteRight] = useState(() => handState.isMuted("right"));

  return (
    <div className="play-tools">
      <CollapsibleSection
        label="Hands"
        open={handsOpen}
        onToggle={() => setHandsOpen((o) => !o)}
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

      <CommonTools
        transport={transport}
        audioEngine={audioEngine}
        falldown={falldown}
        countInBars={countInBars}
        onCountInBarsChange={onCountInBarsChange}
      />
    </div>
  );
}
```

Note: this changes the Play tab's section order from `Loop, Tempo, Hands, Metronome, General` to `Hands, Loop, Tempo, Metronome, General`. That reorder is intentional and acceptable.

- [ ] **Step 3: Verify the gate**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: all pass; 319 Vitest tests stay green. `PlayTools`'s public props are unchanged, so `PracticeView` still compiles.

- [ ] **Step 4: Commit**

```bash
git add src/ui/CommonTools.tsx src/ui/PlayTools.tsx
git commit -m "refactor: extract shared CommonTools from PlayTools"
```

---

### Task 2: Render `CommonTools` in the Practice popover

**Files:**
- Modify: `src/ui/MidiTools.tsx`
- Modify: `src/app/PracticeView.tsx`

Background — `src/ui/MidiTools.tsx` currently renders the MIDI input section, the "Hands I play" section, a "Wait for me" checkbox, an "Input sound" checkbox, and its own `<GeneralSettings/>`. We add the shared sections by rendering `<CommonTools/>` (which already includes General settings), and drop the standalone `<GeneralSettings/>`.

- [ ] **Step 1: Update `MidiTools.tsx` imports**

In `src/ui/MidiTools.tsx`, replace this import line:

```ts
import { GeneralSettings } from "./GeneralSettings";
```

with:

```ts
import { CommonTools } from "./CommonTools";
import type { Transport } from "../transport/transport";
```

- [ ] **Step 2: Add the new props to `MidiToolsProps`**

In `src/ui/MidiTools.tsx`, in the `MidiToolsProps` interface, add these three members at the top of the interface (directly after the opening `interface MidiToolsProps {` line):

```ts
  transport: Transport;
  countInBars: number;
  onCountInBarsChange: (bars: number) => void;
```

- [ ] **Step 3: Destructure the new props**

In `src/ui/MidiTools.tsx`, in the `MidiTools` function's destructured parameter list, add `transport`, `countInBars`, and `onCountInBarsChange` (alongside the existing `audioEngine`, `falldown`, etc.).

- [ ] **Step 4: Render `CommonTools` instead of `GeneralSettings`**

In `src/ui/MidiTools.tsx`, in the returned JSX, replace this line:

```tsx
      <GeneralSettings falldown={falldown} audioEngine={audioEngine} />
```

with:

```tsx
      <CommonTools
        transport={transport}
        audioEngine={audioEngine}
        falldown={falldown}
        countInBars={countInBars}
        onCountInBarsChange={onCountInBarsChange}
      />
```

- [ ] **Step 5: Update the component doc comment**

In `src/ui/MidiTools.tsx`, replace the `MidiTools` function's doc comment with:

```
/**
 * The Tools popover content for the MIDI Practice tab: MIDI device selection,
 * hand selection, wait-for-me, and the input-sound monitor, followed by the
 * sections shared with the Play tab (`CommonTools`: Loop, Tempo, Metronome,
 * General settings). Presentational — all state lives in PracticeView.
 */
```

- [ ] **Step 6: Pass the new props from `PracticeView`**

In `src/app/PracticeView.tsx`, find the `<MidiTools ... />` element. Add these three props to it (alongside the existing `audioEngine`, `falldown`, `midiStatus`, etc.):

```tsx
            transport={transport}
            countInBars={countInBars}
            onCountInBarsChange={setCountInBars}
```

`transport`, `countInBars`, and `setCountInBars` are all already in scope in `PracticeView` (used by the `<PlayTools/>` element).

- [ ] **Step 7: Verify the gate**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: all pass; 319 Vitest tests stay green.

- [ ] **Step 8: Commit**

```bash
git add src/ui/MidiTools.tsx src/app/PracticeView.tsx
git commit -m "feat: show the shared Loop/Tempo/Metronome tools on the Practice tab"
```

---

### Task 3: e2e — Practice popover exposes the shared sections

**Files:**
- Modify: `tests/e2e/practice.spec.ts`

- [ ] **Step 1: Append the e2e test**

Append to `tests/e2e/practice.spec.ts`:

```ts
test("MIDI Practice tab: Tools popover includes the shared Loop, Tempo, and Metronome sections", async ({
  page,
}) => {
  await page.goto("/");
  await page.setInputFiles('input[type="file"]', "src/test/fixtures/clean.mid");
  await expect(page.locator("canvas.falldown-canvas")).toBeVisible({
    timeout: 15_000,
  });

  // Switch to the MIDI Practice tab and open the Tools popover.
  await page.getByRole("button", { name: "MIDI Practice" }).click();
  await page
    .locator(".top-bar")
    .getByRole("button", { name: "Tools" })
    .click();
  await expect(page.getByRole("dialog", { name: "Tools" })).toBeVisible();

  // The Practice popover still has its MIDI controls...
  await expect(
    page.getByRole("checkbox", { name: /wait for me/i }),
  ).toBeVisible();

  // ...and now also the sections shared with the Play tab.
  await expect(
    page.getByRole("button", { name: "Loop", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Tempo", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Metronome", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "General settings" }),
  ).toBeVisible();
});
```

- [ ] **Step 2: Run the e2e suite**

Run: `npm run e2e`
Expected: PASS — the new test plus all existing e2e tests are green.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/practice.spec.ts
git commit -m "test: e2e for shared tool sections on the Practice tab"
```

---

## Self-Review

- **Spec coverage (§2):** the Practice popover gains Loop, Tempo, Metronome (Task 2 renders `<CommonTools/>`, which Task 1 defined to contain those plus General settings); General settings is no longer rendered twice (Task 2 Step 4 removes the standalone one); Play's Hands section stays Play-only (Task 1 keeps it in `PlayTools`); no duplicated state — `CommonTools` is one component instance per popover, editing the shared `transport`/`audioEngine`/`falldown`. e2e proves the sections appear (Task 3).
- **Placeholders:** none. Task 1 Step 1 is a precise mechanical derivation from a named source file (the engineer reads `PlayTools.tsx`); every other step has full code or exact commands.
- **Type consistency:** `CommonToolsProps` (`transport, audioEngine, falldown, countInBars, onCountInBarsChange`) matches the `<CommonTools .../>` call sites in both the new `PlayTools` (Task 1 Step 2) and `MidiTools` (Task 2 Step 4). `MidiToolsProps` gains exactly the three members passed by `PracticeView` in Task 2 Step 6. `PlayToolsProps` is unchanged, so `PracticeView`'s `<PlayTools/>` is untouched.
