# Feature I — Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist uploaded pieces and per-piece practice state in IndexedDB so the user can reopen a piece across sessions, search a library of saved pieces, and have its last tempo / loop / hand settings restored.

**Architecture:** `db.ts` is a thin promise wrapper over IndexedDB with two object stores — `pieces` (the raw uploaded file bytes + metadata) and `practiceState` (per-piece settings). `practiceState.ts` captures the current tempo/loop/hand settings into a plain object and applies a stored one back. `LibraryBrowser` is a React list+search UI. The landing screen combines the import view and the library; importing a file saves it; opening a library entry re-parses its bytes and restores its practice state. `PracticeView` saves practice state when it unmounts.

**Tech Stack:** TypeScript, IndexedDB, React 19, Vitest + React Testing Library, `fake-indexeddb` (an in-memory IndexedDB for tests — jsdom has none).

**Branch:** `feature/i-library`

---

## Notes for the implementer

- Repo root and working directory: `/Users/jeffreywan/Desktop/arpeggio`. Run all commands from there.
- Work on branch `feature/i-library` (the controller creates it before Task 1).
- Features A-H are merged into `main`. `npm test` (152 tests), lint, typecheck, build, e2e all green.
- Key APIs to read:
  - `src/import/importFile.ts` → `importFile(file: File): Promise<Score>`.
  - `src/transport/transport.ts` → `Transport` (`.bpm`, `.setBpm`, `.clock.loop`, `.clock.setLoop`).
  - `src/practice/hands.ts` → `HandState` (`.isMuted`/`.isHidden`/`.setMuted`/`.setHidden`).
  - `src/ui/ImportView.tsx`, `src/app/PracticeView.tsx`, `src/App.tsx`.
- `strict` TypeScript + `noUnusedLocals`/`noUnusedParameters` on. React: `react-jsx`, no `import React`.
- jsdom has NO IndexedDB. The `fake-indexeddb` package provides an in-memory one; `fake-indexeddb/auto` registers it as globals. It is added to the Vitest setup in Task 1.
- Commit after every task with the exact messages given.

---

## File / Folder Structure

```
src/
  library/
    db.ts              # IndexedDB wrapper: pieces + practiceState stores
    practiceState.ts   # capture/apply per-piece practice settings
    LibraryBrowser.tsx # searchable saved-pieces list
  test/setup.ts        # MODIFIED: import fake-indexeddb/auto
  ui/ImportView.tsx    # (unchanged — composed by the landing)
  app/PracticeView.tsx # MODIFIED: restore + save practice state
  App.tsx              # MODIFIED: landing = import + library
```

---

## Task 1: IndexedDB wrapper — `db.ts`

**Files:** Create `src/library/db.ts`, `src/library/db.test.ts`; modify `src/test/setup.ts`, `package.json`/`package-lock.json` (add `fake-indexeddb`).

- [ ] **Step 1: Install `fake-indexeddb`**

Run: `npm install -D fake-indexeddb`
Expected: added under `devDependencies`.

- [ ] **Step 2: Register it for tests — modify `src/test/setup.ts`**

Add this line at the TOP of `src/test/setup.ts` (before the existing imports):

```ts
import "fake-indexeddb/auto";
```

This gives every test an in-memory `indexedDB`.

- [ ] **Step 3: Write the failing test — `src/library/db.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  savePiece,
  listPieces,
  getPiece,
  deletePiece,
  savePracticeState,
  getPracticeState,
  clearLibrary,
} from "./db";

const bytes = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

beforeEach(async () => {
  await clearLibrary();
});

describe("library db — pieces", () => {
  it("saves a piece and lists it", async () => {
    const id = await savePiece("song.mid", bytes("hello"));
    expect(typeof id).toBe("string");
    const pieces = await listPieces();
    expect(pieces).toHaveLength(1);
    expect(pieces[0].name).toBe("song.mid");
    expect(pieces[0].id).toBe(id);
  });

  it("retrieves a saved piece's bytes", async () => {
    const id = await savePiece("song.mid", bytes("abc"));
    const piece = await getPiece(id);
    expect(piece).toBeDefined();
    expect(new TextDecoder().decode(piece!.data)).toBe("abc");
  });

  it("deletes a piece", async () => {
    const id = await savePiece("song.mid", bytes("x"));
    await deletePiece(id);
    expect(await listPieces()).toHaveLength(0);
    expect(await getPiece(id)).toBeUndefined();
  });
});

describe("library db — practice state", () => {
  it("saves and retrieves per-piece practice state", async () => {
    const id = await savePiece("song.mid", bytes("x"));
    await savePracticeState(id, {
      bpm: 90,
      loop: { start: 1, end: 3 },
      leftMuted: true,
      rightMuted: false,
      leftHidden: false,
      rightHidden: true,
    });
    const state = await getPracticeState(id);
    expect(state).toEqual({
      bpm: 90,
      loop: { start: 1, end: 3 },
      leftMuted: true,
      rightMuted: false,
      leftHidden: false,
      rightHidden: true,
    });
  });

  it("returns undefined when a piece has no saved state", async () => {
    const id = await savePiece("song.mid", bytes("x"));
    expect(await getPracticeState(id)).toBeUndefined();
  });
});
```

- [ ] **Step 4: Run it — confirm it fails**

Run: `npm test -- library/db`
Expected: FAIL.

- [ ] **Step 5: Implement `src/library/db.ts`**

```ts
/**
 * IndexedDB persistence for the piece library. Two object stores: `pieces`
 * (raw uploaded file bytes + metadata) and `practiceState` (per-piece settings).
 */

/** A stored uploaded piece. */
export interface StoredPiece {
  id: string;
  name: string;
  data: ArrayBuffer;
  addedAt: number;
}

/** Per-piece practice settings persisted across sessions. */
export interface StoredPracticeState {
  bpm: number;
  loop: { start: number; end: number } | null;
  leftMuted: boolean;
  rightMuted: boolean;
  leftHidden: boolean;
  rightHidden: boolean;
}

const DB_NAME = "arpeggio";
const DB_VERSION = 1;
const PIECES = "pieces";
const PRACTICE = "practiceState";

/** Wrap an IDBRequest as a promise. */
function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;

/** Open (once) the Arpeggio IndexedDB database, creating the stores. */
function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(PIECES)) {
          db.createObjectStore(PIECES, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(PRACTICE)) {
          db.createObjectStore(PRACTICE, { keyPath: "pieceId" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

/** Run `fn` against a store in a transaction and await the transaction. */
async function withStore<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const db = await openDb();
  const tx = db.transaction(store, mode);
  const result = await fn(tx.objectStore(store));
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  return result;
}

/** Save an uploaded file's bytes; returns the new piece id. */
export async function savePiece(
  name: string,
  data: ArrayBuffer,
): Promise<string> {
  const id =
    globalThis.crypto?.randomUUID?.() ??
    `p-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const piece: StoredPiece = { id, name, data, addedAt: Date.now() };
  await withStore(PIECES, "readwrite", (s) => promisify(s.put(piece)));
  return id;
}

/** All saved pieces, newest first. */
export async function listPieces(): Promise<StoredPiece[]> {
  const all = await withStore(PIECES, "readonly", (s) =>
    promisify(s.getAll() as IDBRequest<StoredPiece[]>),
  );
  return all.sort((a, b) => b.addedAt - a.addedAt);
}

/** A saved piece by id, or undefined. */
export async function getPiece(id: string): Promise<StoredPiece | undefined> {
  return withStore(PIECES, "readonly", (s) =>
    promisify(s.get(id) as IDBRequest<StoredPiece | undefined>),
  );
}

/** Delete a saved piece and its practice state. */
export async function deletePiece(id: string): Promise<void> {
  await withStore(PIECES, "readwrite", (s) => promisify(s.delete(id)));
  await withStore(PRACTICE, "readwrite", (s) => promisify(s.delete(id)));
}

/** Save per-piece practice settings. */
export async function savePracticeState(
  pieceId: string,
  state: StoredPracticeState,
): Promise<void> {
  await withStore(PRACTICE, "readwrite", (s) =>
    promisify(s.put({ pieceId, ...state })),
  );
}

/** Retrieve per-piece practice settings, or undefined if none saved. */
export async function getPracticeState(
  pieceId: string,
): Promise<StoredPracticeState | undefined> {
  const record = await withStore(PRACTICE, "readonly", (s) =>
    promisify(
      s.get(pieceId) as IDBRequest<
        (StoredPracticeState & { pieceId: string }) | undefined
      >,
    ),
  );
  if (!record) return undefined;
  const { pieceId: _omit, ...state } = record;
  return state;
}

/** Remove every piece and practice-state record (used by tests). */
export async function clearLibrary(): Promise<void> {
  await withStore(PIECES, "readwrite", (s) => promisify(s.clear()));
  await withStore(PRACTICE, "readwrite", (s) => promisify(s.clear()));
}
```

- [ ] **Step 6: Run the tests — confirm they pass**

Run: `npm test -- library/db`
Expected: PASS (5 tests).

- [ ] **Step 7: Typecheck, lint, full suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all pass. (Importing `fake-indexeddb/auto` in `setup.ts` must not break
any existing test.)

- [ ] **Step 8: Commit**

```bash
git add src/library/db.ts src/library/db.test.ts src/test/setup.ts package.json package-lock.json
git commit -m "feat: add IndexedDB library storage"
```

---

## Task 2: Practice-state capture/apply — `practiceState.ts`

**Files:** Create `src/library/practiceState.ts`, `src/library/practiceState.test.ts`

`practiceState.ts` reads the current tempo / loop / hand settings off the live
objects into a plain `StoredPracticeState`, and applies a stored one back.

- [ ] **Step 1: Write the failing test — `src/library/practiceState.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { capturePracticeState, applyPracticeState } from "./practiceState";
import { Transport } from "../transport/transport";
import { HandState } from "../practice/hands";
import type { Score } from "../model/score";

const score = {
  source: "midi",
  notes: [],
  measures: [
    { index: 0, start: 0, end: 2, numerator: 4, denominator: 4 },
    { index: 1, start: 2, end: 4, numerator: 4, denominator: 4 },
  ],
  pedalEvents: [],
  timeSignatures: [{ start: 0, numerator: 4, denominator: 4 }],
  tempoMap: [{ start: 0, bpm: 120 }],
  durationSeconds: 4,
  musicXml: "",
  qualityWarning: null,
} satisfies Score;

describe("capturePracticeState", () => {
  it("captures tempo, loop, and hand settings", () => {
    const t = new Transport(score);
    t.setBpm(90);
    t.clock.setLoop({ start: 1, end: 3 });
    const hands = new HandState();
    hands.setMuted("left", true);
    hands.setHidden("right", true);
    const state = capturePracticeState(t, hands);
    expect(state.bpm).toBeCloseTo(90, 3);
    expect(state.loop).toEqual({ start: 1, end: 3 });
    expect(state.leftMuted).toBe(true);
    expect(state.rightMuted).toBe(false);
    expect(state.rightHidden).toBe(true);
  });
});

describe("applyPracticeState", () => {
  it("restores tempo, loop, and hand settings", () => {
    const t = new Transport(score);
    const hands = new HandState();
    applyPracticeState(
      {
        bpm: 75,
        loop: { start: 2, end: 4 },
        leftMuted: false,
        rightMuted: true,
        leftHidden: true,
        rightHidden: false,
      },
      t,
      hands,
    );
    expect(t.bpm).toBeCloseTo(75, 3);
    expect(t.clock.loop).toEqual({ start: 2, end: 4 });
    expect(hands.isMuted("right")).toBe(true);
    expect(hands.isHidden("left")).toBe(true);
  });

  it("round-trips through capture", () => {
    const t = new Transport(score);
    t.setBpm(100);
    const hands = new HandState();
    hands.setMuted("right", true);
    const captured = capturePracticeState(t, hands);

    const t2 = new Transport(score);
    const hands2 = new HandState();
    applyPracticeState(captured, t2, hands2);
    expect(capturePracticeState(t2, hands2)).toEqual(captured);
  });
});
```

- [ ] **Step 2: Run it — confirm it fails**

Run: `npm test -- practiceState`
Expected: FAIL.

- [ ] **Step 3: Implement `src/library/practiceState.ts`**

```ts
import type { Transport } from "../transport/transport";
import type { HandState } from "../practice/hands";
import type { StoredPracticeState } from "./db";

/** Read the current tempo, loop, and hand settings into a plain object. */
export function capturePracticeState(
  transport: Transport,
  hands: HandState,
): StoredPracticeState {
  const loop = transport.clock.loop;
  return {
    bpm: transport.bpm,
    loop: loop ? { start: loop.start, end: loop.end } : null,
    leftMuted: hands.isMuted("left"),
    rightMuted: hands.isMuted("right"),
    leftHidden: hands.isHidden("left"),
    rightHidden: hands.isHidden("right"),
  };
}

/** Apply a stored practice state onto the live transport and hand state. */
export function applyPracticeState(
  state: StoredPracticeState,
  transport: Transport,
  hands: HandState,
): void {
  transport.setBpm(state.bpm);
  transport.clock.setLoop(state.loop ? { ...state.loop } : null);
  hands.setMuted("left", state.leftMuted);
  hands.setMuted("right", state.rightMuted);
  hands.setHidden("left", state.leftHidden);
  hands.setHidden("right", state.rightHidden);
}
```

- [ ] **Step 4: Run the tests — confirm they pass**

Run: `npm test -- practiceState`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/library/practiceState.ts src/library/practiceState.test.ts
git commit -m "feat: add practice-state capture and apply"
```

---

## Task 3: Library browser — `LibraryBrowser.tsx`

**Files:** Create `src/library/LibraryBrowser.tsx`, `src/library/LibraryBrowser.test.tsx`

`LibraryBrowser` lists saved pieces with a search box; selecting one calls
`onOpen(id)`, and each row has a delete button.

- [ ] **Step 1: Write the failing test — `src/library/LibraryBrowser.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LibraryBrowser } from "./LibraryBrowser";
import { savePiece, clearLibrary } from "./db";

const bytes = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

beforeEach(async () => {
  await clearLibrary();
});

describe("LibraryBrowser", () => {
  it("lists saved pieces", async () => {
    await savePiece("Chopin Ballade.mid", bytes("x"));
    await savePiece("Moonlight.musicxml", bytes("y"));
    render(<LibraryBrowser onOpen={() => {}} />);
    await waitFor(() =>
      expect(screen.getByText("Chopin Ballade.mid")).toBeInTheDocument(),
    );
    expect(screen.getByText("Moonlight.musicxml")).toBeInTheDocument();
  });

  it("filters the list by the search box", async () => {
    await savePiece("Chopin Ballade.mid", bytes("x"));
    await savePiece("Moonlight.musicxml", bytes("y"));
    render(<LibraryBrowser onOpen={() => {}} />);
    await waitFor(() =>
      expect(screen.getByText("Chopin Ballade.mid")).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "moon" },
    });
    expect(screen.queryByText("Chopin Ballade.mid")).not.toBeInTheDocument();
    expect(screen.getByText("Moonlight.musicxml")).toBeInTheDocument();
  });

  it("calls onOpen with the piece id when a piece is clicked", async () => {
    const id = await savePiece("Chopin Ballade.mid", bytes("x"));
    const onOpen = vi.fn();
    render(<LibraryBrowser onOpen={onOpen} />);
    await waitFor(() =>
      expect(screen.getByText("Chopin Ballade.mid")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText("Chopin Ballade.mid"));
    expect(onOpen).toHaveBeenCalledWith(id);
  });

  it("removes a piece when its delete button is clicked", async () => {
    await savePiece("Chopin Ballade.mid", bytes("x"));
    render(<LibraryBrowser onOpen={() => {}} />);
    await waitFor(() =>
      expect(screen.getByText("Chopin Ballade.mid")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    await waitFor(() =>
      expect(screen.queryByText("Chopin Ballade.mid")).not.toBeInTheDocument(),
    );
  });
});
```

- [ ] **Step 2: Run it — confirm it fails**

Run: `npm test -- LibraryBrowser`
Expected: FAIL.

- [ ] **Step 3: Implement `src/library/LibraryBrowser.tsx`**

Design:

- Import `useState`, `useEffect` from `"react"`; `listPieces`, `deletePiece`,
  `type StoredPiece` from `./db`.
- Props: `{ onOpen: (id: string) => void }`.
- State: `pieces` (`StoredPiece[]`), `query` (string).
- On mount (`useEffect`, `[]` deps): `listPieces()` → `setPieces`. Also expose a
  `refresh` function that re-runs `listPieces()`.
- Render `<div className="library-browser">`:
  - An `<input type="search">` (this is `role="searchbox"`),
    `value={query}`, `onChange` → `setQuery`.
  - The filtered list: `pieces.filter(p => p.name.toLowerCase().includes(
query.toLowerCase().trim()))`. For each piece, a row with:
    - A clickable element showing `piece.name` → on click `onOpen(piece.id)`.
      (Use a `<button>` for the name, or a row with an accessible click target.
      The test does `getByText(piece.name)` then `click` — make the element
      bearing the name clickable, e.g. `<button>{piece.name}</button>`.)
    - A delete `<button>` with accessible name containing "Delete" (e.g.
      `aria-label={\`Delete ${piece.name}\`}`) → on click `await
      deletePiece(piece.id)`then`refresh()`.
  - If `pieces` is empty, show a small "No saved pieces yet" message.
- Style class `library-browser` — add a brief block to `theme.css` (a vertical
  list, on-theme). Keep it short.

- [ ] **Step 4: Run the tests — confirm they pass**

Run: `npm test -- LibraryBrowser`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/library/LibraryBrowser.tsx src/library/LibraryBrowser.test.tsx src/styles/theme.css
git commit -m "feat: add searchable library browser"
```

---

## Task 4: Wire the library into the app

**Files:** Modify `src/App.tsx`, `src/app/PracticeView.tsx`, `src/App.test.tsx`; create `tests/e2e/library.spec.ts`.

The landing screen becomes import + library; importing saves the piece; opening
a library entry restores its practice state; `PracticeView` saves state on exit.

- [ ] **Step 1: Modify `src/App.tsx`**

App holds a small state machine. Type a loaded session as
`{ score: Score; pieceId: string }`.

- State: `session` (`{ score, pieceId } | null`).
- When `null`, render the landing: the `ImportView` AND the `LibraryBrowser`
  together (e.g. both inside a `<div className="landing">`).
- `ImportView`'s `onLoaded` currently gives a `Score`. CHANGE the flow so the
  landing also gets the original `File`: the simplest approach — give `App` a
  handler `handleImported(file: File, score: Score)` and have `ImportView` call
  `onLoaded(score)` AND expose the file. To keep `ImportView` changes minimal,
  change `ImportView`'s `onLoaded` prop to `onLoaded(score: Score, file: File)`
  (it already has the `File` in `handleFile`). Update `ImportView` to pass the
  file, and update its existing test if the signature change breaks it.
  - On import: `const id = await savePiece(file.name, await file.arrayBuffer());`
    then `setSession({ score, pieceId: id })`.
- `LibraryBrowser`'s `onOpen(id)`: `const piece = await getPiece(id)`; if found,
  `const score = await importFile(new File([piece.data], piece.name))`;
  `setSession({ score, pieceId: id })`.
- When `session` is non-null, render `<PracticeView score={session.score}
pieceId={session.pieceId} />`.
- A way back to the landing: pass an `onExit` callback to `PracticeView` (a
  "Back to library" affordance) — optional but recommended; if you add it,
  `PracticeView` renders a small "Library" button that calls `onExit()`, and
  `App` sets `session` back to `null`. If you keep it minimal, at least make
  sure `PracticeView` saves state before the session ends (see Step 2).

- [ ] **Step 2: Modify `src/app/PracticeView.tsx`**

- Add `pieceId: string` to its props (and `onExit?: () => void` if you added
  the back affordance).
- On mount, after the `Transport` and `HandState` exist: load and apply the
  stored practice state — `getPracticeState(pieceId)` → if present,
  `applyPracticeState(state, transport, handState)`. Do this before/around the
  same mount effect; guard with the existing `cancelled` flag.
- On unmount (the mount effect's cleanup, or a dedicated effect): capture and
  save — `void savePracticeState(pieceId, capturePracticeState(transport,
handState))`. (Saving in cleanup is fine; it is fire-and-forget.)
- If you added `onExit`, render a small "Library" / "Back" button in the header
  that calls `onExit`.

- [ ] **Step 3: Update `src/App.test.tsx`**

The Feature G `App.test.tsx` asserts the import prompt renders. With the landing
now also rendering `LibraryBrowser` (which calls `listPieces()` — async, uses the
`fake-indexeddb` registered in `setup.ts`), the test should still pass: the
import prompt text is still present. Run it; if the `LibraryBrowser`'s async
`listPieces` causes an act() warning or failure, make the test async and use
`findByText` for the import prompt. Keep the assertion meaningful (the landing
shows the import prompt).

- [ ] **Step 4: Write the e2e test — `tests/e2e/library.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

test("imported pieces appear in the library after reload", async ({ page }) => {
  await page.goto("/");
  await page.setInputFiles('input[type="file"]', "src/test/fixtures/clean.mid");
  await expect(page.getByRole("button", { name: /play/i })).toBeVisible({
    timeout: 15_000,
  });
  // Reload — the piece should now be listed in the library on the landing.
  await page.goto("/");
  await expect(page.getByText("clean.mid")).toBeVisible({ timeout: 10_000 });
});
```

(If you added an `onExit` "Library" button, the test could instead click it
rather than reloading — either is fine; the reload version proves persistence.)

- [ ] **Step 5: Full verification**

Run: `npm run lint && npm run typecheck && npm test && npm run build && npm run e2e`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/app/PracticeView.tsx src/App.test.tsx \
  src/ui/ImportView.tsx src/ui/ImportView.test.tsx tests/e2e/library.spec.ts
git commit -m "feat: wire the library into the app with persistent practice state"
```

(Include `ImportView.tsx`/`ImportView.test.tsx` only if you changed the
`onLoaded` signature.)

---

## Feature I — Definition of Done

- `db.ts` persists pieces and practice state in IndexedDB.
- `practiceState.ts` captures/applies tempo, loop, and hand settings.
- `LibraryBrowser` lists, searches, opens, and deletes saved pieces.
- Importing a file saves it to the library; opening a library entry restores its
  practice state; `PracticeView` saves state when the session ends.
- All unit/component tests pass; `npm run lint`, `npm run typecheck`,
  `npm test`, `npm run build`, `npm run e2e` all green.
- `docs/features/I-library.md` updated: status Done, changes log + testing.

## Manual-test checklist (for the feature doc)

- Import a piece, practice (change tempo, set a loop, mute a hand), leave; reload
  the app — the piece is in the library; reopening it restores the tempo, loop,
  and hand settings. Search filters the list. Delete removes a piece.
