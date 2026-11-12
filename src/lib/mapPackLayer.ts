import L from 'leaflet';
import { PMTiles, leafletRasterLayer } from 'pmtiles';
import { leafletLayer } from 'protomaps-leaflet';
import { MapPack } from './native';
import { MapPackInfo, PackSource, packCovering, readPacks } from './mapPacks';
import { cachedTileLayer } from './tileCache';
import { FLUID_TILE_OPTIONS } from './mapStyles';

const instances = new Map<string, PMTiles>();

const open = (id: string): PMTiles => {
  let pm = instances.get(id);
  if (!pm) {
    pm = new PMTiles(new PackSource(id, async (packId, offset, length) => (await MapPack.read({ id: packId, offset, length })).data));
    instances.set(id, pm);
  }
  return pm;
};

export const forgetPack = (id: string) => instances.delete(id);

/** A Leaflet layer that draws a pack: pictures straight from raster packs, or vector tiles painted on the phone in a light style. */
export const packLayer = (pack: MapPackInfo, dark = false): L.Layer => {
  const pm = open(pack.id);
  const bounds = L.latLngBounds([pack.bounds[1], pack.bounds[0]], [pack.bounds[3], pack.bounds[2]]);
  if (pack.kind === 'raster') {
    return leafletRasterLayer(pm, { bounds, maxNativeZoom: pack.maxZoom, minZoom: pack.minZoom, maxZoom: 20 }) as unknown as L.Layer;
  }
  // Vector packs are painted on the phone, so they can be drawn dark directly. Raster packs are pictures, so the dark view inverts them.
  return leafletLayer({ url: pm as never, flavor: dark ? 'dark' : 'light', lang: 'en', bounds, maxNativeZoom: pack.maxZoom, minZoom: pack.minZoom, maxZoom: 20 }) as unknown as L.Layer;
};

interface BaseMapOptions {
  url: string;
  attribution: string;
  maxZoom?: number;
  maxNativeZoom?: number;
  opacity?: number;
  /** Draw the map dark (an offline vector pack is painted dark; an offline raster pack is inverted). */
  dark?: boolean;
  /** Where the map is looking: when an offline pack covers it, the pack is used and no map server is asked for tiles. */
  center?: [number, number];
}

/**
 * Adds the map background: an offline pack when one covers the area you are looking at, otherwise the online tiles (kept in the
 * phone's cache as you view them). Returns whether a pack is in use.
 */
export const addBaseMap = (map: L.Map, o: BaseMapOptions): { offline: boolean; layer: L.Layer } => {
  const pack = o.center ? packCovering(readPacks(), o.center[0], o.center[1]) : null;
  if (pack) {
    try {
      const layer = packLayer(pack, o.dark).addTo(map);
      // Only a picture pack needs the dark filter; the online and vector maps are already drawn dark.
      map.getContainer().classList.toggle('map-dark', !!o.dark && pack.kind === 'raster');
      map.attributionControl.addAttribution(pack.kind === 'vector' ? '&copy; OpenStreetMap contributors &middot; offline map' : 'Offline map pack');
      return { offline: true, layer };
    } catch {
      // A damaged pack falls back to the online map.
    }
  }
  map.getContainer().classList.remove('map-dark');
  const layer = cachedTileLayer(o.url, { attribution: o.attribution, maxZoom: o.maxZoom ?? 19, maxNativeZoom: o.maxNativeZoom, opacity: o.opacity, ...FLUID_TILE_OPTIONS }).addTo(map);
  return { offline: false, layer };
};
