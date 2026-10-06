import { useCallback } from 'react';
import { usePersistentState } from './usePersistentState';
import type { MealType } from '../types/tracking';
import { ExtraItem, PlannedMeal, addPlanned, copyWeek, markLogged, removePlanned } from '../lib/mealPlan';

const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export interface MealPlanState {
  plan: PlannedMeal[];
  /** Ticked grocery items: a food's key, or `extra:<id>` for one you added yourself. */
  checked: Record<string, boolean>;
  extras: ExtraItem[];
  add: (date: string, meal: MealType, savedMealId: string) => void;
  remove: (id: string) => void;
  logged: (id: string) => void;
  copyFrom: (fromStart: string, toStart: string) => void;
  toggle: (key: string) => void;
  addExtra: (name: string) => void;
  removeExtra: (id: string) => void;
  clearChecked: () => void;
}

/** The meal plan and grocery ticks. Kept on this phone under the usual `kyfit_` keys, so backups include them. */
export function useMealPlan(): MealPlanState {
  const [plan, setPlan] = usePersistentState<PlannedMeal[]>('meal_plan', []);
  const [checked, setChecked] = usePersistentState<Record<string, boolean>>('grocery_checked', {});
  const [extras, setExtras] = usePersistentState<ExtraItem[]>('grocery_extras', []);

  const add = useCallback((date: string, meal: MealType, savedMealId: string) => setPlan((p) => addPlanned(p, date, meal, savedMealId, newId('mp'))), [setPlan]);
  const remove = useCallback((id: string) => setPlan((p) => removePlanned(p, id)), [setPlan]);
  const logged = useCallback((id: string) => setPlan((p) => markLogged(p, id, Date.now())), [setPlan]);
  const copyFrom = useCallback((from: string, to: string) => setPlan((p) => copyWeek(p, from, to, () => newId('mp'))), [setPlan]);
  const toggle = useCallback(
    (key: string) =>
      setChecked((c) => {
        const next = { ...c };
        if (next[key]) delete next[key];
        else next[key] = true;
        return next;
      }),
    [setChecked]
  );
  const addExtra = useCallback(
    (name: string) => {
      const clean = name.trim();
      if (clean) setExtras((e) => [...e, { id: newId('gx'), name: clean }]);
    },
    [setExtras]
  );
  const removeExtra = useCallback(
    (id: string) => {
      setExtras((e) => e.filter((x) => x.id !== id));
      setChecked((c) => {
        const { [`extra:${id}`]: _gone, ...rest } = c;
        return rest;
      });
    },
    [setExtras, setChecked]
  );
  // Ticked foods are forgotten and ticked extras removed, ready for the next shop.
  const clearChecked = useCallback(() => {
    setExtras((e) => e.filter((x) => !checked[`extra:${x.id}`]));
    setChecked({});
  }, [setExtras, setChecked, checked]);

  return { plan, checked, extras, add, remove, logged, copyFrom, toggle, addExtra, removeExtra, clearChecked };
}
