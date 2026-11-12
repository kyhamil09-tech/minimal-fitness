import test from 'node:test';
import assert from 'node:assert/strict';
import { PMTiles } from 'pmtiles';
import { PackSource, describePack, packCovering, readPacks, sanitizePacks, formatSize, MapPackInfo } from '../lib/mapPacks';

const varint = (n: number): number[] => {
  const out: number[] = [];
  while (n > 127) {
    out.push((n & 127) | 128);
    n = Math.floor(n / 128);
  }
  out.push(n);
  return out;
};

const u64 = (v: number) => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, BigInt(v), true);
  return b;
};

/** A minimal valid PMTiles v3 archive holding one tile at 0/0/0 (uncompressed), so the reader can be tested without a real map. */
const buildPack = (tile: Uint8Array, tileType: number, bounds = { minLon: -1, minLat: 50, maxLon: 1, maxLat: 52 }): Uint8Array => {
  const dir = Uint8Array.from([...varint(1), ...varint(0), ...varint(1), ...varint(tile.length), ...varint(1)]);
  const meta = new TextEncoder().encode('{}');
  const header = new Uint8Array(127);
  header.set(new TextEncoder().encode('PMTiles'), 0);
  header[7] = 3;
  const rootOffset = 127;
  const metaOffset = rootOffset + dir.length;
  const dataOffset = metaOffset + meta.length;
  header.set(u64(rootOffset), 8);
  header.set(u64(dir.length), 16);
  header.set(u64(metaOffset), 24);
  header.set(u64(meta.length), 32);
  header.set(u64(dataOffset), 40); // leaf dirs (empty)
  header.set(u64(0), 48);
  header.set(u64(dataOffset), 56);
  header.set(u64(tile.length), 64);
  header.set(u64(1), 72);
  header.set(u64(1), 80);
  header.set(u64(1), 88);
  header[96] = 1; // clustered
  header[97] = 1; // internal compression: none
  header[98] = 1; // tile compression: none
  header[99] = tileType; // 1 mvt, 2 png
  header[100] = 0;
  header[101] = 14;
  const dv = new DataView(header.buffer);
  dv.setInt32(102, Math.round(bounds.minLon * 1e7), true);
  dv.setInt32(106, Math.round(bounds.minLat * 1e7), true);
  dv.setInt32(110, Math.round(bounds.maxLon * 1e7), true);
  dv.setInt32(114, Math.round(bounds.maxLat * 1e7), true);
  header[118] = 8;
  dv.setInt32(119, 0, true);
  dv.setInt32(123, Math.round(51 * 1e7), true);
  return Uint8Array.from([...header, ...dir, ...meta, ...tile]);
};

const reader = (bytes: Uint8Array) => async (_id: string, offset: number, length: number) => {
  const slice = bytes.slice(offset, Math.min(bytes.length, offset + length));
  return Buffer.from(slice).toString('base64');
};

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5]);

test('a raster pack is described and its tile read back through the byte reader', async () => {
  const file = buildPack(PNG, 2);
  const info = await describePack('pack1', 'London.pmtiles', file.length, reader(file), 1000);
  assert.equal(info.kind, 'raster');
  assert.equal(info.name, 'London');
  assert.equal(info.maxZoom, 14);
  assert.deepEqual(info.bounds, [-1, 50, 1, 52]);
  assert.equal(info.addedAt, 1000);
  const pm = new PMTiles(new PackSource('pack1', reader(file)));
  const tile = await pm.getZxy(0, 0, 0);
  assert.ok(tile);
  assert.deepEqual(Array.from(new Uint8Array(tile!.data)), Array.from(PNG));
  assert.equal(await pm.getZxy(5, 3, 3), undefined);
});

test('a vector pack is recognized, and unsupported or empty files are refused', async () => {
  const vector = buildPack(Uint8Array.from([1, 2, 3]), 1);
  assert.equal((await describePack('v', 'x', vector.length, reader(vector))).kind, 'vector');
  const unknown = buildPack(Uint8Array.from([1]), 0);
  await assert.rejects(() => describePack('u', 'x', unknown.length, reader(unknown)), /cannot draw/);
  const nowhere = buildPack(Uint8Array.from([1]), 2, { minLon: 0, minLat: 0, maxLon: 0, maxLat: 0 });
  await assert.rejects(() => describePack('n', 'x', nowhere.length, reader(nowhere)), /area/);
  await assert.rejects(() => describePack('g', 'x', 10, async () => Buffer.from([1, 2, 3]).toString('base64')));
});

const pack = (id: string, bounds: [number, number, number, number], maxZoom: number): MapPackInfo => ({ id, name: id, sizeBytes: 1, kind: 'vector', minZoom: 0, maxZoom, bounds, addedAt: 0 });

test('the pack that covers a point is chosen, the deepest one first', () => {
  const packs = [pack('country', [-8, 49, 2, 59], 10), pack('city', [-0.5, 51.3, 0.3, 51.7], 15), pack('elsewhere', [10, 40, 12, 42], 14)];
  assert.equal(packCovering(packs, 51.5, -0.1)?.id, 'city');
  assert.equal(packCovering(packs, 55, -3)?.id, 'country');
  assert.equal(packCovering(packs, 0, 0), null);
  assert.equal(packCovering([], 51, 0), null);
});

test('saved pack lists are validated and sizes read well', () => {
  assert.equal(sanitizePacks('nope').length, 0);
  assert.equal(sanitizePacks([{ id: 1 }, null, pack('ok', [0, 0, 1, 1], 5)]).length, 1);
  assert.equal(sanitizePacks([{ ...pack('a', [0, 0, 1, 1], 5), kind: 'weird' }])[0].kind, 'vector');
  assert.deepEqual(readPacks(), []); // no localStorage in tests: falls back to empty
  assert.equal(formatSize(1500), '2 KB');
  assert.equal(formatSize(42_000_000), '42 MB');
  assert.equal(formatSize(2_300_000_000), '2.3 GB');
});
