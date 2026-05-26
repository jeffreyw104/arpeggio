# Library Visual Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Library page's flat list with a "Continue practicing" hero card plus a denser, more informative row list — including a MIDI-vs-MusicXML comparison surface (inline empty state + persistent header popover). One additive schema field (`lastOpenedAt`), no DB version bump, no new playback features.

**Architecture:** Schema gets a single optional timestamp on `StoredPiece` plus a `touchPiece(id)` helper, called fire-and-forget at both `PracticeView` entry points in `src/App.tsx`. The library UI decomposes into colocated sub-components (`Hero`, `Row`, `KebabMenu`, `FormatInfoPill`, `FormatCompare`, `EmptyState`) inside the existing `src/library/LibraryBrowser.tsx`. Format detection (`detectType`) and a new `relativeTime` utility power the per-piece metadata. CSS lives in `src/styles/theme.css`, replacing the existing `--- Library browser ---` block.

**Tech Stack:** TypeScript (strict), React 19, Vitest + React Testing Library for unit tests, Playwright for e2e, IndexedDB for persistence. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-26-library-visual-revamp-design.md`

---

## Conventions

- **Tests are co-located** with the module they test (`foo.ts` ↔ `foo.test.ts`, `foo.tsx` ↔ `foo.test.tsx`).
- **TDD throughout** — failing test first, then minimum code to pass, then commit.
- **Commit after each task** with a descriptive `feat(library): …` or `feat(styles): …` message.
- **No DOM in pure modules.** `db.ts`, `relativeTime.ts` import nothing from React.
- **Run the full verify gate** at the end (`npm run lint && npm run typecheck && npm test && npm run build && npm run e2e`).

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/library/db.ts` | modify | Add optional `lastOpenedAt` to `StoredPiece`, new `touchPiece(id)` function, update `listPieces` sort. |
| `src/library/db.test.ts` | modify | Cover `touchPiece` + new sort behavior. |
| `src/library/relativeTime.ts` | create | Pure utility: `formatRelative(timestamp, now?)` → `"today"`, `"yesterday"`, `"3 days ago"`, etc. |
| `src/library/relativeTime.test.ts` | create | Banded coverage with injected clock. |
| `src/App.tsx` | modify | Wire `touchPiece(id)` into both `handleImported` and `handleOpen`. |
| `src/library/LibraryBrowser.tsx` | rewrite | Top-level component plus colocated sub-components: `Hero`, `Row`, `KebabMenu`, `FormatInfoPill`, `FormatCompare`, `EmptyState`. Public export remains `LibraryBrowser`. |
| `src/library/LibraryBrowser.test.tsx` | rewrite | Keep existing list/search/rename/delete coverage; add hero, popover, empty-state, and kebab-menu tests. |
| `src/styles/theme.css` | modify | New tokens (`--border-soft`, `--warm`, `--warm-soft`), replacement of the `--- Library browser ---` block. |
| `tests/e2e/library.spec.ts` | modify | Add two flows verifying the hero across reloads. |
| `docs/features/I-library.md` | modify | Changes-log bullet + keywords + manual checklist additions. |
| `HANDOVER.md` | modify | One-paragraph note under the Library section. |

---

## Task 1: `lastOpenedAt` schema, `touchPiece`, sort change

**Files:**
- Modify: `src/library/db.ts`
- Modify: `src/library/db.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/library/db.test.ts`:

```ts
import { savePiece, listPieces, touchPiece } from "./db";

describe("touchPiece + lastOpenedAt", () => {
  it("touchPiece sets lastOpenedAt to a positive number", async () => {
    const id = await savePiece("a.mid", new ArrayBuffer(4));
    await touchPiece(id);
    const pieces = await listPieces();
    const found = pieces.find((p) => p.id === id);
    expect(found?.lastOpenedAt).toBeGreaterThan(0);
  });

  it("touchPiece on a missing id is a no-op (no throw)", async () => {
    await expect(touchPiece("nonexistent")).resolves.toBeUndefined();
  });

  it("listPieces sorts by lastOpenedAt desc, fallback addedAt", async () => {
    const older = await savePiece("older.mid", new ArrayBuffer(4));
    await new Promise((r) => setTimeout(r, 5));
    const newer = await savePiece("newer.mid", new ArrayBuffer(4));
    // Initially newer is first (by addedAt fallback).
    let pieces = await listPieces();
    expect(pieces[0].id).toBe(newer);
    // Touch the older piece — it should jump to the top.
    await new Promise((r) => setTimeout(r, 5));
    await touchPiece(older);
    pieces = await listPieces();
    expect(pieces[0].id).toBe(older);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/library/db.test.ts`
Expected: FAIL — `touchPiece` is not exported from `./db`.

- [ ] **Step 3: Add `lastOpenedAt` to the interface**

Edit `src/library/db.ts`, in the `StoredPiece` interface:

```ts
export interface StoredPiece {
  id: string;
  name: string;
  data: ArrayBuffer;
  addedAt: number;
  /** Wall-clock time of the most recent open. Optional — undefined for
   *  records saved before this field existed, and for pieces that have
   *  only been imported without ever being routed through App's open
   *  handler. Used to drive the library hero and the row sort order. */
  lastOpenedAt?: number;
}
```

- [ ] **Step 4: Add the `touchPiece` function**

Add after `renamePiece`:

```ts
/** Record that a piece was opened. No-op if the piece doesn't exist. */
export async function touchPiece(id: string): Promise<void> {
  await withStore(PIECES, "readwrite", async (s) => {
    const piece = (await promisify(s.get(id))) as StoredPiece | undefined;
    if (!piece) return;
    await promisify(s.put({ ...piece, lastOpenedAt: Date.now() }));
  });
}
```

- [ ] **Step 5: Update `listPieces` sort**

Replace the existing sort in `listPieces`:

```ts
export async function listPieces(): Promise<StoredPiece[]> {
  const all = await withStore(PIECES, "readonly", (s) =>
    promisify(s.getAll() as IDBRequest<StoredPiece[]>),
  );
  return all.sort((a, b) => {
    const aKey = a.lastOpenedAt ?? a.addedAt;
    const bKey = b.lastOpenedAt ?? b.addedAt;
    return bKey - aKey;
  });
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/library/db.test.ts`
Expected: PASS (all original tests still green + 3 new ones).

- [ ] **Step 7: Commit**

```bash
git add src/library/db.ts src/library/db.test.ts
git commit -m "feat(library): add lastOpenedAt + touchPiece, sort by recent activity"
```

---

## Task 2: Wire `touchPiece` into App entry points

**Files:**
- Modify: `src/App.tsx`

There is no isolated unit test for `App.tsx` — the existing Playwright e2e for the library covers this end-to-end (and Task 11 below extends it). This task is a 2-line edit guarded by typecheck.

- [ ] **Step 1: Import `touchPiece`**

Edit the top imports in `src/App.tsx`:

```ts
import { savePiece, getPiece, touchPiece } from "./library/db";
```

- [ ] **Step 2: Touch in `handleImported`**

Replace the function body:

```ts
async function handleImported(score: Score, file: File) {
  const id = await savePiece(file.name, await file.arrayBuffer());
  void touchPiece(id);
  setSession({ score, pieceId: id, pieceName: file.name });
}
```

- [ ] **Step 3: Touch in `handleOpen`**

Replace the function body:

```ts
async function handleOpen(id: string) {
  const piece = await getPiece(id);
  if (!piece) return;
  void touchPiece(id);
  const score = await importFile(new File([piece.data], piece.name));
  setSession({ score, pieceId: id, pieceName: piece.name });
}
```

- [ ] **Step 4: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat(library): touchPiece on every PracticeView entry"
```

---

## Task 3: `relativeTime` utility

**Files:**
- Create: `src/library/relativeTime.ts`
- Create: `src/library/relativeTime.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/library/relativeTime.test.ts
import { describe, it, expect } from "vitest";
import { formatRelative } from "./relativeTime";

const NOW = new Date("2026-05-26T12:00:00Z").getTime();
const DAY = 24 * 60 * 60 * 1000;

describe("formatRelative", () => {
  it("returns 'today' for the same day", () => {
    expect(formatRelative(NOW, NOW)).toBe("today");
    expect(formatRelative(NOW - 3 * 60 * 60 * 1000, NOW)).toBe("today");
  });

  it("returns 'yesterday' for the previous day", () => {
    expect(formatRelative(NOW - DAY, NOW)).toBe("yesterday");
  });

  it("returns 'N days ago' for 2-6 days", () => {
    expect(formatRelative(NOW - 2 * DAY, NOW)).toBe("2 days ago");
    expect(formatRelative(NOW - 6 * DAY, NOW)).toBe("6 days ago");
  });

  it("returns 'N weeks ago' for 7-27 days", () => {
    expect(formatRelative(NOW - 7 * DAY, NOW)).toBe("1 week ago");
    expect(formatRelative(NOW - 14 * DAY, NOW)).toBe("2 weeks ago");
    expect(formatRelative(NOW - 27 * DAY, NOW)).toBe("3 weeks ago");
  });

  it("returns 'N months ago' for 28+ days", () => {
    expect(formatRelative(NOW - 28 * DAY, NOW)).toBe("1 month ago");
    expect(formatRelative(NOW - 60 * DAY, NOW)).toBe("2 months ago");
    expect(formatRelative(NOW - 365 * DAY, NOW)).toBe("12 months ago");
  });

  it("uses the system clock when no `now` arg is supplied", () => {
    // Same-second call should always be 'today'.
    expect(formatRelative(Date.now())).toBe("today");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/library/relativeTime.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `formatRelative`**

```ts
// src/library/relativeTime.ts

/** Format a timestamp as a coarse relative phrase.
 *  Bands: today / yesterday / N days / N weeks / N months. */
export function formatRelative(timestamp: number, now: number = Date.now()): string {
  const ms = now - timestamp;
  const day = 24 * 60 * 60 * 1000;

  // Same calendar day check is not strict — anything < 1 day diff is "today".
  if (ms < day) return "today";
  if (ms < 2 * day) return "yesterday";

  const days = Math.floor(ms / day);
  if (days < 7) return `${days} days ago`;

  if (days < 28) {
    const weeks = Math.floor(days / 7);
    return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
  }

  const months = Math.floor(days / 28);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/library/relativeTime.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/library/relativeTime.ts src/library/relativeTime.test.ts
git commit -m "feat(library): add formatRelative utility"
```

---

## Task 4: CSS — new tokens + library-browser block

**Files:**
- Modify: `src/styles/theme.css`

No unit test for CSS. Visual confirmation comes via Playwright (Task 11) and the manual checklist.

- [ ] **Step 1: Add new tokens to `:root`**

Edit `src/styles/theme.css`, in the `:root` block (currently lines 1–10), add three lines:

```css
:root {
  --bg: #0b0b0d;
  --panel: #131316;
  --border: #2a2a30;
  --text: #e6e6ea;
  --text-dim: #9a9aa6;
  --accent: #4a8;
  --accent-soft: rgba(68, 170, 136, 0.18);
  --accent-glow: rgba(68, 170, 136, 0.4);
  /* --- new for library revamp --- */
  --border-soft: #1f1f25;
  --warm: #d9a55a;
  --warm-soft: rgba(217, 165, 90, 0.18);
}
```

- [ ] **Step 2: Replace the `--- Library browser ---` block**

Find the existing block (around line 1139–1212 today, starting with `/* --- Library browser --- */`). Replace the entire block — through `.library-browser .library-empty { ... }` — with:

```css
/* --- Library browser --- */

.library-browser {
  max-width: 760px;
  margin: 0 auto;
  padding: 8px 4px 24px;
}

.library-browser .lib-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 18px;
  flex-wrap: wrap;
  gap: 8px;
}
.library-browser .lib-head h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.015em;
}
.library-browser .lib-head .lib-head-right {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-dim);
  font-size: 12px;
}

/* --- ⓘ MIDI vs MusicXML pill + popover --- */

.library-browser .lib-info-wrap {
  position: relative;
}
.library-browser .lib-info-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-dim);
  font-size: 12px;
  background: transparent;
  border: 1px solid var(--border);
  padding: 5px 10px;
  border-radius: 6px;
  cursor: pointer;
}
.library-browser .lib-info-pill .dot {
  color: var(--accent);
  font-weight: 700;
}
.library-browser .lib-info-pill:hover {
  color: var(--accent);
  border-color: rgba(68, 170, 136, 0.4);
}
.library-browser .lib-info-popover {
  position: absolute;
  top: 38px;
  right: 0;
  width: 480px;
  background: #1a1a20;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px;
  z-index: 10;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6);
}
.library-browser .lib-info-popover .pop-label {
  margin: 0 0 10px;
  font-size: 10px;
  letter-spacing: 0.12em;
  color: var(--text-dim);
  text-transform: uppercase;
  font-weight: 600;
}

/* --- hero --- */

.library-browser .lib-hero {
  position: relative;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 22px 26px;
  background:
    radial-gradient(ellipse 70% 100% at 100% 0%, var(--accent-soft), transparent 60%),
    linear-gradient(180deg, #1a1a20, var(--panel));
  margin-bottom: 22px;
  overflow: hidden;
}
.library-browser .lib-hero::after {
  content: "";
  position: absolute;
  right: -40px;
  top: -40px;
  width: 200px;
  height: 200px;
  border-radius: 50%;
  background: radial-gradient(circle, var(--accent-glow), transparent 70%);
  opacity: 0.45;
  pointer-events: none;
}
.library-browser .lib-hero-grid {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 24px;
  align-items: center;
}
.library-browser .lib-hero-eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  letter-spacing: 0.14em;
  color: var(--accent);
  text-transform: uppercase;
  font-weight: 600;
  margin-bottom: 8px;
}
.library-browser .lib-hero-eyebrow::before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent-glow);
}
.library-browser .lib-hero h3 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  letter-spacing: -0.015em;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.library-browser .lib-hero-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-top: 10px;
  color: var(--text-dim);
  font-size: 13px;
  align-items: center;
}
.library-browser .lib-hero-meta .v {
  color: var(--text);
}
.library-browser .lib-hero-cta {
  background: var(--accent);
  color: #0b0b0d;
  padding: 11px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.1) inset,
    0 4px 12px var(--accent-glow);
}

/* --- list --- */

.library-browser .lib-list-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 0 2px 10px;
  color: var(--text-dim);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-weight: 600;
}

.library-browser input[type="search"] {
  width: 100%;
  box-sizing: border-box;
  background: var(--panel);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 14px;
  margin-bottom: 12px;
  font: inherit;
}

.library-browser .lib-rows {
  list-style: none;
  margin: 0;
  padding: 0;
}
.library-browser .lib-row {
  display: grid;
  grid-template-columns: 36px 1fr auto auto;
  align-items: center;
  gap: 14px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid transparent;
  position: relative;
}
.library-browser .lib-row + .lib-row {
  margin-top: 1px;
}
.library-browser .lib-row:hover,
.library-browser .lib-row.is-menu-open {
  background: var(--panel);
  border-color: var(--border-soft);
}

.library-browser .lib-chip {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
}
.library-browser .lib-chip-midi {
  background: var(--accent-soft);
  color: var(--accent);
}
.library-browser .lib-chip-xml {
  background: var(--warm-soft);
  color: var(--warm);
}

.library-browser .lib-name {
  background: transparent;
  border: none;
  color: var(--text);
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.3;
  text-align: left;
  padding: 0;
  cursor: pointer;
  display: block;
  width: 100%;
}
.library-browser .lib-name:hover {
  color: var(--accent);
}
.library-browser .lib-subline {
  color: var(--text-dim);
  font-size: 12px;
  margin-top: 2px;
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.library-browser .lib-subline .sep {
  opacity: 0.4;
}
.library-browser .lib-mute {
  color: var(--accent);
}

.library-browser .lib-stats {
  color: var(--text-dim);
  font-size: 12px;
  display: flex;
  gap: 12px;
  align-items: center;
  font-variant-numeric: tabular-nums;
}
.library-browser .lib-stats .v {
  color: var(--text);
}
.library-browser .lib-pill {
  background: var(--accent-soft);
  color: var(--accent);
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
}

.library-browser .lib-kebab {
  color: var(--text-dim);
  background: transparent;
  border: none;
  font-size: 18px;
  padding: 4px 8px;
  border-radius: 6px;
  opacity: 0;
  cursor: pointer;
  transition: opacity 0.15s;
}
.library-browser .lib-row:hover .lib-kebab,
.library-browser .lib-row.is-menu-open .lib-kebab {
  opacity: 0.8;
}
.library-browser .lib-kebab:hover {
  opacity: 1;
}

.library-browser .lib-menu {
  position: absolute;
  right: 8px;
  top: 44px;
  background: #1a1a20;
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  padding: 4px;
  min-width: 140px;
  z-index: 10;
}
.library-browser .lib-menu-item {
  display: block;
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  padding: 7px 12px;
  border-radius: 4px;
  font-size: 13px;
  color: var(--text);
  cursor: pointer;
}
.library-browser .lib-menu-item:hover {
  background: var(--accent-soft);
  color: var(--accent);
}
.library-browser .lib-menu-item.danger {
  color: #f08080;
}
.library-browser .lib-menu-item.danger:hover {
  background: rgba(240, 128, 128, 0.12);
  color: #f08080;
}
.library-browser .lib-menu-sep {
  height: 1px;
  background: var(--border);
  margin: 4px 2px;
}

.library-browser .lib-rename-input {
  background: var(--panel);
  color: var(--text);
  border: 1px solid var(--accent);
  border-radius: 6px;
  padding: 6px 10px;
  font: inherit;
  font-size: 14px;
  width: 100%;
}

/* --- empty state --- */

.library-browser .lib-empty {
  border: 1px dashed var(--border);
  border-radius: 12px;
  padding: 24px 22px;
}
.library-browser .lib-empty-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}
.library-browser .lib-empty-ico {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--panel);
  border: 1px solid var(--border);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--accent);
  font-size: 18px;
}
.library-browser .lib-empty h4 {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
}
.library-browser .lib-empty .lead {
  color: var(--text-dim);
  font-size: 13px;
  margin: 0 0 16px;
}

/* --- format compare (shared by empty state + popover) --- */

.library-browser .lib-compare {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.library-browser .lib-compare-col {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px 16px;
  background: linear-gradient(180deg, #1a1a20, var(--panel));
}
.library-browser .lib-compare-col.midi {
  border-color: rgba(68, 170, 136, 0.4);
}
.library-browser .lib-compare-col.xml {
  border-color: rgba(217, 165, 90, 0.4);
}
.library-browser .lib-compare-chip {
  display: inline-flex;
  align-items: center;
  padding: 3px 9px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  margin-bottom: 10px;
}
.library-browser .lib-compare-col.midi .lib-compare-chip {
  background: var(--accent-soft);
  color: var(--accent);
}
.library-browser .lib-compare-col.xml .lib-compare-chip {
  background: var(--warm-soft);
  color: var(--warm);
}
.library-browser .lib-compare-col h5 {
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 600;
}
.library-browser .lib-compare-col .desc {
  color: var(--text-dim);
  font-size: 12px;
  line-height: 1.5;
  margin-bottom: 12px;
}
.library-browser .lib-compare-col ul {
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 12.5px;
}
.library-browser .lib-compare-col li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 4px 0;
  color: var(--text);
}
.library-browser .lib-compare-col li::before {
  content: "✓";
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  margin-top: 1px;
}
.library-browser .lib-compare-col.midi li::before {
  color: var(--accent);
}
.library-browser .lib-compare-col.xml li::before {
  color: var(--warm);
}
.library-browser .lib-compare-col li.x::before {
  content: "—";
  color: var(--text-dim);
}
.library-browser .lib-compare-col li.x {
  color: var(--text-dim);
}
```

- [ ] **Step 3: Verify lint passes**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/styles/theme.css
git commit -m "feat(styles): replace library-browser CSS for revamp"
```

---

## Task 5: `FormatCompare` component

**Files:**
- Modify: `src/library/LibraryBrowser.tsx`
- Modify: `src/library/LibraryBrowser.test.tsx`

We're going to grow `LibraryBrowser.tsx` from a single component into a small set of colocated sub-components. This task adds the first one: `FormatCompare`. It is **not** exported from the module — it stays internal.

- [ ] **Step 1: Write the failing test**

Add to `src/library/LibraryBrowser.test.tsx` (top of file imports may need adjustment to import `render` from `@testing-library/react`; check existing imports first). Add a new `describe` block:

```tsx
import { render, screen, within } from "@testing-library/react";

describe("FormatCompare (via LibraryBrowser empty state)", () => {
  it("renders both MIDI and MUSICXML columns with their bullet content", () => {
    render(<LibraryBrowser onOpen={() => {}} />);
    // Empty state is the default — IDB starts empty in the test setup.
    return new Promise<void>((resolve) => {
      // Wait for the async listPieces effect to settle.
      setTimeout(() => {
        const midi = screen.getByTestId("lib-compare-midi");
        const xml = screen.getByTestId("lib-compare-xml");
        expect(within(midi).getByText(/MIDI/i)).toBeInTheDocument();
        expect(within(midi).getByText(/falldown/i)).toBeInTheDocument();
        expect(within(xml).getByText(/MUSICXML/i)).toBeInTheDocument();
        expect(within(xml).getByText(/engraved/i)).toBeInTheDocument();
        resolve();
      }, 50);
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/library/LibraryBrowser.test.tsx`
Expected: FAIL — empty state with format compare not implemented yet (will resolve in subsequent tasks; this test pins the expected DOM shape).

- [ ] **Step 3: Add `FormatCompare` to the module**

Edit `src/library/LibraryBrowser.tsx`. Below the existing imports and **above** the `LibraryBrowser` component, add:

```tsx
type FormatVariant = "full" | "compact";

interface FormatCompareProps {
  variant: FormatVariant;
}

function FormatCompare({ variant }: FormatCompareProps) {
  return (
    <div className="lib-compare">
      <div className="lib-compare-col midi" data-testid="lib-compare-midi">
        <span className="lib-compare-chip">MIDI</span>
        {variant === "full" && (
          <>
            <h5>Best for playing along</h5>
            <p className="desc">
              .mid / .midi files. Often exported from a DAW or downloaded as a
              performance.
            </p>
          </>
        )}
        <ul>
          <li>Exact falldown view (note timing is the source of truth)</li>
          <li>Auto-detected practice sections</li>
          <li>Bookmarks &amp; section navigator</li>
          <li className="x">Score notation is auto-generated &amp; approximate</li>
        </ul>
      </div>
      <div className="lib-compare-col xml" data-testid="lib-compare-xml">
        <span className="lib-compare-chip">MUSICXML</span>
        {variant === "full" && (
          <>
            <h5>Best for reading the score</h5>
            <p className="desc">
              .xml / .musicxml files. Authored notation from sheet-music
              software.
            </p>
          </>
        )}
        <ul>
          <li>Original engraved sheet music (verbatim)</li>
          <li>Accurate rhythms, articulations, accidentals</li>
          <li>Slim measure scrubber</li>
          <li className="x">No section navigator (uses engraved score instead)</li>
        </ul>
      </div>
    </div>
  );
}
```

(`FormatCompare` will be consumed by `EmptyState` and `FormatInfoPill` in later tasks. The test above won't fully pass until Task 7 wires up `EmptyState`. That's intentional — TDD a single end-to-end vertical at a time.)

- [ ] **Step 4: Verify typecheck still passes**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/library/LibraryBrowser.tsx src/library/LibraryBrowser.test.tsx
git commit -m "feat(library): add internal FormatCompare component"
```

---

## Task 6: `EmptyState` sub-component + wire it in

**Files:**
- Modify: `src/library/LibraryBrowser.tsx`
- Modify: `src/library/LibraryBrowser.test.tsx`

- [ ] **Step 1: Add empty-state expectations to the existing test**

Replace the current empty-state test in `LibraryBrowser.test.tsx`. The existing test asserts `"No saved pieces yet."` — we are removing that copy. Update to:

```tsx
it("shows an empty-state card with the format comparison when no pieces are saved", async () => {
  render(<LibraryBrowser onOpen={() => {}} />);
  // Wait for IDB read.
  await screen.findByTestId("lib-empty");
  expect(screen.getByText(/Your library is empty/i)).toBeInTheDocument();
  expect(screen.getByTestId("lib-compare-midi")).toBeInTheDocument();
  expect(screen.getByTestId("lib-compare-xml")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/library/LibraryBrowser.test.tsx`
Expected: FAIL — `lib-empty` testid not present.

- [ ] **Step 3: Implement `EmptyState`**

Edit `src/library/LibraryBrowser.tsx`. Below `FormatCompare`, add:

```tsx
function EmptyState() {
  return (
    <div className="lib-empty" data-testid="lib-empty">
      <div className="lib-empty-head">
        <div className="lib-empty-ico" aria-hidden="true">♪</div>
        <h4>Your library is empty</h4>
      </div>
      <p className="lead">
        Arpeggio accepts two formats — here's what each unlocks:
      </p>
      <FormatCompare variant="full" />
    </div>
  );
}
```

Now wire it into the top-level component. Replace the existing JSX block that reads:

```tsx
{pieces.length === 0 ? (
  <p className="library-empty">No saved pieces yet.</p>
) : (
  <ul>
    ...
  </ul>
)}
```

with a leading empty branch that takes over the entire return when there are no pieces (we'll flesh out the non-empty branch in later tasks; for now keep the existing list logic for the non-empty case):

```tsx
if (pieces.length === 0) {
  return (
    <div className="library-browser">
      <div className="lib-head">
        <h2>Library</h2>
        <div className="lib-head-right">0 pieces</div>
      </div>
      <EmptyState />
    </div>
  );
}
```

Place this **before** the existing `return` of the component so the non-empty path is unaffected for now.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/library/LibraryBrowser.test.tsx`
Expected: PASS (new empty-state + earlier FormatCompare test now both green).

- [ ] **Step 5: Commit**

```bash
git add src/library/LibraryBrowser.tsx src/library/LibraryBrowser.test.tsx
git commit -m "feat(library): add EmptyState with inline format comparison"
```

---

## Task 7: `FormatInfoPill` (header link + popover)

**Files:**
- Modify: `src/library/LibraryBrowser.tsx`
- Modify: `src/library/LibraryBrowser.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `LibraryBrowser.test.tsx`:

```tsx
import { fireEvent } from "@testing-library/react";

describe("FormatInfoPill", () => {
  async function renderWithOnePiece() {
    const { savePiece } = await import("./db");
    await savePiece("seed.mid", new ArrayBuffer(4));
    render(<LibraryBrowser onOpen={() => {}} />);
    await screen.findByTestId("lib-info-pill");
  }

  it("renders the pill once there is at least one piece", async () => {
    await renderWithOnePiece();
    expect(screen.getByTestId("lib-info-pill")).toBeInTheDocument();
  });

  it("toggles the popover open and closed on pill click", async () => {
    await renderWithOnePiece();
    expect(screen.queryByTestId("lib-info-popover")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("lib-info-pill"));
    expect(screen.getByTestId("lib-info-popover")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("lib-info-pill"));
    expect(screen.queryByTestId("lib-info-popover")).not.toBeInTheDocument();
  });

  it("closes the popover on Escape", async () => {
    await renderWithOnePiece();
    fireEvent.click(screen.getByTestId("lib-info-pill"));
    expect(screen.getByTestId("lib-info-popover")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("lib-info-popover")).not.toBeInTheDocument();
  });

  it("closes the popover on outside click", async () => {
    await renderWithOnePiece();
    fireEvent.click(screen.getByTestId("lib-info-pill"));
    expect(screen.getByTestId("lib-info-popover")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId("lib-info-popover")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/library/LibraryBrowser.test.tsx`
Expected: FAIL — `lib-info-pill` testid not present (we have not yet flipped the non-empty branch to render it).

- [ ] **Step 3: Implement `FormatInfoPill`**

Edit `src/library/LibraryBrowser.tsx`. Imports — ensure `useEffect`, `useRef`, `useState`, `useCallback` are imported from React. Below `EmptyState`, add:

```tsx
function FormatInfoPill() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onDown(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  return (
    <div className="lib-info-wrap" ref={wrapRef}>
      <button
        type="button"
        className="lib-info-pill"
        data-testid="lib-info-pill"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="dot">ⓘ</span> MIDI vs MusicXML
      </button>
      {open && (
        <div className="lib-info-popover" data-testid="lib-info-popover" role="dialog">
          <p className="pop-label">What each format unlocks</p>
          <FormatCompare variant="compact" />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Render `FormatInfoPill` in the non-empty header**

Modify the existing (non-empty) return JSX in `LibraryBrowser`. Wrap the current return in a new header structure. Replace the leading lines (the `<input type="search">` and `<ul>` block) with:

```tsx
return (
  <div className="library-browser">
    <div className="lib-head">
      <h2>Library</h2>
      <div className="lib-head-right">
        <FormatInfoPill />
        <span>{pieces.length} piece{pieces.length === 1 ? "" : "s"} saved</span>
      </div>
    </div>
    {/* Hero + list will replace the existing search/list block in later tasks.
        For now, keep the existing implementation below this header. */}
    <input
      type="search"
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      placeholder="Search saved pieces"
    />
    <ul>
      {/* ... existing list rendering unchanged ... */}
    </ul>
  </div>
);
```

(Preserve the existing `{filtered.map(...)}` body inside `<ul>` exactly as it is today — Task 9 replaces it.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/library/LibraryBrowser.test.tsx`
Expected: PASS (4 new popover tests).

- [ ] **Step 6: Commit**

```bash
git add src/library/LibraryBrowser.tsx src/library/LibraryBrowser.test.tsx
git commit -m "feat(library): add FormatInfoPill header popover"
```

---

## Task 8: `KebabMenu` sub-component

**Files:**
- Modify: `src/library/LibraryBrowser.tsx`
- Modify: `src/library/LibraryBrowser.test.tsx`

We need the kebab + actions popover ready before `Row` consumes it.

- [ ] **Step 1: Write the failing tests**

Append a new describe to `LibraryBrowser.test.tsx`. Since `KebabMenu` is internal, exercise it through a temporary test harness — we'll mount it directly:

```tsx
import { render as rtlRender } from "@testing-library/react";

// Re-export for testing only. KebabMenu is colocated; import it for the harness.
import { __KebabMenu_test_only as KebabMenu } from "./LibraryBrowser";

describe("KebabMenu", () => {
  it("fires onOpen when 'Open' clicked", () => {
    const onOpen = vi.fn();
    rtlRender(
      <KebabMenu
        onOpen={onOpen}
        onRename={() => {}}
        onDelete={() => {}}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("Open"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("fires onRename when 'Rename' clicked", () => {
    const onRename = vi.fn();
    rtlRender(
      <KebabMenu
        onOpen={() => {}}
        onRename={onRename}
        onDelete={() => {}}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("Rename"));
    expect(onRename).toHaveBeenCalledTimes(1);
  });

  it("fires onDelete when 'Delete' clicked", () => {
    const onDelete = vi.fn();
    rtlRender(
      <KebabMenu
        onOpen={() => {}}
        onRename={() => {}}
        onDelete={onDelete}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("Delete"));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("fires onClose on Escape", () => {
    const onClose = vi.fn();
    rtlRender(
      <KebabMenu
        onOpen={() => {}}
        onRename={() => {}}
        onDelete={() => {}}
        onClose={onClose}
      />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

`vi` from `vitest` and `fireEvent` from `@testing-library/react` — make sure both are imported at the top of the file.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/library/LibraryBrowser.test.tsx`
Expected: FAIL — `__KebabMenu_test_only` is not exported.

- [ ] **Step 3: Implement `KebabMenu`**

Edit `src/library/LibraryBrowser.tsx`. Below `FormatInfoPill`, add:

```tsx
interface KebabMenuProps {
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
  onClose: () => void;
}

function KebabMenu({ onOpen, onRename, onDelete, onClose }: KebabMenuProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="lib-menu" role="menu">
      <button type="button" className="lib-menu-item" role="menuitem" onClick={onOpen}>
        Open
      </button>
      <button type="button" className="lib-menu-item" role="menuitem" onClick={onRename}>
        Rename
      </button>
      <div className="lib-menu-sep" />
      <button
        type="button"
        className="lib-menu-item danger"
        role="menuitem"
        onClick={onDelete}
      >
        Delete
      </button>
    </div>
  );
}

// Test-only re-export. Keeps KebabMenu internal to the module while
// allowing direct unit tests of its keyboard / click behavior.
export const __KebabMenu_test_only = KebabMenu;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/library/LibraryBrowser.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/library/LibraryBrowser.tsx src/library/LibraryBrowser.test.tsx
git commit -m "feat(library): add KebabMenu component for row actions"
```

---

## Task 9: `Row` sub-component (replaces list rendering)

**Files:**
- Modify: `src/library/LibraryBrowser.tsx`
- Modify: `src/library/LibraryBrowser.test.tsx`

- [ ] **Step 1: Rewrite the existing row-rendering tests**

The existing test file has four tests we are replacing. Note that under the new layout, the **most-recently-added piece becomes the hero** and is excluded from the row list when the search query is empty. This changes how the original assertions need to be written. Replace the entire `describe("LibraryBrowser", ...)` block contents with:

```tsx
it("renders both saved pieces — newer in the hero, older in the list", async () => {
  await savePiece("Chopin Ballade.mid", bytes("x"));
  await new Promise((r) => setTimeout(r, 5));
  await savePiece("Moonlight.musicxml", bytes("y"));
  render(<LibraryBrowser onOpen={() => {}} />);
  await screen.findByTestId("library-hero");
  expect(
    within(screen.getByTestId("library-hero")).getByText("Moonlight.musicxml"),
  ).toBeInTheDocument();
  const rows = screen.getAllByTestId("lib-row");
  expect(rows).toHaveLength(1);
  expect(within(rows[0]).getByText("Chopin Ballade.mid")).toBeInTheDocument();
});

it("filters the list by the search box (and includes the hero piece when it matches)", async () => {
  await savePiece("Chopin Ballade.mid", bytes("x"));
  await new Promise((r) => setTimeout(r, 5));
  await savePiece("Moonlight.musicxml", bytes("y"));
  render(<LibraryBrowser onOpen={() => {}} />);
  await screen.findByTestId("library-hero");
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "moon" },
  });
  // Moonlight is the hero; with a matching search it also appears as a row.
  const rows = screen.getAllByTestId("lib-row");
  expect(rows).toHaveLength(1);
  expect(within(rows[0]).getByText("Moonlight.musicxml")).toBeInTheDocument();
  // Chopin is filtered out of the row list.
  expect(within(rows[0]).queryByText("Chopin Ballade.mid")).toBeNull();
});
```

The original "calls onOpen", "removes a piece", and "rename" assertions are replaced by the four targeted tests below. Also remove the original empty-state test (already replaced in Task 6).

Replace selectors used throughout:
- Old always-visible `getByRole("button", { name: /delete/i })` and `getByLabelText("Rename …")` are gone — Row exposes a kebab via `getAllByTestId("lib-kebab")`, which opens a menu.

Append a new test:

```tsx
it("shows the chip with MIDI label for .mid files and XML for .musicxml files", async () => {
  const { savePiece } = await import("./db");
  // MThd MIDI header bytes
  const midi = new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6]).buffer;
  // simple MusicXML
  const xml = new TextEncoder().encode(
    "<?xml version='1.0'?><score-partwise></score-partwise>",
  ).buffer;
  await savePiece("a.mid", midi);
  await savePiece("b.musicxml", xml);
  render(<LibraryBrowser onOpen={() => {}} />);
  await screen.findAllByTestId("lib-row");
  const chips = screen.getAllByTestId("lib-chip");
  const labels = chips.map((c) => c.textContent);
  expect(labels).toContain("MIDI");
  expect(labels).toContain("XML");
});
```

Each of the next three tests seeds **two pieces**: a "hero" piece (newer) that takes the hero slot, and a "target" piece (older) that we exercise via its row. This is required because with only one piece, there is no row to test.

Open test:

```tsx
it("calls onOpen with the piece id when a row's name is clicked", async () => {
  const onOpen = vi.fn();
  const targetId = await savePiece("target.mid", new ArrayBuffer(4));
  await new Promise((r) => setTimeout(r, 5));
  await savePiece("hero.mid", new ArrayBuffer(4));
  render(<LibraryBrowser onOpen={onOpen} />);
  await screen.findByTestId("library-hero");
  const row = screen.getByTestId("lib-row");
  fireEvent.click(within(row).getByRole("button", { name: /target\.mid/ }));
  expect(onOpen).toHaveBeenCalledWith(targetId);
});
```

Rename test:

```tsx
it("renames a piece via the kebab menu", async () => {
  await savePiece("target.mid", new ArrayBuffer(4));
  await new Promise((r) => setTimeout(r, 5));
  await savePiece("hero.mid", new ArrayBuffer(4));
  render(<LibraryBrowser onOpen={() => {}} />);
  await screen.findByTestId("library-hero");
  fireEvent.click(screen.getByTestId("lib-kebab"));
  fireEvent.click(screen.getByText("Rename"));
  const input = screen.getByLabelText("New name");
  fireEvent.change(input, { target: { value: "newname.mid" } });
  fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(async () => {
    const pieces = await listPieces();
    const renamed = pieces.find((p) => p.name === "newname.mid");
    expect(renamed).toBeDefined();
  });
});
```

Delete test:

```tsx
it("deletes a piece via the kebab menu", async () => {
  await savePiece("target.mid", new ArrayBuffer(4));
  await new Promise((r) => setTimeout(r, 5));
  await savePiece("hero.mid", new ArrayBuffer(4));
  render(<LibraryBrowser onOpen={() => {}} />);
  await screen.findByTestId("library-hero");
  fireEvent.click(screen.getByTestId("lib-kebab"));
  fireEvent.click(screen.getByText("Delete"));
  await waitFor(async () => {
    const pieces = await listPieces();
    expect(pieces.find((p) => p.name === "target.mid")).toBeUndefined();
  });
});
```

Top-of-file imports needed for the new tests (add anything missing):

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { LibraryBrowser } from "./LibraryBrowser";
import { savePiece, listPieces, clearLibrary } from "./db";
```

Ensure `waitFor` is imported from `@testing-library/react`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/library/LibraryBrowser.test.tsx`
Expected: FAIL — testids and DOM shape not yet present.

- [ ] **Step 3: Implement `Row`**

Edit `src/library/LibraryBrowser.tsx`. Update imports:

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  listPieces,
  deletePiece,
  renamePiece,
  getPracticeState,
  type StoredPiece,
  type StoredPracticeState,
} from "./db";
import { detectType } from "../import/detectType";
import { formatRelative } from "./relativeTime";
```

Below `KebabMenu`, add:

```tsx
function chipFor(format: ReturnType<typeof detectType>): { label: string; cls: string } {
  if (format === "midi") return { label: "MIDI", cls: "lib-chip lib-chip-midi" };
  if (format === "musicxml" || format === "mxl")
    return { label: "XML", cls: "lib-chip lib-chip-xml" };
  return { label: "?", cls: "lib-chip" };
}

function formatLabel(format: ReturnType<typeof detectType>): string {
  if (format === "midi") return "MIDI";
  if (format === "mxl") return "MusicXML (.mxl)";
  return "MusicXML";
}

interface RowProps {
  piece: StoredPiece;
  practiceState: StoredPracticeState | undefined;
  onOpen: () => void;
  onRenameCommit: (next: string) => Promise<void>;
  onDelete: () => Promise<void>;
}

function Row({ piece, practiceState, onOpen, onRenameCommit, onDelete }: RowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(piece.name);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const format = useMemo(
    () => detectType(piece.name, new Uint8Array(piece.data.slice(0, 2048))),
    [piece.id, piece.name],
  );
  const chip = chipFor(format);
  const fmt = formatLabel(format);

  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const muted =
    practiceState?.leftMuted && practiceState?.rightMuted
      ? "L+R muted"
      : practiceState?.leftMuted
        ? "L muted"
        : practiceState?.rightMuted
          ? "R muted"
          : null;

  const hasLoop = practiceState?.loop != null;
  const sectionsCount = practiceState?.sectionState?.sections.length ?? 0;
  const bpm = practiceState?.bpm;

  async function commitRename() {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== piece.name) {
      await onRenameCommit(trimmed);
    }
    setEditing(false);
  }

  return (
    <li
      className={`lib-row${menuOpen ? " is-menu-open" : ""}`}
      data-testid="lib-row"
      ref={menuRef}
    >
      <span className={chip.cls} data-testid="lib-chip">{chip.label}</span>
      <div>
        {editing ? (
          <input
            type="text"
            className="lib-rename-input"
            aria-label="New name"
            autoFocus
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commitRename();
              else if (e.key === "Escape") {
                setEditName(piece.name);
                setEditing(false);
              }
            }}
            onBlur={() => void commitRename()}
          />
        ) : (
          <>
            <button type="button" className="lib-name" onClick={onOpen}>
              {piece.name}
            </button>
            <div className="lib-subline">
              <span>{fmt}</span>
              <span className="sep">·</span>
              <span>added {formatRelative(piece.addedAt)}</span>
              {muted && (
                <>
                  <span className="sep">·</span>
                  <span className="lib-mute">{muted}</span>
                </>
              )}
            </div>
          </>
        )}
      </div>
      <div className="lib-stats">
        {hasLoop && <span className="lib-pill">loop</span>}
        {sectionsCount > 0 && (
          <span className="lib-pill">{sectionsCount} sec</span>
        )}
        {typeof bpm === "number" && (
          <>
            <span>♩</span>
            <span className="v">{bpm}</span>
          </>
        )}
      </div>
      <button
        type="button"
        className="lib-kebab"
        data-testid="lib-kebab"
        aria-label={`Actions for ${piece.name}`}
        onClick={() => setMenuOpen((m) => !m)}
      >
        ⋯
      </button>
      {menuOpen && (
        <KebabMenu
          onOpen={() => {
            setMenuOpen(false);
            onOpen();
          }}
          onRename={() => {
            setMenuOpen(false);
            setEditing(true);
          }}
          onDelete={() => {
            setMenuOpen(false);
            void onDelete();
          }}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </li>
  );
}
```

- [ ] **Step 4: Replace the existing list rendering in `LibraryBrowser`**

In the non-empty return JSX, replace the old `<ul>{filtered.map(...)}</ul>` block with:

```tsx
<ul className="lib-rows">
  {filtered.map((p) => (
    <Row
      key={p.id}
      piece={p}
      practiceState={practiceById.get(p.id)}
      onOpen={() => onOpen(p.id)}
      onRenameCommit={async (next) => {
        await renamePiece(p.id, next);
        await refresh();
      }}
      onDelete={async () => {
        await deletePiece(p.id);
        await refresh();
      }}
    />
  ))}
</ul>
```

Add `practiceById` state and effect at the top of the component, alongside `pieces`/`query`:

```tsx
const [practiceById, setPracticeById] = useState<Map<string, StoredPracticeState>>(
  () => new Map(),
);

useEffect(() => {
  let cancelled = false;
  async function load() {
    const entries = await Promise.all(
      pieces.map(async (p) => [p.id, await getPracticeState(p.id)] as const),
    );
    if (cancelled) return;
    const next = new Map<string, StoredPracticeState>();
    for (const [id, state] of entries) {
      if (state) next.set(id, state);
    }
    setPracticeById(next);
  }
  void load();
  return () => {
    cancelled = true;
  };
}, [pieces]);
```

Also delete the old `editingId` / `editingName` state, the `startRename` / `commitRename` / `cancelRename` helpers, and the old inline-edit JSX block — `Row` owns its own edit state now.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/library/LibraryBrowser.test.tsx`
Expected: PASS — open / rename / delete / chip / format tests all green.

- [ ] **Step 6: Commit**

```bash
git add src/library/LibraryBrowser.tsx src/library/LibraryBrowser.test.tsx
git commit -m "feat(library): replace list rendering with Row sub-component"
```

---

## Task 10: `Hero` sub-component + hero/list integration

**Files:**
- Modify: `src/library/LibraryBrowser.tsx`
- Modify: `src/library/LibraryBrowser.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `LibraryBrowser.test.tsx`:

```tsx
describe("Hero", () => {
  async function seed(name: string, lastOpened?: number) {
    const { savePiece, touchPiece } = await import("./db");
    const midi = new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6]).buffer;
    const id = await savePiece(name, midi);
    if (lastOpened != null) await touchPiece(id);
    return id;
  }

  it("shows the most recently opened piece in the hero with the 'Continue practicing' eyebrow", async () => {
    await seed("older.mid");
    await new Promise((r) => setTimeout(r, 5));
    await seed("newer.mid");
    await new Promise((r) => setTimeout(r, 5));
    await seed("touched.mid", Date.now());
    render(<LibraryBrowser onOpen={() => {}} />);
    await screen.findByTestId("library-hero");
    const hero = screen.getByTestId("library-hero");
    expect(within(hero).getByText(/touched\.mid/)).toBeInTheDocument();
    expect(within(hero).getByText(/Continue practicing/i)).toBeInTheDocument();
  });

  it("falls back to 'MOST RECENT' eyebrow when no piece has been opened", async () => {
    await seed("a.mid");
    await new Promise((r) => setTimeout(r, 5));
    await seed("b.mid");
    render(<LibraryBrowser onOpen={() => {}} />);
    await screen.findByTestId("library-hero");
    const hero = screen.getByTestId("library-hero");
    expect(within(hero).getByText(/b\.mid/)).toBeInTheDocument();
    expect(within(hero).getByText(/Most recent/i)).toBeInTheDocument();
  });

  it("excludes the hero piece from the list when search is empty", async () => {
    await seed("a.mid", Date.now());
    await new Promise((r) => setTimeout(r, 5));
    await seed("b.mid", Date.now());
    render(<LibraryBrowser onOpen={() => {}} />);
    await screen.findByTestId("library-hero");
    // hero shows b.mid (latest); the list should not also contain b.mid as a row
    const rows = screen.queryAllByTestId("lib-row");
    expect(rows).toHaveLength(1);
    const heroName = within(screen.getByTestId("library-hero")).getByRole(
      "heading",
      { level: 3 },
    ).textContent;
    rows.forEach((row) => {
      expect(within(row).queryByText(heroName ?? "")).toBeNull();
    });
  });

  it("includes the hero piece in the list when the search query matches it", async () => {
    await seed("chopin.mid", Date.now());
    await seed("bach.mid");
    render(<LibraryBrowser onOpen={() => {}} />);
    await screen.findByTestId("library-hero");
    fireEvent.change(screen.getByPlaceholderText(/search/i), {
      target: { value: "chopin" },
    });
    const rows = screen.getAllByTestId("lib-row");
    expect(rows.length).toBe(1);
    expect(within(rows[0]).getByText(/chopin\.mid/)).toBeInTheDocument();
  });

  it("fires onOpen with the hero piece id when 'Resume practice' is clicked", async () => {
    const onOpen = vi.fn();
    const id = await seed("hero.mid", Date.now());
    render(<LibraryBrowser onOpen={onOpen} />);
    await screen.findByTestId("library-hero");
    fireEvent.click(screen.getByRole("button", { name: /Resume practice/i }));
    expect(onOpen).toHaveBeenCalledWith(id);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/library/LibraryBrowser.test.tsx`
Expected: FAIL — `library-hero` testid not present.

- [ ] **Step 3: Implement `Hero`**

Edit `src/library/LibraryBrowser.tsx`. Below `Row`, add:

```tsx
interface HeroProps {
  piece: StoredPiece;
  practiceState: StoredPracticeState | undefined;
  onResume: () => void;
}

function Hero({ piece, practiceState, onResume }: HeroProps) {
  const format = useMemo(
    () => detectType(piece.name, new Uint8Array(piece.data.slice(0, 2048))),
    [piece.id, piece.name],
  );
  const fmt = formatLabel(format);
  const lastOpened = piece.lastOpenedAt;
  const eyebrow = lastOpened != null ? "Continue practicing" : "Most recent";
  const relative =
    lastOpened != null
      ? `last opened ${formatRelative(lastOpened)}`
      : `added ${formatRelative(piece.addedAt)}`;

  const muted =
    practiceState?.leftMuted && practiceState?.rightMuted
      ? "L+R muted"
      : practiceState?.leftMuted
        ? "L muted"
        : practiceState?.rightMuted
          ? "R muted"
          : null;
  const hasLoop = practiceState?.loop != null;
  const sectionsCount = practiceState?.sectionState?.sections.length ?? 0;
  const bpm = practiceState?.bpm;

  return (
    <section className="lib-hero" data-testid="library-hero">
      <div className="lib-hero-grid">
        <div>
          <div className="lib-hero-eyebrow">{eyebrow}</div>
          <h3>{piece.name}</h3>
          <div className="lib-hero-meta">
            <span>{fmt}</span>
            <span>·</span>
            <span>{relative}</span>
            {typeof bpm === "number" && (
              <>
                <span>·</span>
                <span>♩ <span className="v">{bpm}</span></span>
              </>
            )}
            {hasLoop && <span className="lib-pill">loop</span>}
            {sectionsCount > 0 && (
              <span className="lib-pill">{sectionsCount} sections</span>
            )}
            {muted && <span className="lib-pill">{muted}</span>}
          </div>
        </div>
        <button type="button" className="lib-hero-cta" onClick={onResume}>
          ▶ Resume practice
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Integrate the hero into `LibraryBrowser`**

In the non-empty return JSX of `LibraryBrowser`, restructure to hero + list:

```tsx
// pick the hero piece
const heroPiece = pieces[0];
const restPieces = pieces.slice(1);

// filtering rule: when query is non-empty, search across ALL pieces (hero included)
const needle = query.trim().toLowerCase();
const filtered = needle.length > 0
  ? pieces.filter((p) => p.name.toLowerCase().includes(needle))
  : restPieces;

return (
  <div className="library-browser">
    <div className="lib-head">
      <h2>Library</h2>
      <div className="lib-head-right">
        <FormatInfoPill />
        <span>{pieces.length} piece{pieces.length === 1 ? "" : "s"} saved</span>
      </div>
    </div>

    <Hero
      piece={heroPiece}
      practiceState={practiceById.get(heroPiece.id)}
      onResume={() => onOpen(heroPiece.id)}
    />

    {restPieces.length > 0 && (
      <>
        <div className="lib-list-label">
          <span>All other pieces · {restPieces.length}</span>
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search"
        />
        <ul className="lib-rows">
          {filtered.map((p) => (
            <Row
              key={p.id}
              piece={p}
              practiceState={practiceById.get(p.id)}
              onOpen={() => onOpen(p.id)}
              onRenameCommit={async (next) => {
                await renamePiece(p.id, next);
                await refresh();
              }}
              onDelete={async () => {
                await deletePiece(p.id);
                await refresh();
              }}
            />
          ))}
        </ul>
      </>
    )}
  </div>
);
```

Remove the old `needle` and `filtered` declarations from earlier in the component — they are now computed inline above.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/library/LibraryBrowser.test.tsx`
Expected: PASS — all 5 new hero tests + all prior tests still green.

- [ ] **Step 6: Commit**

```bash
git add src/library/LibraryBrowser.tsx src/library/LibraryBrowser.test.tsx
git commit -m "feat(library): add Hero with Continue Practicing CTA"
```

---

## Task 11: Playwright e2e — hero across reloads

**Files:**
- Modify: `tests/e2e/library.spec.ts`

- [ ] **Step 1: Read the existing spec to mirror its style**

Run: `cat tests/e2e/library.spec.ts`

Note the helper used to import a file, and the selectors already established.

- [ ] **Step 2: Add the new test cases**

Append to `tests/e2e/library.spec.ts` (adjust import / setup to match existing conventions if they differ):

```ts
test("opened piece appears in the hero after reload", async ({ page }) => {
  await page.goto("/");
  // Use the existing import helper / drop-target the prior test uses.
  await importMidi(page, "fixtures/clean.mid");
  // The act of import + opening counts as a touch; navigate back to library.
  await page.goBack(); // or click the back-to-library affordance — match existing pattern
  await page.reload();
  const hero = page.getByTestId("library-hero");
  await expect(hero).toBeVisible();
  await expect(hero).toContainText("clean.mid");
  await expect(hero).toContainText(/Continue practicing/i);
});

test("opening an older piece promotes it to the hero", async ({ page }) => {
  await page.goto("/");
  await importMidi(page, "fixtures/clean.mid");
  await page.goBack();
  await importMidi(page, "fixtures/other.mid");
  await page.goBack();
  // Hero now shows the newer piece. Open the older one from the row.
  await page.getByRole("button", { name: /clean\.mid/ }).click();
  await page.goBack();
  await page.reload();
  await expect(page.getByTestId("library-hero")).toContainText("clean.mid");
});
```

If `fixtures/other.mid` does not exist, copy `clean.mid` to `other.mid` in the fixtures dir (a second file with a distinct name is enough — content is irrelevant for this test).

- [ ] **Step 3: Run the e2e suite**

Run: `npm run e2e`
Expected: PASS, including the two new tests.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/library.spec.ts tests/e2e/fixtures/other.mid
git commit -m "test(e2e): cover hero behavior across reloads"
```

(Omit the fixture from `git add` if `other.mid` already existed in the tree.)

---

## Task 12: Feature doc + HANDOVER update

**Files:**
- Modify: `docs/features/I-library.md`
- Modify: `HANDOVER.md`

- [ ] **Step 1: Append a Changes log bullet**

Add to `docs/features/I-library.md`, at the bottom of the `## Changes log` section:

```markdown
- 2026-05-26 — Visual revamp. The library now leads with a "Continue
  practicing" hero card driven by a new optional `lastOpenedAt` field on
  `StoredPiece` (`touchPiece(id)` is called on every entry into
  `PracticeView`). Rows are denser, with file-type chips, relative-time
  metadata, and accent pills for loop / sections / hand-mute. Rename and
  Delete moved into a per-row kebab menu. A new shared `FormatCompare`
  component is rendered inline in the empty state and inside a header
  `ⓘ MIDI vs MusicXML` popover. CSS lives in `src/styles/theme.css`
  (`--- Library browser ---` block, fully replaced). New `relativeTime`
  utility for relative dates. No DB version bump.
```

- [ ] **Step 2: Update the Keywords line**

Replace the `## Keywords` block contents with:

```markdown
src/library/db.ts, src/library/practiceState.ts,
src/library/LibraryBrowser.tsx, src/library/relativeTime.ts,
savePiece, getPiece, listPieces, touchPiece, lastOpenedAt,
capturePracticeState, applyPracticeState, IndexedDB, per-piece state,
search, Hero, Row, KebabMenu, FormatCompare, FormatInfoPill, EmptyState.
```

- [ ] **Step 3: Update the Manual checklist**

Add two bullets to `## Manual checklist`:

```markdown
- [ ] After opening any saved piece, returning to the library shows it in
      the hero with the "Continue practicing" eyebrow.
- [ ] The `ⓘ MIDI vs MusicXML` header pill toggles a popover with the
      comparison. The same comparison appears inline when the library is
      empty.
```

- [ ] **Step 4: Append HANDOVER paragraph**

Append under the existing Library section in `HANDOVER.md`:

```markdown
The library now leads with a Continue Practicing hero (most recently
opened piece) and a denser, more informative row list. A new
`lastOpenedAt` optional field on `StoredPiece` drives the hero and the
sort. The hero's `▶ Resume practice` restores per-piece tempo / loop /
mute state via the same code path as opening any piece — there is no
separate fresh-open mode. The empty state and a header `ⓘ MIDI vs
MusicXML` popover both render a shared format-comparison component.
```

- [ ] **Step 5: Commit**

```bash
git add docs/features/I-library.md HANDOVER.md
git commit -m "docs(library): document visual revamp + lastOpenedAt"
```

---

## Task 13: Verify gate

**Files:** none.

- [ ] **Step 1: Run the full verify gate**

Run:

```bash
npm run lint && npm run typecheck && npm test && npm run build && npm run e2e
```

Expected: ALL PASS.

- [ ] **Step 2: Address any failures**

If any step fails:
1. Read the failure output carefully.
2. Identify whether it's a regression in the new code, a fixture issue (e2e), or a stale snapshot.
3. Fix and re-run the failing step + everything downstream.
4. Do **not** mark this task complete until the entire chain is green.

- [ ] **Step 3: Final commit (if needed)**

If any fixes were committed in step 2, that's fine. No empty commit needed here — the verify gate is the gate, not a separate artifact.

---

## Manual smoke (post-implementation, before declaring done)

Run `npm run dev` and exercise the following in a real browser:

- [ ] With an empty library, the empty-state card renders, both MIDI and MUSICXML columns are visible, and the `ⓘ` pill in the header is **absent** (no pieces yet).
- [ ] After importing one piece, returning to the library shows the hero with the imported piece, eyebrow says "Continue practicing", and the `ⓘ MIDI vs MusicXML` pill is now in the header.
- [ ] Clicking the `ⓘ` pill opens the popover. Pressing Escape closes it. Clicking outside closes it.
- [ ] Hover any row — the kebab fades in. Click it — the menu opens with Open / Rename / Delete (red).
- [ ] Rename a piece via the kebab menu — the inline edit takes over, Enter commits, Escape cancels.
- [ ] Delete a piece via the kebab menu — the row disappears.
- [ ] Open one piece, change tempo to 80, set a loop, return to the library. The piece is in the hero with `♩ 80` and a `loop` pill.
- [ ] Import a second piece. The first piece stays in the hero (most recently opened). Open the second piece, return — now the second is in the hero, the first is in the list.
- [ ] Search for the hero piece's name — it appears as a row in the filtered list.
- [ ] Search for nothing matching — the list is empty, the hero is still visible.
- [ ] iPad-portrait width (≤ 820 CSS px) — the header `ⓘ` pill wraps below the title rather than overflowing.

---

## Self-review notes

This plan was checked against the spec for:

1. **Spec coverage:** every locked decision in the spec's "Locked design decisions" table maps to a task above. The Decisions table sections — hero data source (Task 1, 2), sort (Task 1), hero in list (Task 10), hero CTA (Task 10), chip labels (Tasks 5, 9), actions menu (Task 8, 9), format info empty state (Task 6), format info non-empty (Task 7), loading state (no skeleton — implicit, no task needed) — are all covered.
2. **Placeholder scan:** no TBD, no "implement appropriately", no test bodies replaced with `// ...`. Every test step contains the actual assertion. Every implementation step contains the actual code.
3. **Type consistency:** `StoredPiece` is extended with `lastOpenedAt?: number` in Task 1 and consumed (typed) in Tasks 9, 10. `StoredPracticeState` is consumed unchanged. `FormatVariant = "full" | "compact"` is declared in Task 5 and used identically in Tasks 6, 7.
4. **Test-only export:** `__KebabMenu_test_only` exposed to tests in Task 8. This is the project's only deviation from the spec's "no public exports beyond LibraryBrowser" guidance — the deviation is intentional and named to be obviously test-scoped.
