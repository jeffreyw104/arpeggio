# MIDI Practice Mode — Plan 2: MIDI Input & Wait-Mode

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read a connected MIDI keyboard (and a QWERTY fallback), and make the MIDI Practice tab a wait-mode play-along: playback holds at each chord until the player matches it with strict simultaneity, then advances.

**Architecture:** A small `src/midi/` layer — a pure Web MIDI wrapper, a held-notes/pedal store, a QWERTY source, chord grouping, and a pure matching FSM. A `WaitModeController` runs in the existing frame loop and gates the master `Clock` via a new `holdAt` clamp (the same shape as the existing loop-wrap clamp). The `MidiTab` wires it together.

**Tech Stack:** Vite + React 19 + TypeScript strict · Tone.js · Vitest · Web MIDI API.

This is Spec 1, Part B. Spec: `docs/superpowers/specs/2026-05-19-midi-practice-mode-design.md`. Requires Plan 1 (chrome/tabs) to be merged first.

**Note on timestamps:** `MIDIMessageEvent.timeStamp` is already in the `performance.now()` domain. Both input sources stamp events with that one monotonic source, so no cross-domain normalization is needed; the FSM only ever compares press times *to each other*.

**Gate (run after every task):**
```
npm run lint && npm run typecheck && npm test && npm run build && npm run e2e
```

---

### Task 1: Clock `holdAt` clamp

**Files:**
- Modify: `src/transport/clock.ts`
- Modify: `src/transport/clock.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/transport/clock.test.ts`:

```ts
it("clamps position at holdAt and keeps playing", () => {
  const clock = new Clock(10);
  clock.setHold(2);
  clock.play();
  clock.tick(5);
  expect(clock.position).toBe(2);
  expect(clock.playing).toBe(true);
});

it("stays clamped across further ticks while held", () => {
  const clock = new Clock(10);
  clock.setHold(2);
  clock.play();
  clock.tick(5);
  clock.tick(5);
  expect(clock.position).toBe(2);
});

it("advances past a cleared hold", () => {
  const clock = new Clock(10);
  clock.setHold(2);
  clock.play();
  clock.tick(5);
  clock.setHold(null);
  clock.tick(3);
  expect(clock.position).toBeCloseTo(5);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- clock`
Expected: FAIL — `setHold` does not exist.

- [ ] **Step 3: Implement**

In `src/transport/clock.ts`, add a field beside `_loop`:

```ts
  private _holdAt: number | null = null;
```

Add a getter beside `loop` and a setter beside `setLoop`:

```ts
  get holdAt(): number | null {
    return this._holdAt;
  }

  /** Clamp clock advancement at `seconds`; null lifts the hold. */
  setHold(seconds: number | null): void {
    this._holdAt = seconds;
  }
```

In `tick()`, immediately after `let next = …` and before the `const loop = this._loop;` line, insert:

```ts
    if (this._holdAt != null && next >= this._holdAt) {
      if (this._position !== this._holdAt) {
        this._position = this._holdAt;
        this.emitChange();
      }
      return;
    }
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- clock`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/transport/clock.ts src/transport/clock.test.ts
git commit -m "feat: add a holdAt clamp to the master clock"
```

---

### Task 2: `MidiInput` — the Web MIDI wrapper

**Files:**
- Create: `src/midi/MidiInput.ts`
- Create: `src/midi/MidiInput.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/midi/MidiInput.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { MidiInput } from "./MidiInput";

interface FakeInput {
  id: string;
  name: string;
  onmidimessage: ((e: { data: Uint8Array; timeStamp: number }) => void) | null;
}

function fakeAccess(inputs: FakeInput[]) {
  const access = {
    inputs: new Map(inputs.map((i) => [i.id, i])),
    onstatechange: null as (() => void) | null,
  };
  return access;
}

afterEach(() => {
  // @ts-expect-error test cleanup
  delete navigator.requestMIDIAccess;
});

describe("MidiInput", () => {
  it("reports unsupported when the API is absent", async () => {
    const midi = new MidiInput();
    await midi.start();
    expect(midi.status).toBe("unsupported");
  });

  it("connects and lists devices", async () => {
    const input: FakeInput = { id: "d1", name: "Piano", onmidimessage: null };
    // @ts-expect-error test stub
    navigator.requestMIDIAccess = async () => fakeAccess([input]);
    const midi = new MidiInput();
    await midi.start();
    expect(midi.status).toBe("connected");
    expect(midi.devices).toEqual([{ id: "d1", name: "Piano" }]);
  });

  it("emits note-on, note-off and pedal from raw messages", async () => {
    const input: FakeInput = { id: "d1", name: "Piano", onmidimessage: null };
    // @ts-expect-error test stub
    navigator.requestMIDIAccess = async () => fakeAccess([input]);
    const midi = new MidiInput();
    const events: string[] = [];
    midi.onNoteOn = (e) => events.push(`on:${e.pitch}:${e.velocity}`);
    midi.onNoteOff = (e) => events.push(`off:${e.pitch}`);
    midi.onPedal = (down) => events.push(`pedal:${down}`);
    await midi.start();
    input.onmidimessage!({ data: new Uint8Array([0x90, 60, 127]), timeStamp: 1 });
    input.onmidimessage!({ data: new Uint8Array([0x90, 60, 0]), timeStamp: 2 });
    input.onmidimessage!({ data: new Uint8Array([0x80, 62, 40]), timeStamp: 3 });
    input.onmidimessage!({ data: new Uint8Array([0xb0, 64, 80]), timeStamp: 4 });
    input.onmidimessage!({ data: new Uint8Array([0xb0, 64, 10]), timeStamp: 5 });
    expect(events).toEqual([
      "on:60:1",
      "off:60",
      "off:62",
      "pedal:true",
      "pedal:false",
    ]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- MidiInput`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/midi/MidiInput.ts`:

```ts
/** A note press or release from an input source. */
export interface MidiNoteEvent {
  pitch: number;
  /** Normalized velocity, 0–1. */
  velocity: number;
  /** Event time in the performance.now() domain (ms). */
  pressTime: number;
}

/** A connected MIDI input device. */
export interface MidiDevice {
  id: string;
  name: string;
}

export type MidiStatus = "unsupported" | "denied" | "no-device" | "connected";

/**
 * Thin wrapper over the Web MIDI API: device enumeration, hot-plug, and raw
 * message parsing. Holds no app logic — callers wire the emitted events to a
 * LiveNotes store.
 */
export class MidiInput {
  onNoteOn: ((e: MidiNoteEvent) => void) | null = null;
  onNoteOff: ((e: MidiNoteEvent) => void) | null = null;
  onPedal: ((down: boolean) => void) | null = null;
  /** Fired whenever `status` or `devices` changes. */
  onStatusChange: (() => void) | null = null;

  private access: MIDIAccess | null = null;
  private selectedId: string | null = null;
  private _status: MidiStatus = "no-device";
  private _devices: MidiDevice[] = [];

  get status(): MidiStatus {
    return this._status;
  }
  get devices(): readonly MidiDevice[] {
    return this._devices;
  }
  get selectedDevice(): MidiDevice | null {
    return this._devices.find((d) => d.id === this.selectedId) ?? null;
  }

  /** Request Web MIDI access and bind devices. */
  async start(): Promise<void> {
    if (typeof navigator === "undefined" || !navigator.requestMIDIAccess) {
      this.setStatus("unsupported");
      return;
    }
    try {
      this.access = await navigator.requestMIDIAccess();
    } catch {
      this.setStatus("denied");
      return;
    }
    this.access.onstatechange = () => this.rebind();
    this.rebind();
  }

  /** Listen to a specific device by id. */
  select(id: string): void {
    this.selectedId = id;
    this.rebind();
  }

  private rebind(): void {
    if (!this.access) return;
    const inputs = [...this.access.inputs.values()];
    this._devices = inputs.map((i) => ({
      id: i.id,
      name: i.name ?? "MIDI device",
    }));
    for (const input of inputs) input.onmidimessage = null;
    if (this.selectedId == null && inputs.length > 0) {
      this.selectedId = inputs[0].id;
    }
    const active = inputs.find((i) => i.id === this.selectedId);
    if (active) {
      active.onmidimessage = (e) => this.handleMessage(e);
      this._status = "connected";
    } else {
      this.selectedId = null;
      this._status = "no-device";
      this.onPedal?.(false); // clear any stuck pedal on disconnect
    }
    this.onStatusChange?.();
  }

  private handleMessage(e: MIDIMessageEvent): void {
    const data = e.data;
    if (!data || data.length < 2) return;
    const status = data[0] & 0xf0;
    const a = data[1];
    const b = data.length > 2 ? data[2] : 0;
    if (status === 0x90 && b > 0) {
      this.onNoteOn?.({ pitch: a, velocity: b / 127, pressTime: e.timeStamp });
    } else if (status === 0x80 || (status === 0x90 && b === 0)) {
      this.onNoteOff?.({ pitch: a, velocity: 0, pressTime: e.timeStamp });
    } else if (status === 0xb0 && a === 64) {
      this.onPedal?.(b >= 64);
    }
  }

  private setStatus(status: MidiStatus): void {
    this._status = status;
    this.onStatusChange?.();
  }

  /** Detach all handlers. */
  dispose(): void {
    if (this.access) {
      for (const input of this.access.inputs.values()) {
        input.onmidimessage = null;
      }
      this.access.onstatechange = null;
    }
    this.onNoteOn = null;
    this.onNoteOff = null;
    this.onPedal = null;
    this.onStatusChange = null;
  }
}
```

If `npm run typecheck` reports `MIDIAccess` / `MIDIMessageEvent` / `requestMIDIAccess` as unknown, the project's TS lib lacks Web MIDI types — add `"dom"` is already present, so instead add a one-line dev dep `@types/webmidi` and `import "webmidi";` is not needed; the ambient types apply globally. Prefer this only if typecheck actually fails.

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- MidiInput`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/midi/MidiInput.ts src/midi/MidiInput.test.ts
git commit -m "feat: add the Web MIDI input wrapper"
```

---

### Task 3: `LiveNotes` — held-notes + pedal store

**Files:**
- Create: `src/midi/LiveNotes.ts`
- Create: `src/midi/LiveNotes.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/midi/LiveNotes.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { LiveNotes } from "./LiveNotes";

describe("LiveNotes", () => {
  it("tracks held notes and releases them", () => {
    const live = new LiveNotes();
    live.press(60, 0.8, 100);
    expect(live.heldNotes().map((n) => n.pitch)).toEqual([60]);
    live.release(60);
    expect(live.heldNotes()).toEqual([]);
  });

  it("defers a release while the pedal is down, flushing on pedal-up", () => {
    const live = new LiveNotes();
    live.press(60, 0.8, 100);
    live.setPedal(true);
    live.release(60);
    expect(live.heldNotes().map((n) => n.pitch)).toEqual([60]);
    live.setPedal(false);
    expect(live.heldNotes()).toEqual([]);
  });

  it("fires onPressed and onReleased callbacks", () => {
    const live = new LiveNotes();
    const log: string[] = [];
    live.onPressed = (n) => log.push(`press:${n.pitch}`);
    live.onReleased = (p) => log.push(`release:${p}`);
    live.press(60, 0.8, 100);
    live.release(60);
    expect(log).toEqual(["press:60", "release:60"]);
  });

  it("a re-press cancels a pending sustain", () => {
    const live = new LiveNotes();
    live.press(60, 0.8, 100);
    live.setPedal(true);
    live.release(60);
    live.press(60, 0.9, 200);
    live.setPedal(false);
    expect(live.heldNotes().map((n) => n.pitch)).toEqual([60]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- LiveNotes`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/midi/LiveNotes.ts`:

```ts
/** A currently-sounding note. */
export interface HeldNote {
  pitch: number;
  velocity: number;
  /** Press time in the performance.now() domain (ms). */
  pressTime: number;
}

/**
 * The live held-notes + pedal store. Input sources write here; the wait-mode
 * FSM and the falldown key-lighting read from here. Owns sustain-pedal
 * bookkeeping: a release while the pedal is down is deferred until pedal-up.
 */
export class LiveNotes {
  onPressed: ((note: HeldNote) => void) | null = null;
  onReleased: ((pitch: number) => void) | null = null;

  private held = new Map<number, HeldNote>();
  private sustained = new Set<number>();
  private _pedal = false;

  get pedalDown(): boolean {
    return this._pedal;
  }

  /** Pitches currently sounding. */
  heldNotes(): HeldNote[] {
    return [...this.held.values()];
  }

  press(pitch: number, velocity: number, pressTime: number): void {
    this.sustained.delete(pitch);
    const note = { pitch, velocity, pressTime };
    this.held.set(pitch, note);
    this.onPressed?.(note);
  }

  release(pitch: number): void {
    if (this._pedal) {
      if (this.held.has(pitch)) this.sustained.add(pitch);
      return;
    }
    if (this.held.delete(pitch)) this.onReleased?.(pitch);
  }

  setPedal(down: boolean): void {
    this._pedal = down;
    if (down) return;
    for (const pitch of this.sustained) {
      if (this.held.delete(pitch)) this.onReleased?.(pitch);
    }
    this.sustained.clear();
  }

  /** Drop all state (device disconnect, leaving the tab). */
  clear(): void {
    this.held.clear();
    this.sustained.clear();
    this._pedal = false;
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- LiveNotes`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/midi/LiveNotes.ts src/midi/LiveNotes.test.ts
git commit -m "feat: add the live held-notes and pedal store"
```

---

### Task 4: `KeyboardInput` — QWERTY fallback

**Files:**
- Create: `src/midi/KeyboardInput.ts`
- Create: `src/midi/KeyboardInput.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/midi/KeyboardInput.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { KeyboardInput } from "./KeyboardInput";

function keydown(key: string, target?: Element): void {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  void target;
}

describe("KeyboardInput", () => {
  it("maps QWERTY keys to pitches and emits note events", () => {
    const kb = new KeyboardInput();
    const log: string[] = [];
    kb.onNoteOn = (e) => log.push(`on:${e.pitch}`);
    kb.onNoteOff = (e) => log.push(`off:${e.pitch}`);
    kb.enable();
    keydown("a");
    window.dispatchEvent(new KeyboardEvent("keyup", { key: "a" }));
    kb.disable();
    expect(log).toEqual(["on:60", "off:60"]);
  });

  it("ignores unmapped keys and key repeats", () => {
    const kb = new KeyboardInput();
    const log: string[] = [];
    kb.onNoteOn = (e) => log.push(`on:${e.pitch}`);
    kb.enable();
    keydown("1");
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "a", repeat: true }),
    );
    kb.disable();
    expect(log).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- KeyboardInput`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/midi/KeyboardInput.ts`:

```ts
import type { MidiNoteEvent } from "./MidiInput";

/** One octave of piano keys, C4 (60) upward. */
const KEY_TO_PITCH: Readonly<Record<string, number>> = {
  a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66,
  g: 67, y: 68, h: 69, u: 70, j: 71, k: 72,
};

/** Velocity used for every QWERTY press (no real velocity available). */
const KEYBOARD_VELOCITY = 0.7;

/**
 * QWERTY-keyboard fallback input source. Emits the same MidiNoteEvent shape as
 * MidiInput so a connected keyboard is never required to use wait-mode.
 */
export class KeyboardInput {
  onNoteOn: ((e: MidiNoteEvent) => void) | null = null;
  onNoteOff: ((e: MidiNoteEvent) => void) | null = null;

  private enabled = false;
  private down = new Set<string>();

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
  }

  disable(): void {
    if (!this.enabled) return;
    this.enabled = false;
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    this.down.clear();
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    const target = e.target as HTMLElement | null;
    if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
    const key = e.key.toLowerCase();
    const pitch = KEY_TO_PITCH[key];
    if (pitch === undefined || this.down.has(key)) return;
    this.down.add(key);
    this.onNoteOn?.({
      pitch,
      velocity: KEYBOARD_VELOCITY,
      pressTime: performance.now(),
    });
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    const key = e.key.toLowerCase();
    const pitch = KEY_TO_PITCH[key];
    if (pitch === undefined || !this.down.has(key)) return;
    this.down.delete(key);
    this.onNoteOff?.({
      pitch,
      velocity: 0,
      pressTime: performance.now(),
    });
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- KeyboardInput`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/midi/KeyboardInput.ts src/midi/KeyboardInput.test.ts
git commit -m "feat: add the QWERTY keyboard input fallback"
```

---

### Task 5: `chords.buildSteps` — group notes into chord steps

**Files:**
- Create: `src/midi/chords.ts`
- Create: `src/midi/chords.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/midi/chords.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildSteps } from "./chords";
import type { Note } from "../model/score";

function note(midi: number, start: number, hand: "left" | "right"): Note {
  return { midi, start, duration: 1, velocity: 0.8, hand };
}

describe("buildSteps", () => {
  it("groups near-simultaneous notes into one step", () => {
    const notes = [
      note(60, 0, "right"),
      note(64, 0.02, "right"),
      note(67, 0.03, "right"),
      note(72, 1.0, "right"),
    ];
    const steps = buildSteps(notes, new Set(["right"]));
    expect(steps).toHaveLength(2);
    expect([...steps[0].requiredPitches].sort((a, b) => a - b)).toEqual([
      60, 64, 67,
    ]);
    expect(steps[0].time).toBe(0);
    expect([...steps[1].requiredPitches]).toEqual([72]);
  });

  it("filters to the chosen hand(s)", () => {
    const notes = [note(60, 0, "right"), note(48, 0, "left")];
    const steps = buildSteps(notes, new Set(["right"]));
    expect(steps).toHaveLength(1);
    expect([...steps[0].requiredPitches]).toEqual([60]);
  });

  it("includes both hands when both are chosen", () => {
    const notes = [note(60, 0, "right"), note(48, 0.01, "left")];
    const steps = buildSteps(notes, new Set(["left", "right"]));
    expect(steps).toHaveLength(1);
    expect([...steps[0].requiredPitches].sort((a, b) => a - b)).toEqual([
      48, 60,
    ]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- chords`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/midi/chords.ts`:

```ts
import type { Note, Hand } from "../model/score";

/** One chord the player must press together. */
export interface PracticeStep {
  /** Onset time, score seconds. */
  time: number;
  /** Pitches required for this step. */
  requiredPitches: Set<number>;
}

/** Notes within this of a cluster head form one chord step. */
export const STEP_GROUPING_SEC = 0.04;

/**
 * Group hand-filtered notes into ordered chord steps. Because the hand filter
 * is applied first, every emitted step has at least one required pitch — a
 * passage the app plays alone never produces a step, so the clock never holds
 * on a rest.
 */
export function buildSteps(
  notes: Note[],
  hands: ReadonlySet<Hand>,
): PracticeStep[] {
  const relevant = notes
    .filter((n) => hands.has(n.hand))
    .slice()
    .sort((a, b) => a.start - b.start);
  const steps: PracticeStep[] = [];
  let i = 0;
  while (i < relevant.length) {
    const head = relevant[i];
    const groupEnd = head.start + STEP_GROUPING_SEC;
    const requiredPitches = new Set<number>();
    while (i < relevant.length && relevant[i].start <= groupEnd) {
      requiredPitches.add(relevant[i].midi);
      i++;
    }
    steps.push({ time: head.start, requiredPitches });
  }
  return steps;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- chords`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/midi/chords.ts src/midi/chords.test.ts
git commit -m "feat: group score notes into chord practice steps"
```

---

### Task 6: `waitMode.evaluateStep` — the matching FSM

**Files:**
- Create: `src/midi/waitMode.ts`
- Create: `src/midi/waitMode.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/midi/waitMode.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { evaluateStep } from "./waitMode";
import type { PracticeStep } from "./chords";
import type { HeldNote } from "./LiveNotes";

const step: PracticeStep = {
  time: 1,
  requiredPitches: new Set([60, 64, 67]),
};

function held(pitch: number, pressTime: number): HeldNote {
  return { pitch, velocity: 0.8, pressTime };
}

describe("evaluateStep", () => {
  it("is pending when not all required pitches are down", () => {
    const r = evaluateStep(step, [held(60, 1000), held(64, 1010)], 900);
    expect(r.state).toBe("pending");
  });

  it("matches a chord pressed together", () => {
    const r = evaluateStep(
      step,
      [held(60, 1000), held(64, 1020), held(67, 1040)],
      900,
    );
    expect(r.state).toBe("matched");
  });

  it("is staggered when the chord is spread too wide", () => {
    const r = evaluateStep(
      step,
      [held(60, 1000), held(64, 1100), held(67, 1300)],
      900,
    );
    expect(r.state).toBe("staggered");
  });

  it("blocks on a wrong note pressed after arming", () => {
    const r = evaluateStep(
      step,
      [held(60, 1000), held(64, 1010), held(67, 1020), held(62, 1030)],
      900,
    );
    expect(r.state).toBe("wrong");
    expect(r.blocking).toEqual([62]);
  });

  it("ignores a note held over from before the step armed", () => {
    // 50 is not required and was pressed at 800, before armTime 900.
    const r = evaluateStep(
      step,
      [held(50, 800), held(60, 1000), held(64, 1010), held(67, 1020)],
      900,
    );
    expect(r.state).toBe("matched");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- waitMode`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/midi/waitMode.ts`:

```ts
import type { HeldNote } from "./LiveNotes";
import type { PracticeStep } from "./chords";

export type MatchState = "pending" | "wrong" | "staggered" | "matched";

/** Max press-time spread (seconds) for a chord to count as played together. */
export const SIMULTANEITY_SEC = 0.08;

export interface MatchResult {
  state: MatchState;
  /** Required pitches currently held. */
  accepted: number[];
  /** Held pitches blocking advancement (fresh wrong presses). */
  blocking: number[];
}

/**
 * Evaluate a step against the live held notes.
 *
 * `armTime` is the performance.now() ms at which the step became active. A
 * held pitch that is not required counts as a *blocking extra* only if it was
 * pressed after `armTime` — notes held over from a previous step have earlier
 * press times and are ignored, so strict "no extras" never punishes legato.
 *
 * Press times are in milliseconds, so the seconds window is scaled by 1000.
 */
export function evaluateStep(
  step: PracticeStep,
  held: HeldNote[],
  armTime: number,
): MatchResult {
  const required = step.requiredPitches;
  const accepted: number[] = [];
  const blocking: number[] = [];
  for (const note of held) {
    if (required.has(note.pitch)) {
      accepted.push(note.pitch);
    } else if (note.pressTime > armTime) {
      blocking.push(note.pitch);
    }
  }
  if (blocking.length > 0) {
    return { state: "wrong", accepted, blocking };
  }
  if (accepted.length < required.size) {
    return { state: "pending", accepted, blocking };
  }
  const times = held
    .filter((n) => required.has(n.pitch))
    .map((n) => n.pressTime);
  const spread = Math.max(...times) - Math.min(...times);
  if (spread > SIMULTANEITY_SEC * 1000) {
    return { state: "staggered", accepted, blocking };
  }
  return { state: "matched", accepted, blocking };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- waitMode`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/midi/waitMode.ts src/midi/waitMode.test.ts
git commit -m "feat: add the strict chord-matching FSM"
```

---

### Task 7: `WaitModeController` — gate the clock from the frame loop

**Files:**
- Create: `src/app/WaitModeController.ts`
- Create: `src/app/WaitModeController.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/WaitModeController.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { Clock } from "../transport/clock";
import { LiveNotes } from "../midi/LiveNotes";
import { WaitModeController } from "./WaitModeController";
import type { PracticeStep } from "../midi/chords";

const steps: PracticeStep[] = [
  { time: 1, requiredPitches: new Set([60]) },
  { time: 2, requiredPitches: new Set([62]) },
];

describe("WaitModeController", () => {
  it("holds the clock at the next step's onset", () => {
    const clock = new Clock(10);
    const live = new LiveNotes();
    const ctrl = new WaitModeController(clock, steps, live, () => 5000);
    ctrl.setEnabled(true);
    clock.play();
    clock.tick(1.5);
    ctrl.update();
    expect(clock.holdAt).toBe(1);
    expect(clock.position).toBe(1);
  });

  it("advances to the next step when the chord matches", () => {
    const clock = new Clock(10);
    const live = new LiveNotes();
    const ctrl = new WaitModeController(clock, steps, live, () => 5000);
    ctrl.setEnabled(true);
    clock.play();
    clock.tick(1);
    ctrl.update(); // arm + hold at step 0 (time 1)
    live.press(60, 0.8, 5001);
    ctrl.update(); // match -> advance
    expect(ctrl.result?.state).toBe("matched");
    expect(clock.holdAt).toBe(2);
  });

  it("clears the hold when disabled", () => {
    const clock = new Clock(10);
    const ctrl = new WaitModeController(clock, steps, new LiveNotes(), () => 0);
    ctrl.setEnabled(true);
    ctrl.setEnabled(false);
    expect(clock.holdAt).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- WaitModeController`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/app/WaitModeController.ts`:

```ts
import type { Clock } from "../transport/clock";
import type { LiveNotes } from "../midi/LiveNotes";
import type { PracticeStep } from "../midi/chords";
import { evaluateStep, type MatchResult } from "../midi/waitMode";

/** How far before a step's onset presses begin counting. */
export const EARLY_ACCEPT_SEC = 0.12;

/**
 * Drives wait-mode: each frame it parks the clock's hold at the next chord's
 * onset, evaluates the player's input against that chord, and advances when it
 * matches. Pure of UI — `result` is read by the tab for key-lighting.
 */
export class WaitModeController {
  /** Latest match evaluation, or null when no step is armed. */
  result: MatchResult | null = null;

  private stepIndex = 0;
  private armTime = 0;
  private armedFor = -1;
  private enabled = false;
  private readonly unsubscribeLoop: () => void;

  constructor(
    private readonly clock: Clock,
    private steps: PracticeStep[],
    private readonly live: LiveNotes,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.unsubscribeLoop = clock.onLoop(() => this.resyncToPosition());
  }

  /** Replace the steps (e.g. after the hand selection changes). */
  setSteps(steps: PracticeStep[]): void {
    this.steps = steps;
    this.resyncToPosition();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (on) {
      this.resyncToPosition();
    } else {
      this.clock.setHold(null);
      this.result = null;
    }
  }

  /** Point the step pointer at the first step at or after the clock. */
  resyncToPosition(): void {
    const pos = this.clock.position;
    const idx = this.steps.findIndex((s) => s.time >= pos);
    this.stepIndex = idx === -1 ? this.steps.length : idx;
    this.armedFor = -1;
  }

  /** Call once per frame, after the clock has ticked. */
  update(): void {
    if (!this.enabled) return;
    if (this.stepIndex >= this.steps.length) {
      this.clock.setHold(null);
      this.result = null;
      return;
    }
    const step = this.steps[this.stepIndex];
    this.clock.setHold(step.time);

    if (this.clock.position < step.time - EARLY_ACCEPT_SEC) {
      this.result = null;
      return;
    }
    if (this.armedFor !== this.stepIndex) {
      this.armTime = this.now();
      this.armedFor = this.stepIndex;
    }
    this.result = evaluateStep(step, this.live.heldNotes(), this.armTime);
    if (this.result.state === "matched") {
      this.stepIndex++;
      this.armedFor = -1;
      const next = this.steps[this.stepIndex];
      this.clock.setHold(next ? next.time : null);
    }
  }

  dispose(): void {
    this.unsubscribeLoop();
    this.clock.setHold(null);
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- WaitModeController`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/WaitModeController.ts src/app/WaitModeController.test.ts
git commit -m "feat: add the wait-mode controller gating the clock"
```

---

### Task 8: AudioEngine input monitor

**Files:**
- Modify: `src/audio/engine.ts`
- Modify: `src/audio/engine.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/audio/engine.test.ts`, find the fake `PianoSink` used by the existing tests and add `attackNote` / `releaseNote` to it (record calls). Add a test:

```ts
it("routes input notes to the piano sink as attack/release", () => {
  const attacks: number[] = [];
  const releases: number[] = [];
  const piano = {
    playNote: () => {},
    attackNote: (midi: number) => attacks.push(midi),
    releaseNote: (midi: number) => releases.push(midi),
  };
  const engine = new AudioEngine(transport, piano, click);
  engine.playInputNote(60, 0.8);
  engine.releaseInputNote(60);
  expect(attacks).toEqual([60]);
  expect(releases).toEqual([60]);
});
```

(Reuse whatever `transport` / `click` fixtures the surrounding tests already construct.)

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- engine`
Expected: FAIL — `attackNote` not on the `PianoSink` type / `playInputNote` not defined.

- [ ] **Step 3: Implement**

In `src/audio/engine.ts`, extend the `PianoSink` interface:

```ts
export interface PianoSink {
  playNote(midi: number, durationSeconds: number, velocity: number): void;
  /** Begin a sustained note (live input). */
  attackNote(midi: number, velocity: number): void;
  /** End a sustained note (live input). */
  releaseNote(midi: number): void;
}
```

Add two methods to the `AudioEngine` class, beside `playClick`:

```ts
  /** Sound a live-input note press through the piano. */
  playInputNote(midi: number, velocity: number): void {
    this.piano.attackNote(midi, velocity);
  }

  /** End a live-input note. */
  releaseInputNote(midi: number): void {
    this.piano.releaseNote(midi);
  }
```

In `createAudioEngine`, add to the real `piano` object (beside `playNote`):

```ts
    attackNote(midi, velocity) {
      if (!sampler.loaded) return;
      sampler.triggerAttack(
        Tone.Frequency(midi, "midi").toNote(),
        undefined,
        velocity,
      );
    },
    releaseNote(midi) {
      if (!sampler.loaded) return;
      sampler.triggerRelease(Tone.Frequency(midi, "midi").toNote());
    },
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- engine`
Expected: PASS. If any other test constructs a fake `PianoSink`, add the two new methods there too so typecheck passes.

- [ ] **Step 5: Commit**

```bash
git add src/audio/engine.ts src/audio/engine.test.ts
git commit -m "feat: add an input-monitor path to the audio engine"
```

---

### Task 9: Falldown key-lighting

**Files:**
- Modify: `src/falldown/renderer.ts`
- Modify: `src/falldown/renderer.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/falldown/renderer.test.ts`, add a test that constructs a `FalldownRenderer` (the existing tests already build one against a mock 2D context), sets `renderer.inputHighlights = new Map([[60, "correct"], [61, "wrong"]])`, calls `renderFrame()`, and asserts no throw plus that `inputHighlights` is a public mutable field. If the existing test harness captures `fillStyle` assignments, assert the green/red colors appear; otherwise a smoke assertion (`expect(() => renderer.renderFrame()).not.toThrow()`) is sufficient.

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- renderer`
Expected: FAIL — `inputHighlights` does not exist.

- [ ] **Step 3: Implement**

In `src/falldown/renderer.ts`, add two color constants beside `PULSE_COLOR`:

```ts
/** Key-lighting colours for live MIDI input. */
const INPUT_CORRECT = "#44aa88";
const INPUT_WRONG = "#d9534f";
```

Add a public field beside `beatMeter`:

```ts
  /** Live-input key highlights: midi -> correctness. Drawn over the keyboard. */
  inputHighlights = new Map<number, "correct" | "wrong">();
```

In `renderFrame()`, replace the `activeKeyColors:` argument to `drawPiano` with a pre-built, then overlaid, map:

```ts
    const keyColors = activeKeyColors(lit, t, RIGHT, LEFT);
    for (const [midi, kind] of this.inputHighlights) {
      keyColors.set(midi, kind === "correct" ? INPUT_CORRECT : INPUT_WRONG);
    }

    drawPiano(ctx, layout, {
      y: this.hitLineY,
      height: this.pianoHeight,
      activeKeyColors: keyColors,
      whiteColor: WHITE,
      blackColor: BLACK,
    });
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- renderer`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/falldown/renderer.ts src/falldown/renderer.test.ts
git commit -m "feat: draw live-input key highlights on the falldown keyboard"
```

---

### Task 10: Wire the MIDI tab — input, wait-mode, controls

This task assembles the modules into the `MidiTab` shell built in Plan 1. The tab owns the input sources, the `LiveNotes` store, the steps, and the `WaitModeController`, registers `controller.update()` into the frame loop, and renders the device/hands/wait controls in `MidiTools`.

**Files:**
- Modify: `src/app/MidiTab.tsx`, `src/app/MidiTab.test.tsx`
- Modify: `src/ui/MidiTools.tsx`
- Modify: `src/app/PracticeView.tsx` (pass the frame loop / audio engine to `MidiTab`)

- [ ] **Step 1: Hold MIDI session state in MidiTab**

In `MidiTab.tsx`, create on mount (via `useState` lazy initializers, like `PracticeView` does for `Transport`): a `MidiInput`, a `KeyboardInput`, a `LiveNotes`, and a `WaitModeController` built from `transport.clock`, `buildSteps(score.notes, hands)`, and the `LiveNotes`. State: `handsIPlay` (`Set<Hand>`, default `new Set(["right"])`), `waitEnabled` (default `true`), `monitorOn` (default `true`), `midiStatus`, `devices`.

- [ ] **Step 2: Wire the event graph in a mount effect**

```ts
useEffect(() => {
  midiInput.onNoteOn = (e) => liveNotes.press(e.pitch, e.velocity, e.pressTime);
  midiInput.onNoteOff = (e) => liveNotes.release(e.pitch);
  midiInput.onPedal = (down) => liveNotes.setPedal(down);
  midiInput.onStatusChange = () => {
    setMidiStatus(midiInput.status);
    setDevices([...midiInput.devices]);
  };
  keyboardInput.onNoteOn = (e) =>
    liveNotes.press(e.pitch, e.velocity, e.pressTime);
  keyboardInput.onNoteOff = (e) => liveNotes.release(e.pitch);
  liveNotes.onPressed = (n) => {
    if (monitorOnRef.current) audioEngine?.playInputNote(n.pitch, n.velocity);
  };
  liveNotes.onReleased = (p) => {
    if (monitorOnRef.current) audioEngine?.releaseInputNote(p);
  };
  keyboardInput.enable();
  void midiInput.start();
  return () => {
    keyboardInput.disable();
    midiInput.dispose();
    controller.dispose();
    liveNotes.clear();
  };
}, []); // eslint-disable-line react-hooks/exhaustive-deps
```

Use a `monitorOnRef` mirror of `monitorOn` so the stable callbacks read the live value. Register `controller.update()` into the shared `FrameLoop` (passed from `PracticeView`) and, in the same frame callback, copy the controller's result into the falldown highlights:

```ts
loop.onFrame(() => {
  controller.update();
  falldown.inputHighlights.clear();
  const r = controller.result;
  if (r) {
    for (const p of r.accepted) falldown.inputHighlights.set(p, "correct");
    for (const p of r.blocking) falldown.inputHighlights.set(p, "wrong");
  }
});
```

- [ ] **Step 3: React to control changes**

When `handsIPlay` changes: `controller.setSteps(buildSteps(score.notes, handsIPlay))`, and set the `AudioEngine` hand mutes via the shared `HandState` so the app plays only the hand(s) the player is *not* playing (`handState.setMuted(hand, handsIPlay.has(hand))` for each of `"left"`/`"right"`). When `waitEnabled` changes: `controller.setEnabled(waitEnabled)`. When `monitorOn` changes: update `monitorOnRef`.

- [ ] **Step 4: Fill in MidiTools**

Replace the Plan 1 placeholder block in `MidiTools.tsx` with real controls (props supplied by `MidiTab`):
- A device `<select>` listing `devices`, value = selected id, `onChange` → `midiInput.select(id)`. Below it a status line from `midiStatus` (`unsupported` → "Web MIDI not supported — using the computer keyboard"; `denied` → "MIDI access denied"; `no-device` → "No keyboard — using the computer keyboard"; `connected` → the device name).
- "Hands I play" — three buttons Left / Right / Both setting `handsIPlay`.
- A "Wait for me" checkbox bound to `waitEnabled`.
- An "Input sound" checkbox bound to `monitorOn`.
- Keep the Volume and Note-zoom groups.

- [ ] **Step 5: Tests**

In `MidiTab.test.tsx`: render the tab (Web MIDI absent in jsdom → status resolves to `unsupported`, QWERTY still active); assert pressing a mapped QWERTY key with wait-mode enabled holds the clock and that playing the required key advances it. Assert the falldown's `inputHighlights` is populated after a press.

- [ ] **Step 6: Run the gate + commit**

```bash
git add src/app/MidiTab.tsx src/app/MidiTab.test.tsx src/ui/MidiTools.tsx src/app/PracticeView.tsx
git commit -m "feat: wire MIDI input and wait-mode into the MIDI Practice tab"
```

---

### Task 11: Device status chip in the top bar + e2e

**Files:**
- Modify: `src/ui/TopBar.tsx`, `src/ui/TopBar.test.tsx`
- Modify: `src/app/PracticeView.tsx`
- Modify/Create: `tests/` Playwright spec

- [ ] **Step 1: Add the status chip**

Add an optional `midiStatus?: MidiStatus` and `midiDeviceName?: string` to `TopBarProps`. When `mode === "midi"` and `midiStatus` is set, render a chip before the `Tools▾` button: `connected` → `● <name>`; anything else → `○ Connect keyboard`. `PracticeView` lifts `midiStatus` / device name out of `MidiTab` (via a callback prop) and passes them to `TopBar`.

- [ ] **Step 2: Test the chip**

In `TopBar.test.tsx`, render with `mode="midi"` and `midiStatus="connected"`, `midiDeviceName="Piano"`; assert `● Piano` is shown. Render with `midiStatus="no-device"`; assert `○ Connect keyboard`.

- [ ] **Step 3: Playwright e2e**

Add an e2e: load a fixture piece, switch to the MIDI Practice tab, open `Tools▾`, assert the device select and the "Wait for me" / "Input sound" / hands controls are present, and that the status line shows the computer-keyboard fallback message (Web MIDI is unavailable in the Playwright browser context). Web MIDI input itself is not driven in e2e — the FSM is covered by unit tests.

- [ ] **Step 4: Run the gate + commit**

```bash
git add -A
git commit -m "feat: MIDI device status chip and wait-mode e2e coverage"
```

---

## Self-review notes

- Spec §2 (MidiInput / LiveNotes / KeyboardInput): Tasks 2–4.
- Spec §3 (chord grouping, FSM, clock hold, WaitModeController, endless/loop via the existing loop + `onLoop` resync): Tasks 1, 5, 6, 7.
- Spec §4 (input monitor, pedal bookkeeping in LiveNotes, key-lighting, hands-separate via HandState mutes): Tasks 3, 8, 9, 10.
- Spec §5 (MIDI tab wiring, MidiTools content): Task 10. Reading-lane strip itself shipped in Plan 1.
- Spec §1 MIDI status chip: Task 11.
- Spec §6 (errors): unsupported/denied handled in `MidiInput` (Task 2) and surfaced in `MidiTools` (Task 10); disconnect clears pedal + status in `rebind` (Task 2); empty steps cannot occur (Task 5).
- Spec §7 (testing): unit tests in every task; Playwright in Task 11.
- Type consistency check: `MidiNoteEvent` (pitch/velocity/pressTime) is shared by `MidiInput` and `KeyboardInput`; `HeldNote` (pitch/velocity/pressTime) flows `LiveNotes` → `evaluateStep`; `PracticeStep` (time/requiredPitches) flows `buildSteps` → `evaluateStep` / `WaitModeController`; `MatchResult` (state/accepted/blocking) flows `evaluateStep` → `WaitModeController.result` → falldown highlights. Consistent across tasks.
- Constant `EARLY_ACCEPT_SEC` lives in `WaitModeController.ts`; `STEP_GROUPING_SEC` in `chords.ts`; `SIMULTANEITY_SEC` in `waitMode.ts` — each with its sole consumer.
