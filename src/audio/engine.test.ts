import { describe, it, expect } from "vitest";
import { AudioEngine, type PianoSink, type ClickSink } from "./engine";
import { Transport } from "../transport/transport";
import type { Score } from "../model/score";

const score = {
  source: "midi",
  notes: [
    { midi: 60, start: 0.1, duration: 0.5, velocity: 0.7, hand: "right" },
    { midi: 64, start: 0.6, duration: 0.5, velocity: 0.8, hand: "left" },
  ],
  measures: [
    { index: 0, start: 0, end: 2, numerator: 4, denominator: 4 },
    { index: 1, start: 2, end: 4, numerator: 4, denominator: 4 },
  ],
  pedalEvents: [],
  timeSignatures: [{ start: 0, numerator: 4, denominator: 4 }],
  tempoMap: [{ start: 0, bpm: 120 }],
  durationSeconds: 4,
  musicXml: "",
  qualityWarning: null,
} satisfies Score;

function fakes() {
  const piano: PianoSink & { calls: number[] } = {
    calls: [],
    playNote(midi) {
      this.calls.push(midi);
    },
  };
  const click: ClickSink & { count: number } = {
    count: 0,
    playClick() {
      this.count++;
    },
  };
  return { piano, click };
}

describe("AudioEngine", () => {
  it("triggers piano notes as the clock advances past their onsets", () => {
    const t = new Transport(score);
    const { piano, click } = fakes();
    const engine = new AudioEngine(t, piano, click);
    t.clock.play();
    t.clock.tick(0.3); // 0 -> 0.3 : note at 0.1 fires
    engine.update();
    expect(piano.calls).toEqual([60]);
    t.clock.tick(0.5); // 0.3 -> 0.8 : note at 0.6 fires
    engine.update();
    expect(piano.calls).toEqual([60, 64]);
  });

  it("does not trigger a burst of notes after a large seek", () => {
    const t = new Transport(score);
    const { piano, click } = fakes();
    const engine = new AudioEngine(t, piano, click);
    t.clock.play();
    t.clock.seek(3.5); // jump past both notes
    engine.update();
    expect(piano.calls).toEqual([]); // seek is not playback
  });

  it("drives metronome clicks when the metronome is enabled", () => {
    const t = new Transport(score);
    const { piano, click } = fakes();
    const engine = new AudioEngine(t, piano, click);
    engine.metronome.enabled = true;
    t.clock.play();
    t.clock.tick(1.1); // beats at 0,0.5,1.0
    engine.update();
    expect(click.count).toBe(3);
  });

  it("plays a note sitting exactly at the playback start position", () => {
    // A note at time 0 must sound when playback starts from 0, even though
    // the trigger window (prev, cur] would otherwise exclude the boundary.
    const withStartNote = {
      ...score,
      notes: [
        { midi: 48, start: 0, duration: 0.5, velocity: 0.7, hand: "left" },
        ...score.notes,
      ],
    } satisfies Score;
    const t = new Transport(withStartNote);
    const { piano, click } = fakes();
    const engine = new AudioEngine(t, piano, click);
    t.clock.play();
    t.clock.tick(0.2); // 0 -> 0.2 : the note at 0 and the note at 0.1 both fire
    engine.update();
    expect(piano.calls.sort((a, b) => a - b)).toEqual([48, 60]);
  });
});
