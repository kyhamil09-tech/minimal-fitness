import { TrackPoint, decimate, haversineKm } from '../geo';
import { simplifyToMax } from '../simplify';
import { climbFromTrack, downsampleHr } from '../workoutStats';
import { currentRestingHr, estimateCalories, getMaxHr, trimp } from '../calc';
import { WorkoutSession, WorkoutType } from '../../types/health';
import { UserProfile } from '../../types/tracking';
import { ParsedActivity } from './types';

/** Maps the many names for a sport ("Run", "TrailRun", "running", "Ride", "WeightTraining") onto this app's activity types; null for ones it has no place for (swimming, skiing). */
export const mapSport = (raw: string | undefined, hasGps = true): WorkoutType | null => {
  const s = (raw ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (!s) return hasGps ? 'Walking' : null;
  // Sports with no place here (surfing, sailing, wheeled skating) are skipped; the rest map to their own types.
  if (/surf|sail|inline|roller|wheel/.test(s)) return null;
  if (/swim/.test(s)) return /openwater|ocean|lake|sea/.test(s) ? 'OpenWaterSwim' : 'Swimming';
  if (/snowboard/.test(s)) return 'Snowboarding';
  if (/nordic|crosscountry|backcountryski|skateski|rollerski/.test(s)) return 'CrossCountrySkiing';
  if (/ski/.test(s)) return 'AlpineSkiing';
  if (/snowshoe/.test(s)) return 'Snowshoeing';
  if (/skat/.test(s)) return 'IceSkating';
  if (/standup|paddleboard|^sup$/.test(s)) return 'Paddleboarding';
  if (/kayak|canoe|paddl|raft/.test(s)) return 'Kayaking';
  if (/virtualride|indoorcycl|spinning|stationarybike|ebike.*indoor/.test(s)) return 'IndoorCycling';
  if (/treadmill|virtualrun/.test(s)) return 'Treadmill';
  if (/trailrun|run|jog/.test(s)) return 'Running';
  if (/hik/.test(s)) return 'Hiking';
  if (/walk/.test(s)) return 'Walking';
  if (/ride|cycl|bike|biking/.test(s)) return 'Cycling';
  if (/row/.test(s)) return 'Rowing';
  if (/weight|strength|crossfit/.test(s)) return 'Strength';
  if (/calisthen|bodyweight/.test(s)) return 'Calisthenics';
  if (/hiit|intervaltraining|circuit/.test(s)) return 'HIIT';
  if (/yoga|pilates/.test(s)) return 'Yoga';
  if (/ellipt/.test(s)) return 'Elliptical';
  if (/mobility|stretch/.test(s)) return 'Mobility';
  if (/core|abs/.test(s)) return 'Core';
  if (/workout|fitness|training|exercise|aerobic/.test(s)) return 'HIIT';
  return hasGps ? 'Walking' : null;
};

const MAX_TRACK_POINTS = 800;

/** Builds a saved workout from a parsed file. Returns null when the sport is not supported or there is too little data. */
export const activityToWorkout = (a: ParsedActivity, profile: UserProfile): WorkoutSession | null => {
  if (!a.start || a.start < Date.UTC(1990, 0, 1)) return null;
  const hasGps = a.points.length >= 2;
  const type = mapSport(a.sport ?? a.name, hasGps);
  if (!type) return null;

  // Positions, with a running distance that is the file's own when it has one and haversine otherwise.
  const timed = a.points.filter((p) => p.t > 0).sort((x, y) => x.t - y.t);
  const pts = timed.length >= 2 ? timed : a.points;
  const track: TrackPoint[] = [];
  let km = 0;
  const useFileDist = pts.length > 1 && pts.every((p) => p.dist !== undefined) && (pts[pts.length - 1].dist as number) > 0;
  pts.forEach((p, i) => {
    if (i > 0) km += haversineKm([pts[i - 1].lat, pts[i - 1].lng], [p.lat, p.lng]);
    track.push({ t: p.t || a.start + i * 1000, lat: Number(p.lat.toFixed(6)), lng: Number(p.lng.toFixed(6)), alt: p.alt, d: useFileDist ? (p.dist as number) / 1000 : km });
  });
  const fullKm = track.length ? track[track.length - 1].d : 0;
  const distanceKm = a.distanceKm !== undefined && a.distanceKm > 0 ? a.distanceKm : fullKm;

  const elapsedSec = a.elapsedSec ?? (track.length > 1 ? (track[track.length - 1].t - track[0].t) / 1000 : 0);
  const durationSec = Math.round(a.movingSec && a.movingSec > 0 && a.movingSec <= elapsedSec * 1.02 ? a.movingSec : elapsedSec);
  if (durationSec < 60) return null;
  const minutes = Math.max(1, Math.round(durationSec / 60));

  const rawHr: [number, number][] = a.hr && a.hr.length ? a.hr : pts.filter((p) => p.hr && p.t > 0).map((p): [number, number] => [p.t, p.hr as number]);
  const hrSeries = rawHr.length > 5 ? downsampleHr(rawHr.filter(([, b]) => b > 30 && b < 230)) : [];
  const hrVals = hrSeries.map(([, b]) => b);
  const avgHr = a.avgHr && a.avgHr > 0 ? Math.round(a.avgHr) : hrVals.length ? Math.round(hrVals.reduce((s, b) => s + b, 0) / hrVals.length) : 0;
  const maxHr = a.maxHr && a.maxHr > 0 ? Math.round(a.maxHr) : hrVals.length ? Math.max(...hrVals) : undefined;

  const saved = hasGps ? decimate(track, MAX_TRACK_POINTS) : [];
  const climb = a.ascentM !== undefined ? { gain: Math.round(a.ascentM), loss: 0 } : saved.some((p) => p.alt !== undefined) ? climbFromTrack(saved) : null;
  const load = avgHr > 0 ? Math.round(trimp(minutes, avgHr, getMaxHr(profile), currentRestingHr())) : undefined;
  const kcal = a.calories && a.calories > 0 ? Math.round(a.calories) : Math.round(estimateCalories(type, minutes, profile.weightKg));
  const iso = new Date(a.start).toISOString();
  const label = a.source === 'nike' ? 'Nike Run Club export' : a.source === 'fitbit' ? 'Fitbit export' : a.source === 'fit' ? 'FIT file' : a.source === 'tcx' ? 'TCX file' : 'GPX file';

  return {
    id: `imp-${a.source}-${a.start}-${Math.round(distanceKm * 1000)}`,
    type,
    timestamp: iso,
    startedAt: a.start,
    durationMinutes: minutes,
    durationSec,
    distanceKm: distanceKm > 0 ? Number(distanceKm.toFixed(3)) : undefined,
    avgHeartRate: avgHr,
    maxHeartRate: maxHr,
    caloriesBurned: kcal,
    cardioLoadPoints: load,
    gpsTracked: hasGps,
    track: hasGps ? saved : undefined,
    route: hasGps ? simplifyToMax(saved.map((p): [number, number] => [p.lat, p.lng]), 300) : undefined,
    hrSeries: hrSeries.length > 5 ? hrSeries : undefined,
    hrFromSensor: hrSeries.length > 5 || avgHr > 0,
    elevationGainM: climb?.gain,
    elevationLossM: climb?.loss || undefined,
    notes: a.name && a.name.length < 80 ? a.name : undefined,
    importedFrom: label,
  };
};
