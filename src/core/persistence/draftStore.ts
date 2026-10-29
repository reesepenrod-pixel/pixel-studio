// INTERIM single-document autosave for the Art workspace (Phase 1, until the project store in
// task 1.9 replaces it). Unlike the original's localStorage autosave it uses IndexedDB, which
// holds far more data, and it REPORTS failures instead of swallowing them.

export type DraftLayer = { name: string; visible: boolean; opacity: number; x: number; y: number; w: number; h: number; data: Uint8ClampedArray<ArrayBuffer> };
export type Draft = { version: 1; w: number; h: number; layers: DraftLayer[]; activeIndex: number; color: string; recent: string[] };

const DB = 'pixel-studio-draft', STORE = 'drafts', KEY = 'current';

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((res, rej) => {
      const t = db.transaction(STORE, mode), req = fn(t.objectStore(STORE));
      t.oncomplete = () => res(req.result);
      t.onerror = () => rej(t.error ?? req.error);
      t.onabort = () => rej(t.error ?? new Error('save aborted'));
    });
  } finally { db.close(); }
}

export const draftStore = {
  async load(): Promise<Draft | null> {
    const d = await tx<Draft | undefined>('readonly', s => s.get(KEY));
    return d && d.version === 1 && Array.isArray(d.layers) && d.layers.length ? d : null;
  },
  async save(d: Draft): Promise<void> { await tx('readwrite', s => s.put(d, KEY)); }
};
export type DraftStore = typeof draftStore;

/** Turns a storage error into a short, human message for the status bar. */
export function describeSaveError(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (name === 'QuotaExceededError') return 'BROWSER STORAGE IS FULL';
  if (name === 'InvalidStateError' || name === 'SecurityError') return 'BROWSER STORAGE UNAVAILABLE (PRIVATE WINDOW?)';
  return String((e as Error)?.message || e || 'UNKNOWN ERROR').toUpperCase().slice(0, 60);
}
