import React, { useEffect, useMemo, useState } from 'react';
import { MicrosCard } from './food/MicrosCard';
import { ChevronLeft, ChevronRight, Droplets, Plus, Repeat, ScanBarcode, ShoppingBasket, Timer, Trash2, Undo2, Utensils } from 'lucide-react';
import { MealPlanSheet } from './MealPlanSheet';
import { WorkoutSession } from '../types/health';
import { FoodEntry, Goals, MealType, SavedMeal, UserProfile, WaterEntry } from '../types/tracking';
import { ColorPalette } from '../types/theme';
import { Ring } from './ui/charts';
import { MetricDetailSheet } from './MetricDetailSheet';
import type { MetricId } from '../lib/metricSeries';
import { Segmented } from './ui/Segmented';
import { fieldClass } from './ui/Modal';
import { AddFoodModal, NewFood } from './AddFoodModal';
import { FoodIcon } from './food/FoodIcon';
import { macroColors } from './food/MacroDonut';
import { VoiceLogCard } from './VoiceLogCard';
import { addDays, friendlyDateLabel, todayKey } from '../lib/dates';
import { sumFood, workoutsOnDay, clamp01 } from '../lib/calc';
import { displayToMl, mlToDisplay, volumeUnit } from '../lib/units';
import { entriesToRepeat, mealForQuick, mealNow, quickFoods, summarize, yesterdayOf } from '../lib/quickFood';

export type NutritionSegment = 'food' | 'fasting';

interface NutritionScreenProps {
  theme: ColorPalette;
  profile: UserProfile;
  goals: Goals;
  food: FoodEntry[];
  water: WaterEntry[];
  workouts: WorkoutSession[];
  segment: NutritionSegment;
  onSegmentChange: (s: NutritionSegment) => void;
  onAddFood: (date: string, food: NewFood) => string | void;
  onDeleteFood: (id: string) => void;
  onAddWater: (date: string, ml: number) => void;
  onDeleteWater: (id: string) => void;
  fastingSlot: React.ReactNode;
  /** The Health hub supplies its own title and section switcher. */
  hideHeader?: boolean;
  savedMeals?: SavedMeal[];
  onSaveMeal?: (name: string, items: SavedMeal['items']) => void;
  onDeleteMeal?: (id: string) => void;
  /** Something asked for the meal plan to open (the map). Once it has, onPlanOpened clears the request so it does not open again. */
  openPlanToken?: number;
  onPlanOpened?: () => void;
}

const MEALS: MealType[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

export const NutritionScreen: React.FC<NutritionScreenProps> = ({
  theme,
  profile,
  goals,
  food,
  water,
  workouts,
  segment,
  onSegmentChange,
  onAddFood,
  onDeleteFood,
  onAddWater,
  onDeleteWater,
  fastingSlot,
  hideHeader = false,
  savedMeals = [],
  onSaveMeal,
  onDeleteMeal,
  openPlanToken = 0,
  onPlanOpened,
}) => {
  const units = profile.units;
  const today = todayKey();
  const [date, setDate] = useState(today);
  const [addMeal, setAddMeal] = useState<MealType | null>(null);
  const [customWater, setCustomWater] = useState('');
  const [planOpen, setPlanOpen] = useState(false);
  const [metric, setMetric] = useState<MetricId | null>(null);
  // The note after a one-tap add or a repeat, with a way to undo it for a few seconds.
  const [toast, setToast] = useState<{ text: string; ids: string[] } | null>(null);
  const [scanFirst, setScanFirst] = useState(false);
  useEffect(() => {
    if (!toast) return undefined;
    const t = window.setTimeout(() => setToast(null), 8000);
    return () => window.clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (openPlanToken > 0) {
      setPlanOpen(true);
      onPlanOpened?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPlanToken]);

  const dayFood = food.filter((f) => f.date === date);
  const dayWater = water.filter((w) => w.date === date);
  const totals = sumFood(dayFood);
  const waterMl = dayWater.reduce((s, w) => s + w.ml, 0);
  const burned = workoutsOnDay(workouts, date).reduce((s, w) => s + w.caloriesBurned, 0);
  const remaining = goals.dailyCalories - totals.calories + burned;

  const macroKcal = totals.proteinG * 4 + totals.carbsG * 4 + totals.fatG * 9;
  const pct = (kcal: number) => (macroKcal > 0 ? Math.round((kcal / macroKcal) * 100) : 0);

  const quickWater = units === 'imperial' ? [8, 12, 16] : [250, 500, 750];
  const lastWater = dayWater[dayWater.length - 1];

  const addCustomWater = () => {
    const v = parseFloat(customWater);
    if (!(v > 0)) return;
    onAddWater(date, displayToMl(v, units));
    setCustomWater('');
  };

  const recents = [...food].sort((a, b) => (a.id < b.id ? 1 : -1));

  // One-tap logging: the foods you eat most, and yesterday's meals to repeat.
  const quick = useMemo(() => quickFoods(food, today, 8), [food, today]);
  const prevDay = yesterdayOf(date);
  const prevFood = food.filter((f) => f.date === prevDay);
  const logIds = (ids: (string | void)[]): string[] => ids.filter((x): x is string => typeof x === 'string');
  const logQuick = (q: ReturnType<typeof quickFoods>[number]) => {
    const meal = mealForQuick(q);
    const id = onAddFood(date, { ...q.entry, meal });
    setToast({ text: `Added ${q.entry.name} to ${meal}`, ids: logIds([id]) });
  };
  const repeatFrom = (meal?: MealType) => {
    const items = entriesToRepeat(food, prevDay, meal);
    if (items.length === 0) return;
    const ids = logIds(items.map((i) => onAddFood(date, i)));
    setToast({ text: `Repeated yesterday's ${meal ?? 'meals'}: ${items.length} food${items.length === 1 ? '' : 's'}`, ids });
  };

  return (
    <div className="space-y-4 pb-8 max-w-lg mx-auto">
      {!hideHeader && (
        <>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Nutrition & Fasting</h1>
            <p className="text-xs text-[#9AA3B2] mt-0.5">Calories, macros, hydration and intermittent fasting.</p>
          </div>

          <Segmented<NutritionSegment>
            ariaLabel="Nutrition sections"
            theme={theme}
            value={segment}
            onChange={onSegmentChange}
            options={[
              { id: 'food', label: 'Food & Water', icon: <Utensils className="w-3.5 h-3.5" /> },
              { id: 'fasting', label: 'Fasting', icon: <Timer className="w-3.5 h-3.5" /> },
            ]}
          />
        </>
      )}

      {segment === 'fasting' ? (
        fastingSlot
      ) : (
        <>
          <VoiceLogCard theme={theme} date={date} entries={food} onAddFood={onAddFood} onAddWater={onAddWater} />

          <button
            onClick={() => setPlanOpen(true)}
            className="flex w-full items-center justify-between rounded-2xl border border-[#1A1E26] bg-[#0B0D11] px-4 py-3 text-left"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-800 bg-neutral-900">
                <ShoppingBasket className="h-4 w-4" style={{ color: theme.primary }} />
              </span>
              <span>
                <span className="block text-sm font-semibold text-white">Meal plan and groceries</span>
                <span className="block text-xs text-[#9AA3B2]">Plan the week from your saved meals</span>
              </span>
            </span>
            <ChevronRight className="h-4 w-4 text-neutral-400" />
          </button>

          {/* Day picker */}
          <div className="flex items-center justify-between">
            <button onClick={() => setDate(addDays(date, -1))} aria-label="Previous day" className="p-2 rounded-xl border border-[#1A1E26] text-neutral-300">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-white">{friendlyDateLabel(date, today)}</span>
            <button
              onClick={() => setDate(addDays(date, 1))}
              disabled={date >= today}
              aria-label="Next day"
              className="p-2 rounded-xl border border-[#1A1E26] text-neutral-300 disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Quick add: the foods you eat most, water, and the barcode scanner, one tap each */}
          {date <= today && (
            <section className="space-y-2" aria-label="Quick add">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--ink-dim)' }}>
                  Quick add
                </h2>
                <span className="text-xs" style={{ color: 'var(--ink-dim)' }}>One tap, in your usual meal</span>
              </div>
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Quick add choices">
                <button
                  type="button"
                  onClick={() => {
                    onAddWater(date, displayToMl(quickWater[0], units));
                    setToast({ text: `Added ${quickWater[0]} ${volumeUnit(units)} of water`, ids: [] });
                  }}
                  className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold"
                  style={{ borderColor: 'rgba(56,189,248,0.4)', color: '#7dd3fc', backgroundColor: 'rgba(56,189,248,0.1)' }}
                  aria-label={`Add ${quickWater[0]} ${volumeUnit(units)} of water`}
                >
                  <Droplets className="h-4 w-4" aria-hidden="true" />+{quickWater[0]} {volumeUnit(units)}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setScanFirst(true);
                    setAddMeal(date === today ? mealNow() : 'Snack');
                  }}
                  className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold"
                  style={{ borderColor: 'var(--hairline-strong)', color: 'var(--ink)' }}
                >
                  <ScanBarcode className="h-4 w-4" aria-hidden="true" />
                  Scan
                </button>
                {quick.map((q) => (
                  <button
                    key={q.key}
                    type="button"
                    onClick={() => logQuick(q)}
                    className="flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3.5 text-xs font-semibold"
                    style={{ borderColor: 'var(--hairline-strong)', color: 'var(--ink)', backgroundColor: 'var(--card-2)' }}
                    aria-label={`Log ${q.entry.name}, ${q.entry.calories} calories${q.entry.amount ? `, ${q.entry.amount}` : ''}`}
                  >
                    <span className="max-w-[10rem] truncate">{q.entry.name}</span>
                    <span className="tabular-nums" style={{ color: 'var(--ink-dim)' }}>{q.entry.calories}</span>
                  </button>
                ))}
              </div>
              {quick.length === 0 && <p className="px-1 text-xs" style={{ color: 'var(--ink-dim)' }}>The foods you log most show up here, ready to add in one tap.</p>}
              {dayFood.length === 0 && prevFood.length > 0 && (
                <button
                  type="button"
                  onClick={() => repeatFrom()}
                  className="flex min-h-11 w-full items-center justify-between rounded-2xl border px-4 text-left text-sm font-semibold"
                  style={{ borderColor: 'var(--hairline-strong)', color: 'var(--ink)', backgroundColor: 'var(--card-2)' }}
                >
                  <span className="flex items-center gap-2">
                    <Repeat className="h-4 w-4" style={{ color: theme.primary }} aria-hidden="true" />
                    Repeat yesterday's meals
                  </span>
                  <span className="text-xs" style={{ color: 'var(--ink-dim)' }}>
                    {summarize(prevFood).count} foods · {summarize(prevFood).kcal} kcal
                  </span>
                </button>
              )}
              {toast && (
                <div role="status" className="flex items-center justify-between gap-3 rounded-2xl border px-4 py-2.5 text-sm" style={{ borderColor: 'var(--hairline-strong)', backgroundColor: 'var(--card-2)', color: 'var(--ink)' }}>
                  <span className="min-w-0">{toast.text}</span>
                  {toast.ids.length > 0 && (
                    <button
                      type="button"
                      className="min-h-11 shrink-0 px-2 text-sm font-bold"
                      style={{ color: theme.primary }}
                      onClick={() => {
                        toast.ids.forEach((id) => onDeleteFood(id));
                        setToast(null);
                      }}
                    >
                      Undo
                    </button>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Calories */}
          <section className="rounded-3xl border p-5 space-y-4" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
            <button type="button" onClick={() => setMetric('eaten')} aria-label="Calories, open history" className="flex w-full items-center gap-4 text-left">
              <Ring
                value={clamp01(totals.calories / goals.dailyCalories)}
                size={92}
                stroke={9}
                color={totals.calories > goals.dailyCalories ? '#F43F5E' : theme.primary}
                ariaLabel={`${totals.calories} of ${goals.dailyCalories} calories`}
              >
                <div>
                  <div className="text-lg font-bold font-mono text-white leading-none">{totals.calories}</div>
                  <div className="text-xs text-[#9AA3B2] font-mono">/ {goals.dailyCalories}</div>
                </div>
              </Ring>
              <div className="flex-1 space-y-1 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-neutral-400">Eaten</span>
                  <span className="text-white">{totals.calories} kcal</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">Workouts burned</span>
                  <span className="text-white">+{burned} kcal</span>
                </div>
                <div className="flex justify-between border-t border-[#1A1E26] pt-1">
                  <span className="text-neutral-400">{remaining >= 0 ? 'Remaining' : 'Over'}</span>
                  <span style={{ color: remaining >= 0 ? theme.primary : '#F43F5E' }}>{Math.abs(remaining)} kcal</span>
                </div>
              </div>
            </button>

            <div className="space-y-2">
              {[
                { id: 'protein' as MetricId, label: 'Protein', g: totals.proteinG, goal: goals.dailyProteinG, kcal: totals.proteinG * 4, color: macroColors(theme).p },
                { id: 'carbs' as MetricId, label: 'Carbs', g: totals.carbsG, goal: 0, kcal: totals.carbsG * 4, color: macroColors(theme).c },
                { id: 'fat' as MetricId, label: 'Fat', g: totals.fatG, goal: 0, kcal: totals.fatG * 9, color: macroColors(theme).f },
              ].map((m) => (
                <button type="button" key={m.label} onClick={() => setMetric(m.id)} aria-label={`${m.label}, open history`} className="block w-full text-left">
                  <div className="flex justify-between text-xs font-mono text-neutral-400">
                    <span>{m.label}</span>
                    <span className="text-neutral-200">
                      {Math.round(m.g)} g{m.goal ? ` / ${m.goal} g` : ''} · {pct(m.kcal)}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-black/60 border border-[#1A1E26] overflow-hidden mt-1">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${m.goal ? clamp01(m.g / m.goal) * 100 : pct(m.kcal)}%`, backgroundColor: m.color }}
                    />
                  </div>
                </button>
              ))}
            </div>
          </section>

          <MicrosCard entries={dayFood} accent={theme.primary} />

          {/* Water */}
          <section className="rounded-3xl border p-5 space-y-3" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
            <div className="flex items-center gap-4">
              <button type="button" onClick={() => setMetric('water')} aria-label="Hydration, open history" className="flex flex-1 items-center gap-4 text-left">
              <Ring
                value={clamp01(waterMl / goals.dailyWaterMl)}
                size={72}
                stroke={7}
                color="#38BDF8"
                ariaLabel={`${mlToDisplay(waterMl, units)} of ${mlToDisplay(goals.dailyWaterMl, units)} ${volumeUnit(units)} water`}
              >
                <Droplets className="w-5 h-5 text-sky-400" />
              </Ring>
              <div className="flex-1">
                <div className="text-sm font-bold text-neutral-200">Hydration</div>
                <div className="font-mono text-white">
                  <span className="text-xl font-bold">{mlToDisplay(waterMl, units)}</span>
                  <span className="text-xs text-neutral-400">
                    {' '}
                    / {mlToDisplay(goals.dailyWaterMl, units)} {volumeUnit(units)}
                  </span>
                </div>
              </div>
              </button>
              {lastWater && (
                <button
                  onClick={() => onDeleteWater(lastWater.id)}
                  aria-label="Undo last drink"
                  className="p-2 rounded-xl border border-[#1A1E26] text-neutral-400 hover:text-white"
                >
                  <Undo2 className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {quickWater.map((v) => (
                <button
                  key={v}
                  onClick={() => onAddWater(date, displayToMl(v, units))}
                  className="py-2 rounded-xl bg-black/60 border border-[#1A1E26] hover:border-sky-500/50 text-xs font-mono text-sky-300"
                >
                  +{v} {volumeUnit(units)}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                aria-label={`Custom water amount in ${volumeUnit(units)}`}
                inputMode="decimal"
                value={customWater}
                onChange={(e) => setCustomWater(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addCustomWater()}
                placeholder={`Custom (${volumeUnit(units)})`}
                className={fieldClass}
              />
              <button onClick={addCustomWater} className="px-4 rounded-xl border border-neutral-700 text-xs font-semibold text-white">
                Add
              </button>
            </div>
          </section>

          {/* Meals */}
          {MEALS.map((meal) => {
            const entries = dayFood.filter((f) => f.meal === meal);
            const kcal = entries.reduce((s, e) => s + e.calories, 0);
            const share = goals.dailyCalories > 0 ? Math.min(1, kcal / goals.dailyCalories) : 0;
            return (
              <section key={meal} className="rounded-3xl border p-4 space-y-2" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-sm font-extrabold" style={{ color: 'var(--ink)' }}>{meal}</h2>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="h-1.5 w-20 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--hairline)' }}>
                        <div className="h-full rounded-full" style={{ width: `${share * 100}%`, backgroundColor: theme.primary, transition: 'width 0.6s var(--ease)' }} />
                      </div>
                      <span className="text-xs font-mono tabular-nums" style={{ color: 'var(--ink-dim)' }}>{kcal} kcal</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setAddMeal(meal)}
                    aria-label={`Add food to ${meal}`}
                    className="px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1"
                    style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}
                  >
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                </div>
                {entries.length === 0 ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs" style={{ color: 'var(--ink-dim)' }}>Nothing logged yet.</p>
                    {prevFood.some((f) => f.meal === meal) && (
                      <button type="button" onClick={() => repeatFrom(meal)} className="flex min-h-11 items-center gap-1.5 px-1 text-xs font-bold" style={{ color: theme.primary }}>
                        <Repeat className="h-3.5 w-3.5" aria-hidden="true" />
                        Repeat yesterday's {meal.toLowerCase()} ({summarize(prevFood.filter((f) => f.meal === meal)).count})
                      </button>
                    )}
                  </div>
                ) : (
                  <ul className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
                    {entries.map((e) => (
                      <li key={e.id} className="flex items-center gap-3 py-2.5">
                        <FoodIcon group={e.group ?? 0} size={36} />
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-semibold leading-snug line-clamp-2" style={{ color: 'var(--ink)' }}>{e.name}</div>
                          <div className="text-xs truncate" style={{ color: 'var(--ink-dim)' }}>
                            {e.amount ? `${e.amount} · ` : ''}
                            P {e.proteinG} · C {e.carbsG} · F {e.fatG}
                          </div>
                        </div>
                        <span className="text-sm font-extrabold tabular-nums shrink-0" style={{ color: 'var(--ink)' }}>{e.calories}</span>
                        <button onClick={() => onDeleteFood(e.id)} aria-label={`Delete ${e.name}`} className="shrink-0 p-1" style={{ color: 'var(--ink-dim)' }}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}

          <p className="text-xs text-neutral-400 px-1 leading-relaxed">
            Calorie and macro values come from approximate averages — check the label on packaged foods. Daily targets are
            estimates, not medical advice.
          </p>

          <AddFoodModal
            isOpen={addMeal !== null}
            startOnScan={scanFirst}
            onClose={() => {
              setAddMeal(null);
              setScanFirst(false);
            }}
            theme={theme}
            defaultMeal={addMeal || 'Breakfast'}
            recents={recents}
            onAdd={(f) => onAddFood(date, f)}
            onUndo={onDeleteFood}
            goals={goals}
            dayEntries={dayFood}
            savedMeals={savedMeals}
            onSaveMeal={onSaveMeal}
            onDeleteMeal={onDeleteMeal}
          />

          {planOpen && (
            <MealPlanSheet
              theme={theme}
              goals={goals}
              savedMeals={savedMeals}
              onClose={() => setPlanOpen(false)}
              onLogMeal={(planDate, meal, saved) => {
                for (const i of saved.items) onAddFood(planDate, { meal, name: i.name, calories: i.calories, proteinG: i.proteinG, carbsG: i.carbsG, fatG: i.fatG });
              }}
            />
          )}

          {metric && (
            <MetricDetailSheet
              metric={metric}
              theme={theme}
              units={units}
              goals={goals}
              input={{ days: [], body: [], food, water }}
              onClose={() => setMetric(null)}
            />
          )}
        </>
      )}
    </div>
  );
};
