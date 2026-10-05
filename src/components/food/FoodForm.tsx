import React, { useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { FoodRecord } from '../../lib/foodDb';
import { MealType } from '../../types/tracking';
import { haptic } from '../../lib/haptics';

const MEALS: MealType[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
const num = (s: string) => {
  const v = parseFloat(s.replace(',', '.'));
  return Number.isFinite(v) && v > 0 ? v : 0;
};
const r1 = (n: number) => Math.round(n * 10) / 10;

interface Props {
  /** "quick": log calories now. "create": make a food you can use again. */
  mode: 'quick' | 'create';
  initialName?: string;
  meal: MealType;
  onMeal: (m: MealType) => void;
  onBack: () => void;
  /** Called with a one-serving record. {@code keep} says to save it to My foods too. */
  onSubmit: (rec: FoodRecord, keep: boolean) => void;
}

const Field: React.FC<{ label: string; value: string; onChange: (v: string) => void; unit?: string; wide?: boolean; numeric?: boolean; required?: boolean }> = ({ label, value, onChange, unit, wide, numeric = true, required }) => (
  <label className={`block ${wide ? 'col-span-2' : ''}`}>
    <span className="text-[11px] font-semibold" style={{ color: 'var(--ink-dim)' }}>{label}{required ? ' *' : ''}</span>
    <span className="mt-1 flex items-center rounded-2xl border px-3" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--hairline)' }}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={numeric ? 'decimal' : 'text'}
        className="bare-input flex-1 min-w-0 py-3 text-sm outline-none"
        style={{ color: 'var(--ink)', background: 'transparent', border: 'none', boxShadow: 'none' }}
      />
      {unit && <span className="text-[11px]" style={{ color: 'var(--ink-dim)' }}>{unit}</span>}
    </span>
  </label>
);

/** Quick add (calories you know) and Create food (a food of your own, saved for next time). */
export const FoodForm: React.FC<Props> = ({ mode, initialName = '', meal, onMeal, onBack, onSubmit }) => {
  const [name, setName] = useState(initialName);
  const [serving, setServing] = useState('1 serving');
  const [kcal, setKcal] = useState('');
  const [p, setP] = useState('');
  const [c, setC] = useState('');
  const [f, setF] = useState('');
  const [fiber, setFiber] = useState('');
  const [sugar, setSugar] = useState('');
  const [sodium, setSodium] = useState('');
  const [keep, setKeep] = useState(mode === 'create');
  const [more, setMore] = useState(false);

  const fromMacros = Math.round(num(p) * 4 + num(c) * 4 + num(f) * 9);
  const calories = Math.round(num(kcal)) || fromMacros;
  const valid = calories > 0 && (mode === 'quick' || name.trim().length > 0);

  const submit = () => {
    if (!valid) return;
    haptic.success();
    const rec: FoodRecord = {
      id: `mine:${Date.now()}`,
      name: name.trim() || 'Quick add',
      group: 0,
      src: 'mine',
      kcal: calories,
      p: r1(num(p)),
      c: r1(num(c)),
      f: r1(num(f)),
      fiber: r1(num(fiber)),
      sugar: r1(num(sugar)),
      sodium: Math.round(num(sodium)),
      portions: [{ label: serving.trim() || '1 serving', g: 1 }],
      perServing: true,
    };
    onSubmit(rec, keep);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 slide-in">
      <div className="flex items-center gap-3 px-4 pt-1 pb-2">
        <button aria-label="Back" onClick={onBack} className="round-btn !w-10 !h-10">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-extrabold" style={{ color: 'var(--ink)' }}>{mode === 'quick' ? 'Quick add' : 'Create a food'}</h2>
      </div>
      <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label={mode === 'quick' ? 'Name (optional)' : 'Name'} value={name} onChange={setName} wide numeric={false} required={mode === 'create'} />
          {mode === 'create' && <Field label="Serving size, e.g. 1 bar or 30 g" value={serving} onChange={setServing} wide numeric={false} />}
          <Field label="Calories" value={kcal} onChange={setKcal} unit="kcal" wide required />
          {fromMacros > 0 && !num(kcal) && (
            <button type="button" onClick={() => setKcal(String(fromMacros))} className="col-span-2 text-left text-[11px] underline" style={{ color: 'var(--accent)' }}>
              Use {fromMacros} kcal worked out from the macros
            </button>
          )}
          <Field label="Protein" value={p} onChange={setP} unit="g" />
          <Field label="Carbs" value={c} onChange={setC} unit="g" />
          <Field label="Fat" value={f} onChange={setF} unit="g" />
          <button type="button" onClick={() => setMore((v) => !v)} className="self-end pb-3 text-left text-[11px] underline" style={{ color: 'var(--ink-dim)' }}>
            {more ? 'Hide detail' : 'More detail'}
          </button>
          {more && (
            <>
              <Field label="Fibre" value={fiber} onChange={setFiber} unit="g" />
              <Field label="Sugar" value={sugar} onChange={setSugar} unit="g" />
              <Field label="Sodium" value={sodium} onChange={setSodium} unit="mg" wide />
            </>
          )}
        </div>
        {mode === 'quick' && (
          <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--ink)' }}>
            <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> Keep it in My foods for next time
          </label>
        )}
        <div className="flex gap-2 overflow-x-auto no-scrollbar" role="radiogroup" aria-label="Meal">
          {MEALS.map((m) => (
            <button key={m} role="radio" aria-checked={meal === m} aria-pressed={meal === m} onClick={() => onMeal(m)} className="sport-pill shrink-0">
              {m}
            </button>
          ))}
        </div>
      </div>
      <div className="px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button disabled={!valid} onClick={submit} className="w-full py-3.5 rounded-2xl text-sm font-extrabold disabled:opacity-40" style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}>
          {mode === 'create' && !keep ? 'Add' : mode === 'create' ? 'Save and add' : 'Add'} to {meal} · {calories} kcal
        </button>
      </div>
    </div>
  );
};
