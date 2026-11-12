import React, { useState } from 'react';
import { ChevronLeft, ClipboardPaste, Minus, Plus, Trash2 } from 'lucide-react';
import { RecipePaste } from './RecipePaste';
import { useT } from '../../lib/i18n';
import type { FoodRecord } from '../../lib/foodDb';
import { Recipe, perServing, recipeTotals } from '../../lib/recipe';
import { hasMicros } from '../../lib/micros';
import { FoodIcon } from './FoodIcon';

interface Props {
  draft: Recipe;
  onChange: (r: Recipe) => void;
  onAddIngredient: () => void;
  onSave: () => void;
  onBack: () => void;
  /** True when an existing recipe is being changed. */
  editing: boolean;
  /** Looks a food up by name in the app's own list, for pasted ingredients. */
  findFoods?: (query: string) => FoodRecord[];
  /** Open straight on the import screen (the Recipe tile). */
  startImport?: boolean;
}

/** Build a dish from its ingredients: pick foods (the same search as logging), say how many servings it makes, and it becomes one food per serving. */
export const RecipeBuilder: React.FC<Props> = ({ draft, onChange, onAddIngredient, onSave, onBack, editing, findFoods, startImport }) => {
  const t = useT();
  const [pasting, setPasting] = useState(!!startImport);
  const total = recipeTotals(draft);
  const one = perServing(draft);
  const bump = (d: number) => onChange({ ...draft, servings: Math.max(1, Math.min(60, Math.round((draft.servings + d) * 4) / 4)) });
  const ready = draft.name.trim().length > 0 && draft.ingredients.length > 0;
  return (
    <div className="flex-1 flex flex-col min-h-0 slide-in">
      <div className="flex items-center justify-between px-4 pt-1 pb-2">
        <button aria-label="Back" onClick={onBack} className="round-btn !w-10 !h-10">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-extrabold" style={{ color: 'var(--ink)' }}>
          {editing ? 'Edit recipe' : 'New recipe'}
        </h2>
        <span className="w-10" aria-hidden="true" />
      </div>
      <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-28 space-y-4">
        <label className="block">
          <span className="text-xs font-semibold" style={{ color: 'var(--ink-dim)' }}>
            Name
          </span>
          <input
            value={draft.name}
            maxLength={60}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
            placeholder="Chicken curry"
            className="mt-1 w-full rounded-2xl border px-3 py-3 text-sm outline-none"
            style={{ backgroundColor: 'var(--card)', borderColor: 'var(--hairline)', color: 'var(--ink)' }}
          />
        </label>

        <div className="flex items-center justify-between rounded-2xl border px-4 py-3" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--hairline)' }}>
          <div>
            <div className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
              Makes
            </div>
            <div className="text-xs" style={{ color: 'var(--ink-dim)' }}>
              servings
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button aria-label="Fewer servings" onClick={() => bump(-1)} className="round-btn !w-10 !h-10">
              <Minus className="w-4 h-4" />
            </button>
            <span className="min-w-8 text-center text-xl font-extrabold tabular-nums" style={{ color: 'var(--ink)' }} aria-live="polite">
              {draft.servings}
            </span>
            <button aria-label="More servings" onClick={() => bump(1)} className="round-btn !w-10 !h-10">
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div>
          <div className="text-xs font-bold uppercase tracking-wider pb-1" style={{ color: 'var(--ink-dim)' }}>
            Ingredients
          </div>
          {draft.ingredients.length === 0 ? (
            <p className="py-4 text-sm" style={{ color: 'var(--ink-dim)' }}>
              Nothing yet. Add each ingredient the way you would log it: search, scan or pick one, and say how much went in.
            </p>
          ) : (
            <ul className="row-divide">
              {draft.ingredients.map((ing, i) => (
                <li key={i} className="flex items-center gap-3 py-2.5">
                  <FoodIcon group={ing.group ?? 0} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-[13px] font-semibold" style={{ color: 'var(--ink)' }}>
                      {ing.name}
                    </div>
                    <div className="truncate text-xs" style={{ color: 'var(--ink-dim)' }}>
                      {ing.amount ?? ''}
                      {ing.amount ? ' · ' : ''}
                      {Math.round(ing.kcal)} kcal
                    </div>
                  </div>
                  <button aria-label={`Remove ${ing.name}`} onClick={() => onChange({ ...draft, ingredients: draft.ingredients.filter((_, j) => j !== i) })} className="p-2" style={{ color: 'var(--ink-dim)' }}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button onClick={onAddIngredient} className="mt-2 w-full rounded-2xl border border-dashed px-4 py-3 text-left text-[13px] font-bold" style={{ borderColor: 'var(--hairline-strong)', color: 'var(--ink)' }}>
            <Plus className="mr-2 inline w-4 h-4" style={{ color: 'var(--accent)' }} />
            Add an ingredient
          </button>
          {findFoods && (
            <button onClick={() => setPasting(true)} className="mt-2 w-full rounded-2xl border border-dashed px-4 py-3 text-left text-[13px] font-bold" style={{ borderColor: 'var(--hairline-strong)', color: 'var(--ink)' }}>
              <ClipboardPaste className="mr-2 inline w-4 h-4" style={{ color: 'var(--accent)' }} />
              {t('rcp.builderButton')}
            </button>
          )}
        </div>

        {draft.ingredients.length > 0 && (
          <div className="rounded-3xl border p-4" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--hairline)' }} aria-label="Recipe totals">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-xs font-semibold" style={{ color: 'var(--ink-dim)' }}>
                  Per serving
                </div>
                <div className="text-3xl font-extrabold tabular-nums" style={{ color: 'var(--ink)' }}>
                  {one.kcal} <span className="text-sm font-bold" style={{ color: 'var(--ink-dim)' }}>kcal</span>
                </div>
              </div>
              <div className="text-right text-xs font-mono" style={{ color: 'var(--ink-dim)' }}>
                <div>Protein {one.p} g</div>
                <div>Carbs {one.c} g</div>
                <div>Fat {one.f} g</div>
              </div>
            </div>
            <div className="mt-2 text-xs" style={{ color: 'var(--ink-dim)' }}>
              Whole recipe: {Math.round(total.kcal)} kcal · {Math.round(total.p)} g protein · {Math.round(total.c)} g carbs · {Math.round(total.f)} g fat
              {hasMicros(total.micros) ? ' · with vitamins and minerals' : ''}
            </div>
          </div>
        )}
      </div>
      {pasting && findFoods && (
        <RecipePaste
          findFoods={findFoods}
          onBack={() => setPasting(false)}
          defaultServings={draft.servings}
          onImport={(items, servings, name) => {
            onChange({ ...draft, name: draft.name.trim() ? draft.name : (name ?? ''), servings: servings ?? draft.servings, ingredients: [...draft.ingredients, ...items] });
            setPasting(false);
          }}
        />
      )}
      <div className="absolute inset-x-0 bottom-0 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]" style={{ background: 'linear-gradient(to top, var(--bg) 55%, transparent)' }}>
        <button onClick={onSave} disabled={!ready} className="w-full rounded-2xl py-3.5 text-sm font-extrabold disabled:opacity-40" style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}>
          {editing ? 'Save changes' : 'Save recipe'}
        </button>
      </div>
    </div>
  );
};
