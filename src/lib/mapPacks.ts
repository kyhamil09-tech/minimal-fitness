import { PMTiles, RangeResponse, Source, TileType } from 'pmtiles';

/**
 * Offline map packs: PMTiles files you import (a region cut from Protomaps, or any raster map in PMTiles form). The phone keeps
 * the file in the app's private folder and this reads tiles straight out of it, so a pack-covered area draws with no internet at all.
 * This file holds the parts that need no map library; the Leaflet layer is in mapPackLayer.ts.
 */

export interface MapPackInfo {
  id: string;
  name: string;
  sizeBytes: number;
  /** Vector packs are drawn on the phone in the app's own style; raster packs are ready-made pictures. */
  kind: 'vector' | 'raster';
  minZoom: number;
  maxZoom: number;
  /** west, south, east, north in degrees. */
  bounds: [number, number, number, number];
  addedAt: number;
}

export const b64ToBuffer = (b64: string): ArrayBuffer => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
};

/** Reads a byte range of the pack: the phone's native side in the app, or any other function in tests. */
export type RangeReader = (id: string, offset: number, length: number) => Promise<string>;

/** A PMTiles source that fetches pieces of the file through a function instead of the network. */
export class PackSource implements Source {
  constructor(private id: string, private read: RangeReader) {}

  getKey() {
    return `pack:${this.id}`;
  }

  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    return { data: b64ToBuffer(await this.read(this.id, offset, length)) };
  }
}

/** What a pack file is, from its header. Throws when the file is not a PMTiles archive this app can draw. */
export const describePack = async (id: string, name: string, sizeBytes: number, read: RangeReader, now = Date.now()): Promise<MapPackInfo> => {
  const header = await new PMTiles(new PackSource(id, read)).getHeader();
  const raster = header.tileType === TileType.Png || header.tileType === TileType.Jpeg || header.tileType === TileType.Webp || header.tileType === TileType.Avif;
  const vector = header.tileType === TileType.Mvt;
  if (!raster && !vector) throw new Error('This map file has a tile format the app cannot draw.');
  const bounds: [number, number, number, number] = [header.minLon, header.minLat, header.maxLon, header.maxLat];
  if (bounds.some((b) => !Number.isFinite(b)) || bounds[0] >= bounds[2] || bounds[1] >= bounds[3]) throw new Error('The map file does not say which area it covers.');
  return { id, name: name.replace(/\.pmtiles$/i, ''), sizeBytes, kind: vector ? 'vector' : 'raster', minZoom: header.minZoom, maxZoom: header.maxZoom, bounds, addedAt: now };
};

/** The pack whose area holds the point, preferring the one with the deepest zoom. */
export const packCovering = (packs: MapPackInfo[], lat: number, lng: number): MapPackInfo | null => {
  const hits = packs.filter((p) => lng >= p.bounds[0] && lng <= p.bounds[2] && lat >= p.bounds[1] && lat <= p.bounds[3]);
  if (hits.length === 0) return null;
  return hits.reduce((a, b) => (b.maxZoom > a.maxZoom ? b : a));
};

export const sanitizePacks = (raw: unknown): MapPackInfo[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p): p is MapPackInfo => {
      if (!p || typeof p !== 'object') return false;
      const x = p as Partial<MapPackInfo>;
      return typeof x.id === 'string' && typeof x.name === 'string' && Array.isArray(x.bounds) && x.bounds.length === 4 && x.bounds.every((b) => typeof b === 'number');
    })
    .map((p) => ({ ...p, sizeBytes: Number(p.sizeBytes) || 0, kind: p.kind === 'raster' ? 'raster' : 'vector' }));
};

const KEY = 'kyfit_map_packs';

export const readPacks = (): MapPackInfo[] => {
  try {
    return sanitizePacks(JSON.parse(localStorage.getItem(KEY) || '[]'));
  } catch {
    return [];
  }
};

export const writePacks = (packs: MapPackInfo[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(packs));
  } catch {
    // storage unavailable
  }
};

export const formatSize = (bytes: number): string => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : bytes >= 1e6 ? `${Math.round(bytes / 1e6)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`);
