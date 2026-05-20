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

// jsdom does not implement SVGGraphicsElement.getBBox; ScoreView calls it to
// size its measure-highlight/hover overlay rects. Provide a zero-size stub.
const svgProto = SVGElement.prototype as unknown as {
  getBBox?: () => DOMRect;
};
if (!svgProto.getBBox) {
  svgProto.getBBox = () =>
    ({ x: 0, y: 0, width: 0, height: 0 }) as DOMRect;
}

// jsdom does not implement HTMLCanvasElement.getContext; provide a minimal
// no-op stub so PianoRollLane (and any canvas-using) tests do not throw.
if (typeof HTMLCanvasElement !== "undefined") {
  HTMLCanvasElement.prototype.getContext = function () {
    const noop = () => {};
    return {
      clearRect: noop, fillRect: noop, strokeRect: noop,
      beginPath: noop, moveTo: noop, lineTo: noop,
      stroke: noop, fill: noop, save: noop, restore: noop,
      translate: noop, scale: noop, rotate: noop,
      roundRect: noop, setLineDash: noop,
      fillText: noop, measureText: () => ({ width: 0 }),
      fillStyle: "", strokeStyle: "", lineWidth: 0,
      font: "", textAlign: "left", globalAlpha: 1,
      shadowColor: "", shadowBlur: 0,
    } as unknown as CanvasRenderingContext2D;
  } as typeof HTMLCanvasElement.prototype.getContext;
}

// Reset the DOM between tests so leaked elements from one test cannot leak
// into another. Without this, jsdom's document-wide id-selector fast path can
// resolve `querySelector("#id")` to a stale element from an earlier test.
afterEach(() => {
  document.body.innerHTML = "";
});
