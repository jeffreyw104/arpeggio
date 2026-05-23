import { type Section } from "../../model/sections";
import type { Note, Score } from "../../model/score";
import {
  CLIMAX_DENSITY_RATIO,
  CLIMAX_REGISTER_DELTA,
  QUIET_DENSITY_RATIO,
  FAST_TEMPO_RATIO,
  SLOW_TEMPO_RATIO,
  HAND_ISOLATION_PCT,
  MIN_SMART_LABEL_MEASURES,
} from "./thresholds";
import { densityIn, meanPitchIn } from "./helpers";

interface SectionStats {
  density: number;
  meanPitch: number;
  tempo: number;
  durationMeasures: number;
  rightFrac: number;
  leftFrac: number;
}

function statsFor(section: Section, score: Score): SectionStats {
  const inSection = (n: Note) => n.start >= section.start && n.start < section.end;
  const sectionNotes = score.notes.filter(inSection);
  const density = densityIn(score.notes, section.start, section.end);
  const meanPitch = meanPitchIn(score.notes, section.start, section.end);
  // Mean tempo across the section (weighted by time slice).
  // For simplicity, use the bpm in effect at the section midpoint.
  const mid = (section.start + section.end) / 2;
  let tempo = score.tempoMap[0]?.bpm ?? 120;
  for (const t of score.tempoMap) {
    if (t.start <= mid) tempo = t.bpm;
  }
  const measureStart = score.measures.findIndex((m) => m.start >= section.start);
  const measureEnd = score.measures.findIndex((m) => m.end >= section.end);
  const durationMeasures = Math.max(
    1,
    (measureEnd < 0 ? score.measures.length : measureEnd) -
      (measureStart < 0 ? 0 : measureStart) +
      1,
  );
  const rightCount = sectionNotes.filter((n) => n.hand === "right").length;
  const leftCount = sectionNotes.length - rightCount;
  const total = Math.max(1, sectionNotes.length);
  return {
    density,
    meanPitch,
    tempo,
    durationMeasures,
    rightFrac: rightCount / total,
    leftFrac: leftCount / total,
  };
}

export function applySmartLabels(sections: Section[], score: Score): Section[] {
  const hasMarkers = (score.midiMarkers?.length ?? 0) > 0;
  if (sections.length === 0) return sections;

  // Compute medians across the piece.
  const allDensities = sections.map((s) => densityIn(score.notes, s.start, s.end));
  const allTempos = sections.map((s) => {
    let cur = score.tempoMap[0]?.bpm ?? 120;
    for (const t of score.tempoMap) if (t.start <= (s.start + s.end) / 2) cur = t.bpm;
    return cur;
  });
  const median = (xs: number[]) => {
    const ys = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(ys.length / 2);
    return ys.length === 0 ? 0 : (ys.length % 2 ? ys[mid] : (ys[mid - 1] + ys[mid]) / 2);
  };
  const allMeanPitches = sections
    .map((s) => meanPitchIn(score.notes, s.start, s.end))
    .filter((x) => !Number.isNaN(x));
  const medDensity = median(allDensities);
  const medTempo = median(allTempos);
  const medPitch = median(allMeanPitches);

  // Pick the climax candidate up-front (at most one).
  let climaxIdx = -1;
  if (!hasMarkers) {
    let bestScore = -Infinity;
    for (let i = 0; i < sections.length; i += 1) {
      const s = sections[i];
      const stats = statsFor(s, score);
      if (
        stats.density >= CLIMAX_DENSITY_RATIO * medDensity &&
        stats.meanPitch >= medPitch + CLIMAX_REGISTER_DELTA &&
        stats.durationMeasures >= MIN_SMART_LABEL_MEASURES
      ) {
        const composite = stats.density * stats.meanPitch;
        if (composite > bestScore) {
          bestScore = composite;
          climaxIdx = i;
        }
      }
    }
  }

  return sections.map((section, i) => {
    // Rule 1: marker-name sections keep their name unchanged.
    if (!section.name.startsWith("Section ") && !section.name.startsWith("Whole piece")) {
      // (Already named — preserve.)
      return section;
    }

    // Default fallback if smart labels can't apply (Rule 8).
    let name = `Section ${i + 1}`;

    if (!hasMarkers) {
      const isFirst = i === 0;
      const isLast = i === sections.length - 1 && sections.length >= 3;
      const stats = statsFor(section, score);
      const longEnough = stats.durationMeasures >= MIN_SMART_LABEL_MEASURES;

      const hasDensitySignal = medDensity > 0;

      // Rule 7 combinations (position prefix).
      if (isFirst) {
        if (longEnough && hasDensitySignal && stats.density <= QUIET_DENSITY_RATIO * medDensity) {
          name = "Quiet intro";
        } else if (longEnough && stats.tempo < SLOW_TEMPO_RATIO * medTempo) {
          name = "Slow intro";
        } else {
          name = "Intro";
        }
      } else if (isLast) {
        name = "Outro";
      } else if (i === climaxIdx) {
        name = "Climax";
      } else if (stats.rightFrac >= HAND_ISOLATION_PCT && longEnough) {
        name = "Melody";
      } else if (stats.leftFrac >= HAND_ISOLATION_PCT && longEnough) {
        name = "Bass line";
      } else if (longEnough && hasDensitySignal && stats.density <= QUIET_DENSITY_RATIO * medDensity) {
        name = "Quiet section";
      } else if (longEnough && stats.tempo >= FAST_TEMPO_RATIO * medTempo) {
        name = "Fast section";
      } else if (longEnough && stats.tempo <= SLOW_TEMPO_RATIO * medTempo) {
        name = "Slow section";
      }
    }

    return { ...section, name };
  });
}
