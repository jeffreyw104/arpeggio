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

// A stand-in for Verovio output: three measures, each with a staff (whose
// `<path>` children stand in for the engraved staff lines) and one note. The
// staff-line `<path>` exercises ScoreView.measureBox's staff-line path rather
// than its full-measure-bbox fallback.
const measureSvg = (i: number) => `
  <g class="measure" id="m${i}">
    <g class="staff"><path/></g>
    <g class="note" id="n${i}"><rect/></g>
  </g>`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg">
  ${measureSvg(0)}${measureSvg(1)}${measureSvg(2)}
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

  it("adds a transparent .measure-hit rect to every measure", () => {
    const { container } = setup();
    const measures = container.querySelectorAll("[data-measure-index]");
    measures.forEach((m) => {
      const hit = m.querySelector("rect.measure-hit");
      expect(hit).not.toBeNull();
    });
  });

  it("draws a measure-hover rect when hovering the measure-hit area (not a note)", () => {
    const { container } = setup();
    const m1 = container.querySelector('[data-measure-index="1"]')!;
    const hit = m1.querySelector("rect.measure-hit")!;
    hit.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    const rect = container.querySelector("rect.measure-hover");
    expect(rect).not.toBeNull();
    expect(rect!.parentElement).toBe(m1);
  });

  it("draws a green measure-highlight rect inside the current measure", () => {
    const { container, transport, view } = setup();
    transport.clock.seek(2.5); // measure index 1
    view.renderFrame();
    const rect = container.querySelector("rect.measure-highlight");
    expect(rect).not.toBeNull();
    expect(rect!.getAttribute("class")).toBe("measure-highlight");
    // The rect lives inside the measure <g> itself (so it shares the
    // measure's coordinate space and covers the full measure rectangle).
    const measure = rect!.parentElement;
    expect(measure!.getAttribute("data-measure-index")).toBe("1");
    // Inserted as the first child so it sits behind the notation.
    expect(measure!.firstElementChild).toBe(rect);
  });

  it("moves the highlight rect into the new measure when the clock advances", () => {
    const { container, transport, view } = setup();
    transport.clock.seek(2.5); // measure index 1
    view.renderFrame();
    transport.clock.seek(4.5); // measure index 2
    view.renderFrame();
    const rects = container.querySelectorAll("rect.measure-highlight");
    expect(rects).toHaveLength(1); // one rect, moved — not duplicated
    expect(rects[0].parentElement!.getAttribute("data-measure-index")).toBe(
      "2",
    );
  });

  it("keeps exactly one highlight rect even after many frames", () => {
    const { container, transport, view } = setup();
    for (const t of [0.5, 2.5, 4.5, 2.5, 0.5]) {
      transport.clock.seek(t);
      view.renderFrame();
    }
    // The rect is moved between measures, never duplicated.
    expect(container.querySelectorAll("rect.measure-highlight")).toHaveLength(
      1,
    );
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

  it("draws a measure-hover rect inside the hovered measure on mousemove", () => {
    const { container } = setup();
    const m1 = container.querySelector('[data-measure-index="1"]')!;
    m1.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    const rect = container.querySelector("rect.measure-hover");
    expect(rect).not.toBeNull();
    expect(rect!.getAttribute("class")).toBe("measure-hover");
    expect(rect!.parentElement).toBe(m1);
    expect(m1.firstElementChild).toBe(rect);
  });

  it("moves the hover rect when the cursor crosses into another measure", () => {
    const { container } = setup();
    const m0 = container.querySelector('[data-measure-index="0"]')!;
    const m2 = container.querySelector('[data-measure-index="2"]')!;
    m0.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    m2.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    const rects = container.querySelectorAll("rect.measure-hover");
    expect(rects).toHaveLength(1); // one rect, moved — not duplicated
    expect(rects[0].parentElement).toBe(m2);
  });

  it("keeps exactly one hover rect across repeated cursor moves", () => {
    const { container } = setup();
    const m0 = container.querySelector('[data-measure-index="0"]')!;
    const m1 = container.querySelector('[data-measure-index="1"]')!;
    const m2 = container.querySelector('[data-measure-index="2"]')!;
    for (const m of [m0, m1, m2, m1, m0]) {
      m.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    }
    expect(container.querySelectorAll("rect.measure-hover")).toHaveLength(1);
  });

  it("clears the hover rect on mouseleave", () => {
    const { container } = setup();
    const m1 = container.querySelector('[data-measure-index="1"]')!;
    m1.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    expect(container.querySelector("rect.measure-hover")).not.toBeNull();
    container.dispatchEvent(new MouseEvent("mouseleave"));
    expect(container.querySelector("rect.measure-hover")).toBeNull();
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

  it("paints a measure-drag rect on every measure the pointer sweeps across", () => {
    const { container } = setup();
    const m0 = container.querySelector('[data-measure-index="0"]')!;
    const m2 = container.querySelector('[data-measure-index="2"]')!;
    m0.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    m2.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    expect(container.querySelectorAll(".measure-drag")).toHaveLength(3);
  });

  it("clears the drag preview on mouseup", () => {
    const { container } = setup();
    const m0 = container.querySelector('[data-measure-index="0"]')!;
    const m2 = container.querySelector('[data-measure-index="2"]')!;
    m0.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    m2.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    m2.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(container.querySelectorAll(".measure-drag")).toHaveLength(0);
  });

  it("paints a persistent measure-loop rect on every measure inside the active loop", () => {
    const { container, transport } = setup();
    transport.loopMeasures(0, 1);
    expect(container.querySelectorAll(".measure-loop")).toHaveLength(2);
  });

  it("removes the loop indicator when the loop is cleared", () => {
    const { container, transport } = setup();
    transport.loopMeasures(0, 2);
    expect(container.querySelectorAll(".measure-loop")).toHaveLength(3);
    transport.clearLoop();
    expect(container.querySelectorAll(".measure-loop")).toHaveLength(0);
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
