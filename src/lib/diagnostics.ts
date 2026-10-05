const KEY = 'kyfit_diag_errors';
const MAX = 30;

export interface ErrorEntry {
  t: number;
  message: string;
  stack?: string;
}

export const readErrors = (): ErrorEntry[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
};

export const clearErrors = () => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
};

const push = (entry: ErrorEntry) => {
  try {
    const list = readErrors();
    list.push(entry);
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
  } catch {
    // storage full: nothing more to do
  }
};

/** Records an error that was caught on purpose (for example by an error boundary). */
export const logError = (message: string, stack?: string) => push({ t: Date.now(), message, stack: stack?.slice(0, 1500) });

/** Keeps uncaught errors in this device's storage only; nothing is sent anywhere. */
export const installErrorLog = () => {
  window.addEventListener('error', (e) =>
    push({ t: Date.now(), message: e.message || String(e.error), stack: e.error?.stack?.slice(0, 1500) })
  );
  window.addEventListener('unhandledrejection', (e) => {
    const r: any = e.reason;
    push({ t: Date.now(), message: `Unhandled promise rejection: ${r?.message ?? String(r)}`, stack: r?.stack?.slice(0, 1500) });
  });
};

export const formatErrors = (errors: ErrorEntry[]): string =>
  errors.map((e) => `[${new Date(e.t).toISOString()}] ${e.message}${e.stack ? `\n${e.stack}` : ''}`).join('\n\n');