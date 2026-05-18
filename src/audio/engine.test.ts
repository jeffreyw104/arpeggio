import { describe, it, expect } from "vitest";
import {
  AudioEngine,
  type PianoSink,
  type ClickSink,
  type MetronomeSound,
  type OutputSink,
} from "./engine";
import { Transport } from "../transport/transport";
import type { Score } from "../model/score";
import { HandState } from "../practice/hands";

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
    attackNote() {},
    releaseNote() {},
  };
  const click: ClickSink & { count: number } = {
    sound: "click",
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

  it("replays notes on later passes of an A-B loop", () => {
    const t = new Transport(score);
    const { piano, click } = fakes();
    const engine = new AudioEngine(t, piano, click);
    t.clock.setLoop({ start: 0, end: 1 }); // covers notes at 0.1 and 0.6
    t.clock.play();
    t.clock.tick(0.8); // 0 -> 0.8 : first pass, notes 0.1 and 0.6 fire
    engine.update();
    t.clock.tick(0.5); // 0.8 -> 1.3, wraps to loop.start (0)
    engine.update();
    t.clock.tick(0.8); // 0 -> 0.8 : second pass, notes fire again
    engine.update();
    expect(piano.calls.filter((m) => m === 60).length).toBeGreaterThan(1);
    expect(piano.calls.filter((m) => m === 64).length).toBeGreaterThan(1);
  });

  it("keeps the metronome clicking on later loop passes", () => {
    const t = new Transport(score);
    const { piano, click } = fakes();
    const engine = new AudioEngine(t, piano, click);
    engine.metronome.enabled = true;
    t.clock.setLoop({ start: 0, end: 1 }); // beats at 0, 0.5
    t.clock.play();
    t.clock.tick(0.9); // 0 -> 0.9 : first pass, beats 0 and 0.5
    engine.update();
    t.clock.tick(0.5); // 0.9 -> 1.4, wraps to loop.start (0)
    engine.update();
    t.clock.tick(0.9); // 0 -> 0.9 : second pass, beats 0 and 0.5 again
    engine.update();
    expect(click.count).toBe(4); // 2 beats per pass, 2 passes
  });

  it("re-grids the metronome when the tempo mode changes", () => {
    // A varying-tempo score: flatten re-times the measures, so a metronome
    // that ignored the score swap would keep clicking at the old measure beats.
    const varying = {
      ...score,
      notes: [],
      tempoMap: [
        { start: 0, bpm: 60 },
        { start: 2, bpm: 120 },
      ],
    } satisfies Score;
    const t = new Transport(varying);
    const { piano, click } = fakes();
    const engine = new AudioEngine(t, piano, click);
    engine.metronome.enabled = true;
    t.setTempoMode("flatten"); // measure 0 re-times from [0,2] to [0,1.333…]
    t.clock.play();
    t.clock.tick(1.1); // flattened measure-0 beats: 0, 0.333, 0.667, 1.0
    engine.update();
    expect(click.count).toBe(4); // stale grid (beats 0, 0.5, 1.0) would give 3
  });

  it("playClick forwards to the click sink", () => {
    const clicks: boolean[] = [];
    const piano = { playNote: () => {}, attackNote: () => {}, releaseNote: () => {} };
    const click = { sound: "click" as MetronomeSound, playClick: (accent: boolean) => clicks.push(accent) };
    const t = new Transport(score);
    const engine = new AudioEngine(t, piano, click);
    engine.playClick(true);
    engine.playClick(false);
    expect(clicks).toEqual([true, false]);
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

  it("setVolume forwards to the output sink", () => {
    const levels: number[] = [];
    const piano = { playNote: () => {}, attackNote: () => {}, releaseNote: () => {} };
    const click = { sound: "click" as MetronomeSound, playClick: () => {} };
    const output: OutputSink = { setVolume: (level) => levels.push(level) };
    const t = new Transport(score);
    const engine = new AudioEngine(t, piano, click, output);
    engine.setVolume(0.5);
    engine.setVolume(0);
    expect(levels).toEqual([0.5, 0]);
  });

  it("setVolume is a no-op when there is no output sink", () => {
    const piano = { playNote: () => {}, attackNote: () => {}, releaseNote: () => {} };
    const click = { sound: "click" as MetronomeSound, playClick: () => {} };
    const engine = new AudioEngine(new Transport(score), piano, click);
    expect(() => engine.setVolume(0.3)).not.toThrow();
  });

  it("metronomeSound proxies the click sink's sound", () => {
    const piano = { playNote: () => {}, attackNote: () => {}, releaseNote: () => {} };
    const click = {
      sound: "click" as const,
      playClick: () => {},
    };
    const transport = new Transport(score);
    const engine = new AudioEngine(transport, piano, click);
    expect(engine.metronomeSound).toBe("click");
    engine.metronomeSound = "woodblock";
    expect(engine.metronomeSound).toBe("woodblock");
    expect(click.sound).toBe("woodblock");
  });

  it("routes input notes to the piano sink as attack/release", () => {
    const attacks: number[] = [];
    const releases: number[] = [];
    const piano = {
      playNote: () => {},
      attackNote: (midi: number) => attacks.push(midi),
      releaseNote: (midi: number) => releases.push(midi),
    };
    const { click } = fakes();
    const t = new Transport(score);
    const engine = new AudioEngine(t, piano, click);
    engine.playInputNote(60, 0.8);
    engine.releaseInputNote(60);
    expect(attacks).toEqual([60]);
    expect(releases).toEqual([60]);
  });
});

describe("AudioEngine hand mute", () => {
  it("does not trigger notes whose hand is muted", () => {
    const t = new Transport(score);
    const { piano, click } = fakes();
    const engine = new AudioEngine(t, piano, click);
    const hands = new HandState();
    hands.setMuted("left", true);
    engine.handState = hands;
    t.clock.play();
    t.clock.tick(1.0); // advance past both notes (0.1 right, 0.6 left)
    engine.update();
    expect(piano.calls).toContain(60); // right hand still sounds
    expect(piano.calls).not.toContain(64); // left hand is muted
  });
});
