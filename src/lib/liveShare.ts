import { registerPlugin } from '@capacitor/core';
import { useCallback, useEffect, useState } from 'react';
import { isAndroidApp } from './native';
import { KEY_PREFIX, readStored } from '../hooks/usePersistentState';
import type { WorkoutType } from '../types/health';

/**
 * Safety live share settings and the bridge to the native texter (LiveShare.java). While a GPS workout runs, the phone texts a map
 * link to the people you chose. It goes by SMS through the phone itself, never over the internet, and nothing is sent unless you
 * switched it on and picked at least one contact.
 */

export interface LiveShareContact {
  name: string;
  number: string;
}

export interface LiveShareConfig {
  /** Master switch: when off, nothing is ever texted. */
  enabled: boolean;
  /** Your first name as it appears in the texts. */
  yourName: string;
  contacts: LiveShareContact[];
  /** Minutes between location updates. */
  everyMin: 5 | 10 | 15 | 30;
  /** Text once if you stand still for five minutes. */
  stillAlert: boolean;
}

export const DEFAULT_LIVE_SHARE: LiveShareConfig = { enabled: false, yourName: '', contacts: [], everyMin: 10, stillAlert: true };

export const MAX_CONTACTS = 3;

/** A phone number reduced to digits with an optional leading +, or null when it cannot be a number you can text. */
export const normalizePhone = (raw: string): string | null => {
  const trimmed = raw.trim();
  const plus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return null;
  return (plus ? '+' : '') + digits;
};

/** Keeps stored settings inside what the app accepts (a restored backup or older version may differ). */
export const sanitizeLiveShare = (raw: Partial<LiveShareConfig> | null | undefined): LiveShareConfig => {
  const r = raw ?? {};
  const seen = new Set<string>();
  const contacts: LiveShareContact[] = [];
  for (const c of Array.isArray(r.contacts) ? r.contacts : []) {
    const number = typeof c?.number === 'string' ? normalizePhone(c.number) : null;
    if (!number || seen.has(number)) continue;
    seen.add(number);
    contacts.push({ name: String(c.name ?? '').trim().slice(0, 30) || number, number });
    if (contacts.length >= MAX_CONTACTS) break;
  }
  const every = [5, 10, 15, 30].includes(r.everyMin as number) ? (r.everyMin as LiveShareConfig['everyMin']) : DEFAULT_LIVE_SHARE.everyMin;
  return {
    enabled: r.enabled === true && contacts.length > 0,
    yourName: String(r.yourName ?? '').trim().slice(0, 24),
    contacts,
    everyMin: every,
    stillAlert: r.stillAlert !== false,
  };
};

const KEY = 'live_share';
const CHANGED = 'ky-live-share-changed';

export const readLiveShare = (): LiveShareConfig => sanitizeLiveShare(readStored<Partial<LiveShareConfig>>(KEY, {}));

export const writeLiveShare = (cfg: LiveShareConfig) => {
  try {
    localStorage.setItem(KEY_PREFIX + KEY, JSON.stringify(sanitizeLiveShare(cfg)));
  } catch {
    // storage unavailable
  }
  window.dispatchEvent(new Event(CHANGED));
};

export const useLiveShare = (): [LiveShareConfig, (patch: Partial<LiveShareConfig>) => void] => {
  const [cfg, setCfg] = useState<LiveShareConfig>(readLiveShare);
  useEffect(() => {
    const again = () => setCfg(readLiveShare());
    window.addEventListener(CHANGED, again);
    return () => window.removeEventListener(CHANGED, again);
  }, []);
  const update = useCallback((patch: Partial<LiveShareConfig>) => writeLiveShare({ ...readLiveShare(), ...patch }), []);
  return [cfg, update];
};

/** The word used in the text: "started a run", "started a ride". */
export const sportWord = (t: WorkoutType | string): string =>
  t === 'Cycling' || t === 'IndoorCycling' ? 'ride' : t === 'Walking' ? 'walk' : t === 'Hiking' ? 'hike' : t === 'Running' || t === 'Treadmill' ? 'run' : 'workout';

/** Workouts that record a GPS route, the only ones that can share a location. */
export const canShareLocation = (t: WorkoutType | string): boolean => ['Running', 'Walking', 'Hiking', 'Cycling'].includes(t);

// ---------------------------------------------------------------------------------------------
// Native bridge
// ---------------------------------------------------------------------------------------------

export interface ShareLogEntry {
  t: number;
  kind: 'start' | 'update' | 'still' | 'finish' | 'sos' | 'test';
  to: string;
  ok: boolean;
  err?: string;
}

interface Native {
  status(): Promise<{ canText: boolean; granted: boolean }>;
  requestPermission(): Promise<{ granted: boolean }>;
  arm(o: { numbers: string[]; everyMin: number; name: string; sport: string; miles: boolean; stillAlert: boolean }): Promise<void>;
  setPaused(o: { paused: boolean }): Promise<void>;
  disarm(): Promise<void>;
  sos(o: { numbers: string[]; name: string }): Promise<{ sent: boolean }>;
  test(o: { numbers: string[]; name: string }): Promise<{ sent: boolean }>;
  log(): Promise<{ entries: ShareLogEntry[] }>;
  clearLog(): Promise<void>;
}

const Native = registerPlugin<Native>('LiveShare');

export const liveShareSupported = (): boolean => isAndroidApp();

export const smsStatus = async (): Promise<{ canText: boolean; granted: boolean }> => {
  if (!isAndroidApp()) return { canText: false, granted: false };
  try {
    return await Native.status();
  } catch {
    return { canText: false, granted: false };
  }
};

export const requestSms = async (): Promise<boolean> => {
  try {
    return (await Native.requestPermission()).granted;
  } catch {
    return false;
  }
};

const numbers = (cfg: LiveShareConfig) => cfg.contacts.map((c) => c.number);

/** Starts sharing for this workout. Resolves to an error message, or null when sharing is on (or not wanted). */
export const armLiveShare = async (cfg: LiveShareConfig, sport: WorkoutType | string, miles: boolean): Promise<string | null> => {
  if (!cfg.enabled || cfg.contacts.length === 0 || !canShareLocation(sport) || !isAndroidApp()) return null;
  try {
    await Native.arm({ numbers: numbers(cfg), everyMin: cfg.everyMin, name: cfg.yourName, sport: sportWord(sport), miles, stillAlert: cfg.stillAlert });
    return null;
  } catch (e: any) {
    return e?.message || 'Could not start live share.';
  }
};

export const setSharePaused = (paused: boolean) => {
  if (isAndroidApp()) void Native.setPaused({ paused }).catch(() => {});
};

/** Ends sharing; the people following get a "finished" text when sharing had started. */
export const disarmLiveShare = () => {
  if (isAndroidApp()) void Native.disarm().catch(() => {});
};

export const sendSos = async (cfg: LiveShareConfig): Promise<boolean> => {
  try {
    return (await Native.sos({ numbers: numbers(cfg), name: cfg.yourName })).sent;
  } catch {
    return false;
  }
};

export const sendTestText = async (cfg: LiveShareConfig, contact: LiveShareContact): Promise<boolean> => {
  try {
    return (await Native.test({ numbers: [contact.number], name: cfg.yourName })).sent;
  } catch {
    return false;
  }
};

export const readShareLog = async (): Promise<ShareLogEntry[]> => {
  if (!isAndroidApp()) return [];
  try {
    return (await Native.log()).entries;
  } catch {
    return [];
  }
};

export const clearShareLog = () => (isAndroidApp() ? Native.clearLog().catch(() => {}) : Promise.resolve());

export const KIND_LABEL: Record<ShareLogEntry['kind'], string> = {
  start: 'Started',
  update: 'Location update',
  still: 'Not moving alert',
  finish: 'Finished',
  sos: 'Emergency text',
  test: 'Test text',
};
