# Practice-Tab View Options Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `Falldown only` and `Score only` options to the MIDI Practice tab's Layout pill, with full rendering support in `PracticeView`. Ships on desktop and tablet.

**Architecture:** Widen the `PracticeLayout` union; route the new values through the existing single-DOM-tree pattern in `PracticeView` (the `layout-${practiceLayout}` modifier class drives CSS visibility); add the two CSS rule blocks; surface the options in the existing `TopBar` Layout pill.

**Tech Stack:** TypeScript (strict), React, Vitest + React Testing Library, plain CSS.

---

## File Structure

**Modify:**
- `src/layout/practiceMode.ts` — widen the `PracticeLayout` union.
- `src/ui/TopBar.tsx` — add two `<TopBarSelect>` items to the MIDI Practice Layout pill.
- `src/ui/TopBar.test.tsx` — assert the new options render + fire callbacks.
- `src/app/PracticeView.tsx` — extend the score-zoom gating, `scoreContainerClass`, and `scorePanelStyle` to handle `falldown` / `score` MIDI layouts.
- `src/app/PracticeView.test.tsx` — assert the new modifier classes apply.
- `src/styles/theme.css` — add `.practice-content--midi.layout-falldown` and `.practice-content--midi.layout-score` rule blocks.
- `docs/features/G-layout-view-modes.md` — Changes log bullet per CLAUDE.md.

**No new files. No deletions.**

---

### Task 1: Widen the `PracticeLayout` type union

**Files:**
- Modify: `src/layout/practiceMode.ts`

- [ ] **Step 1: Apply the type widening**

Open `src/layout/practiceMode.ts` and replace line 8:

```ts
// before
export type PracticeLayout = "lane" | "split";

// after
export type PracticeLayout = "lane" | "split" | "falldown" | "score";
```

- [ ] **Step 2: Run typecheck to confirm no callers break**

Run: `npm run typecheck`
Expected: PASS — exhaustive `switch`/match callers (if any) would surface here. Currently there are none; widening is purely additive.

- [ ] **Step 3: Commit**

```bash
git add src/layout/practiceMode.ts
git commit -m "feat(practice): widen PracticeLayout to include 'falldown' and 'score'"
```

---

### Task 2: TopBar — render Falldown only + Score only

**Files:**
- Modify: `src/ui/TopBar.tsx:260-263`
- Test: `src/ui/TopBar.test.tsx`

- [ ] **Step 1: Write the failing test**

Open `src/ui/TopBar.test.tsx`. Locate the existing `practiceLayout`-related test near line 177 (the `renderBar({ mode: "midi", practiceLayout: "lane", ... })` block). Add a new test below it:

```tsx
test("MIDI Practice tab Layout pill exposes Falldown only and Score only", () => {
  const onPracticeLayoutChange = vi.fn();
  renderBar({
    mode: "midi",
    practiceLayout: "split",
    laneTheme: "dark",
    onPracticeLayoutChange,
  });

  // Open the Layout pill.
  fireEvent.click(screen.getByRole("button", { name: /layout:/i }));

  // All four options are listed.
  expect(screen.getByRole("menuitem", { name: "Reading lane" })).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: "Split" })).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: "Falldown only" })).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: "Score only" })).toBeInTheDocument();

  // Selecting "Falldown only" fires the callback with "falldown".
  fireEvent.click(screen.getByRole("menuitem", { name: "Falldown only" }));
  expect(onPracticeLayoutChange).toHaveBeenCalledWith("falldown");

  // Re-open and select "Score only".
  fireEvent.click(screen.getByRole("button", { name: /layout:/i }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Score only" }));
  expect(onPracticeLayoutChange).toHaveBeenCalledWith("score");
});
```

Note: if the existing tests use a different role/selector than `menuitem` for `TopBarSelect` options, mirror that pattern — check the existing line-198 test (`onPracticeLayoutChange.toHaveBeenCalledWith("lane")`) for the canonical interaction shape, and copy it.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- TopBar.test.tsx`
Expected: FAIL — the two new options aren't in the pill yet.

- [ ] **Step 3: Add the two items to the Layout pill**

Edit `src/ui/TopBar.tsx`, in the `mode === "midi"` `TopBarSelect` block (lines 257-272). Extend the `"Layout"` section's `items` array:

```tsx
sections={[
  {
    section: "Layout",
    items: [
      { value: "lane", label: "Reading lane" },
      { value: "split", label: "Split" },
      { value: "falldown", label: "Falldown only" },  // new
      { value: "score", label: "Score only" },        // new
    ],
  },
  {
    section: "Lane theme",
    items: [
      { value: "theme:paper", label: "Light" },
      { value: "theme:dark", label: "Dark" },
    ],
  },
]}
```

The existing `onChange` handler (lines 273-281) already dispatches the non-theme branch as `onPracticeLayoutChange(v)`, where `v: LayoutMenuValue` now includes `"falldown"` and `"score"` automatically via the Task 1 type widening. No `onChange` edits needed.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- TopBar.test.tsx`
Expected: PASS, all existing TopBar tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/ui/TopBar.tsx src/ui/TopBar.test.tsx
git commit -m "feat(top-bar): add Falldown only + Score only to MIDI Practice Layout pill"
```

---

### Task 3: PracticeView — wire `practiceLayout` rendering for the new values

**Files:**
- Modify: `src/app/PracticeView.tsx:595-605, 700-712`
- Test: `src/app/PracticeView.test.tsx`

The DOM tree under `.practice-content` is stable — the modifier class `layout-${practiceLayout}` controls visibility via CSS. We only need to:

1. Apply `{ flex: 1 }` to the score panel when `practiceLayout === "score"` (matches the `split` case).
2. Use the `horizontal-pages` score-container class in MIDI score-only (matches Play tab's `viewMode === "score"`).
3. Show the score-zoom buttons in MIDI score-only.

- [ ] **Step 1: Write the failing test**

Open `src/app/PracticeView.test.tsx`. Add the following test (adapt to existing render helpers / mocks — the existing tests already mock Verovio/Tone):

```tsx
test("MIDI score-only layout applies layout-score modifier and horizontal-pages container", async () => {
  const { container } = await renderPracticeView({ isMidiSource: false });

  // Switch to MIDI Practice tab.
  fireEvent.click(screen.getByRole("button", { name: /midi/i }));

  // Open Layout pill and pick "Score only".
  fireEvent.click(screen.getByRole("button", { name: /layout:/i }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Score only" }));

  const content = container.querySelector(".practice-content");
  expect(content?.classList.contains("layout-score")).toBe(true);
  expect(container.querySelector(".score-container.horizontal-pages")).toBeInTheDocument();

  // Score-zoom is visible in MIDI score-only.
  expect(screen.getByRole("button", { name: /zoom in/i })).toBeInTheDocument();
});

test("MIDI falldown-only layout applies layout-falldown modifier and hides score-zoom", async () => {
  const { container } = await renderPracticeView({ isMidiSource: false });

  fireEvent.click(screen.getByRole("button", { name: /midi/i }));
  fireEvent.click(screen.getByRole("button", { name: /layout:/i }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Falldown only" }));

  const content = container.querySelector(".practice-content");
  expect(content?.classList.contains("layout-falldown")).toBe(true);
  // Score-zoom is hidden in falldown-only.
  expect(screen.queryByRole("button", { name: /zoom in/i })).not.toBeInTheDocument();
});
```

If `renderPracticeView` isn't the existing helper name, use whatever the file does today.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- PracticeView.test.tsx`
Expected: FAIL — the new modifier classes don't apply (typecheck is fine because the union is widened), and `score-zoom` rendering condition needs the update.

- [ ] **Step 3: Update score-zoom gating**

Edit `src/app/PracticeView.tsx:701`. Widen the condition so MIDI score-only also shows zoom buttons:

```tsx
// before
{(!isMidi || practiceLayout === "split") && (
  <div className="score-zoom">

// after
{(!isMidi || practiceLayout === "split" || practiceLayout === "score") && (
  <div className="score-zoom">
```

- [ ] **Step 4: Update `scoreContainerClass`**

Edit `src/app/PracticeView.tsx:602-605`. Add the MIDI score-only branch:

```tsx
// before
const scoreContainerClass =
  !isMidi && viewMode === "score"
    ? "score-container horizontal-pages"
    : "score-container";

// after
const scoreContainerClass =
  (!isMidi && viewMode === "score") || (isMidi && practiceLayout === "score")
    ? "score-container horizontal-pages"
    : "score-container";
```

- [ ] **Step 5: Update `scorePanelStyle`**

Edit `src/app/PracticeView.tsx:595-599`. Extend the MIDI branch so `score` mode also gets `{ flex: 1 }`:

```tsx
// before
const scorePanelStyle = isMidi
  ? practiceLayout === "split"
    ? { flex: 1 }
    : undefined
  : { display: showScoreInPlay ? undefined : "none", flex: 1 };

// after
const scorePanelStyle = isMidi
  ? practiceLayout === "split" || practiceLayout === "score"
    ? { flex: 1 }
    : undefined
  : { display: showScoreInPlay ? undefined : "none", flex: 1 };
```

The `falldownPanelStyle` requires no inline-style change for the new layouts — CSS (Task 4) handles the visibility entirely. The Divider gating on line 685 already only fires for `practiceLayout === "split"`, so it correctly stays hidden for `falldown` and `score`. No edit there.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- PracticeView.test.tsx`
Expected: PASS for the two new tests **and** every existing PracticeView test.

- [ ] **Step 7: Commit**

```bash
git add src/app/PracticeView.tsx src/app/PracticeView.test.tsx
git commit -m "feat(practice-view): route 'falldown' and 'score' practice layouts"
```

---

### Task 4: CSS — add `.layout-falldown` and `.layout-score` rules

**Files:**
- Modify: `src/styles/theme.css` (after line 873, the `.practice-content--midi-source` rule block)

CSS-only changes — no automated test. Verification is manual (Task 6).

- [ ] **Step 1: Add the two rule blocks**

Insert after line 873 in `src/styles/theme.css`:

```css
/* ──── MIDI Practice — Falldown-only layout ────
   The falldown takes the full content area; the engraved score panel and
   reading-lane ribbon are hidden. No divider (gated in PracticeView). */
.practice-content--midi.layout-falldown {
  display: block;
  position: relative;
  height: 100%;
  min-height: 0;
}

.practice-content--midi.layout-falldown .practice-falldown-panel {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.practice-content--midi.layout-falldown .practice-score-panel,
.practice-content--midi.layout-falldown .practice-lane-panel {
  display: none;
}

/* ──── MIDI Practice — Score-only layout ────
   The engraved score panel takes the full content area; the falldown and
   reading-lane ribbon are hidden. */
.practice-content--midi.layout-score {
  display: block;
  position: relative;
  height: 100%;
  min-height: 0;
}

.practice-content--midi.layout-score .practice-score-panel {
  position: absolute;
  inset: 0;
  overflow: auto;
}

.practice-content--midi.layout-score .practice-falldown-panel,
.practice-content--midi.layout-score .practice-lane-panel {
  display: none;
}
```

- [ ] **Step 2: Run the full gate to confirm nothing regressed**

Run: `npm run lint && npm run typecheck && npm test`
Expected: PASS across the board.

- [ ] **Step 3: Commit**

```bash
git add src/styles/theme.css
git commit -m "feat(styles): add layout-falldown and layout-score CSS for MIDI Practice"
```

---

### Task 5: Update Feature G doc

**Files:**
- Modify: `docs/features/G-layout-view-modes.md` (Changes log section)

- [ ] **Step 1: Append a dated bullet**

Open `docs/features/G-layout-view-modes.md`. In the `## Changes log` section, after the `2026-05-24` "Studio Dark refresh" bullet, add:

```markdown
- 2026-05-24 — MIDI Practice tab Layout pill gains **Falldown only** and
  **Score only** options (full parity with the Play tab View pill). The
  `PracticeLayout` union widens to `"lane" | "split" | "falldown" | "score"`;
  new CSS rule blocks `.practice-content--midi.layout-falldown` and
  `.layout-score` drive the visibility. Lane theme picker behavior is
  unchanged. `practiceLayout` remains in-memory state (not persisted).
```

- [ ] **Step 2: Run the full gate one more time**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add docs/features/G-layout-view-modes.md
git commit -m "docs(feature-g): log Falldown-only + Score-only on MIDI Practice"
```

---

### Task 6: Manual verification + e2e

**Files:**
- No code changes.

- [ ] **Step 1: Run `npm run dev` and verify each manual checklist item from the spec**

```bash
npm run dev
```

Manual list (from `2026-05-24-practice-view-options-design.md`):

- [ ] Import a MusicXML file, switch to MIDI Practice tab. Layout pill shows four options.
- [ ] **Falldown only** — only the falldown is visible, transport works, no divider, no score-zoom.
- [ ] **Score only** — only the engraved score is visible, no falldown, score-zoom buttons visible, horizontal-pages container.
- [ ] **Reading lane** — unchanged from before this change.
- [ ] **Split** — unchanged from before this change (divider visible, both panes).
- [ ] Lane-theme picker still auto-switches to Reading lane.

- [ ] **Step 2: Run the e2e gate**

```bash
npm run e2e
```

Expected: PASS — no new e2e tests added in this plan, but the existing Playwright suite must remain green.

- [ ] **Step 3: No commit (this task is verification only).**

---

## Self-Review Summary

- **Spec coverage:** Task 1 widens type → spec §"Data model". Task 2 adds pill items → spec §"TopBar pill". Task 3 wires rendering → spec §"Rendering rule". Task 4 ships CSS (implicit in the spec's "the modifier class drives visibility" claim). Task 5 updates feature doc per CLAUDE.md self-check. Task 6 runs the manual checklist.
- **No placeholders.** Every code step shows the actual code to write.
- **Type consistency:** `PracticeLayout`, `LayoutMenuValue`, `practiceLayout`, `onPracticeLayoutChange` used consistently across tasks; line numbers cited.
- **Frequent commits:** one commit per task; verify gate runs in Task 4 and again in Task 5.
