import "fake-indexeddb/auto";
import "@testing-library/jest-dom";
import { afterEach } from "vitest";

// jsdom does not implement ResizeObserver; provide a minimal no-op stub so
// component tests that mount PracticeView do not throw.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// Reset the DOM between tests so leaked elements from one test cannot leak
// into another. Without this, jsdom's document-wide id-selector fast path can
// resolve `querySelector("#id")` to a stale element from an earlier test.
afterEach(() => {
  document.body.innerHTML = "";
});
