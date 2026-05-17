/**
 * Generates the binary MIDI fixtures. Run once with:
 *   npx tsx src/test/fixtures/generateFixtures.ts
 * The emitted .mid files are committed; this script is kept for reproducibility.
 */
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Midi as MidiType } from "@tonejs/midi";

// @tonejs/midi ships only a CJS/UMD bundle; use createRequire so this ESM
// script can load it without relying on bundler-level interop.
const require = createRequire(import.meta.url);
const { Midi } = require("@tonejs/midi") as {
  Midi: new () => MidiType;
};

const dir = new URL(".", import.meta.url).pathname;

/** clean.mid — cleanly sequenced: two tracks (RH/LH), notes exactly on the
 *  grid, one constant velocity. A C-major scale RH over held LH chords. */
function buildClean(): MidiType {
  const midi = new Midi();
  midi.header.setTempo(120);
  const rh = midi.addTrack();
  const scale = [60, 62, 64, 65, 67, 69, 71, 72];
  scale.forEach((n, i) => {
    rh.addNote({ midi: n, time: i * 0.5, duration: 0.5, velocity: 0.7 });
  });
  const lh = midi.addTrack();
  [48, 55].forEach((n, i) => {
    lh.addNote({ midi: n, time: i * 2, duration: 2, velocity: 0.7 });
  });
  return midi;
}

/** performance.mid — same notes as clean, but starts jittered off-grid and
 *  velocities widely varied: should be flagged as a live performance. */
function buildPerformance(): MidiType {
  const midi = new Midi();
  midi.header.setTempo(120);
  const rh = midi.addTrack();
  const scale = [60, 62, 64, 65, 67, 69, 71, 72];
  const jitter = [0.03, -0.02, 0.05, -0.04, 0.02, 0.06, -0.03, 0.01];
  const vel = [0.41, 0.83, 0.55, 0.92, 0.38, 0.74, 0.61, 0.88];
  scale.forEach((n, i) => {
    rh.addNote({
      midi: n,
      time: i * 0.5 + jitter[i],
      duration: 0.45,
      velocity: vel[i],
    });
  });
  return midi;
}

/** polyrhythm.mid — 3-against-2: RH triplets vs LH duplets over one bar. */
function buildPolyrhythm(): MidiType {
  const midi = new Midi();
  midi.header.setTempo(120);
  const rh = midi.addTrack();
  for (let i = 0; i < 3; i++) {
    rh.addNote({ midi: 72, time: i * (2 / 3), duration: 0.3, velocity: 0.7 });
  }
  const lh = midi.addTrack();
  for (let i = 0; i < 2; i++) {
    lh.addNote({ midi: 48, time: i * 1.0, duration: 0.5, velocity: 0.7 });
  }
  return midi;
}

const out: Array<[string, MidiType]> = [
  ["clean.mid", buildClean()],
  ["performance.mid", buildPerformance()],
  ["polyrhythm.mid", buildPolyrhythm()],
];
for (const [name, midi] of out) {
  // midi.toArray() is a Uint8Array; writeFileSync accepts it directly.
  // (Avoid the Buffer global — tsconfig restricts ambient types.)
  writeFileSync(join(dir, name), new Uint8Array(midi.toArray()));
  console.log("wrote", name);
}
