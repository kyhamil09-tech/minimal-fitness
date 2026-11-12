import React, { useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Copy, Plus, Share2, ShoppingBasket, Trash2, Utensils, X } from 'lucide-react';
import { MealType, SavedMeal } from '../types/tracking';
import { MEAL_ORDER, groceryList, groceryText, mealTotals, plannedDayTotals, plannedIn, weekDates } from '../lib/mealPlan';
import { addDays, parseDateKey, startOfWeek, toDateKey } from '../lib/dates';
import { EatCtx } from './state';
import { CalendarSheet } from '../components/CalendarSheet';
import { Sheet, num } from './ui';

type View = 'plan' | 'groceries';

const dayLabel = (date: string, today: string) =>
  date === today ? 'Today' : parseDateKey(date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

/** Plan: a week of saved meals, logged in a tap when you eat them, and the shopping list the plan needs. */
export const Plan: React.FC<{ ctx: EatCtx; onCook: () => void }> = ({ ctx, onCook }) => {
  const { mealPlan: mp, savedMeals, today, goals } = ctx;
  const [view, setView] = useState<View>('plan');
  const [weekStart, setWeekStart] = useState(() => toDateKey(startOfWeek(new Date())));
  const [adding, setAdding] = useState<{ date: string; meal: MealType } | null>(null);
  const [extra, setExtra] = useState('');
  const [calOpen, setCalOpen] = useState(false);

  const dates = useMemo(() => weekDates(weekStart), [weekStart]);
  const byId = useMemo(() => new Map(savedMeals.map((m) => [m.id, m])), [savedMeals]);
  const grocery = useMemo(() => groceryList(mp.plan, savedMeals, dates), [mp.plan, savedMeals, dates]);
  const weekHasPlan = dates.some((d) => mp.plan.some((p) => p.date === d));
  const lastWeek = addDays(weekStart, -7);
  const lastWeekHasPlan = weekDates(lastWeek).some((d) => mp.plan.some((p) => p.date === d));
  const isThisWeek = weekStart === toDateKey(startOfWeek(new Date()));
  const range = `${parseDateKey(dates[0]).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} to ${parseDateKey(dates[6]).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  const totalItems = grocery.length + mp.extras.length;
  const doneItems = grocery.filter((g) => mp.checked[g.key]).length + mp.extras.filter((e) => mp.checked[`extra:${e.id}`]).length;

  const logSaved = (date: string, meal: MealType, sm: SavedMeal, planId: string) => {
    const ids = sm.items.map((i) => ctx.onAddFood(date, { meal, name: i.name, calories: i.calories, proteinG: i.proteinG, carbsG: i.carbsG, fatG: i.fatG })).filter((x): x is string => typeof x === 'string');
    mp.logged(planId);
    ctx.say(`Logged ${sm.name} to ${meal}`, () => ids.forEach((id) => ctx.onDeleteFood(id)));
  };

  const share = async () => {
    const text = groceryText(`Groceries ${range}`, grocery, mp.extras, mp.checked);
    try {
      if (navigator.share) await navigator.share({ title: 'Grocery list', text });
      else {
        await navigator.clipboard.writeText(text);
        ctx.say('List copied');
      }
    } catch {
      // sharing was cancelled
    }
  };

  return (
    <div className="ea-scroll">
      <div className="ea-wrap">
        <h1 className="ea-h1 mt-3">The <em>week</em> ahead</h1>
        <p className="ea-dim mt-1 text-sm">Plan meals you already know, log them with a tap, and shop from the plan.</p>

        <button type="button" className="ea-chip mt-3" onClick={() => setCalOpen(true)}>
          Add to my calendar
        </button>
        <CalendarSheet isOpen={calOpen} onClose={() => setCalOpen(false)} theme={ctx.calendarTheme} />

        <div className="mt-4 grid grid-cols-2 gap-2" role="group" aria-label="Plan view">
          <button type="button" className="ea-chip" aria-pressed={view === 'plan'} onClick={() => setView('plan')}>
            <Utensils className="h-4 w-4" aria-hidden="true" /> Plan
          </button>
          <button type="button" className="ea-chip" aria-pressed={view === 'groceries'} onClick={() => setView('groceries')}>
            <ShoppingBasket className="h-4 w-4" aria-hidden="true" /> Groceries
          </button>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <button type="button" className="ea-iconbtn border" style={{ borderColor: 'var(--ea-line)' }} onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week">
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="text-center">
            <div className="ea-serif text-lg font-semibold">{isThisWeek ? 'This week' : range}</div>
            {isThisWeek && <div className="ea-dim text-xs">{range}</div>}
          </div>
          <button type="button" className="ea-iconbtn border" style={{ borderColor: 'var(--ea-line)' }} onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week">
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {view === 'plan' ? (
          <div className="mt-4 space-y-3">
            {savedMeals.length === 0 && (
              <div className="ea-note text-sm leading-relaxed">
                You have no saved meals yet. Build a recipe or save a few foods as a meal in Cook, and they appear here to plan.
                <button type="button" className="ea-btn ea-btn-small mt-3" onClick={onCook}>
                  Go to Cook
                </button>
              </div>
            )}
            {!weekHasPlan && lastWeekHasPlan && (
              <button type="button" className="ea-btn ea-btn-quiet ea-btn-small w-full" onClick={() => mp.copyFrom(lastWeek, weekStart)}>
                <Copy className="h-4 w-4" aria-hidden="true" /> Copy last week's plan
              </button>
            )}
            {dates.map((date, di) => {
              const totals = plannedDayTotals(mp.plan, savedMeals, date);
              return (
                <section key={date} className="ea-card ea-rise" style={{ ['--i' as string]: di }} aria-label={dayLabel(date, today)}>
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="ea-h2" style={{ color: date === today ? 'var(--ea-c)' : undefined }}>
                      {dayLabel(date, today)}
                    </h2>
                    <span className="ea-dim text-xs tabular-nums">{totals.calories > 0 ? `${num(totals.calories)} of ${num(goals.dailyCalories)} kcal planned` : 'Nothing planned'}</span>
                  </div>
                  {MEAL_ORDER.map((meal) => {
                    const items = plannedIn(mp.plan, date, meal);
                    if (items.length === 0) return null;
                    return (
                      <div key={meal} className="mt-2">
                        <div className="ea-eyebrow">{meal}</div>
                        {items.map((p) => {
                          const m = byId.get(p.savedMealId);
                          const tot = m ? mealTotals(m) : null;
                          return (
                            <div key={p.id} className="flex items-center gap-2 py-1">
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-semibold">{m ? m.name : 'A meal you deleted'}</div>
                                {tot && <div className="ea-dim text-xs tabular-nums">{num(tot.calories)} kcal · P {Math.round(tot.proteinG)}</div>}
                              </div>
                              {m &&
                                (p.loggedAt ? (
                                  <span className="ea-tag flex items-center gap-1" style={{ color: 'var(--ea-f)' }}>
                                    <Check className="h-3 w-3" aria-hidden="true" /> Logged
                                  </span>
                                ) : (
                                  <button type="button" className="ea-chip" onClick={() => logSaved(date, meal, m, p.id)} aria-label={`Log ${m.name} as eaten`}>
                                    <Utensils className="h-4 w-4" aria-hidden="true" /> Log
                                  </button>
                                ))}
                              <button type="button" className="ea-iconbtn" onClick={() => mp.remove(p.id)} aria-label={`Remove ${m?.name ?? 'meal'} from the plan`}>
                                <X className="h-4 w-4" aria-hidden="true" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                  <button type="button" className="ea-chip mt-3" onClick={() => setAdding({ date, meal: 'Dinner' })} disabled={savedMeals.length === 0}>
                    <Plus className="h-4 w-4" aria-hidden="true" /> Add a meal
                  </button>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="mt-4">
            <section className="ea-card" aria-label="Grocery list">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="ea-eyebrow">Shopping list</div>
                  <div className="ea-dim text-xs">{totalItems === 0 ? 'Plan a few meals and the list builds itself.' : `${doneItems} of ${totalItems} in the basket`}</div>
                </div>
                {totalItems > 0 && (
                  <button type="button" className="ea-chip" onClick={() => void share()}>
                    <Share2 className="h-4 w-4" aria-hidden="true" /> Share
                  </button>
                )}
              </div>
              <ul className="mt-2">
                {grocery.map((g) => (
                  <li key={g.key}>
                    <button type="button" role="checkbox" aria-checked={!!mp.checked[g.key]} className="ea-row" onClick={() => mp.toggle(g.key)}>
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border" style={{ borderColor: mp.checked[g.key] ? 'var(--ea-accent)' : 'rgba(var(--ea-tint),0.35)', background: mp.checked[g.key] ? 'var(--ea-accent)' : 'transparent' }} aria-hidden="true">
                        {mp.checked[g.key] && <Check className="h-4 w-4" style={{ color: 'var(--ea-accent-ink)' }} />}
                      </span>
                      <span className="min-w-0 flex-1" style={{ opacity: mp.checked[g.key] ? 0.5 : 1, textDecoration: mp.checked[g.key] ? 'line-through' : 'none' }}>
                        <span className="block truncate text-sm font-semibold">
                          {g.name}
                          {g.count > 1 ? ` x${g.count}` : ''}
                        </span>
                        <span className="ea-dim block truncate text-xs">{g.meals.join(', ')}</span>
                      </span>
                    </button>
                  </li>
                ))}
                {mp.extras.map((e) => (
                  <li key={e.id} className="flex items-center">
                    <button type="button" role="checkbox" aria-checked={!!mp.checked[`extra:${e.id}`]} className="ea-row" onClick={() => mp.toggle(`extra:${e.id}`)}>
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border" style={{ borderColor: mp.checked[`extra:${e.id}`] ? 'var(--ea-accent)' : 'rgba(var(--ea-tint),0.35)', background: mp.checked[`extra:${e.id}`] ? 'var(--ea-accent)' : 'transparent' }} aria-hidden="true">
                        {mp.checked[`extra:${e.id}`] && <Check className="h-4 w-4" style={{ color: 'var(--ea-accent-ink)' }} />}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold" style={{ opacity: mp.checked[`extra:${e.id}`] ? 0.5 : 1, textDecoration: mp.checked[`extra:${e.id}`] ? 'line-through' : 'none' }}>
                        {e.name}
                      </span>
                    </button>
                    <button type="button" className="ea-iconbtn" onClick={() => mp.removeExtra(e.id)} aria-label={`Remove ${e.name}`}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
              <form
                className="mt-3 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  mp.addExtra(extra);
                  setExtra('');
                }}
              >
                <label className="sr-only" htmlFor="ea-extra">
                  Add something else to the list
                </label>
                <input id="ea-extra" className="ea-input" placeholder="Add something else" value={extra} onChange={(e) => setExtra(e.target.value)} />
                <button type="submit" className="ea-btn ea-btn-small shrink-0" disabled={!extra.trim()}>
                  Add
                </button>
              </form>
              {doneItems > 0 && (
                <button type="button" className="ea-chip mt-3" onClick={mp.clearChecked}>
                  Clear what is in the basket
                </button>
              )}
            </section>
          </div>
        )}
        <div className="h-6" />
      </div>

      <Sheet open={adding !== null} onClose={() => setAdding(null)} title={adding ? `Add to ${dayLabel(adding.date, today)}` : 'Add a meal'}>
        {adding && (
          <>
            <div className="ea-eyebrow">Which meal</div>
            <div className="mt-2 grid grid-cols-4 gap-2" role="group" aria-label="Meal">
              {MEAL_ORDER.map((m) => (
                <button key={m} type="button" className="ea-chip !px-0" aria-pressed={adding.meal === m} onClick={() => setAdding({ ...adding, meal: m })}>
                  {m}
                </button>
              ))}
            </div>
            <div className="ea-eyebrow mt-4">Pick a saved meal</div>
            <ul className="mt-1">
              {savedMeals.map((m) => {
                const tot = mealTotals(m);
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      className="ea-row"
                      onClick={() => {
                        mp.add(adding.date, adding.meal, m.id);
                        setAdding(null);
                      }}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{m.name}</span>
                        <span className="ea-dim block text-xs tabular-nums">
                          {num(tot.calories)} kcal · P {Math.round(tot.proteinG)} · {m.items.length} item{m.items.length === 1 ? '' : 's'}
                        </span>
                      </span>
                      <Plus className="h-5 w-5 shrink-0" style={{ color: 'var(--ea-p)' }} aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Sheet>
    </div>
  );
};
