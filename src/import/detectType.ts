export type FileFormat = "midi" | "musicxml" | "mxl" | "unknown";

/**
 * Detect a file's format from its leading bytes.
 * - MIDI: the file begins with the ASCII header chunk "MThd".
 * - MusicXML (uncompressed): the text contains a <score-partwise> or
 *   <score-timewise> root element.
 * - MXL (compressed MusicXML): the file begins with the ZIP magic bytes "PK".
 */
export function detectType(_filename: string, bytes: Uint8Array): FileFormat {
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x4d && // M
    bytes[1] === 0x54 && // T
    bytes[2] === 0x68 && // h
    bytes[3] === 0x64 // d
  ) {
    return "midi";
  }
  // ZIP archive (.mxl is compressed MusicXML). The leading bytes "PK"
  // (0x50 0x4B) mark a ZIP; a local file header is 0x50 0x4B 0x03 0x04.
  if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    return "mxl";
  }
  // Decode at most the first 2 KB as UTF-8 text for cheap content sniffing.
  const head = new TextDecoder("utf-8", { fatal: false }).decode(
    bytes.subarray(0, 2048),
  );
  if (head.includes("score-partwise") || head.includes("score-timewise")) {
    return "musicxml";
  }
  return "unknown";
}
