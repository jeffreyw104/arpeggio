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
 * The Verovio toolkit is a single stateful instance: two renders whose
 * setOptions / loadData / renderToSVG calls interleave corrupt each other
 * (e.g. the reading-lane render's options leaking into the score render).
 * Every render is therefore queued so they run strictly one at a time.
 */
let renderChain: Promise<unknown> = Promise.resolve();

function queueRender<T>(task: () => Promise<T>): Promise<T> {
  const result = renderChain.then(task, task);
  renderChain = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/**
 * Render a MusicXML string to one engraved SVG per page plus a note on/off
 * timemap. Every page is rendered so the score view can stack them into a
 * single scrollable strip; the timemap drives live note highlighting.
 */
export function renderScore(musicXml: string): Promise<RenderedScore> {
  return queueRender(() => renderScoreImpl(musicXml));
}

async function renderScoreImpl(musicXml: string): Promise<RenderedScore> {
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
 * (each line holds several measures), every page cropped tightly to its
 * systems (`adjustPageHeight`) so the pages stack into one near-continuous
 * run with no page whitespace. ALL pages are returned — Verovio caps the
 * usable page height, so a long piece genuinely spans several pages and the
 * lane must stack them all to cover the whole piece. The lane shows ~2
 * systems and jumps down a system at a time. Rendered separately from
 * `renderScore` so the paginated split view keeps its own page-style
 * engraving.
 */
export function renderReadingLane(musicXml: string): Promise<string[]> {
  return queueRender(() => renderReadingLaneImpl(musicXml));
}

async function renderReadingLaneImpl(musicXml: string): Promise<string[]> {
  const toolkit = await loadVerovioToolkit();
  toolkit.setOptions({
    adjustPageHeight: true,
    breaks: "auto",
    footer: "none",
    header: "none",
    scale: 40,
    // As tall as Verovio allows, to keep the page count (and the seams
    // between stacked pages) as low as possible.
    pageHeight: 60000,
  });
  toolkit.loadData(musicXml);
  const pageCount = Math.max(1, toolkit.getPageCount());
  const pages: string[] = [];
  for (let p = 1; p <= pageCount; p++) pages.push(toolkit.renderToSVG(p));
  return pages;
}

/** Count engraved measures in a Verovio SVG string (the `g.measure` elements). */
export function measureElementCount(svg: string): number {
  const matches = svg.match(/class="[^"]*\bmeasure\b[^"]*"/g);
  return matches ? matches.length : 0;
}
