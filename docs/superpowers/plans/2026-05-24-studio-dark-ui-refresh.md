# Studio Dark UI Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin the top bar + MIDI section strip in a unified "Studio Dark" direction, fill the top-bar slack with live session-info chips + a wait-mode pill, and consolidate all multi-option top-bar controls into a shared `TopBarSelect` dropdown primitive. Tools popover loses its duplicated wait/hands rows; Input sound moves into General settings.

**Architecture:** New `TopBarSelect.tsx` is a generic pill-with-menu primitive driven by everything multi-option in the chrome (Mode / View / Layout). New `TopBarReadout.tsx` is the chip group + wait pill rendered into the top-bar slack region. Section-strip palette + background are pure CSS/constant swaps. Tools-popover changes are prop-rewiring (state stays in `PracticeView`). No backend / data-model changes; no new dependencies.

**Tech Stack:** React 19, TypeScript, Vite, Vitest + Testing Library, plain CSS (no preprocessor).

**Source spec:** `docs/superpowers/specs/2026-05-24-studio-dark-ui-refresh-design.md`

---

## File Structure

**New files:**
- `src/ui/TopBarSelect.tsx` — generic pill-with-dropdown primitive (single-section + multi-section menus)
- `src/ui/TopBarSelect.test.tsx`
- `src/ui/TopBarReadout.tsx` — top-bar chip group (tempo / time-sig / measure / loop) + wait pill (MIDI Practice)
- `src/ui/TopBarReadout.test.tsx`
- `src/transport/measureMap.ts` — shared helpers: `measureAt(transport, time)`, `loopMeasureRange(transport)`
- `src/transport/measureMap.test.ts`

**Modified files:**
- `src/styles/section-strip.css` — palette/background swap, hover/snap-line inversion, strip shadow
- `src/section-strip/SectionStrip.tsx` — `PALETTE` constant swap
- `src/styles/theme.css` — chip CSS, hover-only underline on strip toolbar, tabular-nums on top-bar pills
- `src/ui/ModeSwitch.tsx` — rewrite as `<TopBarSelect>` consumer
- `src/ui/ModeSwitch.test.tsx` — assertions for the new dropdown shape
- `src/ui/TopBar.tsx` — embed `<TopBarReadout>` in slack; replace view-controls cluster with `<TopBarSelect>` for Play tab; replace layout+theme cluster with multi-section `<TopBarSelect>` for MIDI Practice; swap unicode `▶`/`⏸` for inline SVG
- `src/ui/TopBar.test.tsx` — updated assertions
- `src/ui/MidiTools.tsx` — drop Hands / Wait / Input sound rows; forward `monitorOn` into `CommonTools`
- `src/ui/MidiTools.test.tsx` — updated assertions
- `src/ui/CommonTools.tsx` — accept + forward optional `monitorOn`/`onMonitorOnChange`; switch its local `measureAt`/`loopMeasures` to the shared helpers
- `src/ui/GeneralSettings.tsx` — render conditional Input sound checkbox
- `src/ui/GeneralSettings.test.tsx` — assertions for conditional render
- `src/app/PracticeView.tsx` — thread `waitEnabled`/`handsIPlay` into `<TopBar>`; thread `monitorOn` into `<MidiTools>` (so it can forward to CommonTools)
- `docs/features/B-top-bar.md` — Changes-log bullet
- `docs/features/J-midi-section-navigator.md` — Changes-log bullet
- `HANDOVER.md` — update top-bar + section-strip callouts

**Deleted CSS:**
- `.midi-tools-hands`, `.midi-hands-buttons` rules in `src/styles/theme.css`

---

## Task 1: Section strip palette + background

**Files:**
- Modify: `src/section-strip/SectionStrip.tsx:19` (`PALETTE` constant)
- Modify: `src/styles/section-strip.css` (lines 11–35, 88–104, 140–152, 218–252, 322–334)

- [ ] **Step 1: Swap the PALETTE constant**

Edit `src/section-strip/SectionStrip.tsx`, replace the line:

```tsx
const PALETTE = ["#cba37a", "#7a9cca", "#c97d7d", "#7ec98a", "#b09bca"] as const;
```

with:

```tsx
const PALETTE = ["#3a5a78", "#2f6e63", "#7a3a4a", "#7a5a2e", "#4a3a6a"] as const;
```

- [ ] **Step 2: Swap strip background + border + toolbar color**

Edit `src/styles/section-strip.css`. Replace the `.section-strip` block (lines 11–18) with:

```css
.section-strip {
  background: linear-gradient(rgba(20,20,25,0.78), rgba(12,12,16,0.88));
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(16px) saturate(160%);
  -webkit-backdrop-filter: blur(16px) saturate(160%);
  padding: 6px 12px 8px;
  user-select: none;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.6),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}
```

Then in the `.section-strip--top` block (around lines 31–35), replace `border-bottom: 1px solid #d3cab3;` with `border-bottom: 1px solid rgba(255, 255, 255, 0.06);` (and keep `border-top: 0;`).

- [ ] **Step 3: Invert hover line + snap line colors for the dark strip**

In `src/styles/section-strip.css`, the `.section-strip__hover-line` (around line 140) currently has `background: #1a1a1a;` and `box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.6);`. Swap them so the line reads as light on dark:

```css
.section-strip__hover-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: rgba(255, 255, 255, 0.85);
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.4);
  pointer-events: none;
  z-index: 20;
}
```

Repeat the same `background` + `box-shadow` swap for `.section-strip__playhead` (around line 227).

The `.section-strip__snap-line` (around line 255) already uses `rgba(255, 255, 255, 0.8)` for `border-left` — leave it; it reads correctly against the dark backdrop.

- [ ] **Step 4: Update strip toolbar text color**

In `src/styles/section-strip.css`, the `.section-strip__toolbar` block (around line 322) currently has `color: #6a5e3e;`. Change to:

```css
color: rgba(230, 230, 234, 0.55);
```

Then in `.section-strip__undo`, `.section-strip__help-toggle` (around line 344) change `color: #6a5e3e;` → `color: rgba(230, 230, 234, 0.55);` and in the `:hover` rule change `color: #2e2810;` → `color: #e6e6ea;` and in the `[aria-pressed="true"]` rule change `color: #2e2810;` → `color: #e6e6ea;`.

- [ ] **Step 5: Run tests + smoke**

Run: `npm test -- src/section-strip`
Expected: PASS (palette colors aren't asserted by existing tests).

Run: `npm run dev` and visit the app with a MIDI source file. Confirm the strip is dark with the new palette, blocks look saturated, hover/playhead lines remain readable.

- [ ] **Step 6: Commit**

```bash
git add src/section-strip/SectionStrip.tsx src/styles/section-strip.css
git commit -m "feat(section-strip): Studio Dark palette + dark translucent background"
```

---

## Task 2: Play / pause SVG glyph

**Files:**
- Modify: `src/ui/TopBar.tsx:160-166` (the `<button className="hud-play-btn">` body)

- [ ] **Step 1: Replace the unicode glyphs with inline SVG**

In `src/ui/TopBar.tsx`, find the play/pause button (around line 160):

```tsx
<button
  type="button"
  className="hud-play-btn"
  aria-label={playing ? "Pause" : "Play"}
  disabled={countingIn}
  onClick={handlePlayToggle}
>
  {playing ? "⏸" : "▶"}
</button>
```

Replace the body with:

```tsx
<button
  type="button"
  className="hud-play-btn"
  aria-label={playing ? "Pause" : "Play"}
  disabled={countingIn}
  onClick={handlePlayToggle}
>
  {playing ? (
    <svg viewBox="0 0 10 10" width="0.75em" height="0.75em" fill="currentColor" aria-hidden="true">
      <rect x="2.5" y="2" width="2" height="6" rx="0.5" />
      <rect x="5.5" y="2" width="2" height="6" rx="0.5" />
    </svg>
  ) : (
    <svg viewBox="0 0 10 10" width="0.85em" height="0.85em" fill="currentColor" aria-hidden="true">
      <path d="M2.5 1.5 L8.5 5 L2.5 8.5 Z" />
    </svg>
  )}
</button>
```

- [ ] **Step 2: Update the existing TopBar test if it asserts the unicode glyph**

Run: `npm test -- src/ui/TopBar.test`
If a test asserts `"▶"` or `"⏸"`, update it to assert `aria-label` ("Play" / "Pause") instead (the aria-label was already there, so this is just dropping any character-content assertion).

- [ ] **Step 3: Run tests**

Run: `npm test -- src/ui/TopBar.test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/ui/TopBar.tsx src/ui/TopBar.test.tsx
git commit -m "fix(top-bar): center play/pause glyph via inline SVG"
```

---

## Task 3: Shared measure-map helpers

**Files:**
- Create: `src/transport/measureMap.ts`
- Create: `src/transport/measureMap.test.ts`
- Modify: `src/ui/CommonTools.tsx:21-46` (delete local helpers, import shared ones)

- [ ] **Step 1: Write failing tests for the helpers**

Create `src/transport/measureMap.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { measureAt, loopMeasureRange } from "./measureMap";
import type { Transport } from "./transport";

function makeFakeTransport(opts: {
  measures: { start: number; end: number }[];
  loop?: { start: number; end: number } | null;
}): Transport {
  return {
    score: { measures: opts.measures },
    clock: { loop: opts.loop ?? null },
  } as unknown as Transport;
}

describe("measureAt", () => {
  it("returns the index of the measure containing the given time", () => {
    const t = makeFakeTransport({
      measures: [
        { start: 0, end: 2 },
        { start: 2, end: 4 },
        { start: 4, end: 6 },
      ],
    });
    expect(measureAt(t, 0)).toBe(0);
    expect(measureAt(t, 1.5)).toBe(0);
    expect(measureAt(t, 2)).toBe(1);
    expect(measureAt(t, 5.9)).toBe(2);
  });

  it("returns 0 when the time matches no measure", () => {
    const t = makeFakeTransport({ measures: [{ start: 0, end: 2 }] });
    expect(measureAt(t, 99)).toBe(0);
  });
});

describe("loopMeasureRange", () => {
  it("returns null when no loop is active", () => {
    const t = makeFakeTransport({ measures: [{ start: 0, end: 2 }] });
    expect(loopMeasureRange(t)).toBeNull();
  });

  it("returns first/last measure indices for the loop range", () => {
    const t = makeFakeTransport({
      measures: [
        { start: 0, end: 2 },
        { start: 2, end: 4 },
        { start: 4, end: 6 },
        { start: 6, end: 8 },
      ],
      loop: { start: 2, end: 8 },
    });
    expect(loopMeasureRange(t)).toEqual({ first: 1, last: 3 });
  });

  it("defaults last to first when the loop end matches no measure", () => {
    const t = makeFakeTransport({
      measures: [{ start: 0, end: 2 }],
      loop: { start: 0, end: 1 },
    });
    expect(loopMeasureRange(t)).toEqual({ first: 0, last: 0 });
  });
});
```

- [ ] **Step 2: Run the test to verify failure**

Run: `npm test -- src/transport/measureMap.test`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the helpers**

Create `src/transport/measureMap.ts`:

```ts
import type { Transport } from "./transport";

/** Index of the measure containing `time`, or 0 if none matches. */
export function measureAt(transport: Transport, time: number): number {
  const i = transport.score.measures.findIndex(
    (m) => time >= m.start && time < m.end,
  );
  return i === -1 ? 0 : i;
}

/** Measure indices [first, last] of an active loop, or null. 0-based. */
export function loopMeasureRange(
  transport: Transport,
): { first: number; last: number } | null {
  const loop = transport.clock.loop;
  if (!loop) return null;
  const measures = transport.score.measures;
  const first = measures.findIndex(
    (m) => loop.start >= m.start && loop.start < m.end,
  );
  const last = measures.findIndex(
    (m) => loop.end > m.start && loop.end <= m.end,
  );
  return {
    first: first === -1 ? 0 : first,
    last: last === -1 ? (first === -1 ? 0 : first) : last,
  };
}
```

- [ ] **Step 4: Run tests, expect PASS**

Run: `npm test -- src/transport/measureMap.test`
Expected: PASS.

- [ ] **Step 5: Refactor CommonTools to use the shared helpers**

In `src/ui/CommonTools.tsx`, delete the local `measureAt` and `loopMeasures` functions (lines 21–46). At the top of the file, add:

```ts
import { measureAt, loopMeasureRange } from "../transport/measureMap";
```

Then replace every reference to the local `loopMeasures` with `loopMeasureRange` (one call site around line 68 and one in the `useEffect` around line 75).

- [ ] **Step 6: Run full test suite**

Run: `npm test`
Expected: PASS (no behavior change in CommonTools).

- [ ] **Step 7: Commit**

```bash
git add src/transport/measureMap.ts src/transport/measureMap.test.ts src/ui/CommonTools.tsx
git commit -m "refactor(transport): extract shared measureAt + loopMeasureRange helpers"
```

---

## Task 4: TopBarSelect primitive

**Files:**
- Create: `src/ui/TopBarSelect.tsx`
- Create: `src/ui/TopBarSelect.test.tsx`
- Modify: `src/styles/theme.css` (add `.top-bar-select`, `.top-bar-select-menu` rules at the end)

- [ ] **Step 1: Write failing tests**

Create `src/ui/TopBarSelect.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TopBarSelect } from "./TopBarSelect";

describe("TopBarSelect", () => {
  const options = [
    { value: "a", label: "Option A" },
    { value: "b", label: "Option B" },
  ];

  it("renders the current value with a chevron", () => {
    render(<TopBarSelect value="a" options={options} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Option A/ })).toBeInTheDocument();
  });

  it("opens a menu listing all options on click", () => {
    render(<TopBarSelect value="a" options={options} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Option A/ }));
    expect(screen.getByRole("menuitem", { name: /Option A/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Option B/ })).toBeInTheDocument();
  });

  it("highlights the current option", () => {
    render(<TopBarSelect value="b" options={options} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Option B/ }));
    const active = screen.getByRole("menuitem", { name: /Option B/ });
    expect(active).toHaveAttribute("aria-current", "true");
  });

  it("calls onChange with the picked value and closes the menu", () => {
    const onChange = vi.fn();
    render(<TopBarSelect value="a" options={options} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Option A/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Option B/ }));
    expect(onChange).toHaveBeenCalledWith("b");
    expect(screen.queryByRole("menuitem")).toBeNull();
  });

  it("prefixes the value with `label` when provided", () => {
    render(<TopBarSelect label="View:" value="a" options={options} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /View: Option A/ })).toBeInTheDocument();
  });

  it("renders multi-section menus with section headings + dividers", () => {
    const sections = [
      { section: "Group 1", items: [{ value: "a", label: "Option A" }] },
      { section: "Group 2", items: [{ value: "b", label: "Option B" }] },
    ];
    render(<TopBarSelect value="a" sections={sections} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Option A/ }));
    expect(screen.getByText("Group 1")).toBeInTheDocument();
    expect(screen.getByText("Group 2")).toBeInTheDocument();
  });

  it("closes on Escape", () => {
    render(<TopBarSelect value="a" options={options} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Option A/ }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menuitem")).toBeNull();
  });

  it("closes on outside click", () => {
    render(
      <div>
        <TopBarSelect value="a" options={options} onChange={vi.fn()} />
        <button>Outside</button>
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Option A/ }));
    fireEvent.mouseDown(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("menuitem")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `npm test -- src/ui/TopBarSelect.test`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement TopBarSelect**

Create `src/ui/TopBarSelect.tsx`:

```tsx
import { useEffect, useId, useRef, useState } from "react";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export interface SelectSection<T extends string> {
  /** Optional section heading; omit for ungrouped items. */
  section?: string;
  items: SelectOption<T>[];
}

interface TopBarSelectProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  /** Single flat option list. Mutually exclusive with `sections`. */
  options?: SelectOption<T>[];
  /** Grouped option list with section headings. */
  sections?: SelectSection<T>[];
  /** Optional prefix shown in the pill before the current label. */
  label?: string;
  /** aria-label override; defaults to the current option's label. */
  ariaLabel?: string;
}

function Chevron(): React.JSX.Element {
  return (
    <svg
      className="top-bar-select-caret"
      viewBox="0 0 10 10"
      width="10"
      height="10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="2.5,4 5,6.5 7.5,4" />
    </svg>
  );
}

/**
 * A pill that shows the current selection + a chevron, opening a floating
 * menu below on click. Used by every multi-option control in the top bar
 * (Mode, View, Layout). Supports a single flat list of options or a list
 * of named sections (used by the merged Layout + Lane-theme menu).
 */
export function TopBarSelect<T extends string>({
  value,
  onChange,
  options,
  sections,
  label,
  ariaLabel,
}: TopBarSelectProps<T>): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const allItems: SelectOption<T>[] = sections
    ? sections.flatMap((s) => s.items)
    : (options ?? []);
  const current = allItems.find((o) => o.value === value);
  const display = current?.label ?? value;

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent): void {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(v: T): void {
    onChange(v);
    setOpen(false);
  }

  return (
    <div className="top-bar-select" ref={rootRef}>
      <button
        type="button"
        className={`top-bar-select-pill${open ? " top-bar-select-pill--open" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={ariaLabel ?? display}
        onClick={() => setOpen((o) => !o)}
      >
        {label ? `${label} ${display}` : display}
        <Chevron />
      </button>
      {open && (
        <ul
          id={menuId}
          className="top-bar-select-menu"
          role="menu"
        >
          {sections
            ? sections.map((s, i) => (
                <Section
                  key={s.section ?? i}
                  section={s}
                  value={value}
                  pick={pick}
                  divider={i > 0}
                />
              ))
            : (options ?? []).map((o) => (
                <Item key={o.value} option={o} value={value} pick={pick} />
              ))}
        </ul>
      )}
    </div>
  );
}

function Section<T extends string>({
  section,
  value,
  pick,
  divider,
}: {
  section: SelectSection<T>;
  value: T;
  pick: (v: T) => void;
  divider: boolean;
}): React.JSX.Element {
  return (
    <>
      {divider && <li className="top-bar-select-divider" role="separator" />}
      {section.section && (
        <li className="top-bar-select-section-label" role="presentation">
          {section.section}
        </li>
      )}
      {section.items.map((o) => (
        <Item key={o.value} option={o} value={value} pick={pick} />
      ))}
    </>
  );
}

function Item<T extends string>({
  option,
  value,
  pick,
}: {
  option: SelectOption<T>;
  value: T;
  pick: (v: T) => void;
}): React.JSX.Element {
  const active = option.value === value;
  return (
    <li
      role="menuitem"
      aria-current={active ? "true" : undefined}
      className={`top-bar-select-item${active ? " top-bar-select-item--active" : ""}`}
      onClick={() => pick(option.value)}
    >
      <span className="top-bar-select-check" aria-hidden="true">
        {active ? "✓" : " "}
      </span>
      {option.label}
    </li>
  );
}
```

- [ ] **Step 4: Add the CSS**

Append to `src/styles/theme.css`:

```css
/* --- TopBarSelect (shared pill+dropdown primitive) --- */

.top-bar-select { position: relative; display: inline-flex; }

.top-bar-select-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 2rem;
  padding: 0 0.7rem 0 0.85rem;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text);
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  font: inherit;
  font-size: 0.85rem;
  white-space: nowrap;
  cursor: pointer;
}
.top-bar-select-pill:hover,
.top-bar-select-pill--open {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.22);
}
.top-bar-select-caret { color: var(--text-dim); flex-shrink: 0; }

.top-bar-select-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 40;
  min-width: 170px;
  list-style: none;
  margin: 0;
  padding: 4px;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  border-radius: 10px;
  box-shadow: var(--glass-shadow);
  color: var(--text);
}

.top-bar-select-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
}
.top-bar-select-item:hover { background: rgba(255, 255, 255, 0.08); }
.top-bar-select-item--active {
  background: var(--accent-soft);
  color: #d6ffe9;
}
.top-bar-select-check {
  width: 12px;
  color: var(--accent);
  font-size: 11px;
  text-align: center;
  flex-shrink: 0;
}

.top-bar-select-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
  margin: 4px 0;
  list-style: none;
}

.top-bar-select-section-label {
  padding: 6px 10px 2px;
  font-size: 9px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(230, 230, 234, 0.55);
  font-weight: 500;
  list-style: none;
}
```

- [ ] **Step 5: Run tests, expect PASS**

Run: `npm test -- src/ui/TopBarSelect.test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/TopBarSelect.tsx src/ui/TopBarSelect.test.tsx src/styles/theme.css
git commit -m "feat(top-bar): add TopBarSelect pill-with-dropdown primitive"
```

---

## Task 5: TopBarReadout — read-only chips (tempo / time-sig / measure / loop)

**Files:**
- Create: `src/ui/TopBarReadout.tsx`
- Create: `src/ui/TopBarReadout.test.tsx`
- Modify: `src/styles/theme.css` (add `.top-bar-readout`, `.top-bar-readout-chip`, `.top-bar-readout-chip--loop` rules)

- [ ] **Step 1: Write failing tests for the read-only chips**

Create `src/ui/TopBarReadout.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { TopBarReadout } from "./TopBarReadout";
import type { Transport } from "../transport/transport";
import type { AudioEngine } from "../audio/engine";

interface FakeTransport extends Transport {
  _listeners: Array<() => void>;
}

function makeTransport(opts: {
  bpm?: number;
  position?: number;
  duration?: number;
  loop?: { start: number; end: number } | null;
}): FakeTransport {
  const listeners: Array<() => void> = [];
  return {
    bpm: opts.bpm ?? 72,
    score: {
      measures: [
        { start: 0, end: 2 },
        { start: 2, end: 4 },
        { start: 4, end: 6 },
        { start: 6, end: 8 },
      ],
    },
    clock: {
      position: opts.position ?? 0,
      duration: opts.duration ?? 8,
      playing: false,
      loop: opts.loop ?? null,
      onChange: (cb: () => void) => {
        listeners.push(cb);
        return () => {
          const i = listeners.indexOf(cb);
          if (i !== -1) listeners.splice(i, 1);
        };
      },
    },
    _listeners: listeners,
  } as unknown as FakeTransport;
}

function makeEngine(num = 4, den = 4): AudioEngine {
  return {
    metronome: { timeSignature: { numerator: num, denominator: den } },
  } as unknown as AudioEngine;
}

describe("TopBarReadout — read-only chips", () => {
  it("renders tempo, time-sig, and measure chips", () => {
    render(
      <TopBarReadout
        mode="play"
        transport={makeTransport({ bpm: 96, position: 0 })}
        audioEngine={makeEngine(3, 4)}
      />,
    );
    expect(screen.getByText(/♩ = 96/)).toBeInTheDocument();
    expect(screen.getByText("3/4")).toBeInTheDocument();
    expect(screen.getByText(/m\. 1 \/ 4/)).toBeInTheDocument();
  });

  it("does NOT render the loop chip when no loop is active", () => {
    render(
      <TopBarReadout
        mode="play"
        transport={makeTransport({})}
        audioEngine={makeEngine()}
      />,
    );
    expect(screen.queryByText(/↻/)).toBeNull();
  });

  it("renders the loop chip as `↻ m.X–Y` when a loop is active", () => {
    render(
      <TopBarReadout
        mode="play"
        transport={makeTransport({ loop: { start: 2, end: 6 } })}
        audioEngine={makeEngine()}
      />,
    );
    expect(screen.getByText(/↻ m\.2–3/)).toBeInTheDocument();
  });

  it("updates chip values when the clock fires onChange", () => {
    const t = makeTransport({ position: 0 });
    render(
      <TopBarReadout mode="play" transport={t} audioEngine={makeEngine()} />,
    );
    expect(screen.getByText(/m\. 1 \/ 4/)).toBeInTheDocument();
    act(() => {
      t.clock.position = 4.5;
      t._listeners.forEach((cb) => cb());
    });
    expect(screen.getByText(/m\. 3 \/ 4/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, verify failure**

Run: `npm test -- src/ui/TopBarReadout.test`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement TopBarReadout (read-only chips only — wait pill added in Task 6)**

Create `src/ui/TopBarReadout.tsx`:

```tsx
import { useEffect, useReducer } from "react";
import type { Transport } from "../transport/transport";
import type { AudioEngine } from "../audio/engine";
import type { TabMode } from "../layout/practiceMode";
import {
  measureAt,
  loopMeasureRange,
} from "../transport/measureMap";

interface TopBarReadoutProps {
  mode: TabMode;
  transport: Transport;
  audioEngine: AudioEngine | null;
}

/**
 * The live chip group that fills the top-bar slack region. Reads tempo,
 * time-signature, current-measure, and active-loop range from the transport
 * and audio engine, re-rendering on every clock change. The wait-mode pill
 * is added in a follow-up task.
 */
export function TopBarReadout({
  mode: _mode,
  transport,
  audioEngine,
}: TopBarReadoutProps): React.JSX.Element {
  const [, forceUpdate] = useReducer((n: number) => n + 1, 0);
  useEffect(() => transport.clock.onChange(forceUpdate), [transport]);

  const bpm = Math.round(transport.bpm);
  const sig = audioEngine?.metronome.timeSignature;
  const totalMeasures = transport.score.measures.length;
  const currentMeasure =
    totalMeasures > 0 ? measureAt(transport, transport.clock.position) + 1 : 0;
  const loopRange = loopMeasureRange(transport);

  return (
    <div className="top-bar-readout">
      <span className="top-bar-readout-chip">♩ = {bpm}</span>
      {sig && (
        <span className="top-bar-readout-chip">
          {sig.numerator}/{sig.denominator}
        </span>
      )}
      {totalMeasures > 0 && (
        <span className="top-bar-readout-chip">
          m. {currentMeasure} / {totalMeasures}
        </span>
      )}
      {loopRange && (
        <span className="top-bar-readout-chip top-bar-readout-chip--loop">
          ↻ m.{loopRange.first + 1}–{loopRange.last + 1}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add the chip CSS**

Append to `src/styles/theme.css`:

```css
/* --- TopBarReadout chips --- */

.top-bar-readout {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.top-bar-readout-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 1.5rem;
  padding: 0 0.65rem;
  border: 1px solid var(--glass-border);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-dim);
  border-radius: 999px;
  font-size: 0.78rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  pointer-events: none;
}

.top-bar-readout-chip--loop {
  color: #f0a8a4;
  background: rgba(217, 83, 79, 0.10);
  border-color: rgba(217, 83, 79, 0.45);
}
```

- [ ] **Step 5: Run tests, expect PASS**

Run: `npm test -- src/ui/TopBarReadout.test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/TopBarReadout.tsx src/ui/TopBarReadout.test.tsx src/styles/theme.css
git commit -m "feat(top-bar): read-only readout chips (tempo / time-sig / measure / loop)"
```

---

## Task 6: TopBarReadout — wait pill + menu

**Files:**
- Modify: `src/ui/TopBarReadout.tsx` (extend props + add wait pill)
- Modify: `src/ui/TopBarReadout.test.tsx` (add wait-pill tests)
- Modify: `src/styles/theme.css` (add `.top-bar-wait-pill` CSS)

- [ ] **Step 1: Add the failing wait-pill tests**

Append to `src/ui/TopBarReadout.test.tsx`:

```tsx
import { fireEvent } from "@testing-library/react";
import type { Hand } from "../model/score";

describe("TopBarReadout — wait pill", () => {
  function commonProps(over: Partial<Parameters<typeof TopBarReadout>[0]> = {}) {
    return {
      mode: "midi" as const,
      transport: makeTransport({}),
      audioEngine: makeEngine(),
      waitEnabled: false,
      onWaitEnabledChange: vi.fn(),
      handsIPlay: new Set<Hand>(),
      onHandsIPlayChange: vi.fn(),
      ...over,
    };
  }

  it("does NOT render the wait pill in Play mode", () => {
    render(<TopBarReadout {...commonProps({ mode: "play" })} />);
    expect(screen.queryByRole("button", { name: /wait/i })).toBeNull();
  });

  it("renders the wait pill in MIDI Practice mode with `Turn on wait mode` when off", () => {
    render(<TopBarReadout {...commonProps()} />);
    expect(
      screen.getByRole("button", { name: /turn on wait mode/i }),
    ).toBeInTheDocument();
  });

  it("renders `Wait L` when wait is on and hands = Left", () => {
    const p = commonProps({
      waitEnabled: true,
      handsIPlay: new Set<Hand>(["left"]),
    });
    render(<TopBarReadout {...p} />);
    expect(screen.getByRole("button", { name: /wait L/ })).toBeInTheDocument();
  });

  it("renders `Wait L+R` when wait is on and hands = Both", () => {
    const p = commonProps({
      waitEnabled: true,
      handsIPlay: new Set<Hand>(["left", "right"]),
    });
    render(<TopBarReadout {...p} />);
    expect(screen.getByRole("button", { name: /wait L\+R/ })).toBeInTheDocument();
  });

  it("renders `Wait R` when wait is on and hands = Right", () => {
    const p = commonProps({
      waitEnabled: true,
      handsIPlay: new Set<Hand>(["right"]),
    });
    render(<TopBarReadout {...p} />);
    expect(screen.getByRole("button", { name: /wait R/ })).toBeInTheDocument();
  });

  it("opens a menu with Left / Both / Right when clicked from the OFF state", () => {
    render(<TopBarReadout {...commonProps()} />);
    fireEvent.click(screen.getByRole("button", { name: /turn on wait mode/i }));
    expect(screen.getByText("Left hand")).toBeInTheDocument();
    expect(screen.getByText("Both hands")).toBeInTheDocument();
    expect(screen.getByText("Right hand")).toBeInTheDocument();
    expect(screen.queryByText("Off")).toBeNull();
  });

  it("picks Left from OFF state → calls onWaitEnabledChange(true) AND onHandsIPlayChange({left})", () => {
    const onWaitEnabledChange = vi.fn();
    const onHandsIPlayChange = vi.fn();
    render(
      <TopBarReadout
        {...commonProps({ onWaitEnabledChange, onHandsIPlayChange })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /turn on wait mode/i }));
    fireEvent.click(screen.getByText("Left hand"));
    expect(onWaitEnabledChange).toHaveBeenCalledWith(true);
    expect(onHandsIPlayChange).toHaveBeenCalledWith(new Set(["left"]));
  });

  it("opens a menu with Off + hand options when clicked from ON state", () => {
    const p = commonProps({
      waitEnabled: true,
      handsIPlay: new Set<Hand>(["left"]),
    });
    render(<TopBarReadout {...p} />);
    fireEvent.click(screen.getByRole("button", { name: /wait L/ }));
    expect(screen.getByText("Off")).toBeInTheDocument();
    expect(screen.getByText("Left hand")).toBeInTheDocument();
  });

  it("picks Off from ON state → calls onWaitEnabledChange(false), leaves handsIPlay alone", () => {
    const onWaitEnabledChange = vi.fn();
    const onHandsIPlayChange = vi.fn();
    const p = commonProps({
      waitEnabled: true,
      handsIPlay: new Set<Hand>(["left"]),
      onWaitEnabledChange,
      onHandsIPlayChange,
    });
    render(<TopBarReadout {...p} />);
    fireEvent.click(screen.getByRole("button", { name: /wait L/ }));
    fireEvent.click(screen.getByText("Off"));
    expect(onWaitEnabledChange).toHaveBeenCalledWith(false);
    expect(onHandsIPlayChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/ui/TopBarReadout.test`
Expected: FAIL — wait-pill props/element not yet defined.

- [ ] **Step 3: Extend TopBarReadout with the wait pill**

Replace the entire `src/ui/TopBarReadout.tsx` with:

```tsx
import { useEffect, useReducer, useRef, useState } from "react";
import type { Transport } from "../transport/transport";
import type { AudioEngine } from "../audio/engine";
import type { TabMode } from "../layout/practiceMode";
import type { Hand } from "../model/score";
import { measureAt, loopMeasureRange } from "../transport/measureMap";

interface TopBarReadoutProps {
  mode: TabMode;
  transport: Transport;
  audioEngine: AudioEngine | null;
  /** Wait-mode state — required when mode === "midi", ignored in Play. */
  waitEnabled?: boolean;
  onWaitEnabledChange?: (on: boolean) => void;
  handsIPlay?: ReadonlySet<Hand>;
  onHandsIPlayChange?: (hands: Set<Hand>) => void;
}

type HandChoice = "left" | "both" | "right";

function handsPreset(hands: ReadonlySet<Hand> | undefined): HandChoice | "none" {
  if (!hands) return "none";
  if (hands.has("left") && hands.has("right")) return "both";
  if (hands.has("left")) return "left";
  if (hands.has("right")) return "right";
  return "none";
}

function handsForChoice(c: HandChoice): Set<Hand> {
  if (c === "both") return new Set(["left", "right"]);
  if (c === "left") return new Set(["left"]);
  return new Set(["right"]);
}

function waitLabel(enabled: boolean, hands: ReadonlySet<Hand> | undefined): string {
  if (!enabled) return "Turn on wait mode";
  const p = handsPreset(hands);
  if (p === "left") return "Wait L";
  if (p === "right") return "Wait R";
  if (p === "both") return "Wait L+R";
  return "Wait"; // wait on but no hand selected (shouldn't normally happen)
}

/**
 * The live chip group that fills the top-bar slack region:
 *  - read-only chips: tempo, time-signature, current measure, active loop
 *  - wait pill (MIDI Practice mode only): indicator + control coupling
 *    `waitEnabled` and `handsIPlay`. Off-state shows "Turn on wait mode";
 *    on-state shows "Wait L" / "Wait L+R" / "Wait R".
 *
 * Re-renders on every clock change.
 */
export function TopBarReadout({
  mode,
  transport,
  audioEngine,
  waitEnabled = false,
  onWaitEnabledChange,
  handsIPlay,
  onHandsIPlayChange,
}: TopBarReadoutProps): React.JSX.Element {
  const [, forceUpdate] = useReducer((n: number) => n + 1, 0);
  useEffect(() => transport.clock.onChange(forceUpdate), [transport]);

  const [waitOpen, setWaitOpen] = useState(false);
  const waitRootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!waitOpen) return;
    function onDocMouseDown(e: MouseEvent): void {
      if (!waitRootRef.current?.contains(e.target as Node)) setWaitOpen(false);
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") setWaitOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [waitOpen]);

  function pickHand(c: HandChoice): void {
    onHandsIPlayChange?.(handsForChoice(c));
    onWaitEnabledChange?.(true);
    setWaitOpen(false);
  }
  function turnOff(): void {
    onWaitEnabledChange?.(false);
    setWaitOpen(false);
  }

  const bpm = Math.round(transport.bpm);
  const sig = audioEngine?.metronome.timeSignature;
  const totalMeasures = transport.score.measures.length;
  const currentMeasure =
    totalMeasures > 0 ? measureAt(transport, transport.clock.position) + 1 : 0;
  const loopRange = loopMeasureRange(transport);
  const currentHand = handsPreset(handsIPlay);

  return (
    <div className="top-bar-readout">
      <span className="top-bar-readout-chip">♩ = {bpm}</span>
      {sig && (
        <span className="top-bar-readout-chip">
          {sig.numerator}/{sig.denominator}
        </span>
      )}
      {totalMeasures > 0 && (
        <span className="top-bar-readout-chip">
          m. {currentMeasure} / {totalMeasures}
        </span>
      )}
      {loopRange && (
        <span className="top-bar-readout-chip top-bar-readout-chip--loop">
          ↻ m.{loopRange.first + 1}–{loopRange.last + 1}
        </span>
      )}
      {mode === "midi" && (
        <div className="top-bar-wait" ref={waitRootRef}>
          <button
            type="button"
            className={`top-bar-wait-pill top-bar-wait-pill--${waitEnabled ? "on" : "off"}`}
            aria-pressed={waitEnabled}
            aria-haspopup="menu"
            aria-expanded={waitOpen}
            onClick={() => setWaitOpen((o) => !o)}
          >
            <span className="top-bar-wait-dot" aria-hidden="true" />
            {waitLabel(waitEnabled, handsIPlay)}
          </button>
          {waitOpen && (
            <ul className="top-bar-select-menu" role="menu">
              {waitEnabled && (
                <>
                  <li
                    role="menuitem"
                    className="top-bar-select-item"
                    onClick={turnOff}
                  >
                    <span className="top-bar-select-check" aria-hidden="true">
                      {" "}
                    </span>
                    Off
                  </li>
                  <li className="top-bar-select-divider" role="separator" />
                </>
              )}
              {(["left", "both", "right"] as HandChoice[]).map((c) => {
                const active = waitEnabled && currentHand === c;
                const label =
                  c === "left" ? "Left hand" : c === "both" ? "Both hands" : "Right hand";
                return (
                  <li
                    key={c}
                    role="menuitem"
                    aria-current={active ? "true" : undefined}
                    className={`top-bar-select-item${active ? " top-bar-select-item--active" : ""}`}
                    onClick={() => pickHand(c)}
                  >
                    <span className="top-bar-select-check" aria-hidden="true">
                      {active ? "✓" : " "}
                    </span>
                    {label}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add the wait-pill CSS**

Append to `src/styles/theme.css`:

```css
/* --- TopBarReadout wait pill --- */

.top-bar-wait { position: relative; display: inline-flex; }

.top-bar-wait-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 1.5rem;
  padding: 0 0.7rem;
  border-radius: 999px;
  font: inherit;
  font-size: 0.78rem;
  white-space: nowrap;
  cursor: pointer;
}

.top-bar-wait-pill--off {
  color: var(--text-dim);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--glass-border);
}
.top-bar-wait-pill--off .top-bar-wait-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: #4a4a52;
  display: inline-block;
}

.top-bar-wait-pill--on {
  color: var(--bg);
  background: var(--accent);
  border: 1px solid var(--accent);
  font-weight: 500;
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.top-bar-wait-pill--on .top-bar-wait-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: #d6ffe9;
  box-shadow: 0 0 6px rgba(255, 255, 255, 0.6);
  display: inline-block;
}
```

- [ ] **Step 5: Run tests**

Run: `npm test -- src/ui/TopBarReadout.test`
Expected: PASS (all read-only + wait-pill tests).

- [ ] **Step 6: Commit**

```bash
git add src/ui/TopBarReadout.tsx src/ui/TopBarReadout.test.tsx src/styles/theme.css
git commit -m "feat(top-bar): wait pill — green-on / gray-off + hand menu coupling"
```

---

## Task 7: Wire TopBarReadout into TopBar + thread props from PracticeView

**Files:**
- Modify: `src/ui/TopBar.tsx` (add `<TopBarReadout>` in the slack region; extend props)
- Modify: `src/app/PracticeView.tsx` (pass wait/hands into `<TopBar>`)
- Modify: `src/ui/TopBar.test.tsx` (assert readout renders)

- [ ] **Step 1: Extend `TopBarProps` and render `<TopBarReadout>`**

In `src/ui/TopBar.tsx`, at the top add the import:

```ts
import { TopBarReadout } from "./TopBarReadout";
import type { Hand } from "../model/score";
```

Extend the `TopBarProps` interface with these three new props (alongside the existing ones):

```ts
  /** MIDI tab: wait-mode state, exposed via the top-bar wait pill. */
  waitEnabled?: boolean;
  onWaitEnabledChange?: (on: boolean) => void;
  handsIPlay?: ReadonlySet<Hand>;
  onHandsIPlayChange?: (hands: Set<Hand>) => void;
```

Add them to the destructured component arguments. Then inside the rendered JSX, replace the existing `<span className="top-bar-spacer" />` line (around line 192) with:

```tsx
<span className="top-bar-spacer" />
<TopBarReadout
  mode={mode}
  transport={transport}
  audioEngine={audioEngine}
  waitEnabled={waitEnabled}
  onWaitEnabledChange={onWaitEnabledChange}
  handsIPlay={handsIPlay}
  onHandsIPlayChange={onHandsIPlayChange}
/>
```

- [ ] **Step 2: Thread the props through `PracticeView`**

In `src/app/PracticeView.tsx`, find the `<TopBar ... />` element (around line 719) and add these props inside its JSX prop list (alongside the existing ones — order doesn't matter):

```tsx
waitEnabled={waitEnabled}
onWaitEnabledChange={setWaitEnabled}
handsIPlay={handsIPlay}
onHandsIPlayChange={setHandsIPlay}
```

(The state variables `waitEnabled`, `setWaitEnabled`, `handsIPlay`, `setHandsIPlay` are already declared at lines 121, 124.)

- [ ] **Step 3: Update TopBar.test.tsx**

Append a new test block to `src/ui/TopBar.test.tsx` (in the existing `describe`):

```tsx
it("renders the readout chips for both isMidiSource modes", () => {
  // helper: pass minimum required props; existing tests show the shape
  // ...assuming the existing helper renderTopBar(opts) exists; if not,
  // mimic the props used by other tests in this file.
});
```

Then check the file's existing structure: if there's a render helper, extend it to thread `waitEnabled`/`handsIPlay` with default fake values. Replace the placeholder above with concrete assertions matching that pattern, e.g.:

```tsx
expect(screen.getByText(/♩ =/)).toBeInTheDocument();
expect(screen.getByText(/m\./)).toBeInTheDocument();
```

If you can't easily extend a helper, leave the wait-pill behavior fully covered by `TopBarReadout.test.tsx` and just add a smoke test in TopBar.test.tsx that confirms the readout container renders.

- [ ] **Step 4: Run tests**

Run: `npm test -- src/ui/TopBar.test src/ui/TopBarReadout.test src/app/PracticeView`
Expected: PASS.

- [ ] **Step 5: Smoke test in the browser**

Run: `npm run dev`. Open the app with a MIDI source file. Confirm the wait pill appears next to the readout chips, defaults to gray "Turn on wait mode", and clicking it opens the hand menu. Pick "Left hand"; pill goes green, reads "Wait L".

- [ ] **Step 6: Commit**

```bash
git add src/ui/TopBar.tsx src/app/PracticeView.tsx src/ui/TopBar.test.tsx
git commit -m "feat(top-bar): wire TopBarReadout + wait-mode props from PracticeView"
```

---

## Task 8: Rewrite ModeSwitch as TopBarSelect consumer

**Files:**
- Modify: `src/ui/ModeSwitch.tsx`
- Modify: `src/ui/ModeSwitch.test.tsx`

- [ ] **Step 1: Update the test file for the new dropdown shape**

Replace `src/ui/ModeSwitch.test.tsx` with:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ModeSwitch } from "./ModeSwitch";

describe("ModeSwitch", () => {
  it("renders a pill showing the current mode label", () => {
    render(<ModeSwitch mode="play" onModeChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Play/ })).toBeInTheDocument();
  });

  it("shows `MIDI Practice` as the pill label when mode is midi", () => {
    render(<ModeSwitch mode="midi" onModeChange={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /MIDI Practice/ }),
    ).toBeInTheDocument();
  });

  it("clicking the pill opens a menu with Play and MIDI Practice", () => {
    render(<ModeSwitch mode="play" onModeChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Play/ }));
    expect(screen.getByRole("menuitem", { name: /Play/ })).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /MIDI Practice/ }),
    ).toBeInTheDocument();
  });

  it("calls onModeChange with the picked mode", () => {
    const onModeChange = vi.fn();
    render(<ModeSwitch mode="play" onModeChange={onModeChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Play/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /MIDI Practice/ }));
    expect(onModeChange).toHaveBeenCalledWith("midi");
  });
});
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/ui/ModeSwitch.test`
Expected: FAIL — the old two-button output doesn't match the new role/name patterns.

- [ ] **Step 3: Rewrite ModeSwitch**

Replace `src/ui/ModeSwitch.tsx` with:

```tsx
import { TopBarSelect } from "./TopBarSelect";
import type { TabMode } from "../layout/practiceMode";

interface ModeSwitchProps {
  mode: TabMode;
  onModeChange: (m: TabMode) => void;
}

const OPTIONS = [
  { value: "play", label: "Play" },
  { value: "midi", label: "MIDI Practice" },
] as const satisfies ReadonlyArray<{ value: TabMode; label: string }>;

/**
 * The Play / MIDI Practice tab toggle. Rendered as a single pill that shows
 * the current mode and opens a dropdown with both options.
 */
export function ModeSwitch({
  mode,
  onModeChange,
}: ModeSwitchProps): React.JSX.Element {
  return (
    <TopBarSelect<TabMode>
      value={mode}
      options={[...OPTIONS]}
      onChange={onModeChange}
    />
  );
}
```

- [ ] **Step 4: Run tests, expect PASS**

Run: `npm test -- src/ui/ModeSwitch.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/ModeSwitch.tsx src/ui/ModeSwitch.test.tsx
git commit -m "refactor(top-bar): ModeSwitch becomes a TopBarSelect dropdown"
```

---

## Task 9: Play-tab View pill

**Files:**
- Modify: `src/ui/TopBar.tsx` (replace the `mode === "play"` view-controls cluster)
- Modify: `src/ui/TopBar.test.tsx` (update Play-tab assertions if any)

- [ ] **Step 1: Replace the inline view-controls cluster (Play branch)**

In `src/ui/TopBar.tsx`, find the existing Play branch around line 211–223:

```tsx
{!isMidiSource && (
  mode === "play" ? (
    <div className="top-bar-views">
      {VIEW_MODE_OPTIONS.map(({ mode: viewModeOption, label }) => (
        <button
          key={viewModeOption}
          type="button"
          aria-pressed={viewMode === viewModeOption}
          onClick={() => onViewModeChange(viewModeOption)}
        >
          {label}
        </button>
      ))}
    </div>
  ) : ( /* MIDI Practice branch — Task 10 */ )
)}
```

Replace the Play branch with:

```tsx
<TopBarSelect<ViewMode>
  label="View:"
  value={viewMode}
  options={[
    { value: "both", label: "Both" },
    { value: "falldown", label: "Falldown only" },
    { value: "score", label: "Score only" },
  ]}
  onChange={onViewModeChange}
/>
```

Add `import { TopBarSelect } from "./TopBarSelect";` at the top of the file (if not already present from Task 7).

Delete the now-unused `VIEW_MODE_OPTIONS` constant (top of file, around line 39–43).

- [ ] **Step 2: Update or add a test**

In `src/ui/TopBar.test.tsx`, find any test that asserts `getByText("Both")` / `Falldown only` / `Score only` and update to look for the pill instead, e.g. `screen.getByRole("button", { name: /View: Both/ })`.

- [ ] **Step 3: Run tests**

Run: `npm test -- src/ui/TopBar.test`
Expected: PASS.

- [ ] **Step 4: Smoke test**

Run: `npm run dev`. Switch to Play mode on a MusicXML file. Confirm the View pill appears on the right, click it, menu opens with all three options, picking one updates the view.

- [ ] **Step 5: Commit**

```bash
git add src/ui/TopBar.tsx src/ui/TopBar.test.tsx
git commit -m "refactor(top-bar): Play-tab view buttons → TopBarSelect pill"
```

---

## Task 10: MIDI Practice Layout + Theme merged pill

**Files:**
- Modify: `src/ui/TopBar.tsx` (replace the MIDI Practice view-controls branch with a single multi-section `<TopBarSelect>`)
- Modify: `src/ui/TopBar.test.tsx` (update MIDI Practice assertions)

- [ ] **Step 1: Define the merged value/option model**

The merged pill handles two pieces of state from one menu: `practiceLayout` (`"lane" | "split"`) and `laneTheme` (`"dark" | "paper"`). The pill's current value is the practiceLayout. Picking a Lane-theme item also forces `practiceLayout === "lane"`.

Implement a small wrapper inside `TopBar.tsx` (just above the return). Add this private helper near the top of `TopBar.tsx`:

```tsx
type LayoutMenuValue = PracticeLayout | `theme:${LaneTheme}`;

function isThemeValue(v: LayoutMenuValue): v is `theme:${LaneTheme}` {
  return v.startsWith("theme:");
}
```

- [ ] **Step 2: Replace the MIDI Practice branch**

In `src/ui/TopBar.tsx`, replace the existing MIDI Practice branch (around lines 224–253):

```tsx
) : (
  <div className="top-bar-views">
    <button …Reading lane…>
    <button …Split…>
    {practiceLayout === "lane" && <button …Paper/Dark…>}
  </div>
)
```

with:

```tsx
) : (
  <TopBarSelect<LayoutMenuValue>
    label="Layout:"
    value={practiceLayout}
    sections={[
      {
        section: "Layout",
        items: [
          { value: "lane", label: "Reading lane" },
          { value: "split", label: "Split" },
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
    onChange={(v) => {
      if (isThemeValue(v)) {
        const theme = v.slice("theme:".length) as LaneTheme;
        onLaneThemeChange(theme);
        if (practiceLayout !== "lane") onPracticeLayoutChange("lane");
      } else {
        onPracticeLayoutChange(v);
      }
    }}
  />
)
```

The pill's `value` is the layout, so its rendered label is always "Layout: Reading lane" or "Layout: Split". The Theme section items are picked from but never appear in the pill label — that's by design.

But — `TopBarSelect` looks up the current `value` in `allItems` to render its label. Since `LayoutMenuValue` includes `"theme:..."` values that are NOT the current `value`, this works as long as `value` is always a layout value. Confirm it never gets set to a theme value (we only pass `value={practiceLayout}`, so yes).

To get the theme item to render an active check when its matching theme is current, however, we need a tweak. Update the implementation so the menu can mark items as active independently of the pill's `value`. Add an `extraActive?: Set<T>` prop to `TopBarSelect`:

Edit `src/ui/TopBarSelect.tsx`. Add to the props interface:

```ts
  /** Additional option values that should render with an active highlight,
   *  beyond the one that matches `value`. */
  extraActive?: ReadonlySet<T>;
```

Pass `extraActive` to `Section` and `Item`. In `Item`, change the `active` computation to:

```ts
const active = option.value === value || (extraActive?.has(option.value) ?? false);
```

Then in the MIDI Practice branch of `TopBar.tsx`, pass:

```tsx
extraActive={new Set<LayoutMenuValue>([`theme:${laneTheme}`])}
```

so the current theme item also shows the active check.

- [ ] **Step 3: Update or add MIDI Practice tests**

In `src/ui/TopBar.test.tsx`, replace any test that asserts the inline `Reading lane` / `Split` / `Paper`/`Dark` buttons with assertions against the new pill:

```tsx
fireEvent.click(screen.getByRole("button", { name: /Layout: Reading lane/ }));
expect(screen.getByRole("menuitem", { name: /Reading lane/ })).toBeInTheDocument();
expect(screen.getByRole("menuitem", { name: /Split/ })).toBeInTheDocument();
expect(screen.getByRole("menuitem", { name: /Light/ })).toBeInTheDocument();
expect(screen.getByRole("menuitem", { name: /Dark/ })).toBeInTheDocument();
```

Add a test for the auto-switch-from-Split behavior:

```tsx
it("picking a Lane theme from Split auto-switches to Reading lane", () => {
  const onPracticeLayoutChange = vi.fn();
  const onLaneThemeChange = vi.fn();
  render(
    <TopBar
      /* ... all required props ... */
      practiceLayout="split"
      laneTheme="dark"
      onPracticeLayoutChange={onPracticeLayoutChange}
      onLaneThemeChange={onLaneThemeChange}
      mode="midi"
      isMidiSource={false}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Layout: Split/ }));
  fireEvent.click(screen.getByRole("menuitem", { name: /Light/ }));
  expect(onLaneThemeChange).toHaveBeenCalledWith("paper");
  expect(onPracticeLayoutChange).toHaveBeenCalledWith("lane");
});
```

Also add a TopBarSelect test for `extraActive`:

```tsx
// in src/ui/TopBarSelect.test.tsx
it("marks options in extraActive with aria-current", () => {
  render(
    <TopBarSelect
      value="a"
      options={[{ value: "a", label: "A" }, { value: "b", label: "B" }]}
      extraActive={new Set(["b"])}
      onChange={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /A/ }));
  expect(screen.getByRole("menuitem", { name: /B/ })).toHaveAttribute("aria-current", "true");
});
```

- [ ] **Step 4: Run tests**

Run: `npm test -- src/ui/TopBar.test src/ui/TopBarSelect.test`
Expected: PASS.

- [ ] **Step 5: Smoke test**

Run: `npm run dev`. In MIDI Practice mode on a MusicXML file: open the Layout pill, confirm two sections render with the correct active states; pick Light while on Split, confirm both state changes happen in one click and the pill updates to "Layout: Reading lane".

- [ ] **Step 6: Commit**

```bash
git add src/ui/TopBar.tsx src/ui/TopBar.test.tsx src/ui/TopBarSelect.tsx src/ui/TopBarSelect.test.tsx
git commit -m "refactor(top-bar): MIDI Practice layout + theme → merged TopBarSelect pill"
```

---

## Task 11: Remove Hands + Wait from MidiTools

**Files:**
- Modify: `src/ui/MidiTools.tsx`
- Modify: `src/ui/MidiTools.test.tsx`
- Modify: `src/app/PracticeView.tsx` (drop the `handsIPlay`, `onHandsIPlayChange`, `waitEnabled`, `onWaitEnabledChange` props passed to `<MidiTools>`)
- Modify: `src/styles/theme.css` (delete `.midi-tools-hands` + `.midi-hands-buttons` rules)

- [ ] **Step 1: Trim MidiTools**

In `src/ui/MidiTools.tsx`:

1. Delete props `handsIPlay`, `onHandsIPlayChange`, `waitEnabled`, `onWaitEnabledChange` from `MidiToolsProps` and from the destructured arguments.
2. Delete the entire `.midi-tools-hands` `<div>` block (the "Hands I play" label + three `<button>` preset buttons).
3. Delete the `.midi-tools-check` `<label>` block for "Wait for me".
4. Delete the unused `handsPreset` helper function and the `preset` local variable.
5. Delete the unused imports `Hand`, `HandState` if applicable (keep what's still used).

- [ ] **Step 2: Drop the matching props at the call site**

In `src/app/PracticeView.tsx`, find the `<MidiTools ... />` element (around line 772). Remove these prop lines:

```tsx
handsIPlay={handsIPlay}
onHandsIPlayChange={setHandsIPlay}
waitEnabled={waitEnabled}
onWaitEnabledChange={setWaitEnabled}
```

(They remain in scope — they're now passed only to `<TopBar>` from Task 7.)

- [ ] **Step 3: Update MidiTools.test.tsx**

Drop any tests in `src/ui/MidiTools.test.tsx` that assert the Hands buttons or Wait checkbox render. Add a positive test that they're gone:

```tsx
it("does not render Hands I play or Wait for me (moved to top bar)", () => {
  render(<MidiTools {...defaultProps} />);
  expect(screen.queryByText(/hands i play/i)).toBeNull();
  expect(screen.queryByLabelText(/wait for me/i)).toBeNull();
});
```

Adjust `defaultProps` in that test file to match the trimmed prop interface.

- [ ] **Step 4: Delete the orphaned CSS**

In `src/styles/theme.css`, find and delete:

- The `.midi-tools-hands` block (whatever rules use that selector — currently around the MidiTools section)
- The `.midi-hands-buttons` block (around lines 894–929)

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/MidiTools.tsx src/ui/MidiTools.test.tsx src/app/PracticeView.tsx src/styles/theme.css
git commit -m "refactor(tools): remove Hands + Wait rows (top-bar wait pill replaces them)"
```

---

## Task 12: Move Input sound into General settings

**Files:**
- Modify: `src/ui/MidiTools.tsx` (drop Input sound row at root; forward `monitorOn`/`onMonitorOnChange` into `CommonTools`)
- Modify: `src/ui/CommonTools.tsx` (accept + forward optional `monitorOn` props)
- Modify: `src/ui/GeneralSettings.tsx` (render conditional Input sound checkbox)
- Modify: `src/ui/GeneralSettings.test.tsx`
- Modify: `src/ui/MidiTools.test.tsx`

- [ ] **Step 1: Write the failing GeneralSettings tests**

Replace (or extend) `src/ui/GeneralSettings.test.tsx` with these cases:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GeneralSettings } from "./GeneralSettings";

describe("GeneralSettings — Input sound conditional", () => {
  it("does NOT render an Input sound checkbox when monitor props are absent", () => {
    render(<GeneralSettings falldown={null} audioEngine={null} />);
    expect(screen.queryByLabelText(/input sound/i)).toBeNull();
  });

  it("renders Input sound when monitor props are provided", () => {
    render(
      <GeneralSettings
        falldown={null}
        audioEngine={null}
        monitorOn={false}
        onMonitorOnChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/input sound/i)).toBeInTheDocument();
  });

  it("toggling the Input sound checkbox calls onMonitorOnChange", () => {
    const onMonitorOnChange = vi.fn();
    render(
      <GeneralSettings
        falldown={null}
        audioEngine={null}
        monitorOn={false}
        onMonitorOnChange={onMonitorOnChange}
      />,
    );
    fireEvent.click(screen.getByLabelText(/input sound/i));
    expect(onMonitorOnChange).toHaveBeenCalledWith(true);
  });
});
```

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/ui/GeneralSettings.test`
Expected: FAIL — props not yet supported.

- [ ] **Step 3: Extend GeneralSettings**

Edit `src/ui/GeneralSettings.tsx`. Extend the props interface:

```ts
interface GeneralSettingsProps {
  falldown: FalldownRenderer | null;
  audioEngine: AudioEngine | null;
  /** MIDI Practice only — when present, renders the Input sound checkbox. */
  monitorOn?: boolean;
  onMonitorOnChange?: (on: boolean) => void;
}
```

Destructure the two new props. Inside the `.general-settings-row` `<div>`, add the checkbox **between** "Full 88 keys" and the Volume `<label className="hud-mini">`:

```tsx
{onMonitorOnChange !== undefined && (
  <label>
    <input
      type="checkbox"
      checked={monitorOn ?? false}
      onChange={(e) => onMonitorOnChange(e.target.checked)}
    />{" "}
    Input sound
  </label>
)}
```

- [ ] **Step 4: Extend CommonTools to forward the props**

In `src/ui/CommonTools.tsx`, extend `CommonToolsProps`:

```ts
interface CommonToolsProps {
  transport: Transport;
  audioEngine: AudioEngine | null;
  falldown: FalldownRenderer | null;
  countInBars: number;
  onCountInBarsChange: (bars: number) => void;
  monitorOn?: boolean;
  onMonitorOnChange?: (on: boolean) => void;
}
```

Destructure the two new props. Update the `<GeneralSettings ... />` element (around line 338) to:

```tsx
<GeneralSettings
  falldown={falldown}
  audioEngine={audioEngine}
  monitorOn={monitorOn}
  onMonitorOnChange={onMonitorOnChange}
/>
```

- [ ] **Step 5: Drop the Input sound row from MidiTools and forward the props**

In `src/ui/MidiTools.tsx`:

1. Delete the `<label className="midi-tools-check">` block for "Input sound" at the popover root.
2. Update the `<CommonTools ... />` element to forward the monitor props:

```tsx
<CommonTools
  transport={transport}
  audioEngine={audioEngine}
  falldown={falldown}
  countInBars={countInBars}
  onCountInBarsChange={onCountInBarsChange}
  monitorOn={monitorOn}
  onMonitorOnChange={onMonitorOnChange}
/>
```

The `monitorOn` and `onMonitorOnChange` props on `MidiToolsProps` remain — they're now passthrough only.

- [ ] **Step 6: Add a MidiTools test for the conditional**

Append to `src/ui/MidiTools.test.tsx`:

```tsx
it("Input sound checkbox lives inside General settings, not at the root", () => {
  render(<MidiTools {...defaultProps} />);
  // The Input sound label IS in the popover (rendered via GeneralSettings),
  // but it is NOT a direct child of the popover root. We assert presence
  // by label — the visual position is verified manually.
  expect(screen.getByLabelText(/input sound/i)).toBeInTheDocument();
});
```

- [ ] **Step 7: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Smoke test**

Run: `npm run dev`. In MIDI Practice mode, open Tools; confirm Input sound now sits inline with Note labels / Beat grid / Full 88 / Volume / Zoom in the General settings row. Switch to Play tab; confirm Input sound is absent from General settings.

- [ ] **Step 9: Commit**

```bash
git add src/ui/MidiTools.tsx src/ui/MidiTools.test.tsx src/ui/CommonTools.tsx src/ui/GeneralSettings.tsx src/ui/GeneralSettings.test.tsx
git commit -m "refactor(tools): move Input sound into General settings (MIDI Practice only)"
```

---

## Task 13: Sleekness touches (tabular-nums, strip toolbar underline, strip shadow)

**Files:**
- Modify: `src/styles/theme.css` (tabular-nums on `.top-bar button`)
- Modify: `src/styles/section-strip.css` (hover-only underline on toolbar links; strip already gets shadow from Task 1)

- [ ] **Step 1: Tabular-nums on top-bar buttons**

In `src/styles/theme.css`, find the `.top-bar button` rule (around line 97) and add `font-variant-numeric: tabular-nums;` to it. This propagates to mode pill, view pill, layout pill, etc. The readout chips already set it; the wait pill text doesn't need it.

- [ ] **Step 2: Hover-only underline on the section-strip toolbar links**

In `src/styles/section-strip.css`, find `.section-strip__undo, .section-strip__help-toggle` (around line 344). Change `text-decoration: underline;` → `text-decoration: none;`. Then add:

```css
.section-strip__undo:not(:disabled):hover,
.section-strip__help-toggle:hover {
  text-decoration: underline;
  text-underline-offset: 2px;
  /* color rule already adjusted in Task 1 */
}
```

(Merge with the existing hover rule rather than creating a duplicate.)

- [ ] **Step 3: Run tests + smoke**

Run: `npm test`
Expected: PASS (no behavior changes).

Smoke: open the section strip — toolbar links are plain text at rest, underline on hover; top-bar pills with digits don't jitter as they update.

- [ ] **Step 4: Commit**

```bash
git add src/styles/theme.css src/styles/section-strip.css
git commit -m "polish(chrome): tabular numerics on top-bar pills + hover-only underline on strip toolbar"
```

---

## Task 14: Feature docs + HANDOVER updates

**Files:**
- Modify: `docs/features/B-top-bar.md`
- Modify: `docs/features/J-midi-section-navigator.md`
- Modify: `HANDOVER.md`

- [ ] **Step 1: Append a Changes-log bullet to `docs/features/B-top-bar.md`**

Find the `## Changes log` section. Append a new bullet at the bottom (today's date):

```markdown
- 2026-05-24 — **Studio Dark refresh**: introduced `TopBarReadout` (live tempo / time-sig / measure / loop chips + green/gray wait pill), promoted Mode / View / Layout into the new `TopBarSelect` pill-with-dropdown primitive (Layout pill also owns Lane theme via a merged section). Removed the duplicated Hands + Wait rows from `MidiTools`; moved Input sound into General settings (MIDI Practice only). Play / pause glyph swapped for inline SVG.
```

If the file has "Keywords" or "Manual checklist" sections that drift from these changes, update them too.

- [ ] **Step 2: Append a Changes-log bullet to `docs/features/J-midi-section-navigator.md`**

Find the `## Changes log` section. Append:

```markdown
- 2026-05-24 — **Studio Dark retheme**: section strip background swapped from cream `#ebe5d4` to dark translucent (matches top-bar chrome). Block palette swapped for moody saturated tones (slate-blue, deep teal, plum, burnt amber, indigo). Hover line + playhead inverted (light on dark with dark halo); toolbar text color and link styling updated for dark.
```

- [ ] **Step 3: Update `HANDOVER.md`**

Open `HANDOVER.md`. Find the architecture overview's top-bar and section-strip callouts and update the descriptions to reflect:
- Top bar now hosts the readout chips + a wait-mode pill (MIDI Practice) in its slack region
- All multi-option selectors flow through `TopBarSelect`
- Section strip uses the Studio Dark palette / dark translucent panel

If the file has a "Known issues" section, no change needed unless something here introduces one.

- [ ] **Step 4: Commit**

```bash
git add docs/features/B-top-bar.md docs/features/J-midi-section-navigator.md HANDOVER.md
git commit -m "docs: log Studio Dark UI refresh in feature docs + HANDOVER"
```

---

## Task 15: Final verification — verify gate + manual checklist

**Files:**
- No file changes; this is the gate.

- [ ] **Step 1: Run the full verify gate (per CLAUDE.md)**

Run: `npm run lint && npm run typecheck && npm test && npm run build && npm run e2e`
Expected: All five steps PASS.

If any step fails, investigate and fix the underlying issue. Do NOT skip hooks or use `--no-verify`. Common likely failures:

- **Lint:** an unused import after deletion (e.g., `Hand` in `MidiTools.tsx`). Remove the unused import.
- **Typecheck:** a prop dropped from a component but still passed at a call site. Trace the type error to the missing or extra prop.
- **Test:** a test in `TopBar.test.tsx` or `MidiTools.test.tsx` asserting the old DOM. Update the assertion to the new shape.
- **e2e:** a Playwright spec that clicked the old `Reading lane`/`Split` buttons by name. Update the selector to click the Layout pill then the menuitem (or use an `aria-label`/`role` selector that survives the change).

- [ ] **Step 2: Run the manual checklist from the spec**

Walk through every step in the spec's "Manual checklist" section (`docs/superpowers/specs/2026-05-24-studio-dark-ui-refresh-design.md`). All 12 steps must pass:

1. MusicXML file: scrubber + chip group both render; tempo / time-sig / measure are read-only.
2. Press play: chip values update live.
3. Drag a loop on the score: red loop chip appears.
4. Open Tools → change tempo + time-sig: top-bar chips reflect new values immediately.
5. Open a MIDI file: section strip is dark with new palette; block text, hover line, snap line, drag preview, loop bracket remain readable.
6. MIDI Practice: wait pill shows "Turn on wait mode" gray; pick Left → pill green "Wait L"; right-hand falldown disappears. Tools: Hands / Wait rows gone; Input sound now in General settings row; Play tab General settings has NO Input sound.
7. Click wait pill while on: menu has Off at top + Left highlighted; pick Off → pill goes gray; hand selection preserved.
8. Resize viewport narrow: chips drop right-to-left (loop → measure → time-sig → tempo → wait); piece title stays whole until very narrow.
9. Click Mode pill: menu with Play + MIDI Practice; current highlighted; picking the other switches modes.
10. Play tab: click View pill → menu has Both / Falldown only / Score only; picking one updates view.
11. MIDI Practice (MusicXML): click Layout pill → menu has Layout section (Reading lane / Split) + Lane theme section (Light / Dark) below divider; current items in both sections highlighted.
12. While Layout = Split, open Layout pill and pick Light → lane switches to Reading lane + Light in one click; menu's highlighted items move accordingly.

If any step fails, file the gap (note it in the implementation thread, fix it, re-verify before merging).

- [ ] **Step 3: No commit needed**

This task is verification only — no source changes.

---

## Self-Review (post-write)

After completing the plan above:

- **Spec coverage:** Every section of the spec (section-strip palette, chip group, wait pill, mode/view/layout pills with merged theme, Tools cleanup, play SVG glyph, sleekness touches, docs) maps to at least one task above.
- **Placeholder scan:** No "TBD", "implement later", or "similar to Task N" — every step shows the actual change.
- **Type consistency:** `loopMeasureRange` is used in both `measureMap.ts` and `CommonTools.tsx` (Task 3); `TopBarSelect`'s `extraActive` prop is added in Task 10 and used the same task. `LayoutMenuValue` lives only inside `TopBar.tsx` (Task 10).
- **Verify gate at end:** Task 15 runs the full `lint && typecheck && test && build && e2e` per CLAUDE.md.
- **Doc updates:** Task 14 hits both feature docs (`B`, `J`) per CLAUDE.md's self-check, plus HANDOVER.
