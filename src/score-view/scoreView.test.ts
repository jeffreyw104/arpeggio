import { describe, it, expect } from "vitest";
import { ScoreView } from "./scoreView";
import { Transport } from "../transport/transport";
import type { TimemapEntry } from "./verovio";
import type { Score } from "../model/score";

const score = {
  source: "midi",
  notes: [],
  measures: [
    { index: 0, start: 0, end: 2, numerator: 4, denominator: 4 },
    { index: 1, start: 2, end: 4, numerator: 4, denominator: 4 },
    { index: 2, start: 4, end: 6, numerator: 4, denominator: 4 },
  ],
  pedalEvents: [],
  timeSignatures: [{ start: 0, numerator: 4, denominator: 4 }],
  tempoMap: [{ start: 0, bpm: 120 }],
  durationSeconds: 6,
  musicXml: "",
  qualityWarning: null,
} satisfies Score;

// A stand-in for Verovio output: three measures, each with one identified note.
const svg = `<svg xmlns="http://www.w3.org/2000/svg">
  <g class="measure" id="m0"><g class="note" id="n0"><rect/></g></g>
  <g class="measure" id="m1"><g class="note" id="n1"><rect/></g></g>
  <g class="measure" id="m2"><g class="note" id="n2"><rect/></g></g>
</svg>`;

// n0 sounds in measure 0 (0-2 s), n1 in measure 1, n2 in measure 2.
const timemap: TimemapEntry[] = [
  { tstamp: 0, on: ["n0"] },
  { tstamp: 2000, on: ["n1"], off: ["n0"] },
  { tstamp: 4000, on: ["n2"], off: ["n1"] },
];

function setup() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const transport = new Transport(score);
  const view = new ScoreView(container, transport, [svg], timemap);
  return { container, transport, view };
}

describe("ScoreView", () => {
  it("injects the SVG and tags every measure with its index", () => {
    const { container } = setup();
    const measures = container.querySelectorAll("[data-measure-index]");
    expect(measures).toHaveLength(3);
    expect(measures[0].getAttribute("data-measure-index")).toBe("0");
    expect(measures[2].getAttribute("data-measure-index")).toBe("2");
  });

  it("draws a green measure-highlight rect over the current measure", () => {
    const { container, transport, view } = setup();
    transport.clock.seek(2.5); // measure index 1
    view.renderFrame();
    const rect = container.querySelector("rect.measure-highlight");
    expect(rect).not.toBeNull();
    expect(rect!.getAttribute("class")).toBe("measure-highlight");
  });

  it("re-renders without error while the clock is not playing", () => {
    const { container, transport, view } = setup();
    transport.clock.seek(2.5);
    view.renderFrame();
    expect(transport.clock.playing).toBe(false);
    transport.clock.seek(4.5); // measure index 2
    expect(() => view.renderFrame()).not.toThrow();
    expect(container.querySelector("rect.measure-highlight")).not.toBeNull();
  });

  it("draws a measure-hover rect on mousemove over a measure", () => {
    const { container } = setup();
    const m1 = container.querySelector('[data-measure-index="1"]')!;
    m1.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    const rect = container.querySelector("rect.measure-hover");
    expect(rect).not.toBeNull();
    expect(rect!.getAttribute("class")).toBe("measure-hover");
  });

  it("clicking a measure seeks the clock to that measure's start", () => {
    const { container, transport } = setup();
    const m2 = container.querySelector('[data-measure-index="2"]')!;
    m2.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    m2.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(transport.clock.position).toBe(4); // measure 2 starts at 4 s
  });

  it("dragging across measures sets the A-B loop", () => {
    const { container, transport } = setup();
    const m0 = container.querySelector('[data-measure-index="0"]')!;
    const m2 = container.querySelector('[data-measure-index="2"]')!;
    m0.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    m2.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(transport.clock.loop).toEqual({ start: 0, end: 6 });
  });

  it("destroy() removes the injected content and listeners", () => {
    const { container, view } = setup();
    view.destroy();
    expect(container.querySelectorAll("[data-measure-index]")).toHaveLength(0);
  });

  it("stacks multiple pages and tags measures across all of them", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const transport = new Transport(score);
    const pageA = `<svg xmlns="http://www.w3.org/2000/svg">
      <g class="measure" id="a0"></g>
      <g class="measure" id="a1"></g>
    </svg>`;
    const pageB = `<svg xmlns="http://www.w3.org/2000/svg">
      <g class="measure" id="b0"></g>
    </svg>`;
    new ScoreView(container, transport, [pageA, pageB], timemap);
    expect(container.querySelectorAll(".score-page")).toHaveLength(2);
    const measures = container.querySelectorAll("[data-measure-index]");
    expect(measures).toHaveLength(3);
    expect(measures[2].getAttribute("data-measure-index")).toBe("2");
  });

  it("setZoom() applies CSS zoom to the pages wrapper", () => {
    const { container, view } = setup();
    view.setZoom(1.5);
    const pages = container.querySelector(".score-pages") as HTMLElement;
    expect(pages.style.zoom).toBe("1.5");
  });
});
