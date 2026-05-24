import { describe, test, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { SplitWarningToast } from "./SplitWarningToast";

// Node 25 exposes a bare-bones localStorage global that shadows jsdom's
// implementation; replace it with a real in-memory store for these tests.
const makeLocalStorage = (): Storage => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => store.clear(),
    get length() { return store.size; },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
  } as Storage;
};

vi.stubGlobal("localStorage", makeLocalStorage());

const KEY = "arpeggio:tablet:split-warning-seen";

describe("SplitWarningToast", () => {
  beforeEach(() => {
    localStorage.removeItem(KEY);
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  test("renders when shouldShow becomes true and localStorage empty", () => {
    render(<SplitWarningToast shouldShow={true} />);
    expect(screen.getByRole("button", { name: /split.*tablet/i })).toHaveTextContent(/split.*tablet/i);
  });

  test("does not render after dismissal persists", () => {
    const { rerender } = render(<SplitWarningToast shouldShow={true} />);
    fireEvent.click(screen.getByRole("button", { name: /split.*tablet/i }));
    expect(screen.queryByRole("button", { name: /split.*tablet/i })).not.toBeInTheDocument();
    rerender(<SplitWarningToast shouldShow={true} />);
    expect(screen.queryByRole("button", { name: /split.*tablet/i })).not.toBeInTheDocument();
    expect(localStorage.getItem(KEY)).toBe("1");
  });

  test("auto-dismisses after 6 seconds", () => {
    render(<SplitWarningToast shouldShow={true} />);
    expect(screen.getByRole("button", { name: /split.*tablet/i })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(6000));
    expect(screen.queryByRole("button", { name: /split.*tablet/i })).not.toBeInTheDocument();
  });

  test("does not render when shouldShow is false", () => {
    render(<SplitWarningToast shouldShow={false} />);
    expect(screen.queryByRole("button", { name: /split.*tablet/i })).not.toBeInTheDocument();
  });

  test("becomes visible when shouldShow transitions from false to true", () => {
    const { rerender } = render(<SplitWarningToast shouldShow={false} />);
    expect(screen.queryByRole("button", { name: /split.*tablet/i })).not.toBeInTheDocument();
    rerender(<SplitWarningToast shouldShow={true} />);
    expect(screen.getByRole("button", { name: /split.*tablet/i })).toBeInTheDocument();
  });
});
