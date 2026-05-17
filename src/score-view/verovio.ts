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
  loadData(data: string): boolean;
  renderToSVG(page: number): string;
  renderToTimemap(options?: object): TimemapEntry[];
  getPageCount(): number;
}

/** A rendered score: the engraved SVG plus the note on/off timemap. */
export interface RenderedScore {
  svg: string;
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
 * Render a MusicXML string to an engraved SVG plus a note on/off timemap. The
 * SVG is page 1 (Verovio is configured for one tall page so the score scrolls
 * as a strip); the timemap drives live note highlighting.
 */
export async function renderScore(musicXml: string): Promise<RenderedScore> {
  const toolkit = await loadVerovioToolkit();
  toolkit.loadData(musicXml);
  return {
    svg: toolkit.renderToSVG(1),
    timemap: toolkit.renderToTimemap({ includeMeasures: true }),
  };
}

/** Count engraved measures in a Verovio SVG string (the `g.measure` elements). */
export function measureElementCount(svg: string): number {
  const matches = svg.match(/class="[^"]*\bmeasure\b[^"]*"/g);
  return matches ? matches.length : 0;
}
