import { describe, it, expect, beforeEach } from "vitest";
import {
  savePiece,
  listPieces,
  getPiece,
  deletePiece,
  savePracticeState,
  getPracticeState,
  clearLibrary,
  touchPiece,
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

describe("touchPiece + lastOpenedAt", () => {
  it("touchPiece sets lastOpenedAt to a positive number", async () => {
    const id = await savePiece("a.mid", new ArrayBuffer(4));
    await touchPiece(id);
    const pieces = await listPieces();
    const found = pieces.find((p) => p.id === id);
    expect(found?.lastOpenedAt).toBeGreaterThan(0);
  });

  it("touchPiece on a missing id is a no-op (no throw)", async () => {
    await expect(touchPiece("nonexistent")).resolves.toBeUndefined();
  });

  it("listPieces sorts by lastOpenedAt desc, fallback addedAt", async () => {
    const older = await savePiece("older.mid", new ArrayBuffer(4));
    await new Promise((r) => setTimeout(r, 5));
    const newer = await savePiece("newer.mid", new ArrayBuffer(4));
    // Initially newer is first (by addedAt fallback).
    let pieces = await listPieces();
    expect(pieces[0].id).toBe(newer);
    // Touch the older piece — it should jump to the top.
    await new Promise((r) => setTimeout(r, 5));
    await touchPiece(older);
    pieces = await listPieces();
    expect(pieces[0].id).toBe(older);
  });
});
