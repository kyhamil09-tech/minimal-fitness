import L from 'leaflet';

/**
 * Map tiles you have looked at are kept on the phone, so the map still draws without a signal.
 * Only tiles that are actually shown get saved (no bulk downloading, which map servers forbid), and the
 * oldest ones are dropped once the cache is large.
 */
const CACHE_NAME = 'kyfit-map-tiles-v1';
const MAX_TILES = 4000;

const cachesAvailable = () => typeof caches !== 'undefined';

let putsSinceTrim = 0;

const trim = async (cache: Cache) => {
  const keys = await cache.keys();
  const extra = keys.length - MAX_TILES;
  // keys() lists oldest first, so delete from the front.
  for (let i = 0; i < extra; i++) await cache.delete(keys[i]);
};

/** A transparent pixel, drawn for a tile that is blocked by the privacy settings or cannot be reached. */
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/**
 * Tiles come from the cache when seen before, otherwise through fetch, which the network guard checks and logs. There is
 * deliberately no fallback that loads the picture straight from the map server: that would skip the guard.
 */
export const loadTile = async (url: string): Promise<string> => {
  try {
    const cache = cachesAvailable() ? await caches.open(CACHE_NAME) : null;
    const hit = cache ? await cache.match(url) : undefined;
    if (hit) return URL.createObjectURL(await hit.blob());
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return BLANK;
    if (cache) {
      void cache.put(url, res.clone()).then(() => {
        if (++putsSinceTrim >= 200) {
          putsSinceTrim = 0;
          void trim(cache);
        }
      });
    }
    return URL.createObjectURL(await res.blob());
  } catch {
    // Offline, blocked by the privacy settings, or storage unavailable: an empty tile.
    return BLANK;
  }
};

class CachedTileLayer extends L.TileLayer {
  createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
    const tile = document.createElement('img');
    tile.alt = '';
    tile.setAttribute('role', 'presentation');
    const url = this.getTileUrl(coords);
    void loadTile(url).then((src) => {
      tile.onload = () => {
        if (src.startsWith('blob:')) URL.revokeObjectURL(src);
        done(undefined, tile);
      };
      tile.onerror = () => done(new Error('tile'), tile);
      tile.src = src;
    });
    return tile;
  }
}

export const cachedTileLayer = (urlTemplate: string, options?: L.TileLayerOptions): L.TileLayer =>
  new CachedTileLayer(urlTemplate, options);

export const tileCacheCount = async (): Promise<number> => {
  if (!cachesAvailable()) return 0;
  try {
    return (await (await caches.open(CACHE_NAME)).keys()).length;
  } catch {
    return 0;
  }
};

export const clearTileCache = async (): Promise<void> => {
  if (!cachesAvailable()) return;
  try {
    await caches.delete(CACHE_NAME);
  } catch {
    // nothing to clear
  }
};
