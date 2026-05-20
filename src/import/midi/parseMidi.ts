import { Midi } from "@tonejs/midi";
import type {
  Measure,
  Note,
  PedalEvent,
  Score,
  TempoEvent,
  TimeSignature,
} from "../../model/score";

/** A note paired with the index of the track it came from. */
interface TrackedNote {
  note: Note;
  trackIndex: number;
}

/**
 * Decide a hand for every note.
 *
 * With two or more sounding tracks, the single track with the highest mean
 * pitch is the right hand and all others are the left. With a single track,
 * notes are split per-pitch around middle C (MIDI 60).
 */
function assignHands(tracked: TrackedNote[]): void {
  const byTrack = new Map<number, Note[]>();
  for (const { note, trackIndex } of tracked) {
    const bucket = byTrack.get(trackIndex);
    if (bucket) bucket.push(note);
    else byTrack.set(trackIndex, [note]);
  }

  if (byTrack.size >= 2) {
    let rightTrack = -1;
    let bestMean = -Infinity;
    for (const [trackIndex, notes] of byTrack) {
      const mean =
        notes.reduce((sum, n) => sum + n.midi, 0) / notes.length;
      if (mean > bestMean) {
        bestMean = mean;
        rightTrack = trackIndex;
      }
    }
    for (const { note, trackIndex } of tracked) {
      note.hand = trackIndex === rightTrack ? "right" : "left";
    }
    return;
  }

  for (const { note } of tracked) {
    note.hand = note.midi >= 60 ? "right" : "left";
  }
}

/**
 * Build measures by walking bar-by-bar in ticks, applying time-signature
 * changes as their tick is reached, and converting boundaries to seconds.
 */
function buildMeasures(
  midi: Midi,
  timeSignatures: TimeSignature[],
  endSeconds: number,
): Measure[] {
  const ppq = midi.header.ppq;
  // Time-signature changes paired with their tick, sorted ascending.
  const changes = midi.header.timeSignatures
    .map((ts) => ({
      ticks: ts.ticks,
      numerator: ts.timeSignature[0],
      denominator: ts.timeSignature[1],
    }))
    .sort((a, b) => a.ticks - b.ticks);

  const fallback = timeSignatures[0];
  let numerator = changes[0]?.numerator ?? fallback.numerator;
  let denominator = changes[0]?.denominator ?? fallback.denominator;

  const measures: Measure[] = [];
  let tick = 0;
  let index = 0;
  let nextChange = 1;

  // Guard against pathological inputs producing an unbounded loop.
  const maxBars = 100000;
  while (index < maxBars) {
    // Apply any time-signature change effective at or before this tick.
    while (
      nextChange < changes.length &&
      changes[nextChange].ticks <= tick
    ) {
      numerator = changes[nextChange].numerator;
      denominator = changes[nextChange].denominator;
      nextChange += 1;
    }

    const start = midi.header.ticksToSeconds(tick);
    // A bar that begins at or after the piece end adds nothing — stop before
    // emitting it, but always keep at least the opening measure.
    if (index > 0 && start >= endSeconds) break;

    const ticksPerBar = (ppq * 4 * numerator) / denominator;
    const end = midi.header.ticksToSeconds(tick + ticksPerBar);
    measures.push({ index, start, end, numerator, denominator });

    tick += ticksPerBar;
    index += 1;
  }

  return measures;
}

/**
 * Parse a MIDI file into a canonical Score, extracting timing data only.
 * `musicXml` and `qualityWarning` are placeholders filled by a later step.
 */
export function parseMidi(buffer: ArrayBuffer): Score {
  // Pass a Uint8Array, never the raw ArrayBuffer: @tonejs/midi branches on
  // `instanceof ArrayBuffer`, which fails across JS realms (e.g. a Node-created
  // buffer reaching the library inside a jsdom test environment).
  const midi = new Midi(new Uint8Array(buffer));

  // Notes — flatten every track, remembering each note's track index.
  const tracked: TrackedNote[] = [];
  for (let t = 0; t < midi.tracks.length; t += 1) {
    for (const n of midi.tracks[t].notes) {
      tracked.push({
        note: {
          midi: n.midi,
          start: n.time,
          duration: n.duration,
          velocity: n.velocity,
          hand: "right",
        },
        trackIndex: t,
      });
    }
  }
  assignHands(tracked);
  const notes: Note[] = tracked
    .map((tn) => tn.note)
    .sort((a, b) => a.start - b.start);

  // Sustain pedal (CC 64) — scan every track in time order.
  const pedalEvents: PedalEvent[] = [];
  for (const track of midi.tracks) {
    const ccs = (track.controlChanges[64] ?? []).slice();
    ccs.sort((a, b) => a.time - b.time);
    let openStart: number | null = null;
    for (const cc of ccs) {
      if (cc.value >= 0.5 && openStart === null) {
        openStart = cc.time;
      } else if (cc.value < 0.5 && openStart !== null) {
        pedalEvents.push({ start: openStart, end: cc.time });
        openStart = null;
      }
    }
    if (openStart !== null) {
      pedalEvents.push({ start: openStart, end: midi.duration });
    }
  }
  pedalEvents.sort((a, b) => a.start - b.start);

  // Tempo map.
  const tempoMap: TempoEvent[] =
    midi.header.tempos.length > 0
      ? midi.header.tempos.map((t) => ({ start: t.time ?? 0, bpm: t.bpm }))
      : [{ start: 0, bpm: 120 }];

  // Time signatures.
  const timeSignatures: TimeSignature[] =
    midi.header.timeSignatures.length > 0
      ? midi.header.timeSignatures.map((ts) => ({
          start: midi.header.ticksToSeconds(ts.ticks),
          numerator: ts.timeSignature[0],
          denominator: ts.timeSignature[1],
        }))
      : [{ start: 0, numerator: 4, denominator: 4 }];

  // Duration — the latest of the file duration and the last note's end.
  const lastNoteEnd = notes.reduce(
    (max, n) => Math.max(max, n.start + n.duration),
    0,
  );
  const measures = buildMeasures(
    midi,
    timeSignatures,
    Math.max(midi.duration, lastNoteEnd),
  );
  const lastMeasureEnd = measures.reduce(
    (max, m) => Math.max(max, m.end),
    0,
  );
  const durationSeconds = Math.max(midi.duration, lastNoteEnd, lastMeasureEnd);

  return {
    source: "midi",
    notes,
    measures,
    pedalEvents,
    timeSignatures,
    tempoMap,
    durationSeconds,
    musicXml: "",
    qualityWarning: null,
  };
}
