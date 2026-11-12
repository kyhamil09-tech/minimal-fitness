import React, { useState } from 'react';
import { BookmarkPlus, Copy, Minus, Plus, Trash2 } from 'lucide-react';
import { FoodEntry, MealType } from '../types/tracking';
import { FoodIcon } from '../components/food/FoodIcon';
import { MEALS } from './content';
import { scaleAmountText, scaleEntry } from './model';
import { EatCtx } from './state';
import { Sheet } from './ui';

const STEP = 0.25;
const CHOICES = [0.5, 1, 1.5, 2];
const fx = (k: number) => String(Math.round(k * 100) / 100);

/**
 * A logged food, up close: change how much you ate (everything scales together), move it to another meal, copy it, keep it as a saved
 * meal, or remove it (with an undo).
 */
export const EntrySheet: React.FC<{ ctx: EatCtx; entry: FoodEntry | null; onClose: () => void }> = ({ ctx, entry, onClose }) => {
  const [k, setK] = useState(1);
  const [meal, setMeal] = useState<MealType>(entry?.meal ?? 'Lunch');
  const [shown, setShown] = useState<string | null>(null);
  // Start fresh each time a different food is opened.
  if (entry && shown !== entry.id) {
    setShown(entry.id);
    setK(1);
    setMeal(entry.meal);
  }
  if (!entry) return <Sheet open={false} onClose={onClose} title="Food">{null}</Sheet>;

  const scaled = scaleEntry(entry, k);
  const changed = k !== 1 || meal !== entry.meal;
  const { id: _id, date: _date, ...rest } = entry;

  const save = () => {
    ctx.onUpdateFood(entry.id, { ...scaled, meal });
    ctx.say(`Updated ${entry.name}`);
    onClose();
  };
  const duplicate = () => {
    const id = ctx.onAddFood(entry.date, { ...rest, ...scaled, meal });
    ctx.say(`Copied ${entry.name}`, typeof id === 'string' ? () => ctx.onDeleteFood(id) : undefined);
    onClose();
  };
  const keep = () => {
    ctx.onSaveMeal(entry.name, [{ name: entry.name, calories: Math.round(entry.calories), proteinG: entry.proteinG, carbsG: entry.carbsG, fatG: entry.fatG }]);
    ctx.say(`Saved ${entry.name} to your meals`);
  };
  const remove = () => {
    ctx.onDeleteFood(entry.id);
    ctx.say(`Removed ${entry.name}`, () => {
      ctx.onAddFood(entry.date, rest);
    });
    onClose();
  };

  return (
    <Sheet open onClose={onClose} title={entry.name}>
      <div className="flex items-center gap-3">
        <FoodIcon group={entry.group ?? 0} size={46} />
        <div className="min-w-0">
          <div className="ea-dim text-sm">{(k === 1 ? entry.amount : scaleAmountText(entry.amount, k)) || 'One serving'}</div>
          <div className="ea-serif text-3xl font-semibold tabular-nums">
            {scaled.calories} <span className="ea-dim text-base font-normal">kcal</span>
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
        {[
          ['Protein', scaled.proteinG, 'var(--ea-p)'],
          ['Carbs', scaled.carbsG, 'var(--ea-c)'],
          ['Fat', scaled.fatG, 'var(--ea-f)'],
        ].map(([label, v, color]) => (
          <div key={label as string} className="rounded-2xl py-2" style={{ background: 'rgba(var(--ea-tint),0.05)' }}>
            <div className="ea-serif text-lg font-semibold" style={{ color: color as string }}>
              {v as number} g
            </div>
            <div className="ea-dim text-xs">{label as string}</div>
          </div>
        ))}
      </div>
      {(scaled.fiberG !== undefined || scaled.sugarG !== undefined || scaled.sodiumMg !== undefined) && (
        <p className="ea-dim mt-2 text-center text-xs">
          {[scaled.fiberG !== undefined ? `Fiber ${scaled.fiberG} g` : '', scaled.sugarG !== undefined ? `Sugar ${scaled.sugarG} g` : '', scaled.sodiumMg !== undefined ? `Sodium ${scaled.sodiumMg} mg` : '']
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}

      <div className="mt-4">
        <div className="ea-eyebrow">How much</div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <button type="button" className="ea-iconbtn border" style={{ borderColor: 'var(--ea-line)' }} onClick={() => setK((v) => Math.max(STEP, Math.round((v - STEP) * 100) / 100))} aria-label="Eat a little less">
            <Minus className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="ea-serif text-3xl font-semibold tabular-nums" aria-live="polite">
            x{fx(k)}
          </div>
          <button type="button" className="ea-iconbtn border" style={{ borderColor: 'var(--ea-line)' }} onClick={() => setK((v) => Math.round((v + STEP) * 100) / 100)} aria-label="Eat a little more">
            <Plus className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-2 flex flex-wrap justify-center gap-2" role="group" aria-label="Quick amounts">
          {CHOICES.map((c) => (
            <button key={c} type="button" className="ea-chip" aria-pressed={k === c} onClick={() => setK(c)}>
              {c === 0.5 ? 'Half' : c === 1 ? 'As logged' : c === 1.5 ? 'One and a half' : 'Double'}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <div className="ea-eyebrow">Meal</div>
        <div className="mt-2 grid grid-cols-4 gap-2" role="group" aria-label="Meal">
          {MEALS.map((m) => (
            <button key={m} type="button" className="ea-chip !px-0" aria-pressed={meal === m} onClick={() => setMeal(m)}>
              {m}
            </button>
          ))}
        </div>
      </div>

      <button type="button" className="ea-btn mt-5 w-full" disabled={!changed} onClick={save}>
        Save changes
      </button>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button type="button" className="ea-btn ea-btn-quiet ea-btn-small" onClick={duplicate}>
          <Copy className="h-4 w-4" aria-hidden="true" /> Copy
        </button>
        <button type="button" className="ea-btn ea-btn-quiet ea-btn-small" onClick={keep}>
          <BookmarkPlus className="h-4 w-4" aria-hidden="true" /> Keep
        </button>
        <button type="button" className="ea-btn ea-btn-quiet ea-btn-small" onClick={remove}>
          <Trash2 className="h-4 w-4" aria-hidden="true" /> Remove
        </button>
      </div>
    </Sheet>
  );
};
