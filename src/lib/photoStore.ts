/**
 * Progress photos live in this device's IndexedDB, never anywhere else: they are not synced, not sent, and not part of the backup
 * file (photos are big), so back them up by sharing them yourself if you want a copy. Each is shrunk to a 1080 px JPEG first.
 */
export interface ProgressPhoto {
  id: string;
  /** YYYY-MM-DD. */
  date: string;
  pose: 'front' | 'side' | 'back' | 'other';
  note?: string;
  blob: Blob;
}

const DB = 'kyfit_photos';
const STORE = 'photos';

const open = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const run = async <T,>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
};

export const listPhotos = async (): Promise<ProgressPhoto[]> => {
  try {
    const all = await run<ProgressPhoto[]>('readonly', (s) => s.getAll());
    return all.sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date < b.date ? 1 : -1));
  } catch {
    return [];
  }
};

export const savePhoto = (p: ProgressPhoto): Promise<IDBValidKey> => run('readwrite', (s) => s.put(p));
export const deletePhoto = (id: string): Promise<undefined> => run('readwrite', (s) => s.delete(id));

/** A photo as it travels inside a backup file: the image as a data URL. */
export interface PhotoBackup {
  id: string;
  date: string;
  pose: ProgressPhoto['pose'];
  note?: string;
  data: string;
}

const blobToDataUrl = (b: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });

const dataUrlToBlob = (url: string): Blob => {
  const [head, body] = url.split(',');
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? 'image/jpeg';
  const bin = atob(body ?? '');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
};

/** Every photo as a data URL, for a manual backup. */
export const exportPhotos = async (): Promise<PhotoBackup[]> => {
  const all = await listPhotos();
  return Promise.all(all.map(async (p) => ({ id: p.id, date: p.date, pose: p.pose, note: p.note, data: await blobToDataUrl(p.blob) })));
};

/** Puts backed-up photos back. Existing photos are replaced, to match a restore of everything else. */
export const importPhotos = async (photos: PhotoBackup[]): Promise<number> => {
  await wipePhotos();
  let n = 0;
  for (const p of photos) {
    try {
      await savePhoto({ id: p.id, date: p.date, pose: p.pose, note: p.note, blob: dataUrlToBlob(p.data) });
      n++;
    } catch {
      // a damaged photo is skipped; the rest still come back
    }
  }
  return n;
};

/** Removes every progress photo (Erase all my data, and before a restore). */
export const wipePhotos = (): Promise<void> =>
  new Promise((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(DB);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });

/** Shrinks an image file so the longest side is at most `max` pixels and re-encodes it as a JPEG. */
export const shrinkImage = async (file: Blob, max = 1080, quality = 0.82): Promise<Blob> => {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', quality));
};
