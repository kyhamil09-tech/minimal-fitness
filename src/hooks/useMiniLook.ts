import { useEffect, useMemo, useState } from 'react';
import { usePersistentState } from './usePersistentState';
import { Look, MiniApp, ResolvedLook, normalizeLook, resolveLook, styleFromVars } from '../lib/miniLook';

export interface MiniLookApi {
  look: Look;
  setLook: (next: Look) => void;
  resolved: ResolvedLook;
  /** Put this on the app's root element. */
  style: Record<string, string>;
}

const query = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null);

/** The saved look of the Fasting or Eat app, worked out into variables. `appAccent` is the main app's accent, for "Match the app". */
export function useMiniLook(app: MiniApp, appAccent: string): MiniLookApi {
  const [stored, setStored] = usePersistentState<Partial<Look>>(`${app}_look`, {});
  const look = useMemo(() => normalizeLook(stored, app), [stored, app]);
  const [systemDark, setSystemDark] = useState(() => query()?.matches ?? true);
  useEffect(() => {
    const q = query();
    if (!q) return undefined;
    const on = () => setSystemDark(q.matches);
    q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, []);
  const resolved = useMemo(() => resolveLook(app, look, { systemDark, appAccent }), [app, look, systemDark, appAccent]);
  const style = useMemo(() => styleFromVars(resolved.vars), [resolved]);
  return { look, setLook: (next) => setStored(next), resolved, style };
}
