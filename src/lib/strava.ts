import { guardNative } from './netGuard';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { WorkoutSession } from '../types/health';
import { toGpx } from './workoutStats';

/**
 * Strava upload with your own Strava API app (free, no server of ours). You enter the Client ID and Secret from
 * strava.com/settings/api, approve access once, and workouts can be sent to your Strava account.
 * The keys and tokens stay on this phone and are left out of backups and exports.
 */

export const STRAVA_REDIRECT = 'http://localhost/strava';
const SECRET_KEY = 'ky_secret_strava';
const SENT_KEY = 'kyfit_strava_sent';
const AUTO_KEY = 'kyfit_strava_auto';
const API = 'https://www.strava.com/api/v3';

interface NativeHttp {
  request(o: { url: string; method?: string; headers?: Record<string, string>; form?: Record<string, string> }): Promise<{ status: number; body: string }>;
  upload(o: {
    url: string;
    headers?: Record<string, string>;
    fields?: Record<string, string>;
    fileField?: string;
    fileName?: string;
    fileText: string;
    mime?: string;
  }): Promise<{ status: number; body: string }>;
}
const Http = registerPlugin<NativeHttp>('NativeHttp');

// Every call below is checked against the allowed services and the privacy switches, and written to the network log.
const httpRequest = (o: Parameters<NativeHttp['request']>[0]) => guardNative(o.url, o.method ?? 'GET', JSON.stringify(o.form ?? {}).length, () => Http.request(o));
const httpUpload = (o: Parameters<NativeHttp['upload']>[0]) => guardNative(o.url, 'POST', (o.fileText ?? '').length, () => Http.upload(o));
const isAndroid = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

export interface StravaAuth {
  clientId: string;
  clientSecret: string;
  accessToken?: string;
  refreshToken?: string;
  /** Epoch seconds. */
  expiresAt?: number;
  athlete?: string;
}

export const readAuth = (): StravaAuth => {
  try {
    return JSON.parse(localStorage.getItem(SECRET_KEY) || '{}') as StravaAuth;
  } catch {
    return { clientId: '', clientSecret: '' };
  }
};
export const writeAuth = (a: StravaAuth) => {
  try {
    localStorage.setItem(SECRET_KEY, JSON.stringify(a));
  } catch {
    // storage unavailable
  }
};
export const clearAuth = () => {
  try {
    localStorage.removeItem(SECRET_KEY);
  } catch {
    // ignore
  }
};
export const isConnected = (a: StravaAuth = readAuth()) => !!(a.clientId && a.clientSecret && a.refreshToken);

export const getAutoUpload = (): boolean => {
  try {
    return localStorage.getItem(AUTO_KEY) === 'true';
  } catch {
    return false;
  }
};
export const setAutoUpload = (on: boolean) => {
  try {
    localStorage.setItem(AUTO_KEY, String(on));
  } catch {
    // ignore
  }
};

export const readSent = (): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem(SENT_KEY) || '{}') as Record<string, string>;
  } catch {
    return {};
  }
};
const markSent = (workoutId: string, activityId: string) => {
  try {
    localStorage.setItem(SENT_KEY, JSON.stringify({ ...readSent(), [workoutId]: activityId }));
  } catch {
    // ignore
  }
};

// ---- pure helpers (tested) ----

export const authorizeUrl = (clientId: string): string =>
  `https://www.strava.com/oauth/authorize?client_id=${encodeURIComponent(clientId.trim())}&response_type=code` +
  `&redirect_uri=${encodeURIComponent(STRAVA_REDIRECT)}&approval_prompt=auto&scope=${encodeURIComponent('read,activity:write')}`;

/** Pulls the approval code out of the address Strava sends you to (or accepts the bare code). */
export const parseAuthCode = (pasted: string): string | null => {
  const text = pasted.trim();
  const m = text.match(/[?&]code=([A-Za-z0-9]+)/);
  if (m) return m[1];
  return /^[A-Za-z0-9]{20,}$/.test(text) ? text : null;
};

export const sportType = (type: string): string => {
  switch (type) {
    case 'Running':
    case 'Treadmill':
      return 'Run';
    case 'Walking':
      return 'Walk';
    case 'Hiking':
      return 'Hike';
    case 'Cycling':
    case 'IndoorCycling':
      return 'Ride';
    case 'Strength':
      return 'WeightTraining';
    case 'HIIT':
      return 'HighIntensityIntervalTraining';
    case 'Yoga':
      return 'Yoga';
    case 'Rowing':
      return 'Rowing';
    case 'Elliptical':
      return 'Elliptical';
    default:
      return 'Workout';
  }
};

const LABEL: Record<string, string> = { Run: 'Run', Walk: 'Walk', Hike: 'Hike', Ride: 'Ride', WeightTraining: 'Strength', HighIntensityIntervalTraining: 'HIIT', Yoga: 'Yoga', Rowing: 'Row', Elliptical: 'Elliptical', Workout: 'Workout' };

/** "Morning Run", "Evening Ride" and so on, from the start time. */
export const activityName = (type: string, startedAt: number): string => {
  const h = new Date(startedAt).getHours();
  const part = h < 5 ? 'Night' : h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : h < 21 ? 'Evening' : 'Night';
  return `${part} ${LABEL[sportType(type)] ?? 'Workout'}`;
};

export const tokenFresh = (a: StravaAuth, nowSec = Math.floor(Date.now() / 1000)): boolean =>
  !!a.accessToken && !!a.expiresAt && a.expiresAt - 60 > nowSec;

// ---- network ----

const need = () => {
  if (!isAndroid()) throw new Error('Strava upload works in the Android app.');
};

const parseJson = (body: string): any => {
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
};

const tokenCall = async (form: Record<string, string>): Promise<StravaAuth> => {
  need();
  const a = readAuth();
  const res = await httpRequest({
    url: 'https://www.strava.com/oauth/token',
    method: 'POST',
    form: { client_id: a.clientId, client_secret: a.clientSecret, ...form },
  });
  const j = parseJson(res.body);
  if (res.status >= 400 || !j.access_token) {
    throw new Error(j.message || 'Strava did not accept that. Check the Client ID and Secret and try again.');
  }
  const next: StravaAuth = {
    ...a,
    accessToken: j.access_token,
    refreshToken: j.refresh_token ?? a.refreshToken,
    expiresAt: j.expires_at,
    athlete: j.athlete ? [j.athlete.firstname, j.athlete.lastname].filter(Boolean).join(' ') : a.athlete,
  };
  writeAuth(next);
  return next;
};

/** Finishes the sign-in with the code from the address Strava sent you to. */
export const connectWithCode = (code: string) => tokenCall({ code, grant_type: 'authorization_code' });

const freshAuth = async (): Promise<StravaAuth> => {
  const a = readAuth();
  if (!isConnected(a)) throw new Error('Connect Strava in Settings first.');
  if (tokenFresh(a)) return a;
  return tokenCall({ refresh_token: a.refreshToken as string, grant_type: 'refresh_token' });
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface UploadResult {
  ok: boolean;
  message: string;
  activityId?: string;
}

/**
 * Sends a workout to Strava: workouts with a GPS track go up as a GPX file (route, time, heart rate),
 * everything else is added as a manual activity. A workout already sent is not sent twice.
 */
export const uploadWorkout = async (w: WorkoutSession): Promise<UploadResult> => {
  try {
    need();
    const already = readSent()[w.id];
    if (already) return { ok: true, message: 'Already on Strava.', activityId: already };
    if (!w.startedAt) return { ok: false, message: 'This workout has no start time, so Strava cannot take it.' };
    const auth = await freshAuth();
    const headers = { Authorization: `Bearer ${auth.accessToken}` };
    const name = activityName(w.type, w.startedAt);
    const description = [w.notes, 'Recorded with Minimal Fitness'].filter(Boolean).join('\n');
    const sport = sportType(w.type);
    const seconds = w.durationSec ?? w.durationMinutes * 60;

    if (w.track && w.track.length >= 2) {
      const res = await httpUpload({
        url: `${API}/uploads`,
        headers,
        fields: {
          data_type: 'gpx',
          name,
          description,
          sport_type: sport,
          external_id: `kyfit-${w.id}`,
          trainer: w.type === 'Treadmill' || w.type === 'IndoorCycling' ? '1' : '0',
        },
        fileField: 'file',
        fileName: `${w.id}.gpx`,
        fileText: toGpx(w),
      });
      const j = parseJson(res.body);
      if (res.status >= 400 && !/duplicate/i.test(String(j.error || j.message || ''))) {
        return { ok: false, message: j.message || j.error || 'Strava refused the upload.' };
      }
      if (/duplicate/i.test(String(j.error || ''))) {
        markSent(w.id, 'duplicate');
        return { ok: true, message: 'Strava already has this activity.' };
      }
      // Strava processes the file in the background; check a few times.
      for (let i = 0; i < 10 && j.id; i++) {
        await wait(2000);
        const st = await httpRequest({ url: `${API}/uploads/${j.id}`, headers });
        const s = parseJson(st.body);
        if (s.activity_id) {
          markSent(w.id, String(s.activity_id));
          return { ok: true, message: 'Sent to Strava.', activityId: String(s.activity_id) };
        }
        if (s.error) {
          if (/duplicate/i.test(String(s.error))) {
            markSent(w.id, 'duplicate');
            return { ok: true, message: 'Strava already has this activity.' };
          }
          return { ok: false, message: String(s.error) };
        }
      }
      markSent(w.id, String(j.id));
      return { ok: true, message: 'Uploaded. Strava is still processing it.' };
    }

    const form: Record<string, string> = {
      name,
      sport_type: sport,
      start_date_local: new Date(w.startedAt - new Date(w.startedAt).getTimezoneOffset() * 60000).toISOString().replace(/\.\d+Z$/, 'Z'),
      elapsed_time: String(Math.max(1, Math.round(seconds))),
      description,
    };
    if (w.distanceKm && w.distanceKm > 0) form.distance = String(Math.round(w.distanceKm * 1000));
    const res = await httpRequest({ url: `${API}/activities`, method: 'POST', headers, form });
    const j = parseJson(res.body);
    if (res.status >= 400 || !j.id) return { ok: false, message: j.message || 'Strava refused the activity.' };
    markSent(w.id, String(j.id));
    return { ok: true, message: 'Added to Strava.', activityId: String(j.id) };
  } catch (e: any) {
    return { ok: false, message: e?.message || 'Could not reach Strava.' };
  }
};
