import { NetFeature, featureForHost } from './netHosts';

/**
 * The app's gatekeeper for the network. Every request the app itself makes goes through here: it is checked against the
 * allowed services (netHosts.ts) and the privacy switches, and written to a log you can read on the Privacy screen.
 * Offline mode blocks everything. Nothing is ever sent to the developer: there is no server on the other end.
 */
export interface NetPrefs {
  /** Block every request the app makes. Maps already seen on the phone still draw. */
  offline: boolean;
  maps: boolean;
  food: boolean;
}

export const DEFAULT_NET_PREFS: NetPrefs = { offline: false, maps: true, food: true };

export interface NetEntry {
  t: number;
  feature: NetFeature | 'other';
  host: string;
  /** Path and query as sent, so you can see exactly what left (secret keys are never put in the address). */
  path: string;
  method: string;
  /** Approximate bytes sent: the address plus any body. */
  sent: number;
  result: 'ok' | 'blocked' | 'failed';
  status?: number;
  why?: string;
}

export interface NetTotals {
  since: number;
  requests: number;
  blocked: number;
  sent: number;
}

/** Minimal storage so the log can be tested without a browser. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const PREFS_KEY = 'kyfit_net_prefs';
const LOG_KEY = 'kyfit_net_log';
const TOTALS_KEY = 'kyfit_net_totals';
export const MAX_LOG = 150;
export const NET_CHANGED = 'kyfit-net-changed';

const browserStore = (): KeyValueStore | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

const readJson = <T>(store: KeyValueStore | null, key: string, fallback: T): T => {
  try {
    const raw = store?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

export const readNetPrefs = (store: KeyValueStore | null = browserStore()): NetPrefs => {
  const raw = readJson<Partial<NetPrefs>>(store, PREFS_KEY, {});
  return {
    offline: typeof raw.offline === 'boolean' ? raw.offline : DEFAULT_NET_PREFS.offline,
    maps: typeof raw.maps === 'boolean' ? raw.maps : DEFAULT_NET_PREFS.maps,
    food: typeof raw.food === 'boolean' ? raw.food : DEFAULT_NET_PREFS.food,
  };
};

const notify = () => {
  try {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(NET_CHANGED));
  } catch {
    // no window (tests)
  }
};

export const writeNetPrefs = (patch: Partial<NetPrefs>, store: KeyValueStore | null = browserStore()) => {
  try {
    store?.setItem(PREFS_KEY, JSON.stringify({ ...readNetPrefs(store), ...patch }));
  } catch {
    // storage unavailable
  }
  notify();
};

export type Verdict = { allow: true; feature: NetFeature } | { allow: false; feature: NetFeature | 'other'; why: string };

/** Decides whether a request to this host may go out. */
export const judge = (host: string, prefs: NetPrefs): Verdict => {
  const feature = featureForHost(host);
  if (!feature) return { allow: false, feature: 'other', why: 'That address is not one of the services this app is allowed to use.' };
  if (prefs.offline) return { allow: false, feature, why: 'Offline mode is on.' };
  if (feature === 'maps' && !prefs.maps) return { allow: false, feature, why: 'Maps are switched off.' };
  if (feature === 'food' && !prefs.food) return { allow: false, feature, why: 'Food search is switched off.' };
  return { allow: true, feature };
};

export const readNetLog = (store: KeyValueStore | null = browserStore()): NetEntry[] => readJson<NetEntry[]>(store, LOG_KEY, []);

export const readNetTotals = (store: KeyValueStore | null = browserStore()): NetTotals =>
  readJson<NetTotals>(store, TOTALS_KEY, { since: Date.now(), requests: 0, blocked: 0, sent: 0 });

export const clearNetLog = (store: KeyValueStore | null = browserStore()) => {
  try {
    store?.setItem(LOG_KEY, '[]');
  } catch {
    // storage unavailable
  }
  notify();
};

/** Adds one line to the log (the newest 150 are kept) and updates the running totals. */
export const recordRequest = (entry: NetEntry, store: KeyValueStore | null = browserStore()) => {
  if (!store) return;
  try {
    const log = readNetLog(store);
    log.push(entry);
    store.setItem(LOG_KEY, JSON.stringify(log.slice(-MAX_LOG)));
    const totals = readNetTotals(store);
    store.setItem(
      TOTALS_KEY,
      JSON.stringify({
        since: totals.since,
        requests: totals.requests + (entry.result === 'blocked' ? 0 : 1),
        blocked: totals.blocked + (entry.result === 'blocked' ? 1 : 0),
        sent: totals.sent + (entry.result === 'blocked' ? 0 : entry.sent),
      } satisfies NetTotals)
    );
  } catch {
    // storage full: the request is not logged, but it was still checked
  }
  notify();
};

const parse = (input: RequestInfo | URL): URL | null => {
  try {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return new URL(raw, typeof location !== 'undefined' ? location.href : undefined);
  } catch {
    return null;
  }
};

const isOwnFile = (u: URL): boolean =>
  u.protocol === 'data:' || u.protocol === 'blob:' || (typeof location !== 'undefined' && u.origin === location.origin);

const bodySize = (body: BodyInit | null | undefined): number => {
  if (typeof body === 'string') return body.length;
  if (body instanceof Blob) return body.size;
  if (body instanceof URLSearchParams) return body.toString().length;
  return 0;
};

const entryFor = (u: URL, method: string, sent: number, result: NetEntry['result'], feature: NetEntry['feature'], status?: number, why?: string): NetEntry => ({
  t: Date.now(),
  feature,
  host: u.hostname,
  path: feature === 'strava' ? u.pathname : u.pathname + u.search,
  method,
  sent,
  result,
  status,
  why,
});

/**
 * Checks and logs a request made by native code (the Strava client). Only addresses on the allowed list go through, and
 * only when Offline mode is off.
 */
export const guardNative = async <T extends { status?: number }>(url: string, method: string, bodyBytes: number, call: () => Promise<T>): Promise<T> => {
  const u = parse(url);
  if (!u) throw new Error('That is not a valid address.');
  const verdict = judge(u.hostname, readNetPrefs());
  const sent = url.length + bodyBytes;
  if (!verdict.allow) {
    recordRequest(entryFor(u, method, sent, 'blocked', verdict.feature, undefined, verdict.why));
    throw new Error(`Blocked by your privacy settings: ${verdict.why}`);
  }
  try {
    const res = await call();
    recordRequest(entryFor(u, method, sent, (res.status ?? 200) < 400 ? 'ok' : 'failed', verdict.feature, res.status));
    return res;
  } catch (e) {
    recordRequest(entryFor(u, method, sent, 'failed', verdict.feature));
    throw e;
  }
};

let installed = false;

/** Wraps the web view's fetch so every request is checked and logged, and notes anything the security policy refuses. */
export const installNetGuard = () => {
  if (installed || typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = parse(input);
    if (!u || isOwnFile(u)) return original(input, init);
    const method = (init?.method || (typeof input !== 'string' && !(input instanceof URL) ? input.method : '') || 'GET').toUpperCase();
    const verdict = judge(u.hostname, readNetPrefs());
    const sent = u.href.length + bodySize(init?.body);
    if (!verdict.allow) {
      recordRequest(entryFor(u, method, sent, 'blocked', verdict.feature, undefined, verdict.why));
      throw new TypeError(`Blocked by your privacy settings: ${verdict.why}`);
    }
    try {
      const res = await original(input, init);
      recordRequest(entryFor(u, method, sent, res.ok ? 'ok' : 'failed', verdict.feature, res.status));
      return res;
    } catch (e) {
      recordRequest(entryFor(u, method, sent, 'failed', verdict.feature));
      throw e;
    }
  };
  window.addEventListener('securitypolicyviolation', (e) => {
    let host = e.blockedURI;
    try {
      host = new URL(e.blockedURI).hostname || e.blockedURI;
    } catch {
      // not an address (inline, eval)
    }
    recordRequest({ t: Date.now(), feature: 'other', host, path: e.violatedDirective, method: 'GET', sent: 0, result: 'blocked', why: "Stopped by the app's built-in security policy." });
  });
};

/** What a tile or other image request may do right now (used where an image is loaded outside fetch). */
export const imageAllowed = (url: string): boolean => {
  const u = parse(url);
  return !!u && judge(u.hostname, readNetPrefs()).allow;
};

/** The security policy the packaged app is running under, read back from the page (empty in the browser dev server). */
export const activeSecurityPolicy = (): string => {
  try {
    return document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') ?? '';
  } catch {
    return '';
  }
};
