/**
 * What the app may save to Health Connect, one tick box per kind of data. Receiving is separate and always on once Health
 * Connect is: this list is only about sending. Everything starts unticked, so turning sending on shares nothing until you choose.
 */
export type ShareId = 'workouts' | 'workoutRoute' | 'workoutHeart' | 'body' | 'food' | 'water' | 'sleep' | 'bloodPressure' | 'bloodGlucose' | 'breathing';

export type ShareMap = Record<ShareId, boolean>;

export interface ShareItem {
  id: ShareId;
  label: string;
  sub: string;
  /** Which part of the list it sits under. */
  section: 'Activity' | 'Body and health' | 'Food and water';
  /** Android permissions needed to save it (names without the android.permission.health. prefix). */
  perms: string[];
  /** The permission group to ask for when it is ticked (see HealthConnectPlugin.kt). */
  group: string;
  /** True for items that can show where you were or measure your body, so the list can flag them. */
  sensitive?: boolean;
}

export const SHARE_ITEMS: ShareItem[] = [
  { id: 'workouts', section: 'Activity', label: 'Workouts', sub: 'Type, time, distance and calories', perms: ['WRITE_EXERCISE', 'WRITE_DISTANCE', 'WRITE_TOTAL_CALORIES_BURNED'], group: 'activity' },
  { id: 'workoutRoute', section: 'Activity', label: 'Workout GPS route', sub: 'The map line of where you ran or rode', perms: ['WRITE_EXERCISE_ROUTE'], group: 'activity', sensitive: true },
  { id: 'workoutHeart', section: 'Activity', label: 'Workout heart rate', sub: 'Heart rate recorded during a workout', perms: ['WRITE_HEART_RATE'], group: 'heart', sensitive: true },
  { id: 'sleep', section: 'Body and health', label: 'Sleep', sub: 'Nights you log or this phone detects (never ones that came from Health Connect)', perms: ['WRITE_SLEEP'], group: 'sleep' },
  { id: 'breathing', section: 'Body and health', label: 'Breathing sessions', sub: 'Guided breathing you finish, as a mindfulness session', perms: ['WRITE_MINDFULNESS'], group: 'mindfulness' },
  { id: 'body', section: 'Body and health', label: 'Weight and body fat', sub: 'Entries you log', perms: ['WRITE_WEIGHT', 'WRITE_BODY_FAT'], group: 'body', sensitive: true },
  { id: 'bloodPressure', section: 'Body and health', label: 'Blood pressure', sub: 'Readings you log', perms: ['WRITE_BLOOD_PRESSURE'], group: 'vitals', sensitive: true },
  { id: 'bloodGlucose', section: 'Body and health', label: 'Blood glucose', sub: 'Readings you log', perms: ['WRITE_BLOOD_GLUCOSE'], group: 'vitals', sensitive: true },
  { id: 'food', section: 'Food and water', label: 'Meals', sub: 'Foods you log, with calories and macros', perms: ['WRITE_NUTRITION'], group: 'nutrition' },
  { id: 'water', section: 'Food and water', label: 'Water', sub: 'Drinks you log', perms: ['WRITE_HYDRATION'], group: 'nutrition' },
];

export const SHARE_SECTIONS: ShareItem['section'][] = ['Activity', 'Body and health', 'Food and water'];

export const SHARE_IDS = SHARE_ITEMS.map((i) => i.id);

export const NO_SHARE: ShareMap = Object.fromEntries(SHARE_IDS.map((id) => [id, false])) as ShareMap;
export const ALL_SHARE: ShareMap = Object.fromEntries(SHARE_IDS.map((id) => [id, true])) as ShareMap;

/**
 * Reads a stored share list. Someone who already had sending switched on before this list existed keeps everything they were
 * sending (`legacyWrite`); everyone else starts with nothing ticked.
 */
export const sanitizeShare = (raw: unknown, legacyWrite: boolean): ShareMap => {
  if (!raw || typeof raw !== 'object') return { ...(legacyWrite ? ALL_SHARE : NO_SHARE) };
  const r = raw as Record<string, unknown>;
  const out = { ...NO_SHARE };
  for (const id of SHARE_IDS) out[id] = r[id] === true;
  return out;
};

/** True when every permission this item needs has been granted (`missing` is the list Health Connect still lacks). */
export const shareGranted = (item: ShareItem, missing: string[] | undefined): boolean => !!missing && item.perms.every((p) => !missing.includes(p));
