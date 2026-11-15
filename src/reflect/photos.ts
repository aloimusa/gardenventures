// Photos stay on the device: downscaled JPEGs in IndexedDB, referenced from the log by id. The seed photo ships in
// the build (generated locally by scripts/seed-photo.mjs), so it is precached with the shell.
import seedRiver from './assets/seed-river.jpg';
import { SEED_PHOTO } from './model';

const DB = 'garden', STORE = 'photos';
let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  return dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((res, rej) => { const q = f(d.transaction(STORE, mode).objectStore(STORE)); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
}

export async function putPhoto(blob: Blob): Promise<string> {
  const id = `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  await tx('readwrite', s => s.put(blob, id));
  return id;
}

/** Empty the local photo store for an explicit demo reset; the database/schema can remain available. */
export async function clearPhotos(): Promise<void> {
  await tx('readwrite', s => s.clear());
  for (const url of urls.values()) URL.revokeObjectURL(url);
  urls.clear();
}

const urls = new Map<string, string>();
export async function photoUrl(id: string): Promise<string | null> {
  if (id === SEED_PHOTO) return seedRiver;
  if (urls.has(id)) return urls.get(id)!;
  try {
    const b = await tx<Blob | undefined>('readonly', s => s.get(id) as IDBRequest<Blob | undefined>);
    if (!b) return null;
    const u = URL.createObjectURL(b); urls.set(id, u); return u;
  } catch { return null; }
}

/** draws a source (video frame, image) to a JPEG with its long edge at most `edge` px */
export function toJpeg(src: CanvasImageSource, w: number, h: number, edge = 1200): Promise<Blob> {
  const k = Math.min(1, edge / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('jpeg'))), 'image/jpeg', 0.85));
}
