import React, { useState } from 'react';
import { BookOpen, CalendarPlus, ChefHat, Link2, PackagePlus, Pencil, Trash2, Utensils } from 'lucide-react';
import { MealType, SavedMeal } from '../types/tracking';
import { useFoodLibrary } from '../hooks/useFoodLibrary';
import { Recipe, perServing, recipeFoodId } from '../lib/recipe';
import { mealTotals } from '../lib/mealPlan';
import { addDays, parseDateKey } from '../lib/dates';
import { mealNow } from '../lib/quickFood';
import { MEALS } from './content';
import { EatCtx } from './state';
import { Pantry } from './PantryPanel';
import { SectionTitle, Sheet, num } from './ui';

type Target = { kind: 'meal'; meal: SavedMeal } | { kind: 'recipe'; recipe: Recipe };
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Cook: recipes and saved meals in one place, each loggable in a tap, plannable for the week, or editable. */
export const Cook: React.FC<{ ctx: EatCtx; onEditRecipe: (r: Recipe) => void }> = ({ ctx, onEditRecipe }) => {
  const lib = useFoodLibrary(ctx.food);
  const [log, setLog] = useState<Target | null>(null);
  const [plan, setPlan] = useState<SavedMeal | null>(null);
  const [meal, setMeal] = useState<MealType>(mealNow());
  const [servings, setServings] = useState(1);
  const [planMeal, setPlanMeal] = useState<MealType>('Dinner');

  const open = (t: Target) => {
    setLog(t);
    setMeal(mealNow());
    setServings(1);
  };

  const confirmLog = () => {
    if (!log) return;
    const ids: string[] = [];
    if (log.kind === 'meal') {
      for (const i of log.meal.items) {
        const id = ctx.onAddFood(ctx.date, { meal, name: i.name, calories: i.calories, proteinG: i.proteinG, carbsG: i.carbsG, fatG: i.fatG });
        if (typeof id === 'string') ids.push(id);
      }
      ctx.say(`Logged ${log.meal.name} to ${meal}`, () => ids.forEach((id) => ctx.onDeleteFood(id)));
    } else {
      const s = perServing(log.recipe);
      const id = ctx.onAddFood(ctx.date, {
        meal,
        name: log.recipe.name,
        calories: Math.round(s.kcal * servings),
        proteinG: r1(s.p * servings),
        carbsG: r1(s.c * servings),
        fatG: r1(s.f * servings),
        fiberG: r1(s.fiber * servings),
        sugarG: r1(s.sugar * servings),
        sodiumMg: Math.round(s.sodium * servings),
        amount: `${servings} serving${servings === 1 ? '' : 's'}`,
      });
      ctx.say(`Logged ${log.recipe.name} to ${meal}`, typeof id === 'string' ? () => ctx.onDeleteFood(id) : undefined);
    }
    setLog(null);
  };

  const removeMeal = (m: SavedMeal) => {
    ctx.onDeleteMeal(m.id);
    ctx.say(`Removed ${m.name}`, () => ctx.onSaveMeal(m.name, m.items));
  };
  const removeRecipe = (r: Recipe) => {
    lib.removeMine(recipeFoodId(r.id));
    ctx.say(`Removed ${r.name}`, () => lib.saveRecipe(r));
  };

  const week = Array.from({ length: 7 }, (_, i) => addDays(ctx.today, i));

  return (
    <div className="ea-scroll">
      <div className="ea-wrap">
        <h1 className="ea-h1 mt-3">
          Your <em>kitchen</em>
        </h1>
        <p className="ea-dim mt-1 text-sm">Recipes and meals you make again and again, one tap from the diary.</p>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <button type="button" className="ea-card ea-row !flex-col !gap-1.5 !py-3 text-center" onClick={() => ctx.openAdd(undefined, 'recipe')}>
            <ChefHat className="h-6 w-6" style={{ color: 'var(--ea-p)' }} aria-hidden="true" />
            <span className="text-xs font-bold">New recipe</span>
          </button>
          <button type="button" className="ea-card ea-row !flex-col !gap-1.5 !py-3 text-center" onClick={() => ctx.openAdd(undefined, 'import')}>
            <Link2 className="h-6 w-6" style={{ color: 'var(--ea-c)' }} aria-hidden="true" />
            <span className="text-xs font-bold">Import</span>
          </button>
          <button type="button" className="ea-card ea-row !flex-col !gap-1.5 !py-3 text-center" onClick={() => ctx.openAdd(undefined, 'create')}>
            <PackagePlus className="h-6 w-6" style={{ color: 'var(--ea-f)' }} aria-hidden="true" />
            <span className="text-xs font-bold">Make a food</span>
          </button>
        </div>

        <SectionTitle eyebrow="From scratch">Recipes</SectionTitle>
        {lib.recipes.length === 0 ? (
          <div className="ea-card text-sm leading-relaxed">
            <BookOpen className="mb-2 h-5 w-5" style={{ color: 'var(--ea-c)' }} aria-hidden="true" />
            Paste a recipe or add its web address, and the ingredients are worked out for you, per serving. Or build one ingredient by ingredient.
          </div>
        ) : (
          <ul className="space-y-3">
            {lib.recipes.map((r, i) => {
              const s = perServing(r);
              return (
                <li key={r.id} className="ea-card ea-rise" style={{ ['--i' as string]: i }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="ea-h2 truncate">{r.name || 'Untitled recipe'}</h3>
                      <div className="ea-dim text-xs tabular-nums">
                        {r.servings} serving{r.servings === 1 ? '' : 's'} · {r.ingredients.length} ingredient{r.ingredients.length === 1 ? '' : 's'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="ea-serif text-xl font-semibold tabular-nums">{num(s.kcal)}</div>
                      <div className="ea-dim text-xs">kcal / serving</div>
                    </div>
                  </div>
                  <div className="ea-dim mt-1 text-xs tabular-nums">
                    P {Math.round(s.p)} · C {Math.round(s.c)} · F {Math.round(s.f)} g
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button type="button" className="ea-btn ea-btn-small flex-1" onClick={() => open({ kind: 'recipe', recipe: r })}>
                      <Utensils className="h-4 w-4" aria-hidden="true" /> Log
                    </button>
                    <button type="button" className="ea-btn ea-btn-quiet ea-btn-small" onClick={() => onEditRecipe(r)} aria-label={`Edit ${r.name}`}>
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button type="button" className="ea-btn ea-btn-quiet ea-btn-small" onClick={() => removeRecipe(r)} aria-label={`Delete ${r.name}`}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <SectionTitle eyebrow="Your usual plates">Saved meals</SectionTitle>
        {ctx.savedMeals.length === 0 ? (
          <div className="ea-card text-sm leading-relaxed">Add a few foods in the food finder, then tap Save meal. A usual breakfast becomes one tap, and can be planned for the week.</div>
        ) : (
          <ul className="space-y-3">
            {ctx.savedMeals.map((m, i) => {
              const t = mealTotals(m);
              return (
                <li key={m.id} className="ea-card ea-rise" style={{ ['--i' as string]: i }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="ea-h2 truncate">{m.name}</h3>
                      <div className="ea-dim truncate text-xs">{m.items.map((x) => x.name).join(', ')}</div>
                    </div>
                    <div className="text-right">
                      <div className="ea-serif text-xl font-semibold tabular-nums">{num(t.calories)}</div>
                      <div className="ea-dim text-xs">P {Math.round(t.proteinG)} g</div>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button type="button" className="ea-btn ea-btn-small flex-1" onClick={() => open({ kind: 'meal', meal: m })}>
                      <Utensils className="h-4 w-4" aria-hidden="true" /> Log
                    </button>
                    <button type="button" className="ea-btn ea-btn-quiet ea-btn-small" onClick={() => setPlan(m)} aria-label={`Plan ${m.name}`}>
                      <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button type="button" className="ea-btn ea-btn-quiet ea-btn-small" onClick={() => removeMeal(m)} aria-label={`Delete ${m.name}`}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <Pantry ctx={ctx} recipes={lib.recipes} onLogMeal={(m) => open({ kind: 'meal', meal: m })} onLogRecipe={(r) => open({ kind: 'recipe', recipe: r })} />
      </div>

      <Sheet open={log !== null} onClose={() => setLog(null)} title={log ? `Log ${log.kind === 'meal' ? log.meal.name : log.recipe.name}` : 'Log'}>
        {log && (
          <>
            <div className="ea-eyebrow">Which meal</div>
            <div className="mt-2 grid grid-cols-4 gap-2" role="group" aria-label="Meal">
              {MEALS.map((m) => (
                <button key={m} type="button" className="ea-chip !px-0" aria-pressed={meal === m} onClick={() => setMeal(m)}>
                  {m}
                </button>
              ))}
            </div>
            {log.kind === 'recipe' && (
              <>
                <div className="ea-eyebrow mt-4">How many servings</div>
                <div className="mt-2 grid grid-cols-4 gap-2" role="group" aria-label="Servings">
                  {[0.5, 1, 1.5, 2].map((s) => (
                    <button key={s} type="button" className="ea-chip !px-0" aria-pressed={servings === s} onClick={() => setServings(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </>
            )}
            <p className="ea-dim mt-3 text-xs">Goes in {ctx.date === ctx.today ? 'today' : ctx.date}.</p>
            <button type="button" className="ea-btn mt-4 w-full" onClick={confirmLog}>
              Add to {meal}
            </button>
          </>
        )}
      </Sheet>

      <Sheet open={plan !== null} onClose={() => setPlan(null)} title={plan ? `Plan ${plan.name}` : 'Plan'}>
        {plan && (
          <>
            <div className="ea-eyebrow">Which meal</div>
            <div className="mt-2 grid grid-cols-4 gap-2" role="group" aria-label="Meal">
              {MEALS.map((m) => (
                <button key={m} type="button" className="ea-chip !px-0" aria-pressed={planMeal === m} onClick={() => setPlanMeal(m)}>
                  {m}
                </button>
              ))}
            </div>
            <div className="ea-eyebrow mt-4">Which day</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {week.map((d) => (
                <button
                  key={d}
                  type="button"
                  className="ea-chip"
                  onClick={() => {
                    ctx.mealPlan.add(d, planMeal, plan.id);
                    ctx.say(`Planned ${plan.name} for ${d === ctx.today ? 'today' : parseDateKey(d).toLocaleDateString(undefined, { weekday: 'long' })}`);
                    setPlan(null);
                  }}
                >
                  {d === ctx.today ? 'Today' : parseDateKey(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                </button>
              ))}
            </div>
          </>
        )}
      </Sheet>
    </div>
  );
};
