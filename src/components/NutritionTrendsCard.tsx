import React, { useMemo, useState } from 'react';
import { Utensils } from 'lucide-react';
import { ColorPalette } from '../types/theme';
import { FoodEntry, Goals } from '../types/tracking';
import { BarChart, EmptyState } from './ui/charts';
import { buildNutrition } from '../lib/nutritionTrends';
import { shortWeekday, todayKey } from '../lib/dates';
import { Segmented } from './ui/Segmented';

interface NutritionTrendsCardProps {
  theme: ColorPalette;
  food: FoodEntry[];
  goals: Goals;
}

const PROTEIN = '#F472B6';
const CARBS = '#FBBF24';
const FAT = '#38BDF8';
const RANGES = [7, 30] as const;

const kcal = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)));

/** Calories and macros for the last week or month against your targets, from the food you logged. */
export const NutritionTrendsCard: React.FC<NutritionTrendsCardProps> = ({ theme, food, goals }) => {
  const [range, setRange] = useState<(typeof RANGES)[number]>(7);
  const today = todayKey();
  const n = useMemo(() => buildNutrition(food, goals, range, today), [food, goals, range, today]);

  const label = (date: string) => (range <= 7 ? shortWeekday(date) : String(Number(date.slice(8, 10))));
  const calorieBars = n.days.map((d, i) => ({ label: label(d.date), value: d.calories, highlight: i === n.days.length - 1 }));
  const proteinBars = n.days.map((d, i) => ({ label: label(d.date), value: Math.round(d.proteinG), highlight: i === n.days.length - 1 }));

  const delta = n.calorieDelta;
  const tile = 'rounded-2xl bg-black/40 border border-[#1A1E26] p-3';

  return (
    <section className="rounded-3xl border p-4 space-y-3" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }} aria-label="Nutrition trends">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Utensils className="h-4 w-4" style={{ color: theme.primary }} />
          <h3 className="text-sm font-bold text-neutral-200">Nutrition</h3>
        </div>
        <Segmented<string>
          ariaLabel="Nutrition range"
          size="sm"
          semantics="group"
          fill={false}
          value={String(range)}
          onChange={(id) => setRange(Number(id) as typeof range)}
          options={RANGES.map((r) => ({ id: String(r), label: r === 7 ? 'Week' : 'Month' }))}
        />
      </div>

      {n.loggedDays === 0 ? (
        <EmptyState title="No food logged in this period" hint="Log meals in Nutrition and your calories and macros show up here." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className={tile}>
              <div className="stat-label">Average calories</div>
              <div className="mt-1 text-lg font-bold tabular-nums">
                {Math.round(n.avgCalories).toLocaleString()} <span className="text-xs font-normal text-[#9AA3B2]">kcal</span>
              </div>
              {delta !== undefined && (
                <div className="text-xs text-neutral-400">
                  {Math.abs(Math.round(delta)).toLocaleString()} {delta < 0 ? 'under' : 'over'} the {goals.dailyCalories.toLocaleString()} goal
                </div>
              )}
            </div>
            <div className={tile}>
              <div className="stat-label">Average protein</div>
              <div className="mt-1 text-lg font-bold tabular-nums">
                {Math.round(n.avgProteinG)} <span className="text-xs font-normal text-[#9AA3B2]">g</span>
              </div>
              <div className="text-xs text-neutral-400">goal {goals.dailyProteinG} g</div>
            </div>
            <div className={tile}>
              <div className="stat-label">Calories on target</div>
              <div className="mt-1 text-lg font-bold tabular-nums">
                {n.daysOnCalories} <span className="text-xs font-normal text-[#9AA3B2]">of {n.loggedDays} days</span>
              </div>
              <div className="text-xs text-neutral-400">within 10% of goal</div>
            </div>
            <div className={tile}>
              <div className="stat-label">Protein on target</div>
              <div className="mt-1 text-lg font-bold tabular-nums">
                {n.daysOnProtein} <span className="text-xs font-normal text-[#9AA3B2]">of {n.loggedDays} days</span>
              </div>
              <div className="text-xs text-neutral-400">at least 90% of goal</div>
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-xs font-semibold text-neutral-300">Calories per day</span>
              <span className="text-xs text-neutral-400">dashed line is your goal</span>
            </div>
            <BarChart data={calorieBars} color={theme.primary} goal={goals.dailyCalories} format={kcal} ariaLabel={`Calories eaten per day, last ${range} days`} />
          </div>

          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-xs font-semibold text-neutral-300">Protein per day</span>
              <span className="text-xs text-neutral-400">grams</span>
            </div>
            <BarChart data={proteinBars} color={PROTEIN} goal={goals.dailyProteinG} ariaLabel={`Protein per day, last ${range} days`} />
          </div>

          {n.split && (
            <div>
              <div className="mb-1.5 text-xs font-semibold text-neutral-300">Where your calories come from</div>
              <div
                className="flex h-3 overflow-hidden rounded-full"
                role="img"
                aria-label={`Protein ${n.split.protein} percent, carbs ${n.split.carbs} percent, fat ${n.split.fat} percent of calories`}
              >
                <span style={{ width: `${n.split.protein}%`, background: PROTEIN }} />
                <span style={{ width: `${n.split.carbs}%`, background: CARBS }} />
                <span style={{ width: `${n.split.fat}%`, background: FAT }} />
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                {[
                  { name: 'Protein', pct: n.split.protein, g: n.avgProteinG, color: PROTEIN },
                  { name: 'Carbs', pct: n.split.carbs, g: n.avgCarbsG, color: CARBS },
                  { name: 'Fat', pct: n.split.fat, g: n.avgFatG, color: FAT },
                ].map((m) => (
                  <div key={m.name}>
                    <div className="flex items-center justify-center gap-1 text-xs text-neutral-300">
                      <span className="h-2 w-2 rounded-full" style={{ background: m.color }} />
                      {m.name}
                    </div>
                    <div className="text-sm font-bold tabular-nums text-white">{m.pct}%</div>
                    <div className="text-xs text-neutral-400">{Math.round(m.g)} g a day</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs leading-relaxed text-neutral-400">
            Based on the {n.loggedDays} day{n.loggedDays === 1 ? '' : 's'} with food logged; days with nothing logged are left out. General information, not dietary advice.
          </p>
        </>
      )}
    </section>
  );
};
