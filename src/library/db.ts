/**
 * IndexedDB persistence for the piece library. Two object stores: `pieces`
 * (raw uploaded file bytes + metadata) and `practiceState` (per-piece settings).
 */

import type { HandVisibility } from "../practice/hands";
import type { TabMode } from "../layout/practiceMode";

/** A stored uploaded piece. */
export interface StoredPiece {
  id: string;
  name: string;
  data: ArrayBuffer;
  addedAt: number;
}

/** Per-piece practice settings persisted across sessions. */
export interface StoredPracticeState {
  bpm: number;
  loop: { start: number; end: number } | null;
  leftMuted: boolean;
  rightMuted: boolean;
  /** 3-way visibility. Optional: records saved before this used the booleans below. */
  leftVisibility?: HandVisibility;
  rightVisibility?: HandVisibility;
  /** Legacy boolean visibility — read-only fallback for old records. */
  leftHidden?: boolean;
  rightHidden?: boolean;
  /** Beat-grid / metronome settings (optional for records saved before this). */
  numerator?: number;
  denominator?: number;
  subdivision?: number;
  /** True when the user has manually overridden the score's time signature.
   *  Old records without this flag are treated as "no override" — the score's
   *  segments win on load. (Added 2026-05-24 with mid-piece time-sig support.) */
  manualOverride?: boolean;
  /** The last-used session mode (optional for records saved before this). */
  mode?: TabMode;
  /** Per-tab transport state (optional; pre-this records fall back to bpm/loop). */
  tabs?: {
    play: { bpm: number; loop: { start: number; end: number } | null };
    midi: { bpm: number; loop: { start: number; end: number } | null };
  };
  /** Per-piece section navigator state (MIDI source only). */
  sectionState?: import("../model/sections").SectionState;
}

const DB_NAME = "arpeggio";
// Held at 2 because an earlier (now-reverted) feature created the DB at v2
// in some browsers. Opening at a lower version throws VersionError and
// breaks the import flow. Keeping v2 is harmless — the optional third
// store (sectionOverrides) from that feature sits unused.
const DB_VERSION = 2;
const PIECES = "pieces";
const PRACTICE = "practiceState";

/** Wrap an IDBRequest as a promise. */
function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;

/** Open (once) the Arpeggio IndexedDB database, creating the stores.
 *  Errors are logged loudly and the cached promise is cleared on failure
 *  so callers can retry instead of being permanently stuck. */
function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      let req: IDBOpenDBRequest;
      try {
        req = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (err) {
        // Some browsers throw synchronously (e.g., private-mode Safari).
        console.error("[arpeggio] indexedDB.open threw:", err);
        dbPromise = null;
        reject(err);
        return;
      }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(PIECES)) {
          db.createObjectStore(PIECES, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(PRACTICE)) {
          db.createObjectStore(PRACTICE, { keyPath: "pieceId" });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        // Confirm both stores landed (paranoia for partially-upgraded DBs).
        const missing: string[] = [];
        if (!db.objectStoreNames.contains(PIECES)) missing.push(PIECES);
        if (!db.objectStoreNames.contains(PRACTICE)) missing.push(PRACTICE);
        if (missing.length > 0) {
          console.error(
            `[arpeggio] IDB opened but expected stores missing: ${missing.join(", ")}. ` +
              `DB version=${db.version}, stores=${Array.from(db.objectStoreNames).join(",")}`,
          );
        }
        resolve(db);
      };
      req.onerror = () => {
        console.error(
          "[arpeggio] IDB open failed:",
          req.error,
          `(name=${req.error?.name}, message=${req.error?.message})`,
        );
        dbPromise = null;
        reject(req.error);
      };
      req.onblocked = () => {
        console.warn(
          "[arpeggio] IDB open blocked — another Arpeggio tab has the DB open " +
            "at an older version. Close other Arpeggio tabs and refresh.",
        );
      };
    });
  }
  return dbPromise;
}

/** Run `fn` against a store in a transaction and await the transaction. */
async function withStore<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const db = await openDb();
  const tx = db.transaction(store, mode);
  const result = await fn(tx.objectStore(store));
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  return result;
}

/** Save an uploaded file's bytes; returns the new piece id. */
export async function savePiece(
  name: string,
  data: ArrayBuffer,
): Promise<string> {
  const id =
    globalThis.crypto?.randomUUID?.() ??
    `p-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const piece: StoredPiece = { id, name, data, addedAt: Date.now() };
  await withStore(PIECES, "readwrite", (s) => promisify(s.put(piece)));
  return id;
}

/** All saved pieces, newest first. */
export async function listPieces(): Promise<StoredPiece[]> {
  const all = await withStore(PIECES, "readonly", (s) =>
    promisify(s.getAll() as IDBRequest<StoredPiece[]>),
  );
  return all.sort((a, b) => b.addedAt - a.addedAt);
}

/** A saved piece by id, or undefined. */
export async function getPiece(id: string): Promise<StoredPiece | undefined> {
  return withStore(PIECES, "readonly", (s) =>
    promisify(s.get(id) as IDBRequest<StoredPiece | undefined>),
  );
}

/** Rename a saved piece. No-op if the piece doesn't exist. */
export async function renamePiece(id: string, name: string): Promise<void> {
  await withStore(PIECES, "readwrite", async (s) => {
    const piece = (await promisify(s.get(id))) as StoredPiece | undefined;
    if (!piece) return;
    await promisify(s.put({ ...piece, name }));
  });
}

/** Delete a saved piece and its practice state. */
export async function deletePiece(id: string): Promise<void> {
  await withStore(PIECES, "readwrite", (s) => promisify(s.delete(id)));
  await withStore(PRACTICE, "readwrite", (s) => promisify(s.delete(id)));
}

/** Save per-piece practice settings. */
export async function savePracticeState(
  pieceId: string,
  state: StoredPracticeState,
): Promise<void> {
  await withStore(PRACTICE, "readwrite", (s) =>
    promisify(s.put({ pieceId, ...state })),
  );
}

/** Retrieve per-piece practice settings, or undefined if none saved. */
export async function getPracticeState(
  pieceId: string,
): Promise<StoredPracticeState | undefined> {
  const record = await withStore(PRACTICE, "readonly", (s) =>
    promisify(
      s.get(pieceId) as IDBRequest<
        (StoredPracticeState & { pieceId: string }) | undefined
      >,
    ),
  );
  if (!record) return undefined;
  const state: StoredPracticeState & { pieceId?: string } = { ...record };
  delete state.pieceId;
  return state;
}

/** Remove every piece and practice-state record (used by tests). */
export async function clearLibrary(): Promise<void> {
  await withStore(PIECES, "readwrite", (s) => promisify(s.clear()));
  await withStore(PRACTICE, "readwrite", (s) => promisify(s.clear()));
}
