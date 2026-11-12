import React, { useMemo, useState } from 'react';
import { ChevronLeft, Minus, Plus, Star } from 'lucide-react';
import { ColorPalette } from '../../types/theme';
import { MealType } from '../../types/tracking';
import { MICROS, microText } from '../../lib/micros';
import { FoodRecord, GROUPS, UnitKey, defaultAmount, displayName, gramsFor, nutrientsFor } from '../../lib/foodDb';
import { FoodIcon } from './FoodIcon';
import { MacroDonut, macroColors } from './MacroDonut';
import { CountUp } from '../ui/CountUp';
import { haptic } from '../../lib/haptics';

const MEALS: MealType[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

interface Props {
  theme: ColorPalette;
  rec: FoodRecord;
  meal: MealType;
  onMeal: (m: MealType) => void;
  favorite: boolean;
  onToggleFavorite: () => void;
  onBack: () => void;
  onAdd: (unit: UnitKey, qty: number) => void;
  /** The add button's words, when it does something other than log the food (adding to a recipe). */
  addLabel?: string;
  /** Remove a food you made yourself. */
  onDelete?: () => void;
}

const stepFor = (unit: UnitKey) => (unit === 'g' ? 10 : unit === 'oz' ? 0.5 : 0.5);

/** One food: how much of it, what it adds up to (calories, protein, carbs, fat and the finer detail), and the add button. */
export const FoodDetail: React.FC<Props> = ({ theme, rec, meal, onMeal, favorite, onToggleFavorite, onBack, onAdd, onDelete, addLabel }) => {
  const start = defaultAmount(rec);
  const [unit, setUnit] = useState<UnitKey>(start.unit);
  const [qtyText, setQtyText] = useState(String(start.qty));
  const qty = Math.max(0, parseFloat(qtyText) || 0);
  const n = useMemo(() => nutrientsFor(rec, unit, qty), [rec, unit, qty]);
  const col = macroColors(theme);
  const units: { key: UnitKey; label: string }[] = rec.perServing
    ? [{ key: 'p0', label: rec.portions[0]?.label ?? 'serving' }]
    : [...rec.portions.map((p, i) => ({ key: `p${i}` as UnitKey, label: p.label })), { key: 'g', label: 'grams' }, { key: 'oz', label: 'ounces' }];

  const pickUnit = (k: UnitKey) => {
    if (k === unit) return;
    haptic.select();
    // Keep the same weight when you change unit, so switching from "1 cup" to grams shows the grams in that cup.
    if (!rec.perServing) {
      const grams = gramsFor(rec, unit, qty) || 100;
      const to = k === 'g' ? grams : k === 'oz' ? grams / 28.3495 : grams / (rec.portions[Number(k.slice(1))]?.g || 100);
      setQtyText(String(Math.round(to * 10) / 10 || 1));
    }
    setUnit(k);
  };
  const bump = (dir: 1 | -1) => {
    const s = stepFor(unit);
    const next = Math.max(s, Math.round((qty + dir * s) * 100) / 100);
    setQtyText(String(next));
    haptic.tick();
  };

  const total = n.p * 4 + n.c * 4 + n.f * 9;
  const pct = (kcal: number) => (total > 0 ? Math.round((kcal / total) * 100) : 0);
  const facts: [string, string][] = [];
  if (n.fiber > 0) facts.push(['Fiber', `${n.fiber} g`]);
  if (n.sugar > 0) facts.push(['Sugar', `${n.sugar} g`]);
  if (n.sodium > 0) facts.push(['Sodium', `${n.sodium} mg`]);
  for (const def of MICROS) {
    const v = n.micros?.[def.id] ?? 0;
    if (v > 0) facts.push([def.label, microText(def, v)]);
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 slide-in">
      <div className="flex items-center justify-between px-4 pt-1 pb-2">
        <button aria-label="Back to results" onClick={onBack} className="round-btn !w-10 !h-10">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'} aria-pressed={favorite} onClick={onToggleFavorite} className="round-btn !w-10 !h-10">
          <Star className="w-5 h-5" style={{ color: favorite ? 'var(--g-yellow)' : undefined, fill: favorite ? 'var(--g-yellow)' : 'none' }} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-4 space-y-4">
        <div className="flex items-center gap-3">
          <FoodIcon group={rec.group} size={52} />
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold leading-tight" style={{ color: 'var(--ink)' }}>{displayName(rec)}</h2>
            <p className="text-xs" style={{ color: 'var(--ink-dim)' }}>
              {rec.src === 'off' || rec.src === 'usda' ? 'Packaged food' : rec.src === 'mine' ? 'Your food' : GROUPS[rec.group]} · {rec.perServing ? 'per serving' : 'values per 100 g'}
            </p>
          </div>
        </div>

        {/* Amount */}
        <div className="rounded-3xl border p-4 pop-in" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--hairline)', '--i': 0 } as React.CSSProperties}>
          <div className="flex items-center justify-between gap-3">
            <button aria-label="Less" onClick={() => bump(-1)} className="round-btn !w-12 !h-12">
              <Minus className="w-5 h-5" />
            </button>
            <input
              aria-label="Amount"
              inputMode="decimal"
              value={qtyText}
              onChange={(e) => setQtyText(e.target.value.replace(',', '.'))}
              onFocus={(e) => e.target.select()}
              className="bare-input w-28 text-center hero-num text-[3rem] outline-none"
              style={{ color: 'var(--ink)', background: 'transparent', border: 'none', boxShadow: 'none' }}
            />
            <button aria-label="More" onClick={() => bump(1)} className="round-btn !w-12 !h-12">
              <Plus className="w-5 h-5" />
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar mt-3 pb-1" role="radiogroup" aria-label="Unit">
            {units.map((u) => (
              <button
                key={u.key}
                role="radio"
                aria-checked={unit === u.key}
                onClick={() => pickUnit(u.key)}
                className="sport-pill shrink-0 !py-1.5 !px-3 !text-xs"
                aria-pressed={unit === u.key}
              >
                {u.label}
              </button>
            ))}
          </div>
        </div>

        {/* What it adds up to */}
        <div className="rounded-3xl border p-4 flex items-center gap-4 pop-in" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--hairline)', '--i': 1 } as React.CSSProperties}>
          <MacroDonut theme={theme} p={n.p} c={n.c} f={n.f} size={124}>
            <div className="hero-num text-[2rem]"><CountUp value={n.kcal} ms={350} /></div>
            <div className="text-xs font-bold tracking-widest" style={{ color: 'var(--ink-dim)' }}>KCAL</div>
          </MacroDonut>
          <div className="flex-1 space-y-2.5">
            {[
              { label: 'Protein', g: n.p, color: col.p, kcal: n.p * 4 },
              { label: 'Carbs', g: n.c, color: col.c, kcal: n.c * 4 },
              { label: 'Fat', g: n.f, color: col.f, kcal: n.f * 9 },
            ].map((m) => (
              <div key={m.label} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2" style={{ color: 'var(--ink)' }}>
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: m.color }} />
                  {m.label}
                </span>
                <span className="font-mono tabular-nums" style={{ color: 'var(--ink)' }}>
                  {m.g} g <span style={{ color: 'var(--ink-dim)' }}>· {pct(m.kcal)}%</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {facts.length > 0 && (
          <div className="rounded-3xl border divide-y pop-in" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--hairline)', '--i': 2 } as React.CSSProperties}>
            {facts.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between px-4 py-2.5 text-xs" style={{ borderColor: 'var(--hairline)' }}>
                <span style={{ color: 'var(--ink-dim)' }}>{k}</span>
                <span className="font-mono tabular-nums" style={{ color: 'var(--ink)' }}>{v}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 overflow-x-auto no-scrollbar" role="radiogroup" aria-label="Meal">
          {MEALS.map((m) => (
            <button key={m} role="radio" aria-checked={meal === m} onClick={() => onMeal(m)} className="sport-pill shrink-0">
              {m}
            </button>
          ))}
        </div>
        {onDelete && (
          <button onClick={onDelete} className="text-xs underline" style={{ color: 'var(--ink-dim)' }}>
            Delete this food from My foods
          </button>
        )}
      </div>

      <div className="px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          disabled={qty <= 0}
          onClick={() => onAdd(unit, qty)}
          className="w-full py-3.5 rounded-2xl text-sm font-extrabold disabled:opacity-40"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          Add to {meal} · {n.kcal} kcal
        </button>
      </div>
    </div>
  );
};
