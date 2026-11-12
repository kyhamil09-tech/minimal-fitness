import { useEffect, useRef } from 'react';
import { Eat, isAndroidApp } from '../lib/native';
import { curatedFoods, loadUsda } from '../lib/foodDb';
import { buildIndex } from '../lib/foodSearch';
import { entryFor, parseSmart } from '../lib/voiceFood';
import { todayKey } from '../lib/dates';
import { FoodRecord } from '../lib/foodDb';
import { readStored } from './usePersistentState';
import type { FoodEntry } from '../types/tracking';

/** What was said into the watch, and how it turned out. */
export interface HeardMeal {
  at: number;
  text: string;
}

/** The note sent back to the watch: what was logged, or why nothing was. Short enough for a watch screen. */
export const resultText = (text: string, logged: { name: string; kcal: number }[], waterMl: number): string => {
  if (logged.length === 0 && waterMl === 0) return `Could not find "${text.slice(0, 40)}". Try again, or log it on your phone.`;
  const kcal = Math.round(logged.reduce((s, x) => s + x.kcal, 0));
  const names = logged.map((x) => x.name.replace(/\s*\(.*$/, '')).slice(0, 3).join(', ');
  const parts = [logged.length > 0 ? `Logged ${names}${logged.length > 3 ? ' and more' : ''}, ${kcal} kcal` : '', waterMl > 0 ? `${waterMl} ml water` : ''].filter(Boolean);
  return parts.join('. ');
};

/** Reads the JSON the phone keeps for meals said into the watch; anything malformed is ignored. */
export const parseInbox = (json: string, now: number): HeardMeal[] => {
  try {
    const list = JSON.parse(json) as unknown;
    if (!Array.isArray(list)) return [];
    return list
      .filter((x): x is HeardMeal => !!x && typeof (x as HeardMeal).text === 'string' && typeof (x as HeardMeal).at === 'number')
      .filter((x) => x.text.trim().length > 0 && x.at <= now + 60_000 && now - x.at < 7 * 24 * 3_600_000)
      .slice(0, 30);
  } catch {
    return [];
  }
};

/**
 * Meals dictated on the watch: each one is turned into foods by the same parser the voice card uses (amounts, units, water), logged for
 * the day it was said, and a short note goes back to the watch. It checks when the app opens, each minute, and when the app comes back.
 */
export function useWatchFoodLog(opts: { enabled: boolean; onAddFood: (date: string, f: Omit<FoodEntry, 'id' | 'date'>) => string | void; onAddWater: (date: string, ml: number) => void }) {
  const add = useRef(opts.onAddFood);
  add.current = opts.onAddFood;
  const water = useRef(opts.onAddWater);
  water.current = opts.onAddWater;
  const index = useRef<ReturnType<typeof buildIndex> | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    if (!isAndroidApp() || !opts.enabled) return;
    const handle = async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        const { items } = await Eat.takeVoice();
        const heard = parseInbox(items, Date.now());
        if (heard.length === 0) return;
        if (!index.current) {
          const usda = await loadUsda();
          index.current = buildIndex([...readStored<FoodRecord[]>('my_foods', []), ...curatedFoods(), ...usda]);
        }
        for (const h of heard) {
          const day = todayKey();
          const r = parseSmart(h.text, index.current, new Date(h.at));
          const logged: { name: string; kcal: number }[] = [];
          for (const item of r.foods) {
            const e = entryFor(item, r.meal);
            add.current(day, e);
            logged.push({ name: e.name, kcal: e.calories });
          }
          let ml = 0;
          for (const w of r.water) {
            water.current(day, w.ml);
            ml += w.ml;
          }
          await Eat.sendResult({ text: resultText(h.text, logged, ml) }).catch(() => undefined);
        }
      } catch {
        // the bridge or the food list is not ready: try again next time
      } finally {
        busy.current = false;
      }
    };
    void handle();
    const timer = setInterval(() => void handle(), 60_000);
    const onVisible = () => document.visibilityState === 'visible' && void handle();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [opts.enabled]);
}
