import React, { useMemo, useState } from 'react';
import { BookmarkPlus, CalendarDays, Camera, ChevronLeft, ChevronRight, Copy, Droplets, Flame, Mic, Plus, Repeat, ScanBarcode, Sparkles, Timer, Undo2 } from 'lucide-react';
import { FoodEntry, MealType } from '../types/tracking';
import { FoodIcon } from '../components/food/FoodIcon';
import { MicrosCard } from '../components/food/MicrosCard';
import { addDays, friendlyDateLabel, parseDateKey } from '../lib/dates';
import { workoutsOnDay } from '../lib/calc';
import { displayToMl, mlToDisplay, volumeUnit } from '../lib/units';
import { entriesToRepeat, mealForQuick, mealNow, quickFoods, yesterdayOf } from '../lib/quickFood';
import { FEELINGS, MEALS, MEAL_HINT, styleById } from './content';
import { lowDayKcal } from '../fasting/model';
import { fitsDiet } from './diet';
import { calmWord, dayGoal, dayNote, dayTotals, eatingWindow, fillIdeas, greeting, isTrainingDay, loggingStreak, macroTargets, mealBudget, plate, weekBudget } from './model';
import { eatingState } from '../fasting/model';
import { displayToKg, kgToDisplay, weightUnit } from '../lib/units';
import { EatCtx } from './state';
import { MacroBar, Ornament, PlateRing, SectionTitle, Sheet, hoursText, num, timeOfDay, useNow } from './ui';

const H = 3_600_000;

/**
 * Today: the plate with what is left, the three macros, the day's note, a week view if you want it, one-tap usuals, the four meals, water,
 * ideas for closing a gap, vitamins, and a few words about how the day felt.
 */
export const Today: React.FC<{ ctx: EatCtx; onEdit: (e: FoodEntry) => void }> = ({ ctx, onEdit }) => {
  const { food, water, goals, date, today, units, prefs } = ctx;
  const now = useNow(60_000);
  const hour = new Date(now).getHours() + new Date(now).getMinutes() / 60;
  const isToday = date === today;
  const calm = prefs.calm;
  const [pickDate, setPickDate] = useState(false);
  const [mealSheet, setMealSheet] = useState<{ kind: 'save' | 'copy'; meal: MealType } | null>(null);
  const [mealName, setMealName] = useState('');

  const dayFood = useMemo(() => food.filter((f) => f.date === date), [food, date]);
  const t = useMemo(() => dayTotals(dayFood), [dayFood]);
  const burned = prefs.activity ? Math.round(workoutsOnDay(ctx.workouts, date).reduce((s, w) => s + w.caloriesBurned, 0)) : 0;
  const training = isTrainingDay(ctx.workouts, date, today, ctx.plannedTraining);
  const lowKcal = lowDayKcal(ctx.fastPlan, date);
  const goalToday = lowKcal ?? dayGoal(goals.dailyCalories, prefs.split, training);
  const budget = goalToday + (lowKcal !== null ? 0 : burned);
  const left = Math.round(budget - t.calories);
  const targets = macroTargets(goalToday, goals.dailyProteinG, styleById(prefs.style));
  const pl = plate(t, budget);
  const week = useMemo(() => weekBudget(food, goals.dailyCalories, today), [food, goals.dailyCalories, today]);
  const streak = useMemo(() => loggingStreak(food, today), [food, today]);
  const window = useMemo(() => eatingWindow(dayFood), [dayFood]);
  const usuals = useMemo(() => quickFoods(food, today, 8), [food, today]);
  const prevDay = yesterdayOf(date);
  const prevCount = useMemo(() => food.filter((f) => f.date === prevDay).length, [food, prevDay]);
  const note = dayNote({ hour: isToday ? hour : 20, date, eaten: t.calories, goal: budget, proteinG: t.proteinG, proteinGoal: targets.proteinG, entries: dayFood.length });
  const ideas = useMemo(
    () => (isToday && (dayFood.length > 0 || hour >= 11) ? fillIdeas(food, today, { kcal: left, proteinG: targets.proteinG - t.proteinG, fiberG: targets.fiberG - t.fiberG }, 3, (e) => fitsDiet(e, prefs.diet)) : []),
    [isToday, dayFood.length, hour, food, today, left, targets.proteinG, targets.fiberG, t.proteinG, t.fiberG, prefs.diet]
  );

  const dayWater = water.filter((w) => w.date === date);
  const waterMl = dayWater.reduce((s, w) => s + w.ml, 0);
  const quickWater = units === 'imperial' ? [8, 12, 16] : [250, 500, 750];
  const lastWater = dayWater[dayWater.length - 1];

  const meal = (m: MealType) => dayFood.filter((f) => f.meal === m);
  const logIds = (ids: (string | void)[]): string[] => ids.filter((x): x is string => typeof x === 'string');
  const undoAll = (ids: string[]) => () => ids.forEach((id) => ctx.onDeleteFood(id));

  const logQuick = (q: ReturnType<typeof quickFoods>[number]) => {
    const m = mealForQuick(q);
    const id = ctx.onAddFood(date, { ...q.entry, meal: m });
    ctx.say(`Added ${q.entry.name} to ${m}`, undoAll(logIds([id])));
  };
  const repeat = () => {
    const items = entriesToRepeat(food, prevDay);
    if (items.length === 0) return;
    const ids = logIds(items.map((i) => ctx.onAddFood(date, i)));
    ctx.say(`Repeated yesterday: ${items.length} food${items.length === 1 ? '' : 's'}`, undoAll(ids));
  };
  const addIdea = (e: Omit<FoodEntry, 'id' | 'date'>) => {
    const id = ctx.onAddFood(date, { ...e, meal: mealNow() });
    ctx.say(`Added ${e.name}`, undoAll(logIds([id])));
  };

  const dayNotes = ctx.notes[date] ?? {};
  const toggleFeel = (id: string) =>
    ctx.setNotes((all) => {
      const cur = all[date] ?? {};
      const feel = cur.feel?.includes(id) ? cur.feel.filter((x) => x !== id) : [...(cur.feel ?? []), id];
      return { ...all, [date]: { ...cur, feel } };
    });

  const saveMeal = (m: MealType, name: string) => {
    const items = meal(m).map((e) => ({ name: e.name, calories: Math.round(e.calories), proteinG: e.proteinG, carbsG: e.carbsG, fatG: e.fatG }));
    if (items.length === 0 || !name.trim()) return;
    ctx.onSaveMeal(name.trim(), items);
    ctx.say(`Saved ${name.trim()} to Cook`);
    setMealSheet(null);
  };
  const copyMeal = (m: MealType, to: string) => {
    const ids = logIds(meal(m).map((e) => { const { id: _id, date: _d, ...rest } = e; return ctx.onAddFood(to, rest); }));
    ctx.say(`Copied ${m} to ${friendlyDateLabel(to, today)}`, undoAll(ids));
    setMealSheet(null);
  };

  // The Fasting plan's window, for anyone who uses Fasting.
  const win = useMemo(() => eatingState(ctx.fastPlan, now), [ctx.fastPlan, Math.floor(now / 60_000)]);
  const showWindow = isToday && (ctx.fastsUsed || !!ctx.fast) && win.state !== 'off' && !!win.windowStart && !!win.windowEnd;

  // Weigh-in: the same list Progress reads.
  const [weighOpen, setWeighOpen] = useState(false);
  const [weighText, setWeighText] = useState('');
  const latestW = useMemo(() => [...ctx.body].sort((a, b) => (a.date < b.date ? 1 : -1))[0], [ctx.body]);
  const daysSinceW = latestW ? Math.round((parseDateKey(today).getTime() - parseDateKey(latestW.date).getTime()) / 86_400_000) : null;
  const saveWeight = () => {
    const v = Number(weighText.replace(',', '.'));
    const kg = Math.round(displayToKg(v, units) * 10) / 10;
    if (!(kg >= 25 && kg <= 400)) return;
    ctx.onAddBody({ date: today, weightKg: kg });
    ctx.say(`Weight logged: ${v} ${weightUnit(units)}`);
    setWeighOpen(false);
  };

  const fastHours = ctx.fast ? (now - ctx.fast.startedAt) / H : 0;
  const first = ctx.name.trim().split(/\s+/)[0];
  const over = left < 0;

  return (
    <div className="ea-scroll">
      <div className="ea-wrap">
        <div className="ea-rise mt-1 flex items-center justify-between gap-2" style={{ ['--i' as string]: 0 }}>
          <button type="button" className="ea-iconbtn border" style={{ borderColor: 'var(--ea-line)' }} onClick={() => ctx.setDate(addDays(date, -1))} aria-label="Previous day">
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <button type="button" className="min-h-11 rounded-xl px-3 text-center" onClick={() => setPickDate(true)} aria-label={`${friendlyDateLabel(date, today)}, ${parseDateKey(date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}. Pick another day`}>
            <div className="ea-eyebrow">{friendlyDateLabel(date, today)}</div>
            <div className="ea-dim flex items-center justify-center gap-1 text-xs">
              {parseDateKey(date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
              <CalendarDays className="h-3 w-3" aria-hidden="true" />
            </div>
          </button>
          <button type="button" className="ea-iconbtn border" style={{ borderColor: 'var(--ea-line)' }} onClick={() => ctx.setDate(addDays(date, 1))} aria-label="Next day" disabled={date >= today}>
            <ChevronRight className="h-5 w-5" aria-hidden="true" style={{ opacity: date >= today ? 0.3 : 1 }} />
          </button>
        </div>

        <h1 className="ea-h1 ea-rise mt-4" style={{ ['--i' as string]: 1 }}>
          {isToday ? greeting(new Date(now).getHours()) : friendlyDateLabel(date, today)}
          {isToday && first ? (
            <>
              , <em>{first}</em>
            </>
          ) : null}
          .
        </h1>

        {ctx.fast && isToday && (
          <div className="ea-note ea-rise mt-4 flex items-center justify-between gap-3" style={{ ['--i' as string]: 2 }}>
            <div className="min-w-0 text-sm leading-snug">
              <span className="font-bold">A fast is running · {Math.floor(fastHours)}h {String(Math.floor((fastHours % 1) * 60)).padStart(2, '0')}m.</span> When you break it, end it in Fasting.
            </div>
            <button type="button" className="ea-chip shrink-0" onClick={ctx.openFasting}>
              <Timer className="h-4 w-4" aria-hidden="true" /> Fasting
            </button>
          </div>
        )}

        {showWindow && (
          <div className="ea-card ea-rise mt-4 flex items-center justify-between gap-3 !py-3" style={{ ['--i' as string]: 2 }}>
            <div className="min-w-0 text-sm leading-snug">
              <span className="font-bold">Eating window {timeOfDay(win.windowStart!)} to {timeOfDay(win.windowEnd!)}</span>
              <span className="ea-dim block text-xs">
                {ctx.fast ? 'You are fasting now.' : win.state === 'eating' && win.nextAt ? `Open for ${hoursText((win.nextAt - now) / 3_600_000)} more.` : win.nextAt ? `Opens in ${hoursText((win.nextAt - now) / 3_600_000)}.` : 'Closed for today.'}
              </span>
            </div>
            <button type="button" className="ea-chip shrink-0" onClick={ctx.openFasting}>
              <Timer className="h-4 w-4" aria-hidden="true" /> Fasting
            </button>
          </div>
        )}

        <section className="ea-card ea-card-gold ea-rise mt-4" style={{ ['--i' as string]: 3 }} aria-label="Today's plate">
          <PlateRing
            plate={pl}
            label={`${calm ? calmWord(t.calories, budget) + '. ' : `${num(t.calories)} of ${num(budget)} calories. `}Protein ${Math.round(t.proteinG)} grams, carbs ${Math.round(t.carbsG)} grams, fat ${Math.round(t.fatG)} grams.`}
          >
            {calm ? (
              <div className="ea-serif text-2xl font-semibold leading-tight">{calmWord(t.calories, budget)}</div>
            ) : (
              <>
                <div className="ea-big" style={{ color: over ? 'var(--ea-c)' : 'var(--ea-text)' }}>
                  {over ? `+${num(-left)}` : num(left)}
                </div>
                <div className="ea-dim mt-1 text-xs font-semibold">{over ? 'past your plan, and that is okay' : 'left to enjoy'}</div>
              </>
            )}
          </PlateRing>
          {lowKcal !== null && !calm && (
            <div className="mt-3 flex justify-center">
              <span className="ea-tag">5:2 low-calorie day</span>
            </div>
          )}
          {lowKcal === null && prefs.split.on && !calm && (
            <div className="mt-3 flex justify-center">
              <span className="ea-tag">{training ? 'Training day' : 'Rest day'} target</span>
            </div>
          )}
          {!calm && (
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="ea-serif text-xl font-semibold">{num(t.calories)}</div>
              <div className="ea-dim text-xs">eaten</div>
            </div>
            <div>
              <div className="ea-serif text-xl font-semibold">{num(goalToday)}</div>
              <div className="ea-dim text-xs">plan</div>
            </div>
            <div>
              <div className="ea-serif flex items-center justify-center gap-1 text-xl font-semibold">
                {burned > 0 && <Flame className="h-4 w-4" style={{ color: 'var(--ea-p)' }} aria-hidden="true" />}
                {burned > 0 ? `+${num(burned)}` : '0'}
              </div>
              <div className="ea-dim text-xs">{prefs.activity ? 'from activity' : 'activity not added'}</div>
            </div>
          </div>
          )}
          <div className="mt-5">
            <MacroBar label="Protein" value={t.proteinG} target={targets.proteinG} color="var(--ea-p)" />
            <MacroBar label="Carbs" value={t.carbsG} target={targets.carbsG} color="var(--ea-c)" />
            <MacroBar label="Fat" value={t.fatG} target={targets.fatG} color="var(--ea-f)" />
            <MacroBar label="Fiber" value={t.fiberG} target={targets.fiberG} color="var(--ea-lilac)" />
            {(t.sugarG > 0 || t.sodiumMg > 0) && (
              <details className="mt-3">
                <summary className="ea-dim min-h-11 cursor-pointer list-none py-2 text-xs font-bold uppercase tracking-wider">More numbers</summary>
                <MacroBar label="Sugar" value={t.sugarG} target={prefs.sugarG} color="var(--ea-p)" />
                <MacroBar label="Sodium" value={t.sodiumMg} target={prefs.sodiumMg} unit="mg" color="var(--ea-water)" />
              </details>
            )}
          </div>
          <p className="mt-4 text-center text-[0.95rem] italic leading-snug" style={{ fontFamily: 'var(--ea-serif)', color: 'var(--ea-text)' }}>
            {note}
          </p>
          {(streak >= 2 || window) && (
            <div className="ea-dim mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
              {streak >= 2 && <span>{streak} days logged in a row</span>}
              {window && (
                <span>
                  First bite {timeOfDay(window.first)} · last {timeOfDay(window.last)} · {window.hours} h
                </span>
              )}
            </div>
          )}
        </section>

        {prefs.flex && !calm && (
          <section className="ea-card ea-rise mt-3" style={{ ['--i' as string]: 4 }} aria-label="This week">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="ea-eyebrow">This week</div>
                <div className="ea-serif mt-0.5 text-xl font-semibold">
                  {week.left >= 0 ? `${num(week.left)} left` : `${num(-week.left)} past`}
                </div>
              </div>
              <div className="ea-dim text-right text-xs">
                {week.daysLeft > 0 ? `${num(week.perDay)} a day for the ${week.daysLeft} day${week.daysLeft === 1 ? '' : 's'} left` : 'The week is done'}
              </div>
            </div>
            <div className="ea-week mt-3" role="group" aria-label="Days of this week">
              {week.days.map((d) => {
                const pct = goals.dailyCalories > 0 ? Math.min(100, (d.calories / goals.dailyCalories) * 100) : 0;
                return (
                  <button key={d.date} type="button" className="ea-day" aria-pressed={d.date === date} onClick={() => !d.isFuture && ctx.setDate(d.date)} disabled={d.isFuture} aria-label={`${friendlyDateLabel(d.date, today)}, ${num(d.calories)} calories`}>
                    <span className="ea-bar">
                      <div style={{ height: `${pct}%`, background: d.calories > goals.dailyCalories * 1.1 ? 'var(--ea-c)' : 'var(--ea-p)', opacity: d.isFuture ? 0.25 : 1 }} />
                    </span>
                    <span style={{ color: d.isToday ? 'var(--ea-c)' : 'var(--ea-dim)' }}>{parseDateKey(d.date).toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
                  </button>
                );
              })}
            </div>
            <p className="ea-dim mt-3 text-xs leading-relaxed">A day over is balanced by the days around it. Days you did not log count as your plan, so nothing is saved up by skipping the log.</p>
          </section>
        )}

        {isToday && usuals.length > 0 && (
          <div className="ea-rise" style={{ ['--i' as string]: 5 }}>
            <SectionTitle eyebrow="One tap" right={prevCount > 0 ? (
              <button type="button" className="ea-chip" onClick={repeat}>
                <Repeat className="h-4 w-4" aria-hidden="true" /> Repeat yesterday
              </button>
            ) : undefined}>
              Your usuals
            </SectionTitle>
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar" role="group" aria-label="Your usual foods">
              {usuals.map((q) => (
                <button key={q.key} type="button" className="ea-quickfood" onClick={() => logQuick(q)} aria-label={`Log ${q.entry.name}${calm ? '' : `, ${Math.round(q.entry.calories)} calories`}${q.entry.amount ? `, ${q.entry.amount}` : ''}`}>
                  <span className="line-clamp-2 text-sm font-semibold leading-tight">{q.entry.name}</span>
                  {!calm && <span className="ea-dim text-xs tabular-nums">{Math.round(q.entry.calories)} kcal</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-3 gap-2">
          <button type="button" className="ea-chip" onClick={() => ctx.openAdd(mealNow(), 'scan')}>
            <ScanBarcode className="h-4 w-4" aria-hidden="true" /> Scan
          </button>
          <button type="button" className="ea-chip" onClick={() => ctx.openAdd(mealNow(), 'photo')}>
            <Camera className="h-4 w-4" aria-hidden="true" /> Photo
          </button>
          <button type="button" className="ea-chip" onClick={ctx.openVoice}>
            <Mic className="h-4 w-4" aria-hidden="true" /> Speak
          </button>
        </div>

        <SectionTitle eyebrow="The day">Meals</SectionTitle>
        <div className="space-y-3">
          {MEALS.map((m, mi) => {
            const items = meal(m);
            const kcal = items.reduce((s, e) => s + e.calories, 0);
            return (
              <section key={m} className="ea-card ea-meal ea-rise" style={{ ['--i' as string]: 6 + mi }} aria-label={m}>
                <div className="ea-meal-head">
                  <div className="min-w-0">
                    <h3 className="ea-h2">{m}</h3>
                    <div className="ea-dim text-xs">
                      {items.length > 0 ? `${items.length} food${items.length === 1 ? '' : 's'}` : MEAL_HINT[m]}
                      {!calm && items.length > 0 ? ` · about ${num(mealBudget(goalToday, m))} suggested` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {kcal > 0 && !calm && <span className="ea-serif text-lg font-semibold">{num(kcal)}</span>}
                    <button type="button" className="ea-addmeal" onClick={() => ctx.openAdd(m)} aria-label={`Add food to ${m}`}>
                      <Plus className="h-5 w-5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
                {items.length > 0 && (
                  <ul className="mt-2">
                    {items.map((e) => (
                      <li key={e.id}>
                        <button type="button" className="ea-row" onClick={() => onEdit(e)} aria-label={`${e.name}${calm ? '' : `, ${Math.round(e.calories)} calories`}. Edit`}>
                          <FoodIcon group={e.group ?? 0} size={38} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">{e.name}</span>
                            <span className="ea-dim block truncate text-xs">
                              {e.amount ? `${e.amount} · ` : ''}P {Math.round(e.proteinG)} · C {Math.round(e.carbsG)} · F {Math.round(e.fatG)}
                            </span>
                          </span>
                          {!calm && <span className="ea-serif shrink-0 text-base font-semibold tabular-nums">{Math.round(e.calories)}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {items.length > 0 && (
                  <div className="mt-1 flex gap-2 pb-1">
                    <button type="button" className="ea-chip" onClick={() => { setMealName(`My ${m.toLowerCase()}`); setMealSheet({ kind: 'save', meal: m }); }}>
                      <BookmarkPlus className="h-4 w-4" aria-hidden="true" /> Save as meal
                    </button>
                    <button type="button" className="ea-chip" onClick={() => setMealSheet({ kind: 'copy', meal: m })}>
                      <Copy className="h-4 w-4" aria-hidden="true" /> Copy to…
                    </button>
                  </div>
                )}
              </section>
            );
          })}
        </div>

        {ideas.length > 0 && (
          <>
            <SectionTitle eyebrow="Room left" right={<Sparkles className="h-5 w-5" style={{ color: 'var(--ea-c)' }} aria-hidden="true" />}>
              Ideas to finish the day
            </SectionTitle>
            <section className="ea-card" aria-label="Ideas to finish the day">
              <ul>
                {ideas.map((i) => (
                  <li key={i.entry.name} className="flex items-center gap-3 py-1.5">
                    <FoodIcon group={i.entry.group ?? 0} size={38} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{i.entry.name}</span>
                      <span className="ea-dim block truncate text-xs">
                        {calm ? '' : `${Math.round(i.entry.calories)} kcal · `}{i.why}
                        {i.typical ? ' · typical values' : ' · from your log'}
                      </span>
                    </span>
                    <button type="button" className="ea-addmeal" onClick={() => addIdea(i.entry)} aria-label={`Add ${i.entry.name}`}>
                      <Plus className="h-5 w-5" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}

        <SectionTitle eyebrow="Hydration">Water</SectionTitle>
        <section className="ea-card" aria-label="Water">
          <div className="flex items-end justify-between gap-3">
            <div>
              <span className="ea-serif text-2xl font-semibold">{mlToDisplay(waterMl, units).toLocaleString()}</span>
              <span className="ea-dim text-sm"> / {mlToDisplay(goals.dailyWaterMl, units).toLocaleString()} {volumeUnit(units)}</span>
            </div>
            {lastWater && (
              <button type="button" className="ea-chip" onClick={() => ctx.onDeleteWater(lastWater.id)} aria-label="Undo last drink">
                <Undo2 className="h-4 w-4" aria-hidden="true" /> Undo
              </button>
            )}
          </div>
          <div className="ea-track" aria-hidden="true">
            <div className="ea-fill" style={{ width: `${goals.dailyWaterMl > 0 ? Math.min(100, (waterMl / goals.dailyWaterMl) * 100) : 0}%`, background: 'var(--ea-water)' }} />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {quickWater.map((v) => (
              <button key={v} type="button" className="ea-chip" onClick={() => ctx.onAddWater(date, displayToMl(v, units))} aria-label={`Add ${v} ${volumeUnit(units)} of water`}>
                <Droplets className="h-4 w-4" style={{ color: 'var(--ea-water)' }} aria-hidden="true" /> +{v}
              </button>
            ))}
          </div>
        </section>

        {isToday && (
          <>
            <SectionTitle eyebrow="Weight">Weigh-in</SectionTitle>
            <section className="ea-card flex items-center justify-between gap-3" aria-label="Weigh-in">
              <div className="min-w-0">
                <div className="ea-serif text-2xl font-semibold tabular-nums">{latestW ? `${kgToDisplay(latestW.weightKg, units)} ${weightUnit(units)}` : 'No weight yet'}</div>
                <div className="ea-dim text-xs">{latestW ? (daysSinceW === 0 ? 'Weighed today' : `${daysSinceW} day${daysSinceW === 1 ? '' : 's'} ago`) : 'Log one to see your trend in Insights'}</div>
              </div>
              <button type="button" className="ea-btn ea-btn-small shrink-0" onClick={() => { setWeighText(latestW ? String(kgToDisplay(latestW.weightKg, units)) : ''); setWeighOpen(true); }}>
                Log weight
              </button>
            </section>
          </>
        )}

        {dayFood.length > 0 && (
          <div className="mt-5">
            <MicrosCard entries={dayFood} accent="var(--ea-lilac)" />
          </div>
        )}

        <SectionTitle eyebrow="A few words">How did it feel?</SectionTitle>
        <section className="ea-card" aria-label="How the day felt">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Feelings">
            {FEELINGS.map((f) => (
              <button key={f.id} type="button" className="ea-chip" aria-pressed={dayNotes.feel?.includes(f.id) ?? false} onClick={() => toggleFeel(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
          <label className="sr-only" htmlFor="ea-day-note">
            Note for the day
          </label>
          <textarea
            id="ea-day-note"
            className="ea-input mt-3"
            placeholder="A note about today: what worked, what you want more of"
            defaultValue={dayNotes.note ?? ''}
            key={date}
            onBlur={(e) => {
              const v = e.target.value.trim();
              ctx.setNotes((all) => ({ ...all, [date]: { ...(all[date] ?? {}), note: v || undefined } }));
            }}
          />
        </section>
        <Ornament />
        <p className="ea-dim mt-3 text-center text-xs">Calories and nutrients are estimates. Food is for enjoying, too.</p>
      </div>

      <Sheet open={weighOpen} onClose={() => setWeighOpen(false)} title="Log your weight">
        <label htmlFor="ea-weigh" className="ea-eyebrow block">Weight today ({weightUnit(units)})</label>
        <input id="ea-weigh" className="ea-input mt-2" inputMode="decimal" value={weighText} onChange={(e) => setWeighText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveWeight()} />
        <p className="ea-dim mt-2 text-xs">One weigh-in does not tell you much. The trend over weeks does; Insights smooths the day-to-day noise.</p>
        <button type="button" className="ea-btn mt-4 w-full" disabled={!(Number(weighText.replace(',', '.')) > 0)} onClick={saveWeight}>
          Save
        </button>
      </Sheet>

      <Sheet open={pickDate} onClose={() => setPickDate(false)} title="Pick a day">
        <label htmlFor="ea-pick-date" className="ea-eyebrow block">Day</label>
        <input id="ea-pick-date" type="date" className="ea-input mt-2" value={date} max={today} onChange={(e) => e.target.value && (ctx.setDate(e.target.value), setPickDate(false))} />
        <button type="button" className="ea-btn mt-4 w-full" onClick={() => { ctx.setDate(today); setPickDate(false); }}>
          Back to today
        </button>
      </Sheet>

      <Sheet open={mealSheet?.kind === 'save'} onClose={() => setMealSheet(null)} title="Save as a meal">
        <p className="ea-dim text-sm">Keep this {mealSheet?.meal.toLowerCase()} as one tap, and plan it for the week.</p>
        <label htmlFor="ea-meal-name" className="ea-eyebrow mt-3 block">Name</label>
        <input id="ea-meal-name" className="ea-input mt-2" value={mealName} onChange={(e) => setMealName(e.target.value)} />
        <button type="button" className="ea-btn mt-4 w-full" disabled={!mealName.trim()} onClick={() => mealSheet && saveMeal(mealSheet.meal, mealName)}>
          Save
        </button>
      </Sheet>

      <Sheet open={mealSheet?.kind === 'copy'} onClose={() => setMealSheet(null)} title="Copy to another day">
        <p className="ea-dim text-sm">Copies every food in this {mealSheet?.meal.toLowerCase()} to the day you choose.</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {[addDays(date, -1), addDays(date, 1), addDays(date, 2), addDays(date, 3), addDays(date, 4), addDays(date, 5)]
            .filter((d, i) => d !== date && (i === 0 || d >= today))
            .map((d) => (
              <button key={d} type="button" className="ea-chip" onClick={() => mealSheet && copyMeal(mealSheet.meal, d)}>
                {d === today ? 'Today' : d === addDays(today, 1) ? 'Tomorrow' : friendlyDateLabel(d, today)}
              </button>
            ))}
        </div>
      </Sheet>
    </div>
  );
};
