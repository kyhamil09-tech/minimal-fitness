import React, { useEffect, useMemo, useState } from 'react';
import { GrabHandle } from './ui/GrabHandle';
import { Check, ChevronLeft, ChevronRight, Copy, Plus, ShoppingBasket, Trash2, Utensils, X } from 'lucide-react';
import { ColorPalette } from '../types/theme';
import { Goals, MealType, SavedMeal } from '../types/tracking';
import { useMealPlan } from '../hooks/useMealPlan';
import { MEAL_ORDER, groceryList, groceryText, mealTotals, plannedDayTotals, plannedIn, weekDates } from '../lib/mealPlan';
import { addDays, parseDateKey, startOfWeek, toDateKey, todayKey } from '../lib/dates';
import { Segmented } from './ui/Segmented';

interface MealPlanSheetProps {
  theme: ColorPalette;
  goals: Goals;
  savedMeals: SavedMeal[];
  /** Logs a planned meal's foods as eaten on a date. */
  onLogMeal: (date: string, meal: MealType, meal_: SavedMeal) => void;
  onClose: () => void;
}

type View = 'plan' | 'groceries';

const dayLabel = (date: string, today: string) =>
  date === today ? 'Today' : parseDateKey(date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

/** Plan a week of saved meals, log them in a tap, and get the shopping list the plan needs. */
export const MealPlanSheet: React.FC<MealPlanSheetProps> = ({ theme, goals, savedMeals, onLogMeal, onClose }) => {
  const mp = useMealPlan();
  const today = todayKey();
  const [view, setView] = useState<View>('plan');
  const [weekStart, setWeekStart] = useState(() => toDateKey(startOfWeek(new Date())));
  const [adding, setAdding] = useState<string | null>(null); // "date|meal"
  const [extra, setExtra] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const dates = useMemo(() => weekDates(weekStart), [weekStart]);
  const byId = useMemo(() => new Map(savedMeals.map((m) => [m.id, m])), [savedMeals]);
  const grocery = useMemo(() => groceryList(mp.plan, savedMeals, dates), [mp.plan, savedMeals, dates]);
  const weekHasPlan = dates.some((d) => mp.plan.some((p) => p.date === d));
  const lastWeek = addDays(weekStart, -7);
  const lastWeekHasPlan = weekDates(lastWeek).some((d) => mp.plan.some((p) => p.date === d));
  const range = `${parseDateKey(dates[0]).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} to ${parseDateKey(dates[6]).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  const isThisWeek = weekStart === toDateKey(startOfWeek(new Date()));

  const shareList = async () => {
    const text = groceryText(`Groceries ${range}`, grocery, mp.extras, mp.checked);
    try {
      if (navigator.share) await navigator.share({ title: 'Grocery list', text });
      else {
        await navigator.clipboard.writeText(text);
        setNote('List copied.');
      }
    } catch {
      // sharing was cancelled
    }
  };

  const btn = 'rounded-lg border border-neutral-700 px-2.5 py-1.5 text-xs font-semibold text-neutral-200 hover:text-white';
  const nav = 'rounded-full border border-neutral-800 p-2 text-neutral-300 hover:text-white';
  const totalItems = grocery.length + mp.extras.length;
  const doneItems = grocery.filter((g) => mp.checked[g.key]).length + mp.extras.filter((e) => mp.checked[`extra:${e.id}`]).length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Meal plan and groceries"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm animate-fadeIn"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg max-h-[94dvh] overflow-y-auto rounded-t-[32px] border border-b-0 border-[#1A1E26] bg-[#0B0D11] px-5 pb-8 pt-0 text-white shadow-2xl">
        <GrabHandle onClose={onClose} />
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">Meal plan</h2>
          <button onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-full text-neutral-300 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <Segmented<'plan' | 'groceries'>
          className="mt-3"
          ariaLabel="Meal plan view"
          size="sm"
          semantics="group"
          value={view}
          onChange={setView}
          options={[
            { id: 'plan', label: 'Plan', icon: <Utensils className="h-3.5 w-3.5" /> },
            { id: 'groceries', label: 'Groceries', icon: <ShoppingBasket className="h-3.5 w-3.5" /> },
          ]}
        />

        <div className="mt-3 flex items-center justify-between">
          <button onClick={() => setWeekStart(addDays(weekStart, -7))} className={nav} aria-label="Previous week">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="text-center">
            <div className="text-sm font-semibold">{isThisWeek ? 'This week' : range}</div>
            {isThisWeek && <div className="text-xs text-[#9AA3B2]">{range}</div>}
          </div>
          <button onClick={() => setWeekStart(addDays(weekStart, 7))} className={nav} aria-label="Next week">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {view === 'plan' ? (
          <div className="mt-3 space-y-3">
            {savedMeals.length === 0 && (
              <p className="rounded-2xl border border-[#1A1E26] bg-black/30 p-3 text-xs leading-relaxed text-neutral-300">
                You have no saved meals yet. In Add food, add a few foods, then tap Save meal. Saved meals are what you plan here.
              </p>
            )}
            {!weekHasPlan && lastWeekHasPlan && (
              <button onClick={() => mp.copyFrom(lastWeek, weekStart)} className={`${btn} flex w-full items-center justify-center gap-1.5`}>
                <Copy className="h-3.5 w-3.5" /> Copy last week's plan
              </button>
            )}
            {dates.map((date) => {
              const totals = plannedDayTotals(mp.plan, savedMeals, date);
              const over = goals.dailyCalories > 0 && totals.calories > goals.dailyCalories * 1.1;
              return (
                <section key={date} className="rounded-2xl border border-[#1A1E26] bg-black/30 p-3" aria-label={dayLabel(date, today)}>
                  <div className="flex items-baseline justify-between">
                    <h3 className="text-xs font-bold" style={{ color: date === today ? theme.primary : '#fff' }}>
                      {dayLabel(date, today)}
                    </h3>
                    {totals.calories > 0 && (
                      <span className="text-xs tabular-nums" style={{ color: over ? '#F28B82' : '#7E889B' }}>
                        {Math.round(totals.calories).toLocaleString()} of {goals.dailyCalories.toLocaleString()} kcal · {Math.round(totals.proteinG)} g protein
                      </span>
                    )}
                  </div>
                  <div className="mt-2 space-y-2">
                    {MEAL_ORDER.map((meal) => {
                      const planned = plannedIn(mp.plan, date, meal);
                      const key = `${date}|${meal}`;
                      return (
                        <div key={meal}>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase tracking-wide text-[#9AA3B2]">{meal}</span>
                            {savedMeals.length > 0 && (
                              <button onClick={() => setAdding(adding === key ? null : key)} className="rounded-full p-1 text-neutral-400 hover:text-white" aria-label={`Add a meal to ${meal} on ${dayLabel(date, today)}`}>
                                <Plus className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                          {planned.map((p) => {
                            const m = byId.get(p.savedMealId);
                            return (
                              <div key={p.id} className="mt-1 flex items-center gap-2 rounded-xl bg-white/[0.04] px-2.5 py-2">
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-xs font-semibold">{m ? m.name : 'Deleted meal'}</div>
                                  {m && <div className="text-xs text-[#9AA3B2]">{Math.round(mealTotals(m).calories)} kcal · {Math.round(mealTotals(m).proteinG)} g protein</div>}
                                </div>
                                {m && (p.loggedAt ? (
                                  <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: theme.primary }}>
                                    <Check className="h-3 w-3" /> Logged
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => {
                                      onLogMeal(date, meal, m);
                                      mp.logged(p.id);
                                    }}
                                    className={btn}
                                  >
                                    Log it
                                  </button>
                                ))}
                                <button onClick={() => mp.remove(p.id)} className="rounded-full p-1.5 text-neutral-400 hover:text-rose-300" aria-label={`Remove ${m ? m.name : 'meal'} from the plan`}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            );
                          })}
                          {adding === key && (
                            <select
                              autoFocus
                              defaultValue=""
                              onChange={(e) => {
                                if (e.target.value) mp.add(date, meal, e.target.value);
                                setAdding(null);
                              }}
                              className="mt-1 w-full rounded-xl border border-neutral-700 bg-black/60 px-3 py-2 text-xs text-white"
                              aria-label={`Choose a meal for ${meal}`}
                            >
                              <option value="">Choose a saved meal…</option>
                              {savedMeals.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name} ({Math.round(mealTotals(m).calories)} kcal)
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {totalItems === 0 ? (
              <p className="rounded-2xl border border-[#1A1E26] bg-black/30 p-4 text-center text-xs leading-relaxed text-neutral-300">
                Nothing to buy yet. Plan some meals for this week and the foods in them appear here. You can also add your own items below.
              </p>
            ) : (
              <div className="flex items-center justify-between text-xs text-[#9AA3B2]">
                <span>
                  {doneItems} of {totalItems} ticked
                </span>
                <div className="flex gap-2">
                  {doneItems > 0 && (
                    <button onClick={mp.clearChecked} className={btn}>
                      Clear ticked
                    </button>
                  )}
                  <button onClick={shareList} className={btn}>
                    Share list
                  </button>
                </div>
              </div>
            )}
            <ul className="divide-y divide-[#1A1E26] rounded-2xl border border-[#1A1E26] bg-black/30">
              {grocery.map((g) => {
                const on = !!mp.checked[g.key];
                return (
                  <li key={g.key}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5">
                      <input type="checkbox" checked={on} onChange={() => mp.toggle(g.key)} className="h-4 w-4 accent-[var(--accent)]" />
                      <span className="min-w-0 flex-1">
                        <span className={`block text-xs font-semibold ${on ? 'text-neutral-400 line-through' : ''}`}>
                          {g.name}
                          {g.count > 1 && <span className="ml-1.5 font-normal text-[#9AA3B2]">x{g.count}</span>}
                        </span>
                        <span className="block truncate text-xs text-neutral-400">{g.meals.join(', ')}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
              {mp.extras.map((e) => {
                const on = !!mp.checked[`extra:${e.id}`];
                return (
                  <li key={e.id} className="flex items-center">
                    <label className="flex flex-1 cursor-pointer items-center gap-3 px-3 py-2.5">
                      <input type="checkbox" checked={on} onChange={() => mp.toggle(`extra:${e.id}`)} className="h-4 w-4 accent-[var(--accent)]" />
                      <span className={`text-xs font-semibold ${on ? 'text-neutral-400 line-through' : ''}`}>{e.name}</span>
                    </label>
                    <button onClick={() => mp.removeExtra(e.id)} className="mr-2 rounded-full p-1.5 text-neutral-400 hover:text-rose-300" aria-label={`Remove ${e.name}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                mp.addExtra(extra);
                setExtra('');
              }}
              className="flex gap-2"
            >
              <input
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
                placeholder="Add your own item"
                aria-label="Add your own grocery item"
                className="min-w-0 flex-1 rounded-xl border border-neutral-700 bg-black/60 px-3 py-2 text-xs text-white"
              />
              <button type="submit" disabled={!extra.trim()} className="rounded-xl px-3.5 py-2 text-xs font-bold text-black disabled:opacity-40" style={{ backgroundColor: theme.primary }}>
                Add
              </button>
            </form>
            {note && (
              <p role="status" className="text-xs" style={{ color: theme.primary }}>
                {note}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
