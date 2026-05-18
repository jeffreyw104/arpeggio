import { describe, it, expect, beforeEach } from "vitest";
import {
  savePiece,
  listPieces,
  getPiece,
  deletePiece,
  savePracticeState,
  getPracticeState,
  clearLibrary,
} from "./db";

const bytes = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

beforeEach(async () => {
  await clearLibrary();
});

describe("library db — pieces", () => {
  it("saves a piece and lists it", async () => {
    const id = await savePiece("song.mid", bytes("hello"));
    expect(typeof id).toBe("string");
    const pieces = await listPieces();
    expect(pieces).toHaveLength(1);
    expect(pieces[0].name).toBe("song.mid");
    expect(pieces[0].id).toBe(id);
  });

  it("retrieves a saved piece's bytes", async () => {
    const id = await savePiece("song.mid", bytes("abc"));
    const piece = await getPiece(id);
    expect(piece).toBeDefined();
    expect(new TextDecoder().decode(piece!.data)).toBe("abc");
  });

  it("deletes a piece", async () => {
    const id = await savePiece("song.mid", bytes("x"));
    await deletePiece(id);
    expect(await listPieces()).toHaveLength(0);
    expect(await getPiece(id)).toBeUndefined();
  });
});

describe("library db — practice state", () => {
  it("saves and retrieves per-piece practice state", async () => {
    const id = await savePiece("song.mid", bytes("x"));
    await savePracticeState(id, {
      bpm: 90,
      loop: { start: 1, end: 3 },
      leftMuted: true,
      rightMuted: false,
      leftHidden: false,
      rightHidden: true,
    });
    const state = await getPracticeState(id);
    expect(state).toEqual({
      bpm: 90,
      loop: { start: 1, end: 3 },
      leftMuted: true,
      rightMuted: false,
      leftHidden: false,
      rightHidden: true,
    });
  });

  it("returns undefined when a piece has no saved state", async () => {
    const id = await savePiece("song.mid", bytes("x"));
    expect(await getPracticeState(id)).toBeUndefined();
  });
});
