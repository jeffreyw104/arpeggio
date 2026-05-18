# MIDI Practice Mode — Plan 1: Chrome & Tab Restructure

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate the three chrome layers (top bar + accordion row + floating HUD) into a single top bar, delete the old standalone Play mode, and stand up a `Play` / `MIDI Practice` tab structure with an empty MIDI tab shell.

**Architecture:** Incremental refactor of existing UI. The old simple Play mode is removed first so both tabs share one behavior; then the type renames; then the floating HUD and accordion row are folded into one `TopBar` plus a per-tab `Tools▾` popover; finally the MIDI tab shell is added. Each task ends with the full gate green.

**Tech Stack:** Vite + React 19 (`react-jsx`, no `import React`) + TypeScript strict · Vitest + Testing Library · Playwright e2e.

This is Spec 1, Part A. Spec: `docs/superpowers/specs/2026-05-19-midi-practice-mode-design.md`. Plan 2 (MIDI input + wait-mode) builds on this.

**Gate (run after every task):**
```
npm run lint && npm run typecheck && npm test && npm run build && npm run e2e
```

---

### Task 1: Remove the old standalone Play mode

The old Play mode existed only to offer a stripped-down playback view distinct from Practice. The spec deletes it: both tabs now share the full practice behavior. This task removes the suspend/restore machinery and the HUD speed stepper while leaving the `mode` state in place (still typed `PracticeMode`, still `"play" | "practice"`) so the rename in Task 2 is isolated.

**Files:**
- Modify: `src/app/PracticeView.tsx`
- Modify: `src/ui/FloatingHud.tsx`
- Modify: `src/app/PracticeView.test.tsx`
- Modify: `src/ui/FloatingHud.test.tsx`

- [ ] **Step 1: Update PracticeView tests for always-practice behavior**

In `src/app/PracticeView.test.tsx`, remove any test asserting Play-mode-specific behavior (suspended loop/hands, the speed stepper, BPM swapping on mode switch). Keep/adjust tests so they assert: the accordion bar (`ExtendedTopBar`) is shown whenever `practiceReady` is true regardless of mode. Run `npm test -- PracticeView` and expect the edited tests to fail against current code.

- [ ] **Step 2: Strip suspend/restore from PracticeView**

In `src/app/PracticeView.tsx` delete: `suspendedRef`, `practiceBpmRef`, `playBpmRef`, `userChangedModeRef`, the functions `suspendPractice()` and `restorePractice()`, and their calls. In the mount effect's restore block, drop the `restoredMode === "play"` branch and the `suspendPractice()` call — just `setMode(state?.mode ?? "practice")`. In the unmount cleanup, drop the `if (modeRef.current === "play") restorePractice()` line. Rewrite `handleModeChange` to simply `setMode(next)` (no BPM swap). `extendedBarShown` becomes `practiceReady` only (drop the `mode === "practice"` clause). Keep `mode`, `setMode`, `modeRef`, and `handleModeChange` — they still drive the switch.

- [ ] **Step 3: Remove the speed stepper from FloatingHud**

In `src/ui/FloatingHud.tsx` delete the `SPEED_STEPS` constant, `speedIndex` state, `changeSpeed()`, and the `{mode === "play" && (<div className="hud-group">…)}` block. The `mode` prop stays (still used by `useDraggable` initial placement and the count-in guard). Update `src/ui/FloatingHud.test.tsx` to drop speed-stepper assertions.

- [ ] **Step 4: Run the gate**

Run the full gate. Expected: all green. The app now shows identical behavior in both tabs.

- [ ] **Step 5: Commit**

```bash
git add src/app/PracticeView.tsx src/app/PracticeView.test.tsx src/ui/FloatingHud.tsx src/ui/FloatingHud.test.tsx
git commit -m "refactor: remove the old standalone Play mode"
```

---

### Task 2: Rename PracticeMode → TabMode (`play` | `midi`)

**Files:**
- Modify: `src/layout/practiceMode.ts`
- Modify: `src/ui/ModeSwitch.tsx`, `src/ui/ModeSwitch.test.tsx`
- Modify: `src/ui/TopBar.tsx`, `src/ui/FloatingHud.tsx`, `src/app/PracticeView.tsx`
- Modify: `src/library/practiceState.ts`, `src/library/db.ts`
- Modify: `src/layout/practiceMode.test.ts` (rename from existing test if present)

- [ ] **Step 1: Rewrite the type module**

Replace `src/layout/practiceMode.ts` contents:

```ts
/** Which tab the practice screen is on. */
export type TabMode = "play" | "midi";

/** All tabs, in switcher order. */
export const TAB_MODES: readonly TabMode[] = ["play", "midi"];
```

Rename the file's test accordingly if one exists; assert `TAB_MODES` equals `["play", "midi"]`.

- [ ] **Step 2: Update every consumer**

Replace `PracticeMode` with `TabMode` and the import path's symbol everywhere it is used: `ModeSwitch.tsx`, `TopBar.tsx`, `FloatingHud.tsx`, `PracticeView.tsx`, `practiceState.ts`. In `db.ts`, change the `StoredPracticeState.mode` field type from `PracticeMode` to `TabMode`. In `PracticeView.tsx`, change every `"practice"` mode literal to `"midi"` and keep `"play"` — the default mode and restore fallback become `"play"` (the full-tooling tab is now the default). `modeRef`/`mode` initial value: `"play"`.

- [ ] **Step 3: Relabel ModeSwitch**

Rewrite `src/ui/ModeSwitch.tsx` so the two buttons read `Play` (`mode === "play"`) and `MIDI Practice` (`mode === "midi"`), calling `onModeChange("play")` / `onModeChange("midi")`. Update `ModeSwitch.test.tsx` for the new labels and values.

- [ ] **Step 4: Run the gate**

Expected: all green. A persisted `mode: "practice"` from old IndexedDB data will no longer match `TabMode`; `db.ts` reads should fall back to the default — verify the restore code uses `state?.mode ?? "play"` so stale values are harmless.

- [ ] **Step 5: Commit**

```bash
git add src/layout/practiceMode.ts src/ui src/app/PracticeView.tsx src/library
git commit -m "refactor: rename PracticeMode to TabMode (play | midi)"
```

---

### Task 3: Fold the floating HUD's transport into the TopBar

The single consolidated bar gains the transport controls (play/pause, scrubber, time). `FloatingHud` is deleted; its Vol/Zoom sliders move temporarily onto the bar and relocate into the Tools popover in Task 4.

**Files:**
- Modify: `src/ui/TopBar.tsx`, `src/ui/TopBar.test.tsx`
- Modify: `src/app/PracticeView.tsx`
- Delete: `src/ui/FloatingHud.tsx`, `src/ui/FloatingHud.test.tsx`
- Modify: `src/styles/theme.css`

- [ ] **Step 1: Extend TopBar props and render the transport inline**

Add to `TopBarProps`: `transport: Transport`, `audioEngine: AudioEngine | null`, `falldown: FalldownRenderer | null`, `countInBars: number`. In `TopBar`, subscribe to `transport.clock.onChange` via a `useReducer` force-update (copy the pattern from the old `FloatingHud`). Render, in bar order: logo, Library, a play/pause button (`clock.toggle()` plus the count-in path lifted verbatim from `FloatingHud.handlePlayToggle`), the seek `<input type="range" className="hud-scrubber">`, the `m:ss / m:ss` time readout (`formatTime` helper moved from `FloatingHud`), then piece name, `ModeSwitch`, the view-mode buttons, and `⚙`. Carry the count-in (`startCountIn`) logic and the `volume`/`zoom` mini-sliders over from `FloatingHud` unchanged.

- [ ] **Step 2: Rewire PracticeView**

In `src/app/PracticeView.tsx`, delete the `<FloatingHud … />` element and pass the new props (`transport`, `audioEngine`, `falldown`, `countInBars`) to `<TopBar>`.

- [ ] **Step 3: Delete FloatingHud**

```bash
git rm src/ui/FloatingHud.tsx src/ui/FloatingHud.test.tsx
```

- [ ] **Step 4: Move the CSS**

In `src/styles/theme.css`, the `.floating-hud` rules become part of the `.top-bar` layout — the bar is a single flex row; the scrubber flexes to fill. Remove `.floating-hud`, `.faded`, and drag-related rules. Keep `.hud-scrubber`, `.hud-time`, `.hud-play-btn`, `.hud-mini`, `.hud-minislider` selectors (now children of `.top-bar`).

- [ ] **Step 5: Update TopBar tests + run gate**

In `TopBar.test.tsx`, add a render with a real `Transport` (construct from a fixture `Score`) and assert the play button and scrubber are present. Run the gate; fix any Playwright e2e selectors that referenced `.floating-hud`. Expected: green.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: fold the floating HUD transport into the top bar"
```

---

### Task 4: Replace the accordion row with a Tools popover (Play tab)

`ExtendedTopBar` (the second row) is removed. Its four section bodies — Loop, Tempo, Hands, Metronome — render inside a floating `ToolsPopover` opened from a `Tools▾` button in the bar. Vol/Zoom move into the popover.

**Files:**
- Create: `src/ui/ToolsPopover.tsx`, `src/ui/ToolsPopover.test.tsx`
- Create: `src/ui/PlayTools.tsx`
- Modify: `src/ui/TopBar.tsx`, `src/app/PracticeView.tsx`
- Delete: `src/ui/ExtendedTopBar.tsx`, `src/ui/ExtendedTopBar.test.tsx`
- Modify: `src/styles/theme.css`

- [ ] **Step 1: Create ToolsPopover**

`ToolsPopover` is a presentational floating panel: props `{ open: boolean; onClose: () => void; children: React.ReactNode }`. Renders nothing when closed; when open renders `<div className="tools-popover" role="dialog">` containing `children`, plus a click-outside / `Escape` handler that calls `onClose`. Anchor it below the bar via CSS (`position: absolute; top: <bar height>; right: …`).

- [ ] **Step 2: Create PlayTools**

`PlayTools` holds the four section bodies. Move the Loop, Speed-up, Tempo, Hands, and Metronome control logic verbatim out of `ExtendedTopBar.tsx` into `PlayTools.tsx` — same `transport` / `handState` / `audioEngine` / `falldown` / `countInBars` / `onCountInBarsChange` props, same state hooks and handlers. Reuse `CollapsibleSection` for each group. Append two more groups: Volume and Note-zoom (the `volume`/`zoom` slider logic moved from the bar). Drop `ExtendedTopBar`'s `useLayoutEffect` auto-collapse — a popover is not width-bound.

- [ ] **Step 3: Wire the Tools button into TopBar**

Add a `Tools▾` button to `TopBar` between the view-mode buttons and `⚙`. Add `toolsOpen` state in `PracticeView`; pass `toolsOpen` + `onToggleTools` to `TopBar`, and render `<ToolsPopover open={toolsOpen} onClose={…}><PlayTools …/></ToolsPopover>` from `PracticeView` (so the popover content is tab-aware in Task 5).

- [ ] **Step 4: Delete ExtendedTopBar**

```bash
git rm src/ui/ExtendedTopBar.tsx src/ui/ExtendedTopBar.test.tsx
```

Remove the `<ExtendedTopBar>` element and `extendedBarShown` from `PracticeView`. Remove `.extended-top-bar` / `.practice-view--extended` rules from `theme.css`; add `.tools-popover` rules.

- [ ] **Step 5: Tests + gate**

`ToolsPopover.test.tsx`: asserts hidden when `open=false`, visible when `open=true`, `onClose` fires on `Escape` and outside click. Move any still-relevant `ExtendedTopBar` control tests into a `PlayTools.test.tsx`. Update Playwright e2e: open Tools, toggle a loop. Run the gate; expected green.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: replace the accordion row with a Tools popover"
```

---

### Task 5: MIDI Practice tab shell + per-tab Tools content

The `midi` tab renders a distinct layout (mockup B): falldown-focused with a collapsible reading-lane strip. For Plan 1 the strip shows the existing engraved score; wait-mode arrives in Plan 2. The Tools popover content switches by tab.

**Files:**
- Create: `src/app/MidiTab.tsx`, `src/app/MidiTab.test.tsx`
- Create: `src/ui/ReadingLane.tsx`, `src/ui/ReadingLane.test.tsx`
- Create: `src/ui/MidiTools.tsx`
- Modify: `src/app/PracticeView.tsx`, `src/ui/TopBar.tsx`
- Modify: `src/styles/theme.css`

- [ ] **Step 1: Create ReadingLane**

`ReadingLane` props `{ scoreContainerRef: React.RefObject<HTMLDivElement | null>; collapsed: boolean }`. Renders a `<div className="reading-lane">` (height clipped to ~one engraved system, ~120px) wrapping the score container, with a collapse toggle. When `collapsed`, the lane height is 0. It reuses the *same* score DOM the `ScoreView` already drives — no second Verovio render.

- [ ] **Step 2: Create MidiTab**

`MidiTab` props: the shared `transport`, `falldown` canvas ref, `scoreContainerRef`, plus `laneCollapsed` / `onToggleLane`. It renders the falldown canvas filling the panel with `<ReadingLane>` pinned above it. For Plan 1 this is a layout-only shell — no MIDI logic. `MidiTab.test.tsx` asserts the falldown canvas and reading lane both render.

- [ ] **Step 3: Create MidiTools**

`MidiTools` is the MIDI tab's popover content. For Plan 1 it renders the Volume and Note-zoom groups plus a disabled placeholder block labelled "MIDI input — added in the next update" (no `TODO` text in shipped UI; this is a real interim label). Plan 2 fills it in.

- [ ] **Step 4: Switch layout and Tools content by tab in PracticeView**

In `PracticeView`, when `mode === "midi"` render `<MidiTab>` instead of `<Layout>`, and render `<MidiTools>` instead of `<PlayTools>` inside the `ToolsPopover`. Add `laneCollapsed` state. The view-mode buttons in `TopBar` show the Both/Falldown/Score switch when `mode === "play"` and a single "Reading lane" toggle when `mode === "midi"` (drives `laneCollapsed`).

- [ ] **Step 5: CSS + tests + gate**

Add `.reading-lane`, `.midi-tab` rules to `theme.css`. Add a Playwright e2e: switch to the MIDI Practice tab, assert the reading lane is visible, toggle it. Run the gate; expected green.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add the MIDI Practice tab shell and per-tab Tools content"
```

---

### Task 6: Spacebar play/pause

**Files:**
- Modify: `src/app/PracticeView.tsx`
- Modify: `src/app/PracticeView.test.tsx`

- [ ] **Step 1: Write the failing test**

In `PracticeView.test.tsx`, add a test: render `PracticeView`, dispatch a `keydown` for `" "` on `window`, assert `transport.clock.playing` flipped. Add a second test: focus a text `<input>`, dispatch space, assert the clock did **not** toggle. Run `npm test -- PracticeView`; expect FAIL.

- [ ] **Step 2: Add the handler**

In `PracticeView`, extend the existing arrow-key `useEffect`: also handle `e.key === " "` — `e.preventDefault()` then `transport.clock.toggle()`, with the same `/^(INPUT|SELECT|TEXTAREA)$/` focused-element guard already used for the arrows.

- [ ] **Step 3: Run the test**

Run `npm test -- PracticeView`; expect PASS.

- [ ] **Step 4: Run the gate + commit**

```bash
git add src/app/PracticeView.tsx src/app/PracticeView.test.tsx
git commit -m "feat: spacebar toggles play/pause"
```

---

## Self-review notes

- Spec §1 (tab restructure, one bar, FloatingHud + ExtendedTopBar removed, per-tab Tools, MIDI status chip): the status chip is deferred to Plan 2 (it needs `MidiInput`); everything else is Tasks 1–5.
- Spec §5 spacebar: Task 6. Reading-lane strip: Task 5.
- Spec §2–4, §6–7 (MIDI input, wait-mode, key-lighting, error handling): out of scope for Plan 1 — Plan 2.
- The `Clock.holdAt` change is intentionally in Plan 2, not here, since nothing in Plan 1 uses it.
