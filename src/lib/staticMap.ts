/**
 * A small still map for a route: which map tiles lie behind it, and where each point of the route falls on them. It is the same
 * Web Mercator math every web map uses, so the line sits exactly on the streets. No map library is needed, which keeps a long list of
 * workouts light.
 */

export type LatLng = [number, number];

const TILE = 256;
const MAX_LAT = 85.0511;

/** World pixel position at a zoom (the whole world is 256 * 2^zoom pixels wide). */
export const worldPixel = (lat: number, lng: number, zoom: number): { x: number; y: number } => {
  const scale = TILE * Math.pow(2, zoom);
  const clamped = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const rad = (clamped * Math.PI) / 180;
  return { x: ((lng + 180) / 360) * scale, y: ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * scale };
};

export interface StaticTile {
  x: number;
  y: number;
  /** Where its top-left corner falls in the picture. */
  px: number;
  py: number;
}

export interface StaticView {
  zoom: number;
  tiles: StaticTile[];
  /** The route as an SVG polyline `points` string in the picture's own pixels. */
  points: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
}

/** The most the route is allowed to be zoomed in: past this the tiles are not drawn any sharper. */
export const MAX_ZOOM = 16;

/**
 * The view of `route` in a `w` x `h` picture: the highest zoom that still fits the whole route with `pad` pixels around it, the tiles
 * that cover the picture, and the route's points. Null when there are fewer than two points.
 */
export const staticMapView = (route: LatLng[], w: number, h: number, pad = 12, maxZoom = MAX_ZOOM): StaticView | null => {
  if (route.length < 2) return null;
  const lats = route.map((p) => p[0]);
  const lngs = route.map((p) => p[1]);
  const south = Math.min(...lats);
  const north = Math.max(...lats);
  const west = Math.min(...lngs);
  const east = Math.max(...lngs);

  let zoom = 0;
  for (let z = maxZoom; z >= 0; z--) {
    const a = worldPixel(north, west, z);
    const b = worldPixel(south, east, z);
    if (Math.abs(b.x - a.x) <= w - pad * 2 && Math.abs(b.y - a.y) <= h - pad * 2) {
      zoom = z;
      break;
    }
  }
  const nw = worldPixel(north, west, zoom);
  const se = worldPixel(south, east, zoom);
  const originX = (nw.x + se.x) / 2 - w / 2;
  const originY = (nw.y + se.y) / 2 - h / 2;

  const tiles: StaticTile[] = [];
  const n = Math.pow(2, zoom);
  const x0 = Math.floor(originX / TILE);
  const x1 = Math.floor((originX + w) / TILE);
  const y0 = Math.floor(originY / TILE);
  const y1 = Math.floor((originY + h) / TILE);
  for (let ty = Math.max(0, y0); ty <= Math.min(n - 1, y1); ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      tiles.push({ x: ((tx % n) + n) % n, y: ty, px: Math.round(tx * TILE - originX), py: Math.round(ty * TILE - originY) });
    }
  }

  const project = (p: LatLng) => {
    const q = worldPixel(p[0], p[1], zoom);
    return { x: q.x - originX, y: q.y - originY };
  };
  const pts = route.map(project);
  return {
    zoom,
    tiles,
    points: pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
    start: pts[0],
    end: pts[pts.length - 1],
  };
};

/** A tile's address from a style's `{z}/{y}/{x}` template. */
export const tileUrl = (template: string, z: number, x: number, y: number): string => template.replace('{z}', String(z)).replace('{y}', String(y)).replace('{x}', String(x));
