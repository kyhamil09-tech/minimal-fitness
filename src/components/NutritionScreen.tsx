import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Droplets, Plus, ShoppingBasket, Timer, Trash2, Undo2, Utensils } from 'lucide-react';
import { MealPlanSheet } from './MealPlanSheet';
import { WorkoutSession } from '../types/health';
import { FoodEntry, Goals, MealType, SavedMeal, UserProfile, WaterEntry } from '../types/tracking';
import { ColorPalette } from '../types/theme';
import { Ring } from './ui/charts';
import { Segmented } from './ui/Segmented';
import { fieldClass } from './ui/Modal';
import { AddFoodModal, NewFood } from './AddFoodModal';
import { FoodIcon } from './food/FoodIcon';
import { macroColors } from './food/MacroDonut';
import { VoiceLogCard } from './VoiceLogCard';
import { addDays, friendlyDateLabel, todayKey } from '../lib/dates';
import { sumFood, workoutsOnDay, clamp01 } from '../lib/calc';
import { displayToMl, mlToDisplay, volumeUnit } from '../lib/units';

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

  return (
    <div className="space-y-4 pb-8 max-w-lg mx-auto">
      {!hideHeader && (
        <>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Nutrition & Fasting</h1>
            <p className="text-xs text-[#7E889B] mt-0.5">Calories, macros, hydration and intermittent fasting.</p>
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
          <VoiceLogCard theme={theme} date={date} onAddFood={onAddFood} onAddWater={onAddWater} />

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
                <span className="block text-[11px] text-[#7E889B]">Plan the week from your saved meals</span>
              </span>
            </span>
            <ChevronRight className="h-4 w-4 text-neutral-500" />
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

          {/* Calories */}
          <section className="rounded-3xl border p-5 space-y-4" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
            <div className="flex items-center gap-4">
              <Ring
                value={clamp01(totals.calories / goals.dailyCalories)}
                size={92}
                stroke={9}
                color={totals.calories > goals.dailyCalories ? '#F43F5E' : theme.primary}
                ariaLabel={`${totals.calories} of ${goals.dailyCalories} calories`}
              >
                <div>
                  <div className="text-lg font-bold font-mono text-white leading-none">{totals.calories}</div>
                  <div className="text-[9px] text-[#7E889B] font-mono">/ {goals.dailyCalories}</div>
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
            </div>

            <div className="space-y-2">
              {[
                { label: 'Protein', g: totals.proteinG, goal: goals.dailyProteinG, kcal: totals.proteinG * 4, color: macroColors(theme).p },
                { label: 'Carbs', g: totals.carbsG, goal: 0, kcal: totals.carbsG * 4, color: macroColors(theme).c },
                { label: 'Fat', g: totals.fatG, goal: 0, kcal: totals.fatG * 9, color: macroColors(theme).f },
              ].map((m) => (
                <div key={m.label}>
                  <div className="flex justify-between text-[11px] font-mono text-neutral-400">
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
                </div>
              ))}
            </div>
          </section>

          {/* Water */}
          <section className="rounded-3xl border p-5 space-y-3" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
            <div className="flex items-center gap-4">
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
                <div className="text-xs font-semibold uppercase tracking-wider text-[#7E889B]">Hydration</div>
                <div className="font-mono text-white">
                  <span className="text-xl font-bold">{mlToDisplay(waterMl, units)}</span>
                  <span className="text-xs text-neutral-400">
                    {' '}
                    / {mlToDisplay(goals.dailyWaterMl, units)} {volumeUnit(units)}
                  </span>
                </div>
              </div>
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
                      <span className="text-[11px] font-mono tabular-nums" style={{ color: 'var(--ink-dim)' }}>{kcal} kcal</span>
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
                  <p className="text-[11px]" style={{ color: 'var(--ink-dim)' }}>Nothing logged yet.</p>
                ) : (
                  <ul className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
                    {entries.map((e) => (
                      <li key={e.id} className="flex items-center gap-3 py-2.5">
                        <FoodIcon group={e.group ?? 0} size={36} />
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-semibold leading-snug line-clamp-2" style={{ color: 'var(--ink)' }}>{e.name}</div>
                          <div className="text-[11px] truncate" style={{ color: 'var(--ink-dim)' }}>
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

          <p className="text-[10px] text-neutral-600 px-1 leading-relaxed">
            Calorie and macro values come from approximate averages — check the label on packaged foods. Daily targets are
            estimates, not medical advice.
          </p>

          <AddFoodModal
            isOpen={addMeal !== null}
            onClose={() => setAddMeal(null)}
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
        </>
      )}
    </div>
  );
};
