const pad = (n: number) => String(n).padStart(2, '0');

/** Local-time YYYY-MM-DD key. */
export const toDateKey = (d: Date | number): string => {
  const date = typeof d === 'number' ? new Date(d) : d;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const todayKey = () => toDateKey(new Date());

export const parseDateKey = (key: string): Date => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

export const addDays = (key: string, days: number): string => {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
};

let sundayStart = false;
/** Settings > week starts on. Weekly totals, the week strip and the calendar follow it. */
export const setWeekStartsOnSunday = (on: boolean) => {
  sundayStart = on;
};
export const weekStartsOnSunday = () => sundayStart;

/** Monday-based start of week (training plans always count their days from Monday). */
export const startOfMondayWeek = (d: Date | number): Date => {
  const date = new Date(typeof d === 'number' ? d : d.getTime());
  date.setHours(0, 0, 0, 0);
  const dow = (date.getDay() + 6) % 7; // Monday = 0
  date.setDate(date.getDate() - dow);
  return date;
};

/** Start of the week for the given date, on Monday or Sunday depending on the setting. */
export const startOfWeek = (d: Date | number): Date => {
  if (!sundayStart) return startOfMondayWeek(d);
  const date = new Date(typeof d === 'number' ? d : d.getTime());
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - date.getDay());
  return date;
};

/** 0 = Monday ... 6 = Sunday */
export const weekdayIndex = (d: Date | number = new Date()): number =>
  ((typeof d === 'number' ? new Date(d) : d).getDay() + 6) % 7;

export const lastNDayKeys = (n: number, endKey: string = todayKey()): string[] => {
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) keys.push(addDays(endKey, -i));
  return keys;
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const shortWeekday = (key: string) => WEEKDAYS[parseDateKey(key).getDay()];
export const shortMonthDay = (key: string) => {
  const d = parseDateKey(key);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
};
export const shortMonth = (key: string) => MONTHS[parseDateKey(key).getMonth()];

export const formatClock = (ms: number) => {
  const d = new Date(ms);
  const h = d.getHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(d.getMinutes())} ${h >= 12 ? 'PM' : 'AM'}`;
};

export const formatTimestamp = (ms: number, now: number = Date.now()): string => {
  const key = toDateKey(ms);
  const today = toDateKey(now);
  if (key === today) return `Today, ${formatClock(ms)}`;
  if (key === addDays(today, -1)) return `Yesterday, ${formatClock(ms)}`;
  return `${shortMonthDay(key)}, ${formatClock(ms)}`;
};

export const friendlyDateLabel = (key: string, today: string = todayKey()): string => {
  if (key === today) return 'Today';
  if (key === addDays(today, -1)) return 'Yesterday';
  return `${shortWeekday(key)}, ${shortMonthDay(key)}`;
};
