import { Unzip, UnzipInflate, gunzipSync } from 'fflate';

/** Entries bigger than this once unzipped are skipped (a photo or video in a data export, never an activity). */
const MAX_ENTRY_BYTES = 120 * 1024 * 1024;

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const concat = (chunks: Uint8Array[], total: number): Uint8Array => {
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
};

/**
 * Reads a zip archive piece by piece, so a large export (Strava archives run to gigabytes) never sits in memory whole. Only entries
 * that {@code want} accepts are unpacked, and each is handed over as soon as it is complete and finished with before the next
 * one is read.
 */
export const readZip = async (
  chunks: AsyncIterable<Uint8Array> | Iterable<Uint8Array>,
  want: (name: string) => boolean,
  onEntry: (entry: ZipEntry) => Promise<void> | void
): Promise<void> => {
  const ready: ZipEntry[] = [];
  const unzip = new Unzip((file) => {
    if (file.name.endsWith('/') || !want(file.name)) return;
    const parts: Uint8Array[] = [];
    let total = 0;
    let tooBig = false;
    file.ondata = (err, data, final) => {
      if (err || tooBig) return;
      total += data.length;
      if (total > MAX_ENTRY_BYTES) {
        tooBig = true;
        file.terminate();
        return;
      }
      parts.push(data);
      if (final) ready.push({ name: file.name, data: concat(parts, total) });
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  const drain = async () => {
    while (ready.length) await onEntry(ready.shift() as ZipEntry);
  };
  for await (const chunk of chunks as AsyncIterable<Uint8Array>) {
    unzip.push(chunk, false);
    await drain();
  }
  unzip.push(new Uint8Array(0), true);
  await drain();
};

/** A File or Blob as a stream of 4 MB pieces. */
export async function* blobChunks(blob: Blob, size = 4 * 1024 * 1024): AsyncGenerator<Uint8Array> {
  for (let o = 0; o < blob.size; o += size) {
    yield new Uint8Array(await blob.slice(o, o + size).arrayBuffer());
  }
}

/** Unzips a .gz file's bytes (Strava stores many activities as .fit.gz). */
export const gunzip = (bytes: Uint8Array): Uint8Array => gunzipSync(bytes);
