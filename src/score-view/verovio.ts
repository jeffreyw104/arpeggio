/**
 * Verovio renders MusicXML to an engraved SVG. The WASM toolkit is loaded
 * lazily and is not unit-tested (engraving is verified by build + manual checks);
 * `measureElementCount` is a pure helper that IS tested.
 */

/** One entry of Verovio's timemap: at `tstamp` ms, notes in `on` start
 *  sounding and notes in `off` stop. */
export interface TimemapEntry {
  tstamp: number;
  on?: string[];
  off?: string[];
}

/** A loaded Verovio toolkit, narrowed to the methods this app uses. */
export interface VerovioToolkit {
  setOptions(options: object): void;
  loadData(data: string): boolean;
  renderToSVG(page: number): string;
  renderToTimemap(options?: object): TimemapEntry[];
  getPageCount(): number;
}

/** A rendered score: one engraved SVG per page plus the note on/off timemap. */
export interface RenderedScore {
  svgPages: string[];
  timemap: TimemapEntry[];
}

let toolkitPromise: Promise<VerovioToolkit> | null = null;

/**
 * Load the Verovio WASM toolkit (once; subsequent calls reuse the instance).
 * Verovio is imported dynamically so the heavy WASM is only fetched when the
 * score view is actually used.
 */
export async function loadVerovioToolkit(): Promise<VerovioToolkit> {
  if (!toolkitPromise) {
    toolkitPromise = (async () => {
      const createVerovioModule = (await import("verovio/wasm")).default;
      const { VerovioToolkit } = await import("verovio/esm");
      const mod = await createVerovioModule();
      return new VerovioToolkit(mod) as unknown as VerovioToolkit;
    })();
  }
  return toolkitPromise;
}

/**
 * Render a MusicXML string to one engraved SVG per page plus a note on/off
 * timemap. Every page is rendered so the score view can stack them into a
 * single scrollable strip; the timemap drives live note highlighting.
 */
export async function renderScore(musicXml: string): Promise<RenderedScore> {
  const toolkit = await loadVerovioToolkit();
  // Sensible engraving options: every page rendered at the SAME full-page
  // height (adjustPageHeight off) so the score-only view can size all pages to
  // one uniform height and width; automatic line breaks; no header/footer.
  toolkit.setOptions({
    adjustPageHeight: false,
    breaks: "auto",
    footer: "none",
    header: "none",
    scale: 40,
  });
  toolkit.loadData(musicXml);
  const pageCount = toolkit.getPageCount();
  const svgPages: string[] = [];
  for (let p = 1; p <= Math.max(1, pageCount); p++) {
    svgPages.push(toolkit.renderToSVG(p));
  }
  return {
    svgPages,
    timemap: toolkit.renderToTimemap({ includeMeasures: true }),
  };
}

/**
 * Render the score for the MIDI Practice reading lane: normal system breaks
 * (each line holds several measures) but every system stacked onto ONE tall
 * page, so there are no page-boundary gaps. The lane shows ~2 systems and
 * jumps down a system at a time. Rendered separately from `renderScore` so the
 * paginated split view keeps its own page-style engraving.
 */
export async function renderReadingLane(musicXml: string): Promise<string> {
  const toolkit = await loadVerovioToolkit();
  toolkit.setOptions({
    // adjustPageHeight must stay OFF: with it on, Verovio paginates at a
    // default page height and ignores the huge pageHeight below, so a long
    // piece spills onto pages 2+ (and the lane, rendering only page 1, would
    // stop after the first page). Off, the huge pageHeight is honoured and
    // every system lands on one page — the lane has no page-boundary gaps.
    adjustPageHeight: false,
    breaks: "auto",
    footer: "none",
    header: "none",
    scale: 40,
    // No pageWidth override: a lane line is laid out exactly like a line in
    // the paginated score.
    pageHeight: 100000,
  });
  toolkit.loadData(musicXml);
  return toolkit.renderToSVG(1);
}

/** Count engraved measures in a Verovio SVG string (the `g.measure` elements). */
export function measureElementCount(svg: string): number {
  const matches = svg.match(/class="[^"]*\bmeasure\b[^"]*"/g);
  return matches ? matches.length : 0;
}
