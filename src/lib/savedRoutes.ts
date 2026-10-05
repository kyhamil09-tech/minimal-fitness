import { LatLng, haversineKm } from './geo';
import { simplifyToMax } from './simplify';
import { WorkoutSession } from '../types/health';
import { workoutPoints } from './routes';
import { parseGpxRoute } from './importers/xmlActivities';

/** A route you can follow: points in order, saved on this phone. */
export interface SavedRoute {
  id: string;
  name: string;
  points: LatLng[];
  km: number;
  createdAt: number;
  /** Where it came from: a GPX file, or one of your own runs. */
  source: 'gpx' | 'workout';
}

const MAX_POINTS = 1200;

export const routeKm = (points: LatLng[]): number => {
  let km = 0;
  for (let i = 1; i < points.length; i++) km += haversineKm(points[i - 1], points[i]);
  return km;
};

const valid = (p: unknown): p is LatLng => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180;

/** Keeps what is safe to follow: at least two valid points, thinned to a sensible size. */
export const sanitizeRoute = (raw: unknown): SavedRoute | null => {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<SavedRoute>;
  if (!Array.isArray(r.points)) return null;
  const pts = r.points.filter(valid);
  if (pts.length < 2 || typeof r.id !== 'string') return null;
  const points = simplifyToMax(pts, MAX_POINTS);
  return {
    id: r.id,
    name: typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 60) : 'Saved route',
    points,
    km: routeKm(points),
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : Date.now(),
    source: r.source === 'workout' ? 'workout' : 'gpx',
  };
};

export const routeFromWorkout = (w: WorkoutSession, now = Date.now()): SavedRoute | null => {
  const pts = workoutPoints(w);
  if (pts.length < 2) return null;
  const when = w.startedAt ? new Date(w.startedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  return sanitizeRoute({ id: `route-${w.id}`, name: `${w.type} ${when}`.trim(), points: pts, createdAt: now, source: 'workout' });
};

/** A route from the text of a GPX file (a track, a planned route or waypoints). */
export const routeFromGpx = (text: string, fileName: string, now = Date.now()): SavedRoute | null => {
  const parsed = parseGpxRoute(text);
  if (!parsed) return null;
  const name = parsed.name?.trim() || fileName.replace(/\.gpx$/i, '');
  return sanitizeRoute({ id: `route-gpx-${now}-${Math.round(parsed.points[0][0] * 1e4)}`, name, points: parsed.points, createdAt: now, source: 'gpx' });
};

/** Adds a route, replacing one with the same id. Newest first. */
export const upsertRoute = (routes: SavedRoute[], route: SavedRoute): SavedRoute[] => [route, ...routes.filter((r) => r.id !== route.id)];
