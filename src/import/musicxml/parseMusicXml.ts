import type {
  Measure,
  Note,
  Score,
  Section,
  TempoEvent,
  TimeSignature,
} from "../../model/score";

/** Notation carries no dynamics — every parsed note gets this velocity. */
const DEFAULT_VELOCITY = 0.7;

/** Semitone offset from C for each diatonic step name. */
const STEP_SEMITONES: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

/** Read the integer text content of a direct or descendant child tag. */
function childNumber(parent: Element, tag: string): number | null {
  const el = parent.querySelector(tag);
  if (!el || el.textContent === null || el.textContent.trim() === "") {
    return null;
  }
  return Number(el.textContent);
}

/** Convert a `<pitch>` element to a MIDI note number. */
function pitchToMidi(pitchEl: Element): number {
  const step = pitchEl.querySelector("step")?.textContent?.trim() ?? "C";
  const octave = Number(pitchEl.querySelector("octave")?.textContent ?? "4");
  const alter = Number(pitchEl.querySelector("alter")?.textContent ?? "0");
  return (octave + 1) * 12 + (STEP_SEMITONES[step] ?? 0) + alter;
}

/** Mutable parser state shared while walking a part. */
interface ParseState {
  divisions: number;
  tempoBpm: number;
  numerator: number;
  denominator: number;
}

/** Convert a duration in divisions to seconds under the current state. */
function divisionsToSeconds(d: number, state: ParseState): number {
  return (d / state.divisions) * (60 / state.tempoBpm);
}

/**
 * Parse a single `<measure>` element, appending notes and returning the
 * measure length in divisions (the maximum cursor reached).
 */
function parseMeasure(
  measureEl: Element,
  state: ParseState,
  measureStartSeconds: number,
  notes: Note[],
  timeSignatures: TimeSignature[],
  tempoMap: TempoEvent[],
  openTies: Map<string, Note>,
): number {
  // Apply attributes that take effect at the measure start.
  const attributes = measureEl.querySelector("attributes");
  if (attributes) {
    const divisions = childNumber(attributes, "divisions");
    if (divisions !== null) state.divisions = divisions;

    const timeEl = attributes.querySelector("time");
    if (timeEl) {
      const beats = childNumber(timeEl, "beats");
      const beatType = childNumber(timeEl, "beat-type");
      if (beats !== null) state.numerator = beats;
      if (beatType !== null) state.denominator = beatType;
      timeSignatures.push({
        start: measureStartSeconds,
        numerator: state.numerator,
        denominator: state.denominator,
      });
    }
  }

  // Tempo: prefer an explicit <sound tempo="...">, fall back to <per-minute>.
  const soundTempo = measureEl.querySelector("sound[tempo]");
  const perMinute = measureEl.querySelector("metronome per-minute");
  const tempoText =
    soundTempo?.getAttribute("tempo") ?? perMinute?.textContent ?? null;
  if (tempoText !== null && tempoText.trim() !== "") {
    state.tempoBpm = Number(tempoText);
    tempoMap.push({ start: measureStartSeconds, bpm: state.tempoBpm });
  }

  let cursor = 0;
  let maxCursor = 0;
  let previousOnset = 0;

  for (const child of Array.from(measureEl.children)) {
    if (child.tagName === "note") {
      const durationEl = Array.from(child.children).find(
        (c) => c.tagName === "duration",
      );
      // Grace notes carry no <duration>; skip them entirely.
      if (!durationEl || durationEl.textContent === null) continue;
      const noteDuration = Number(durationEl.textContent);

      const isChord = child.querySelector("chord") !== null;
      const isRest = child.querySelector("rest") !== null;
      const onset = isChord ? previousOnset : cursor;

      if (!isRest) {
        const pitchEl = child.querySelector("pitch");
        if (pitchEl) {
          const midi = pitchToMidi(pitchEl);
          const staff = child.querySelector("staff")?.textContent?.trim();
          const hand =
            staff === "2"
              ? "left"
              : staff === "1"
                ? "right"
                : midi >= 60
                  ? "right"
                  : "left";
          const start = measureStartSeconds + divisionsToSeconds(onset, state);
          const duration = divisionsToSeconds(noteDuration, state);

          const tieTypes = Array.from(child.querySelectorAll("tie")).map((t) =>
            t.getAttribute("type"),
          );
          const tieKey = `${midi}:${staff ?? hand}`;

          if (tieTypes.includes("stop")) {
            // Extend the still-open tied note rather than emit a new one.
            const open = openTies.get(tieKey);
            if (open) {
              open.duration = start + duration - open.start;
              if (!tieTypes.includes("start")) openTies.delete(tieKey);
            } else {
              const note: Note = {
                midi,
                start,
                duration,
                velocity: DEFAULT_VELOCITY,
                hand,
              };
              notes.push(note);
            }
          } else {
            const note: Note = {
              midi,
              start,
              duration,
              velocity: DEFAULT_VELOCITY,
              hand,
            };
            notes.push(note);
            if (tieTypes.includes("start")) openTies.set(tieKey, note);
          }
        }
      }

      if (!isChord) {
        previousOnset = cursor;
        cursor += noteDuration;
      }
    } else if (child.tagName === "backup") {
      cursor -= childNumber(child, "duration") ?? 0;
    } else if (child.tagName === "forward") {
      cursor += childNumber(child, "duration") ?? 0;
    }

    if (cursor > maxCursor) maxCursor = cursor;
  }

  return maxCursor;
}

/**
 * Parse an uncompressed `score-partwise` MusicXML document into a canonical
 * Score. The input string is stored verbatim in `Score.musicXml`, and
 * `qualityWarning` is always null for notation sources.
 */
export function parseMusicXml(xml: string): Score {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror") !== null) {
    throw new Error("invalid MusicXML");
  }

  const state: ParseState = {
    divisions: 1,
    tempoBpm: 120,
    numerator: 4,
    denominator: 4,
  };

  const notes: Note[] = [];
  const measures: Measure[] = [];
  const timeSignatures: TimeSignature[] = [];
  const tempoMap: TempoEvent[] = [];
  const sections: Section[] = [];

  for (const part of Array.from(doc.querySelectorAll("part"))) {
    let measureStartSeconds = 0;
    let index = 0;
    // Open ties are scoped per-part: a tie cannot cross parts.
    const openTies = new Map<string, Note>();

    for (const measureEl of Array.from(part.children)) {
      if (measureEl.tagName !== "measure") continue;

      const measureLen = parseMeasure(
        measureEl,
        state,
        measureStartSeconds,
        notes,
        timeSignatures,
        tempoMap,
        openTies,
      );
      const end = measureStartSeconds + divisionsToSeconds(measureLen, state);
      measures.push({
        index,
        start: measureStartSeconds,
        end,
        numerator: state.numerator,
        denominator: state.denominator,
      });

      // Extract rehearsal markers
      const rehearsalEls = measureEl.querySelectorAll(
        "direction > direction-type > rehearsal",
      );
      for (const r of rehearsalEls) {
        sections.push({ start: measureStartSeconds, label: r.textContent?.trim() ?? "" });
      }

      measureStartSeconds = end;
      index += 1;
    }
  }

  notes.sort((a, b) => a.start - b.start);

  const lastNoteEnd = notes.reduce(
    (max, n) => Math.max(max, n.start + n.duration),
    0,
  );
  const lastMeasureEnd = measures.reduce(
    (max, m) => Math.max(max, m.end),
    0,
  );
  const durationSeconds = Math.max(lastNoteEnd, lastMeasureEnd);

  return {
    source: "musicxml",
    notes,
    measures,
    pedalEvents: [],
    timeSignatures:
      timeSignatures.length > 0
        ? timeSignatures
        : [{ start: 0, numerator: 4, denominator: 4 }],
    tempoMap:
      tempoMap.length > 0 ? tempoMap : [{ start: 0, bpm: 120 }],
    sections,
    durationSeconds,
    musicXml: xml,
    qualityWarning: null,
  };
}
