# Reading-Lane Redesign + Switchable Layout — Implementation Plan (Plan 3 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Practice tab's thin reading-lane strip with the engraved score integrated as a frosted backdrop over the top of the falldown, and let the user toggle the Practice tab between that reading-lane view and a side-by-side split view.

**Architecture:** The falldown `<canvas>` fills the whole Practice area; in **lane** layout the score-container `<div>` is an absolute frosted overlay across the top, in **split** layout it is a side panel like the Play tab. Both the canvas and the score `<div>` stay at fixed React-tree positions and never remount — only CSS classes on the content wrapper change (the same mechanism as the existing play/midi switch). `PracticeView` holds a `practiceLayout: "lane" | "split"` state; a `TopBar` toggle drives it. This absorbs known bug 1 (reading lane was on the bottom) and bug 3 (no score navigation — the split view's full scrollable score with click-to-seek is the navigation).

**Tech Stack:** TypeScript (strict), React 19, CSS. Spec: `docs/superpowers/specs/2026-05-19-practice-mode-independence-design.md` §3–§4. No unit tests for these UI files; verified by the gate + a Playwright e2e test.

**Note on the frosted panel colour:** the approved mockup showed a dark frosted panel with light notation, but Verovio renders real notation as black ink and the green measure-highlight must stay green. So the real lane overlay is a **light** translucent frosted panel (black notation stays readable, the green highlight is unaffected, and the falling notes still blur behind it). This is the faithful realisation of the "Frosted panel" choice for real engraved notation.

---

### Task 1: Layout state + `TopBar` toggle

**Files:**
- Modify: `src/layout/practiceMode.ts`
- Modify: `src/ui/TopBar.tsx`
- Modify: `src/app/PracticeView.tsx`

- [ ] **Step 1: Add the `PracticeLayout` type**

In `src/layout/practiceMode.ts`, append:

```ts
/** The Practice tab's layout: the reading-lane backdrop, or a side-by-side split. */
export type PracticeLayout = "lane" | "split";
```

- [ ] **Step 2: Update `TopBar` props**

In `src/ui/TopBar.tsx`:

Change the import line `import type { TabMode } from "../layout/practiceMode";` to:

```ts
import type { TabMode, PracticeLayout } from "../layout/practiceMode";
```

In the `TopBarProps` interface, replace these two members:

```ts
  /** MIDI tab: whether the reading lane is currently collapsed. */
  laneCollapsed: boolean;
  /** MIDI tab: toggle the reading lane collapsed state. */
  onToggleLane: () => void;
```

with:

```ts
  /** MIDI tab: the current Practice layout. */
  practiceLayout: PracticeLayout;
  /** MIDI tab: change the Practice layout. */
  onPracticeLayoutChange: (layout: PracticeLayout) => void;
```

In the `TopBar` function's destructured parameters, replace `laneCollapsed,` and `onToggleLane,` with `practiceLayout,` and `onPracticeLayoutChange,`.

- [ ] **Step 3: Replace the MIDI view control**

In `src/ui/TopBar.tsx`, in the returned JSX, replace this block:

```tsx
      ) : (
        <button
          type="button"
          aria-pressed={!laneCollapsed}
          aria-label="Toggle reading lane"
          onClick={onToggleLane}
        >
          Reading lane
        </button>
      )}
```

with:

```tsx
      ) : (
        <div className="top-bar-views">
          <button
            type="button"
            aria-pressed={practiceLayout === "lane"}
            onClick={() => onPracticeLayoutChange("lane")}
          >
            Reading lane
          </button>
          <button
            type="button"
            aria-pressed={practiceLayout === "split"}
            onClick={() => onPracticeLayoutChange("split")}
          >
            Split
          </button>
        </div>
      )}
```

- [ ] **Step 4: Update `PracticeView` state**

In `src/app/PracticeView.tsx`:

Change the import `import type { TabMode } from "../layout/practiceMode";` to:

```ts
import type { TabMode, PracticeLayout } from "../layout/practiceMode";
```

Replace this state line:

```ts
  const [laneCollapsed, setLaneCollapsed] = useState(false);
```

with:

```ts
  const [practiceLayout, setPracticeLayout] = useState<PracticeLayout>("lane");
```

- [ ] **Step 5: Update the wrapper class and score-panel class**

In `src/app/PracticeView.tsx`, replace this block:

```tsx
  // CSS classes for the score panel wrapper:
  //   play mode  →  "practice-score-panel"
  //   midi mode  →  "practice-score-panel reading-lane [reading-lane--collapsed]"
  const scorePanelClass = [
    "practice-score-panel",
    isMidi ? "reading-lane" : "",
    isMidi && laneCollapsed ? "reading-lane--collapsed" : "",
  ]
    .filter(Boolean)
    .join(" ");
```

with:

```tsx
  // The score panel is one stable element; the content-wrapper classes drive
  // its arrangement (play column / midi lane overlay / midi split panel).
  const scorePanelClass = "practice-score-panel";
```

Then replace the content-wrapper `<div>` opening:

```tsx
      <div
        className={[
          "practice-content",
          `practice-content--${mode}`,
        ]
          .filter(Boolean)
          .join(" ")}
      >
```

with:

```tsx
      <div
        className={[
          "practice-content",
          `practice-content--${mode}`,
          isMidi ? `layout-${practiceLayout}` : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
```

- [ ] **Step 6: Remove the in-panel reading-lane toggle button**

In `src/app/PracticeView.tsx`, delete this entire block from the score-panel `<div>`:

```tsx
          {/* MIDI-mode reading-lane toggle — only shown when expanded.
               When collapsed, the lane has overflow:hidden so this button
               would be geometrically clipped and unclickable. Re-expanding
               is done via the TopBar "Reading lane" toggle instead. */}
          {isMidi && !laneCollapsed && (
            <button
              type="button"
              className="reading-lane-toggle"
              aria-label="Collapse reading lane"
              aria-expanded={true}
              onClick={() => setLaneCollapsed(true)}
            >
              ▾ Reading lane
            </button>
          )}
```

- [ ] **Step 7: Update the `<TopBar>` props**

In `src/app/PracticeView.tsx`, in the `<TopBar ... />` element, replace these two props:

```tsx
        laneCollapsed={laneCollapsed}
        onToggleLane={() => setLaneCollapsed((c) => !c)}
```

with:

```tsx
        practiceLayout={practiceLayout}
        onPracticeLayoutChange={setPracticeLayout}
```

- [ ] **Step 8: Verify the gate**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: all pass; 321 Vitest tests stay green. (The layout will look wrong until Task 2 adds the CSS — that is expected at this step.)

- [ ] **Step 9: Commit**

```bash
git add src/layout/practiceMode.ts src/ui/TopBar.tsx src/app/PracticeView.tsx
git commit -m "feat: switchable Practice layout (reading-lane / split) state + toggle"
```

---

### Task 2: Reading-lane overlay + split layout CSS

**Files:**
- Modify: `src/styles/theme.css`

- [ ] **Step 1: Replace the MIDI-layout and reading-lane CSS**

In `src/styles/theme.css`, find the block that begins with the comment `/* MIDI mode: vertical stack (reading-lane on top, falldown below). */` and the `.practice-content--midi` rule, and which continues through the `.reading-lane-toggle:hover { ... }` rule. Replace **everything from `.practice-content--midi {` through the closing `}` of `.reading-lane-toggle:hover`** — i.e. these rules: `.practice-content--midi`, `.practice-content--midi .practice-falldown-panel`, `.reading-lane`, `.reading-lane--collapsed`, `.reading-lane .score-container`, `.reading-lane-toggle`, `.reading-lane-toggle:hover` (the `.practice-content--play .practice-score-panel` rule sits between them — keep it) — with the following.

Keep the `.practice-content--play .practice-score-panel` rule exactly as it is; only the `.practice-content--midi*` and `.reading-lane*` rules are being replaced. Replace them with:

```css
/* --- MIDI Practice layouts --- */

/* Reading-lane layout: the falldown fills the whole area; the engraved score
   is a frosted overlay across the top that the falling notes blur behind. */
.practice-content--midi.layout-lane {
  display: block;
  position: relative;
  height: 100%;
  min-height: 0;
}

.practice-content--midi.layout-lane .practice-falldown-panel {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.practice-content--midi.layout-lane .practice-score-panel {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 42%;
  z-index: 4;
  overflow: hidden;
  /* A light frosted pane: black engraved notation stays readable and the
     green measure highlight is unaffected, while the falling notes behind
     are blurred and recede. */
  background: rgba(248, 248, 246, 0.74);
  backdrop-filter: blur(7px) saturate(140%);
  -webkit-backdrop-filter: blur(7px) saturate(140%);
  border-bottom: 1px solid var(--glass-border);
  /* Soft lower edge so the panel dissolves into the falldown. */
  -webkit-mask-image: linear-gradient(to bottom, #000 86%, transparent 100%);
  mask-image: linear-gradient(to bottom, #000 86%, transparent 100%);
}

/* The score-container inside the lane overlay: transparent (the frosted pane
   shows through), clipped to the current system, with top padding that both
   clears the floating top bar and gives ledger-line headroom. */
.practice-content--midi.layout-lane .score-container {
  background: transparent;
  overflow: hidden;
  height: 100%;
  padding: 64px 1rem 0.5rem;
}

/* Split layout: falldown and the full engraved score side-by-side, like Play. */
.practice-content--midi.layout-split {
  display: flex;
  flex-direction: row;
  height: 100%;
  min-height: 0;
}

.practice-content--midi.layout-split .practice-falldown-panel {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  position: relative;
}

.practice-content--midi.layout-split .practice-score-panel {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  position: relative;
}
```

- [ ] **Step 2: Verify the gate and the dev build**

Run: `npm run lint && npm run typecheck && npm run build`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add src/styles/theme.css
git commit -m "feat: frosted reading-lane overlay and split layout for the Practice tab"
```

---

### Task 3: Update the reading-lane e2e test

**Files:**
- Modify: `tests/e2e/practice.spec.ts`

The existing test `"MIDI Practice tab: reading lane is visible and can be toggled"` exercises the removed collapse behaviour. Replace it with a test for the new lane/split toggle.

- [ ] **Step 1: Replace the test**

In `tests/e2e/practice.spec.ts`, find the test that starts with `test("MIDI Practice tab: reading lane is visible and can be toggled", async ({` and replace that entire `test(...)` call (from `test(` to its closing `});`) with:

```ts
test("MIDI Practice tab: layout toggles between reading-lane and split", async ({
  page,
}) => {
  await page.goto("/");
  await page.setInputFiles('input[type="file"]', "src/test/fixtures/clean.mid");
  await expect(page.locator("canvas.falldown-canvas")).toBeVisible({
    timeout: 15_000,
  });

  // Switch to the MIDI Practice tab — the reading-lane layout is the default.
  await page.getByRole("button", { name: "MIDI Practice" }).click();

  const laneBtn = page
    .locator(".top-bar")
    .getByRole("button", { name: "Reading lane" });
  const splitBtn = page
    .locator(".top-bar")
    .getByRole("button", { name: "Split", exact: true });

  await expect(laneBtn).toHaveAttribute("aria-pressed", "true");
  await expect(splitBtn).toHaveAttribute("aria-pressed", "false");

  // The score panel and the falldown canvas are both present in lane layout.
  await expect(page.locator("[data-testid='reading-lane']")).toBeVisible();
  await expect(page.locator("canvas.falldown-canvas")).toBeVisible();

  // Switch to the split layout.
  await splitBtn.click();
  await expect(splitBtn).toHaveAttribute("aria-pressed", "true");
  await expect(laneBtn).toHaveAttribute("aria-pressed", "false");
  // The canvas must still be the same element — never remounted.
  await expect(page.locator("canvas.falldown-canvas")).toBeVisible();

  // Back to the reading-lane layout.
  await laneBtn.click();
  await expect(laneBtn).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("canvas.falldown-canvas")).toBeVisible();

  // Switching back to the Play tab keeps the canvas visible (not remounted).
  await page
    .locator(".top-bar-modes")
    .getByRole("button", { name: "Play" })
    .click();
  await expect(page.locator("canvas.falldown-canvas")).toBeVisible();
});
```

Note: the score panel keeps its `data-testid="reading-lane"` attribute in MIDI mode (set in `PracticeView`), so the locator still resolves.

- [ ] **Step 2: Run the e2e suite**

Run: `npm run e2e`
Expected: PASS — the replaced test plus all other e2e tests are green.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/practice.spec.ts
git commit -m "test: e2e for the Practice layout toggle"
```

---

## Self-Review

- **Spec §3:** the falldown fills the area and the score is an absolute frosted overlay (Task 2 CSS); falling notes blur behind it via `backdrop-filter`; the overlay shows one clipped system that `ScoreView` already scrolls to follow the playhead; top padding gives ledger headroom; the green highlight is `ScoreView`'s existing rect (unaffected — light frosted panel, no colour inversion). Bug 1 absorbed — the score is the top backdrop.
- **Spec §4:** `practiceLayout` state + `TopBar` lane/split toggle (Task 1); split layout is a side-by-side panel with the full scrollable score (Task 2) — the existing `ScoreView` click-to-seek / drag-to-loop give section navigation, absorbing bug 3. The canvas and score `<div>` never remount — only wrapper classes change (Task 1 Step 5).
- **Placeholders:** none — every step is exact code or an exact command. Task 2 Step 1 names the precise rules to replace in a named file.
- **Type consistency:** `PracticeLayout` (`"lane" | "split"`) is defined once in `practiceMode.ts` and used by `TopBar` (`practiceLayout`/`onPracticeLayoutChange`) and `PracticeView` (`useState<PracticeLayout>`); the `<TopBar>` call passes exactly those two props. CSS classes `layout-lane` / `layout-split` emitted by Task 1 Step 5 match the selectors in Task 2 Step 1.
