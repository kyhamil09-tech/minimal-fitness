import L from 'leaflet';

/**
 * The map looks the app can show, all from Esri's designed basemaps (no account or key needed): a dark gray canvas with its own labels,
 * a full-color street map, a terrain map for hikes and rides, and satellite photos. The dark map is drawn dark by Esri, not made by
 * turning a street map inside out with a filter.
 */
export type MapStyle = 'dark' | 'street' | 'terrain' | 'satellite';

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';

export interface MapStyleDef {
  url: string;
  attribution: string;
  /** The highest zoom drawn; past the native zoom the tiles are enlarged. */
  maxZoom: number;
  maxNativeZoom: number;
  /** A transparent layer of place names drawn on top (the dark canvas keeps its labels separate). */
  labelsUrl?: string;
}

export const MAP_STYLES: Record<MapStyle, MapStyleDef> = {
  dark: {
    url: `${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    labelsUrl: `${ESRI}/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
    attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, OpenStreetMap contributors',
    maxZoom: 19,
    maxNativeZoom: 16,
  },
  street: { url: `${ESRI}/World_Street_Map/MapServer/tile/{z}/{y}/{x}`, attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, OpenStreetMap contributors', maxZoom: 19, maxNativeZoom: 19 },
  terrain: { url: `${ESRI}/World_Topo_Map/MapServer/tile/{z}/{y}/{x}`, attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, USGS, OpenStreetMap contributors', maxZoom: 19, maxNativeZoom: 19 },
  satellite: { url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, attribution: 'Tiles &copy; Esri', maxZoom: 19, maxNativeZoom: 19 },
};

/** Options that make panning and zooming feel smooth: animated zoom, momentum after a drag, and tiles kept around the edges. */
export const FLUID_MAP_OPTIONS: L.MapOptions = {
  zoomControl: false,
  attributionControl: true,
  zoomSnap: 0.25,
  zoomDelta: 0.5,
  wheelPxPerZoomLevel: 90,
  zoomAnimation: true,
  fadeAnimation: true,
  markerZoomAnimation: true,
  inertia: true,
  inertiaDeceleration: 2600,
  easeLinearity: 0.2,
  preferCanvas: true,
};

/** Tile options for smooth drawing: tiles load around the screen before they scroll in, and while you are still moving. */
export const FLUID_TILE_OPTIONS: L.TileLayerOptions = { keepBuffer: 4, updateWhenIdle: false, updateWhenZooming: false, updateInterval: 120 };

/** A round map pin (start, finish) drawn with CSS, so it stays sharp at any zoom and needs no image. */
export const pinIcon = (kind: 'start' | 'finish'): L.DivIcon =>
  L.divIcon({ className: 'ky-pin-wrap', html: `<span class="ky-pin ky-pin-${kind}"><i></i></span>`, iconSize: [26, 26], iconAnchor: [13, 13] });

/** The "you are here" marker: a glowing dot with a soft pulse, and an arrow that turns to face the way you are heading. */
export const youIcon = (color: string): L.DivIcon =>
  L.divIcon({
    className: 'ky-pin-wrap',
    html: `<span class="ky-you" style="--you:${color}"><b class="ky-you-pulse"></b><b class="ky-you-arrow"></b><b class="ky-you-dot"></b></span>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });

/** Compass heading in degrees (0 = north) from one point to the next. */
export const headingDeg = (a: [number, number], b: [number, number]): number => {
  const toRad = Math.PI / 180;
  const dLng = (b[1] - a[1]) * toRad;
  const y = Math.sin(dLng) * Math.cos(b[0] * toRad);
  const x = Math.cos(a[0] * toRad) * Math.sin(b[0] * toRad) - Math.sin(a[0] * toRad) * Math.cos(b[0] * toRad) * Math.cos(dLng);
  return (Math.atan2(y, x) / toRad + 360) % 360;
};

/** Adds the place-name layer that goes over a style's map (only the dark map has one). */
export const addLabelsOverlay = (map: L.Map, style: MapStyle, cached: (url: string, o: L.TileLayerOptions) => L.TileLayer): L.TileLayer | null => {
  const def = MAP_STYLES[style];
  if (!def.labelsUrl) return null;
  return cached(def.labelsUrl, { maxZoom: def.maxZoom, maxNativeZoom: def.maxNativeZoom, pane: 'overlayPane', zIndex: 5, ...FLUID_TILE_OPTIONS }).addTo(map);
};

/** Slow is cool blue-violet, fast is warm lime: one smooth ramp that reads on a dark or a light map. The route line and its legend both use it. */
export const speedColor = (t: number): string => {
  const k = Math.max(0, Math.min(1, t));
  return `hsl(${Math.round(262 - 150 * k)}, 90%, ${Math.round(62 + 6 * k)}%)`;
};

/** A CSS gradient of the speed ramp, so the legend bar is exactly the colors the line uses. */
export const speedGradient = (): string => `linear-gradient(90deg, ${Array.from({ length: 9 }, (_, i) => `${speedColor(i / 8)} ${(i / 8) * 100}%`).join(', ')})`;
