import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadStripPosition, saveStripPosition } from "./stripPosition";

// Node 25 exposes a bare-bones localStorage global that shadows jsdom's
// implementation; replace it with a real in-memory store for these tests.
const makeLocalStorage = (): Storage => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    get length() {
      return store.size;
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
  } as Storage;
};

vi.stubGlobal("localStorage", makeLocalStorage());

beforeEach(() => {
  localStorage.clear();
});

describe("strip position pref", () => {
  it("defaults to 'bottom'", () => {
    expect(loadStripPosition()).toBe("bottom");
  });

  it("round-trips a saved value", () => {
    saveStripPosition("top");
    expect(loadStripPosition()).toBe("top");
  });

  it("ignores a garbage stored value", () => {
    localStorage.setItem("arpeggio.stripPosition", "diagonal");
    expect(loadStripPosition()).toBe("bottom");
  });
});
