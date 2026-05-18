import { unzipSync } from "fflate";
import type { Score } from "../model/score";
import { detectType } from "./detectType";
import { parseMidi } from "./midi/parseMidi";
import { midiToMusicXml } from "./midi/midiToMusicXml";
import { detectMidiQuality } from "./midi/quality";
import { parseMusicXml } from "./musicxml/parseMusicXml";

/**
 * Read an uploaded file and produce the canonical Score model.
 * MIDI imports also get an approximate engraved score and a quality warning.
 */
export async function importFile(file: File): Promise<Score> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const format = detectType(file.name, bytes);

  if (format === "midi") {
    const score = parseMidi(buffer);
    const quality = detectMidiQuality(score);
    score.musicXml = midiToMusicXml(score);
    score.qualityWarning = quality.warning;
    return score;
  }
  if (format === "musicxml") {
    return parseMusicXml(new TextDecoder("utf-8").decode(bytes));
  }
  if (format === "mxl") {
    const files = unzipSync(bytes);
    let entryName: string | null = null;

    const container = files["META-INF/container.xml"];
    if (container) {
      const containerXml = new TextDecoder("utf-8").decode(container);
      const match = containerXml.match(/full-path="([^"]+)"/);
      if (match) entryName = match[1];
    }
    if (entryName === null || files[entryName] === undefined) {
      entryName =
        Object.keys(files).find(
          (name) =>
            !name.startsWith("META-INF/") &&
            /\.(musicxml|xml)$/i.test(name),
        ) ?? null;
    }
    if (entryName === null || files[entryName] === undefined) {
      throw new Error(
        `Unsupported or unrecognized file (no MusicXML in archive): ${file.name}`,
      );
    }
    return parseMusicXml(new TextDecoder("utf-8").decode(files[entryName]));
  }
  throw new Error(`Unsupported or unrecognized file: ${file.name}`);
}
