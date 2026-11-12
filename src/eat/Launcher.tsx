import React, { useMemo } from 'react';
import { ArrowRight, Droplets, Plus } from 'lucide-react';
import { FoodEntry, Goals, UnitSystem, WaterEntry } from '../types/tracking';
import { displayToMl, mlToDisplay, volumeUnit } from '../lib/units';
import { todayKey } from '../lib/dates';
import { useMiniLook } from '../hooks/useMiniLook';
import { dayTotals, greeting, plate } from './model';

const COLORS = { p: 'var(--ea-p)', c: 'var(--ea-c)', f: 'var(--ea-f)' } as const;
const R = 40;
const CIRC = 2 * Math.PI * R;

/**
 * What the Health tab shows for food: a small plate with what is left today, and the doors into the Eat app. The whole food side lives
 * in Eat; this is its front step.
 */
export const EatLauncher: React.FC<{
  food: FoodEntry[];
  water: WaterEntry[];
  goals: Goals;
  units: UnitSystem;
  name: string;
  appAccent: string;
  onOpen: () => void;
  onAdd: () => void;
  onWater: (ml: number) => void;
}> = ({ food, water, goals, units, name, appAccent, onOpen, onAdd, onWater }) => {
  const miniLook = useMiniLook('eat', appAccent);
  const today = todayKey();
  const t = useMemo(() => dayTotals(food.filter((f) => f.date === today)), [food, today]);
  const waterMl = water.filter((w) => w.date === today).reduce((s, w) => s + w.ml, 0);
  const left = Math.round(goals.dailyCalories - t.calories);
  const pl = plate(t, goals.dailyCalories);
  const first = name.trim().split(/\s+/)[0];
  const glass = units === 'imperial' ? 8 : 250;

  return (
    <section
      aria-label="Eat"
      className="overflow-hidden rounded-[28px] border"
      style={{ ...miniLook.style, borderColor: 'rgba(var(--ea-gold-rgb),0.3)', background: 'radial-gradient(120% 90% at 100% 0%, var(--ea-glow), transparent 60%), linear-gradient(180deg, var(--ea-surface2), var(--ea-bg-a))', color: 'var(--ea-text)' }}
    >
      <div className="flex items-center gap-4 p-5">
        <svg width="96" height="96" viewBox="0 0 96 96" role="img" aria-label={`${Math.abs(left).toLocaleString()} calories ${left >= 0 ? 'left' : 'past your plan'} today`} className="shrink-0">
          <circle cx="48" cy="48" r={R} fill="none" stroke="rgba(var(--ea-tint),0.1)" strokeWidth="9" />
          {pl.segments.map((s) => {
            const len = Math.max(0, (s.to - s.from) * CIRC);
            return <circle key={s.key} cx="48" cy="48" r={R} fill="none" stroke={COLORS[s.key]} strokeWidth="9" strokeDasharray={`${len} ${CIRC - len}`} strokeDashoffset={-s.from * CIRC} transform="rotate(-90 48 48)" />;
          })}
          <circle cx="48" cy="48" r="29" fill="var(--ea-plate)" stroke="rgba(var(--ea-gold-rgb),0.3)" strokeWidth="1" />
          <text x="48" y="52" textAnchor="middle" fontSize="15" fontWeight="600" fill="var(--ea-text)" style={{ fontFamily: "'Iowan Old Style', Palatino, Georgia, serif" }}>
            {Math.abs(left).toLocaleString()}
          </text>
        </svg>
        <div className="min-w-0 flex-1">
          <div className="text-[0.7rem] font-extrabold uppercase tracking-[0.16em]" style={{ color: 'var(--ea-gold)' }}>
            Eat
          </div>
          <div className="mt-0.5 text-xl font-semibold leading-tight" style={{ fontFamily: "'Iowan Old Style', Palatino, Georgia, serif" }}>
            {t.count === 0 ? `${greeting(new Date().getHours())}${first ? `, ${first}` : ''}.` : left >= 0 ? `${left.toLocaleString()} left to enjoy` : `${(-left).toLocaleString()} past your plan`}
          </div>
          <div className="mt-0.5 text-xs" style={{ color: 'var(--ea-dim)' }}>
            {t.count === 0 ? 'Nothing logged yet today.' : `P ${Math.round(t.proteinG)} · C ${Math.round(t.carbsG)} · F ${Math.round(t.fatG)} g`}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-5 pb-5">
        <button type="button" onClick={onOpen} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl text-sm font-extrabold" style={{ background: 'var(--ea-accent)', color: 'var(--ea-accent-ink)' }}>
          Open Eat <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" onClick={onAdd} className="flex min-h-12 min-w-12 items-center justify-center rounded-2xl border" style={{ borderColor: 'rgba(var(--ea-tint),0.2)' }} aria-label="Add food">
          <Plus className="h-5 w-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onWater(displayToMl(glass, units))}
          className="flex min-h-12 items-center justify-center gap-1.5 rounded-2xl border px-3 text-xs font-bold"
          style={{ borderColor: 'rgba(var(--ea-tint),0.2)' }}
          aria-label={`Add ${glass} ${volumeUnit(units)} of water. Today ${mlToDisplay(waterMl, units)} of ${mlToDisplay(goals.dailyWaterMl, units)}`}
        >
          <Droplets className="h-4 w-4" style={{ color: 'var(--ea-water)' }} aria-hidden="true" /> +{glass}
        </button>
      </div>
    </section>
  );
};
