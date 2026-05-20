import type { Transport } from "../transport/transport";
import { PianoRollLane } from "./PianoRollLane";

const PANEL_MEASURES_PER_PAGE = 8;

/** Split-view variant of the MIDI piano-roll. Same renderer + paging as the
 *  lane, with a larger page size. No reading-lane chrome. */
export class PianoRollPanel extends PianoRollLane {
  constructor(container: HTMLElement, transport: Transport) {
    super(container, transport, { measuresPerPage: PANEL_MEASURES_PER_PAGE });
    const canvas = container.querySelector("canvas");
    if (canvas) canvas.className = "piano-roll-panel-canvas";
  }
}
