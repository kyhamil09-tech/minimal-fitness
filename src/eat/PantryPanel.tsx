import React, { useMemo, useState } from 'react';
import { ListPlus, Plus, Utensils, X } from 'lucide-react';
import { SavedMeal } from '../types/tracking';
import { Recipe } from '../lib/recipe';
import { usePersistentState } from '../hooks/usePersistentState';
import { mealNow } from '../lib/quickFood';
import { FoodIcon } from '../components/food/FoodIcon';
import { dietActive, dietLabel } from './diet';
import { COMMON_PANTRY, Candidate, IDEAS, MealIdea, addToPantry, rankMeals } from './pantry';
import { EatCtx } from './state';
import { SectionTitle } from './ui';

/**
 * Pantry: list what is in your kitchen and see what you could make, from your own saved meals and recipes first and then simple ideas
 * with typical numbers. A meal that is missing a thing or two can send the missing things to your shopping list.
 */
export const Pantry: React.FC<{ ctx: EatCtx; recipes: Recipe[]; onLogMeal: (m: SavedMeal) => void; onLogRecipe: (r: Recipe) => void }> = ({ ctx, recipes, onLogMeal, onLogRecipe }) => {
  const [pantry, setPantry] = usePersistentState<string[]>('eat_pantry', []);
  const [text, setText] = useState('');
  const diet = ctx.prefs.diet;

  const candidates = useMemo<Candidate[]>(
    () => [
      ...ctx.savedMeals.map((m): Candidate => ({ kind: 'saved', id: m.id, name: m.name, ingredients: m.items.map((i) => i.name) })),
      ...recipes.map((r): Candidate => ({ kind: 'recipe', id: r.id, name: r.name || 'Untitled recipe', ingredients: r.ingredients.map((i) => i.name) })),
      ...IDEAS.map((i): Candidate => ({ kind: 'idea', id: i.id, name: i.name, ingredients: i.ingredients, idea: i })),
    ],
    [ctx.savedMeals, recipes]
  );
  const ranked = useMemo(() => rankMeals(pantry, candidates, diet), [pantry, candidates, diet]);

  const add = (item: string) => setPantry((p) => addToPantry(p, item));

  const logIdea = (i: MealIdea) => {
    const id = ctx.onAddFood(ctx.date, { meal: mealNow(), name: i.name, amount: '1 serving (typical)', calories: i.calories, proteinG: i.proteinG, carbsG: i.carbsG, fatG: i.fatG, fiberG: i.fiberG, group: i.group });
    ctx.say(`Logged ${i.name}`, typeof id === 'string' ? () => ctx.onDeleteFood(id) : undefined);
  };

  const sendMissing = (missing: string[]) => {
    missing.forEach((m) => ctx.mealPlan.addExtra(m));
    ctx.say(`Added ${missing.length} thing${missing.length === 1 ? '' : 's'} to your shopping list`);
  };

  return (
    <>
      <SectionTitle eyebrow="What is in the kitchen">Pantry</SectionTitle>
      <section className="ea-card" aria-label="Pantry">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add(text);
            setText('');
          }}
        >
          <label className="sr-only" htmlFor="ea-pantry-add">
            Add something to your pantry
          </label>
          <input id="ea-pantry-add" className="ea-input" placeholder="Add eggs, rice, spinach..." value={text} onChange={(e) => setText(e.target.value)} />
          <button type="submit" className="ea-btn ea-btn-small shrink-0" disabled={!text.trim()}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Add
          </button>
        </form>

        {pantry.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="In your pantry">
            {pantry.map((p) => (
              <li key={p}>
                <button type="button" className="ea-chip" onClick={() => setPantry((all) => all.filter((x) => x !== p))} aria-label={`Remove ${p}`}>
                  {p} <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ea-dim mt-3 text-xs">Nothing yet. Add what you have, or tap a few below.</p>
        )}

        <div className="ea-eyebrow mt-4">Quick add</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {COMMON_PANTRY.filter((c) => !pantry.includes(c)).slice(0, 14).map((c) => (
            <button key={c} type="button" className="ea-chip !min-h-9" onClick={() => add(c)}>
              + {c}
            </button>
          ))}
        </div>
      </section>

      <SectionTitle eyebrow={dietActive(diet) ? `For you: ${dietLabel(diet)}` : 'From what you have'}>What can I make?</SectionTitle>
      {pantry.length === 0 ? (
        <div className="ea-card text-sm leading-relaxed">Add a few things to the pantry and ideas appear here.</div>
      ) : ranked.length === 0 ? (
        <div className="ea-card text-sm leading-relaxed">Nothing matches yet. A couple more ingredients, or a looser diet filter, will turn something up.</div>
      ) : (
        <ul className="space-y-3">
          {ranked.map((r, i) => {
            const c = r.candidate;
            return (
              <li key={`${c.kind}-${c.id}`} className="ea-card ea-rise" style={{ ['--i' as string]: i }}>
                <div className="flex items-start gap-3">
                  {c.idea && <FoodIcon group={c.idea.group} size={40} />}
                  <div className="min-w-0 flex-1">
                    <h3 className="ea-h2 truncate">{c.name}</h3>
                    <div className="ea-dim text-xs">
                      {c.kind === 'saved' ? 'Your saved meal' : c.kind === 'recipe' ? 'Your recipe' : `An idea · about ${c.idea!.minutes} min · ${c.idea!.calories} kcal, ${c.idea!.proteinG} g protein (typical)`}
                    </div>
                  </div>
                  <span className="ea-tag shrink-0" style={{ color: r.missing.length === 0 ? 'var(--ea-f)' : undefined }}>
                    {r.missing.length === 0 ? 'Have it all' : `${r.have.length} of ${r.have.length + r.missing.length}`}
                  </span>
                </div>
                {r.missing.length > 0 && <p className="ea-dim mt-2 text-xs">Missing: {r.missing.join(', ')}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="ea-btn ea-btn-small"
                    onClick={() => {
                      if (c.kind === 'idea') logIdea(c.idea!);
                      else if (c.kind === 'saved') onLogMeal(ctx.savedMeals.find((m) => m.id === c.id)!);
                      else onLogRecipe(recipes.find((x) => x.id === c.id)!);
                    }}
                  >
                    <Utensils className="h-4 w-4" aria-hidden="true" /> Log it
                  </button>
                  {r.missing.length > 0 && (
                    <button type="button" className="ea-btn ea-btn-quiet ea-btn-small" onClick={() => sendMissing(r.missing)}>
                      <ListPlus className="h-4 w-4" aria-hidden="true" /> Add missing to list
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="ea-dim mt-3 px-1 text-xs leading-relaxed">Ideas use typical numbers and simple steps you already know. Diet filters go by ingredient names, so check labels, especially for allergies.</p>
    </>
  );
};
