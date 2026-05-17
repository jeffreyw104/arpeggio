import type { Measure, Note, Score } from "../../model/score";

/** Division grid: a quarter note is 4 divisions (sixteenth-note resolution). */
const DIVISIONS = 4;

/** Sharp spelling for each pitch class, index = `midi % 12`. */
const PITCH_CLASSES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

/** A MusicXML `<type>` value paired with its length in division units. */
const NOTE_TYPES: { units: number; type: string }[] = [
  { units: 16, type: "whole" },
  { units: 8, type: "half" },
  { units: 4, type: "quarter" },
  { units: 2, type: "eighth" },
  { units: 1, type: "16th" },
];

/** Convert a span of seconds to beats (quarter notes) at the given tempo. */
function secondsToBeats(seconds: number, bpm: number): number {
  return seconds / (60 / bpm);
}

/** XML fragment for a `<pitch>` element derived from a MIDI note number. */
function midiToPitch(midi: number): string {
  const name = PITCH_CLASSES[((midi % 12) + 12) % 12];
  const step = name[0];
  const octave = Math.floor(midi / 12) - 1;
  const alter = name.length > 1 ? "<alter>1</alter>" : "";
  return `<pitch><step>${step}</step>${alter}<octave>${octave}</octave></pitch>`;
}

/**
 * Map a duration in division units to the largest MusicXML `<type>` whose
 * length is `<= divUnits`. Falls back to the shortest type (`16th`).
 */
function durationToType(divUnits: number): string {
  for (const candidate of NOTE_TYPES) {
    if (candidate.units <= divUnits) return candidate.type;
  }
  return "16th";
}

/** One quantized note ready to be engraved within a measure. */
interface GridNote {
  midi: number;
  /** Onset, in division units relative to the measure start. */
  startUnits: number;
  /** Length, in division units, already clipped to the measure end. */
  durationUnits: number;
}

/** Emit a single `<note>` element (chord member when `chord` is true). */
function noteXml(
  pitch: string | null,
  durationUnits: number,
  voice: number,
  staff: number,
  chord: boolean,
): string {
  const chordTag = chord ? "<chord/>" : "";
  const body = pitch ?? "<rest/>";
  const type = durationToType(durationUnits);
  return (
    `<note>${chordTag}${body}` +
    `<duration>${durationUnits}</duration>` +
    `<voice>${voice}</voice>` +
    `<type>${type}</type>` +
    `<staff>${staff}</staff></note>`
  );
}

/**
 * Build the engraved content for one staff of a measure: notes quantized onto
 * the division grid, with rests filling every gap. An empty staff yields a
 * single full-measure rest.
 */
function buildStaffXml(
  notes: GridNote[],
  measureLenUnits: number,
  voice: number,
  staff: number,
): string {
  if (notes.length === 0) {
    return noteXml(null, measureLenUnits, voice, staff, false);
  }

  // Walk notes in onset order. Any note whose onset has fallen at or behind
  // the cursor (e.g. an overlapping note in the same hand) is folded into the
  // current chord, so an onset can never be emitted before the cursor and the
  // emitted durations always sum to exactly measureLenUnits.
  const ordered = [...notes].sort((a, b) => a.startUnits - b.startUnits);

  let xml = "";
  let cursor = 0;
  let next = 0;
  while (next < ordered.length && cursor < measureLenUnits) {
    const onset = ordered[next].startUnits;
    if (onset > cursor) {
      // Fill the gap before this onset with a rest, clipped to the bar.
      const restLen = Math.min(onset - cursor, measureLenUnits - cursor);
      xml += noteXml(null, restLen, voice, staff, false);
      cursor += restLen;
      continue;
    }

    // Gather every not-yet-emitted note whose onset is at or behind the cursor.
    const chordNotes: GridNote[] = [];
    while (
      next < ordered.length &&
      ordered[next].startUnits <= cursor
    ) {
      chordNotes.push(ordered[next]);
      next += 1;
    }

    // The chord's notated length is the shortest member, clamped to >= 1 and
    // to the remaining bar space so it never crosses the barline.
    const minDuration = Math.min(...chordNotes.map((n) => n.durationUnits));
    const len = Math.min(
      Math.max(minDuration, 1),
      measureLenUnits - cursor,
    );
    chordNotes.forEach((note, i) => {
      xml += noteXml(midiToPitch(note.midi), len, voice, staff, i > 0);
    });
    cursor += len;
  }

  if (cursor < measureLenUnits) {
    xml += noteXml(null, measureLenUnits - cursor, voice, staff, false);
  }
  return xml;
}

/** Quantize the score's notes for one hand within a single measure. */
function gridNotesFor(
  measure: Measure,
  hand: Note["hand"],
  bpm: number,
  measureLenUnits: number,
  allNotes: Note[],
): GridNote[] {
  const grid: GridNote[] = [];
  for (const note of allNotes) {
    if (note.hand !== hand) continue;
    if (note.start < measure.start || note.start >= measure.end) continue;

    const startUnits = Math.round(
      secondsToBeats(note.start - measure.start, bpm) * DIVISIONS,
    );
    const rawDuration = Math.round(
      secondsToBeats(note.duration, bpm) * DIVISIONS,
    );
    const clamped = Math.min(
      Math.max(rawDuration, 1),
      measureLenUnits - startUnits,
    );
    grid.push({
      midi: note.midi,
      startUnits,
      durationUnits: Math.max(clamped, 1),
    });
  }
  return grid;
}

/** Build the `<measure>` element for a single bar of the score. */
function buildMeasureXml(
  measure: Measure,
  bpm: number,
  allNotes: Note[],
  attributes: string,
): string {
  const measureLenUnits = Math.max(
    Math.round(
      secondsToBeats(measure.end - measure.start, bpm) * DIVISIONS,
    ),
    1,
  );

  const rightNotes = gridNotesFor(
    measure,
    "right",
    bpm,
    measureLenUnits,
    allNotes,
  );
  const leftNotes = gridNotesFor(
    measure,
    "left",
    bpm,
    measureLenUnits,
    allNotes,
  );

  const staff1 = buildStaffXml(rightNotes, measureLenUnits, 1, 1);
  const backup = `<backup><duration>${measureLenUnits}</duration></backup>`;
  const staff2 = buildStaffXml(leftNotes, measureLenUnits, 2, 2);

  return (
    `<measure number="${measure.index + 1}">` +
    attributes +
    staff1 +
    backup +
    staff2 +
    `</measure>`
  );
}

/**
 * Build an approximate `score-partwise` MusicXML document from a MIDI-derived
 * Score. Times are quantized onto a sixteenth-note grid; the goal is valid,
 * well-formed MusicXML for the engraved score view, not engraving perfection.
 */
export function midiToMusicXml(score: Score): string {
  const bpm = score.tempoMap[0]?.bpm ?? 120;
  const timeSig = score.timeSignatures[0] ?? {
    start: 0,
    numerator: 4,
    denominator: 4,
  };

  const firstMeasureAttributes =
    `<attributes>` +
    `<divisions>${DIVISIONS}</divisions>` +
    `<key><fifths>0</fifths></key>` +
    `<time><beats>${timeSig.numerator}</beats>` +
    `<beat-type>${timeSig.denominator}</beat-type></time>` +
    `<staves>2</staves>` +
    `<clef number="1"><sign>G</sign><line>2</line></clef>` +
    `<clef number="2"><sign>F</sign><line>4</line></clef>` +
    `</attributes>`;

  let measuresXml = "";
  score.measures.forEach((measure, i) => {
    measuresXml += buildMeasureXml(
      measure,
      bpm,
      score.notes,
      i === 0 ? firstMeasureAttributes : "",
    );
  });

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<score-partwise version="4.0">` +
    `<part-list>` +
    `<score-part id="P1"><part-name>Piano</part-name></score-part>` +
    `</part-list>` +
    `<part id="P1">${measuresXml}</part>` +
    `</score-partwise>`
  );
}
