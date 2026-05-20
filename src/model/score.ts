/** Which hand plays a note. */
export type Hand = "left" | "right";

/** The file format a Score was imported from. */
export type SourceFormat = "midi" | "musicxml";

/** A single played note. All times are seconds from the start of the piece. */
export interface Note {
  /** MIDI pitch number, 0-127. Middle C (C4) = 60. */
  midi: number;
  /** Onset time, seconds. */
  start: number;
  /** Sounding length, seconds. Always > 0. */
  duration: number;
  /** Normalized velocity, 0-1. */
  velocity: number;
  /** Which hand plays this note. */
  hand: Hand;
}

/** A sustain-pedal press, as a closed [start, end] interval in seconds. */
export interface PedalEvent {
  start: number;
  end: number;
}

/** A time-signature change effective from `start` seconds. */
export interface TimeSignature {
  start: number;
  numerator: number;
  denominator: number;
}

/** A tempo change effective from `start` seconds. */
export interface TempoEvent {
  start: number;
  bpm: number;
}

/** One notated measure (bar). */
export interface Measure {
  /** 0-based position in the piece. */
  index: number;
  /** Measure start time, seconds. */
  start: number;
  /** Measure end time, seconds (== next measure's start, or piece end). */
  end: number;
  numerator: number;
  denominator: number;
}

/** A section / rehearsal marker imported from the source file. */
export interface Section {
  /** Onset, seconds from start of piece. */
  start: number;
  /** Display label as written in the source (e.g. "Verse 1", "A"). */
  label: string;
}

/** The canonical, in-memory representation of an imported piece. */
export interface Score {
  source: SourceFormat;
  /** All notes, sorted ascending by `start`. */
  notes: Note[];
  /** All measures, sorted ascending by `index`/`start`. */
  measures: Measure[];
  /** Sustain-pedal intervals, sorted by `start`. */
  pedalEvents: PedalEvent[];
  /** Time-signature changes, sorted by `start`; at least one entry. */
  timeSignatures: TimeSignature[];
  /** Tempo changes, sorted by `start`; at least one entry. */
  tempoMap: TempoEvent[];
  /** Section/rehearsal markers from the source, sorted by `start`. Empty
   *  array when the source carried none. */
  sections: Section[];
  /** Total length of the piece, seconds. */
  durationSeconds: number;
  /** MusicXML for the engraved score view — original (MusicXML import) or
   *  approximate (MIDI import). */
  musicXml: string;
  /** Non-null when the source MIDI looks like a live performance. */
  qualityWarning: string | null;
}
