# Tab Independence — Implementation Plan (Plan 1 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Play and MIDI Practice tabs keep independent playback — each tab owns its playhead, loop, and tempo, and switching tabs never carries playback over.

**Architecture:** Keep one `Transport` and one rendering pipeline. Independence is achieved by snapshotting the live transport state when leaving a tab and restoring the entering tab's snapshot — a tab switch composes from existing operations (`pause`, `seek`, `setLoop`, `setBpm`). A new pure `tabSnapshot` module holds the logic; `PracticeView` owns one snapshot per tab in a ref; persistence stores per-tab `{bpm, loop}`.

**Tech Stack:** TypeScript (strict), React 19, Vitest + Testing Library, Playwright. Spec: `docs/superpowers/specs/2026-05-19-practice-mode-independence-design.md` §1.

---

### Task 1: `tabSnapshot` module — capture / apply / switch

**Files:**
- Create: `src/transport/tabSnapshot.ts`
- Test: `src/transport/tabSnapshot.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/transport/tabSnapshot.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { Score, Note } from "../model/score";
import { Transport } from "./transport";
import { captureTab, applyTab, switchTab } from "./tabSnapshot";
import type { TabSnapshot } from "./tabSnapshot";
import type { TabMode } from "../layout/practiceMode";

function makeScore(): Score {
  return {
    source: "midi",
    notes: [] as Note[],
    measures: [{ index: 0, start: 0, end: 4, numerator: 4, denominator: 4 }],
    pedalEvents: [],
    timeSignatures: [{ start: 0, numerator: 4, denominator: 4 }],
    tempoMap: [{ start: 0, bpm: 120 }],
    durationSeconds: 30,
    musicXml: "",
    qualityWarning: null,
  } satisfies Score;
}

describe("tabSnapshot", () => {
  it("captureTab reads position, loop, and bpm off the transport", () => {
    const t = new Transport(makeScore());
    t.clock.seek(7);
    t.clock.setLoop({ start: 2, end: 5 });
    t.setBpm(90);
    expect(captureTab(t)).toEqual({
      position: 7,
      loop: { start: 2, end: 5 },
      bpm: 90,
    });
  });

  it("captureTab clones the loop so later clock changes do not mutate it", () => {
    const t = new Transport(makeScore());
    t.clock.setLoop({ start: 1, end: 2 });
    const snap = captureTab(t);
    t.clock.setLoop({ start: 8, end: 9 });
    expect(snap.loop).toEqual({ start: 1, end: 2 });
  });

  it("applyTab writes a snapshot back onto the transport", () => {
    const t = new Transport(makeScore());
    applyTab({ position: 4, loop: { start: 1, end: 3 }, bpm: 60 }, t);
    expect(t.clock.position).toBe(4);
    expect(t.clock.loop).toEqual({ start: 1, end: 3 });
    expect(t.bpm).toBeCloseTo(60, 3);
  });

  it("applyTab clears the loop when the snapshot has none", () => {
    const t = new Transport(makeScore());
    t.clock.setLoop({ start: 1, end: 2 });
    applyTab({ position: 0, loop: null, bpm: 120 }, t);
    expect(t.clock.loop).toBeNull();
  });

  it("switchTab pauses, captures the leaving tab, restores the entering tab", () => {
    const t = new Transport(makeScore());
    const snapshots: Record<TabMode, TabSnapshot> = {
      play: { position: 0, loop: null, bpm: 120 },
      midi: { position: 12, loop: { start: 8, end: 10 }, bpm: 75 },
    };
    t.clock.seek(6);
    t.clock.play();

    switchTab(t, snapshots, "play", "midi");

    expect(snapshots.play).toEqual({ position: 6, loop: null, bpm: 120 });
    expect(t.clock.position).toBe(12);
    expect(t.clock.loop).toEqual({ start: 8, end: 10 });
    expect(t.bpm).toBeCloseTo(75, 3);
    expect(t.clock.playing).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/transport/tabSnapshot.test.ts`
Expected: FAIL — cannot resolve `./tabSnapshot`.

- [ ] **Step 3: Write the module**

Create `src/transport/tabSnapshot.ts`:

```ts
import type { Transport } from "./transport";
import type { Loop } from "./clock";
import type { TabMode } from "../layout/practiceMode";

/** A tab's independent transport state — playhead, loop region, tempo. */
export interface TabSnapshot {
  position: number;
  loop: Loop | null;
  bpm: number;
}

/** Read the transport's current state into a snapshot (loop cloned). */
export function captureTab(transport: Transport): TabSnapshot {
  const loop = transport.clock.loop;
  return {
    position: transport.clock.position,
    loop: loop ? { start: loop.start, end: loop.end } : null,
    bpm: transport.bpm,
  };
}

/** Write a snapshot back onto the transport. */
export function applyTab(snapshot: TabSnapshot, transport: Transport): void {
  transport.setBpm(snapshot.bpm);
  transport.clock.setLoop(
    snapshot.loop
      ? { start: snapshot.loop.start, end: snapshot.loop.end }
      : null,
  );
  transport.clock.seek(snapshot.position);
}

/**
 * Switch tabs: pause the clock, save the leaving tab's live state into
 * `snapshots`, and restore the entering tab's state onto the transport.
 * Switching always leaves the clock paused — a tab switch never auto-resumes.
 */
export function switchTab(
  transport: Transport,
  snapshots: Record<TabMode, TabSnapshot>,
  from: TabMode,
  to: TabMode,
): void {
  transport.clock.pause();
  snapshots[from] = captureTab(transport);
  applyTab(snapshots[to], transport);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/transport/tabSnapshot.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/transport/tabSnapshot.ts src/transport/tabSnapshot.test.ts
git commit -m "feat: add tabSnapshot module for per-tab transport state"
```

---

### Task 2: Per-tab persistence

**Files:**
- Modify: `src/library/db.ts` (the `StoredPracticeState` interface)
- Modify: `src/library/practiceState.ts`
- Test: `src/library/practiceState.test.ts`

- [ ] **Step 1: Add the `tabs` field to `StoredPracticeState`**

In `src/library/db.ts`, inside the `StoredPracticeState` interface, add this field directly after the `mode?: TabMode;` line:

```ts
  /** Per-tab transport state (optional; pre-this records fall back to bpm/loop). */
  tabs?: {
    play: { bpm: number; loop: { start: number; end: number } | null };
    midi: { bpm: number; loop: { start: number; end: number } | null };
  };
```

- [ ] **Step 2: Write the failing tests**

In `src/library/practiceState.test.ts`, add these imports at the top (after the existing imports):

```ts
import { seedTabSnapshots } from "./practiceState";
```

Then append this `describe` block to the end of the file:

```ts
describe("per-tab transport snapshots", () => {
  it("capturePracticeState records both tabs when given the tabs argument", () => {
    const t = new Transport(score);
    const hands = new HandState();
    const captured = capturePracticeState(t, hands, undefined, {
      mode: "midi",
      tabs: {
        play: { bpm: 120, loop: null },
        midi: { bpm: 80, loop: { start: 1, end: 3 } },
      },
    });
    expect(captured.tabs).toEqual({
      play: { bpm: 120, loop: null },
      midi: { bpm: 80, loop: { start: 1, end: 3 } },
    });
  });

  it("capturePracticeState omits tabs when the tabs argument is not given", () => {
    const t = new Transport(score);
    const hands = new HandState();
    expect(capturePracticeState(t, hands, undefined, { mode: "play" }).tabs)
      .toBeUndefined();
  });

  it("seedTabSnapshots returns the stored per-tab state", () => {
    const t = new Transport(score);
    const seeded = seedTabSnapshots(t, {
      bpm: 120,
      loop: null,
      leftMuted: false,
      rightMuted: false,
      tabs: {
        play: { bpm: 110, loop: null },
        midi: { bpm: 70, loop: { start: 2, end: 4 } },
      },
    });
    expect(seeded.play).toEqual({ position: 0, bpm: 110, loop: null });
    expect(seeded.midi).toEqual({
      position: 0,
      bpm: 70,
      loop: { start: 2, end: 4 },
    });
  });

  it("seedTabSnapshots falls back to the live transport for records with no tabs", () => {
    const t = new Transport(score);
    t.setBpm(95);
    t.clock.seek(1.5);
    const seeded = seedTabSnapshots(t, null);
    expect(seeded.play.bpm).toBeCloseTo(95, 3);
    expect(seeded.midi.bpm).toBeCloseTo(95, 3);
    expect(seeded.play.position).toBe(1.5);
    expect(seeded.midi.position).toBe(1.5);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/library/practiceState.test.ts`
Expected: FAIL — `seedTabSnapshots` is not exported; `tabs` argument is not accepted.

- [ ] **Step 4: Update `practiceState.ts`**

In `src/library/practiceState.ts`, add this import after the existing imports:

```ts
import { captureTab, type TabSnapshot } from "../transport/tabSnapshot";
```

Replace the `capturePracticeState` function's signature and body with:

```ts
/** Read the current tempo, loop, hand, and session settings. */
export function capturePracticeState(
  transport: Transport,
  hands: HandState,
  beat?: { numerator: number; denominator: number; subdivision: number },
  session?: {
    mode: TabMode;
    tabs?: Record<TabMode, { bpm: number; loop: { start: number; end: number } | null }>;
  },
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
      ...(session.tabs && {
        tabs: {
          play: {
            bpm: session.tabs.play.bpm,
            loop: session.tabs.play.loop
              ? { ...session.tabs.play.loop }
              : null,
          },
          midi: {
            bpm: session.tabs.midi.bpm,
            loop: session.tabs.midi.loop
              ? { ...session.tabs.midi.loop }
              : null,
          },
        },
      }),
    }),
  };
}
```

Then append this new function to the end of `src/library/practiceState.ts`:

```ts
/**
 * Build the per-tab snapshots for a freshly-opened piece. When the stored
 * record has per-tab state, use it (position is not persisted — starts at 0).
 * Otherwise both tabs seed from the live transport so they share its baseline.
 */
export function seedTabSnapshots(
  transport: Transport,
  state: StoredPracticeState | null,
): Record<TabMode, TabSnapshot> {
  if (!state?.tabs) {
    const base = captureTab(transport);
    return { play: { ...base }, midi: { ...base } };
  }
  return {
    play: {
      position: 0,
      bpm: state.tabs.play.bpm,
      loop: state.tabs.play.loop ? { ...state.tabs.play.loop } : null,
    },
    midi: {
      position: 0,
      bpm: state.tabs.midi.bpm,
      loop: state.tabs.midi.loop ? { ...state.tabs.midi.loop } : null,
    },
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/library/practiceState.test.ts`
Expected: PASS — all tests, including the four new ones.

- [ ] **Step 6: Commit**

```bash
git add src/library/db.ts src/library/practiceState.ts src/library/practiceState.test.ts
git commit -m "feat: persist per-tab transport state"
```

---

### Task 3: Wire snapshot/restore into `PracticeView`

**Files:**
- Modify: `src/app/PracticeView.tsx`

No unit test — `PracticeView` composes Verovio, audio, and canvas and is not unit-tested in this repo. Behaviour is verified by the existing suite staying green plus the e2e in Task 4.

- [ ] **Step 1: Add the imports**

In `src/app/PracticeView.tsx`, add after the existing `measureJumpTarget` import:

```ts
import {
  captureTab,
  applyTab,
  switchTab,
  type TabSnapshot,
} from "../transport/tabSnapshot";
```

And change the existing practiceState import to also bring in `seedTabSnapshots`:

```ts
import {
  capturePracticeState,
  applyPracticeState,
  seedTabSnapshots,
} from "../library/practiceState";
```

- [ ] **Step 2: Add the snapshots ref**

In `src/app/PracticeView.tsx`, directly after the `loadedStateRef` declaration
(`const loadedStateRef = useRef<StoredPracticeState | null>(null);`), add:

```ts
  // One transport snapshot per tab. Seeded once the stored state resolves.
  const snapshotsRef = useRef<Record<TabMode, TabSnapshot> | null>(null);
```

- [ ] **Step 3: Seed snapshots in the practice-state restore effect**

In `src/app/PracticeView.tsx`, in the third async IIFE of the mount effect,
replace these two lines:

```ts
      setMode(state?.mode === "midi" ? "midi" : "play");
      setPracticeReady(true);
```

with:

```ts
      const initialMode: TabMode = state?.mode === "midi" ? "midi" : "play";
      const snapshots = seedTabSnapshots(transport, state ?? null);
      applyTab(snapshots[initialMode], transport);
      snapshotsRef.current = snapshots;
      setMode(initialMode);
      setPracticeReady(true);
```

- [ ] **Step 4: Capture the active tab into the snapshots at unmount**

In `src/app/PracticeView.tsx`, in the mount effect's cleanup `return`, replace:

```ts
      void savePracticeState(
        pieceId,
        capturePracticeState(transport, handState, beat, {
          mode: modeRef.current,
        }),
      );
```

with:

```ts
      const snapshots = snapshotsRef.current;
      if (snapshots) snapshots[modeRef.current] = captureTab(transport);
      void savePracticeState(
        pieceId,
        capturePracticeState(transport, handState, beat, {
          mode: modeRef.current,
          ...(snapshots && { tabs: snapshots }),
        }),
      );
```

- [ ] **Step 5: Add the `switchMode` handler**

In `src/app/PracticeView.tsx`, directly before the `const isMidi = mode === "midi";`
line, add:

```ts
  // Switch tabs without carrying playback over: snapshot the leaving tab and
  // restore the entering tab. Always lands paused.
  function switchMode(next: TabMode): void {
    const snapshots = snapshotsRef.current;
    if (next === modeRef.current || !snapshots) {
      setMode(next);
      return;
    }
    switchTab(transport, snapshots, modeRef.current, next);
    setMode(next);
  }
```

- [ ] **Step 6: Point the TopBar at `switchMode`**

In `src/app/PracticeView.tsx`, in the `<TopBar ... />` element, change:

```tsx
        onModeChange={setMode}
```

to:

```tsx
        onModeChange={switchMode}
```

- [ ] **Step 7: Verify the gate is green**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: all pass; the full Vitest suite stays green.

- [ ] **Step 8: Commit**

```bash
git add src/app/PracticeView.tsx
git commit -m "feat: snapshot/restore transport state on tab switch"
```

---

### Task 4: e2e — playback does not carry over between tabs

**Files:**
- Modify: `tests/e2e/practice.spec.ts`

- [ ] **Step 1: Add the failing e2e test**

Append to `tests/e2e/practice.spec.ts`:

```ts
test("playback does not carry over between the Play and Practice tabs", async ({
  page,
}) => {
  await page.goto("/");
  await page.setInputFiles('input[type="file"]', "src/test/fixtures/clean.mid");
  await expect(page.locator("canvas.falldown-canvas")).toBeVisible({
    timeout: 15_000,
  });

  const time = page.locator(".top-bar .hud-time");
  const playBtn = page.locator(".top-bar .hud-play-btn");

  // Play on the Play tab for a moment, then pause.
  await playBtn.evaluate((el: HTMLButtonElement) => el.click());
  await page.waitForTimeout(1200);
  await playBtn.evaluate((el: HTMLButtonElement) => el.click());
  const playTabTime = await time.textContent();

  // Switch to MIDI Practice — its playhead is independent of the Play tab.
  await page.getByRole("button", { name: "MIDI Practice" }).click();
  const practiceTime = await time.textContent();
  expect(practiceTime).not.toBe(playTabTime);

  // Switch back to Play — its playhead is restored where it was left.
  await page
    .locator(".top-bar-modes")
    .getByRole("button", { name: "Play" })
    .click();
  expect(await time.textContent()).toBe(playTabTime);
});
```

- [ ] **Step 2: Run the e2e suite**

Run: `npm run e2e`
Expected: PASS — the new test plus all existing e2e tests are green.

If the new test fails because `playTabTime` is still `"0:00"` after 1.2 s of
playback, the audio/clock did not advance — re-check Task 3 wiring before
adjusting the test.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/practice.spec.ts
git commit -m "test: e2e for independent playback across tabs"
```

---

## Self-Review

- **Spec coverage (§1):** per-tab `{position, loop, bpm}` snapshot (Task 1);
  switch always pauses (Task 1 `switchTab` + test); shared settings untouched
  (only transport state is snapshotted); per-tab `{bpm, loop}` persistence with
  legacy fallback (Task 2); wired into the single `Transport` / pipeline
  (Task 3); no-carry-over verified (Task 4). Position persistence is
  intentionally backlog per the spec — `seedTabSnapshots` starts position at 0.
- **Placeholders:** none — every step has full code or an exact command.
- **Type consistency:** `TabSnapshot {position, loop, bpm}` is used identically
  across Tasks 1–3. `switchTab(transport, snapshots, from, to)` and
  `seedTabSnapshots(transport, state)` signatures match their call sites in
  Task 3. `capturePracticeState`'s `session.tabs` type
  (`Record<TabMode, {bpm, loop}>`) accepts a `Record<TabMode, TabSnapshot>`
  (TabSnapshot is a structural superset).
