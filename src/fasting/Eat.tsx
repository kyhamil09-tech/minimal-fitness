import React, { useMemo, useState } from 'react';
import { Droplets, Utensils } from 'lucide-react';
import { todayKey } from '../lib/dates';
import { eatingWindow } from '../eat/model';
import { ELECTROLYTES } from './content';
import { eatingState, waterAmounts, waterText, waterTotalMl, withExtra } from './model';
import { IntakeList } from './Intake';
import { FastCtx } from './state';
import { RefeedGuide, WhatBreaksList } from './Parts';
import { SectionTitle, hoursText, timeOfDay, useNow } from './ui';

const BEFORE = [
  'Make the last meal a proper one: protein, fiber and some healthy fat keep you full longer than refined carbs alone.',
  'Drink water with it, and keep drinking through the evening.',
  'Go easy on salty, sugary or alcoholic last meals, which can make the first hours harder.',
  'Plan what you will break the fast with, so hunger does not decide for you.',
];

/** Eat: your eating window, how to break a fast, what does and does not count, and water and salts. */
export const Eat: React.FC<{ ctx: FastCtx }> = ({ ctx }) => {
  const { plan, sessions, setExtras, extras, units } = ctx;
  const glass = waterAmounts(units)[0];
  const now = useNow(30_000);
  const eat = useMemo(() => eatingState(plan, now), [plan, Math.floor(now / 60_000)]);
  const active = sessions.find((s) => !s.isCompleted);
  const last = sessions.filter((s) => s.isCompleted).sort((a, b) => b.startTimestamp - a.startTimestamp)[0];
  const [len, setLen] = useState<number>(last?.actualHours ?? 16);
  const day = todayKey();
  const dayFood = useMemo(() => ctx.food.filter((f) => f.date === day), [ctx.food, day]);
  const foodWindow = useMemo(() => eatingWindow(dayFood), [dayFood]);

  return (
    <div className="fa-scroll">
      <h1 className="fa-h1 mt-3">Eat well</h1>
      <p className="fa-dim mt-1 text-sm">Your eating window, breaking a fast gently, and what counts.</p>

      <section className="fa-card mt-4" aria-label="Eating window">
        <div className="fa-eyebrow">Eating window</div>
        {eat.state === 'off' ? (
          <p className="mt-2 text-sm">Today is a day off in your plan: eat as you normally would.</p>
        ) : eat.windowStart && eat.windowEnd ? (
          <>
            <div className="mt-1 text-xl font-extrabold">
              {timeOfDay(eat.windowStart)} to {timeOfDay(eat.windowEnd)}
            </div>
            <p className="fa-dim mt-1 text-sm">
              {active ? 'You are fasting now.' : eat.state === 'eating' && eat.nextAt ? `Open for ${hoursText((eat.nextAt - now) / 3_600_000)} more.` : eat.nextAt ? `Opens in ${hoursText((eat.nextAt - now) / 3_600_000)}.` : 'No window tomorrow.'}
            </p>
          </>
        ) : null}
        <button type="button" className="fa-btn fa-btn-small mt-3" onClick={ctx.onLogMeal}>
          <Utensils className="h-4 w-4" aria-hidden="true" /> Log a meal
        </button>
      </section>

      <section className="fa-card mt-3" aria-label="Logged in Eat today">
        <div className="fa-eyebrow">Logged in Eat today</div>
        {dayFood.length === 0 ? (
          <p className="fa-dim mt-1 text-sm">Nothing logged yet today.</p>
        ) : (
          <p className="mt-1 text-sm leading-relaxed">
            {dayFood.length} food{dayFood.length === 1 ? '' : 's'}, {Math.round(dayFood.reduce((s, f) => s + f.calories, 0)).toLocaleString()} kcal.
            {foodWindow ? ` First ${timeOfDay(foodWindow.first)}, last ${timeOfDay(foodWindow.last)}${eat.windowStart && eat.windowEnd ? ` (your window is ${timeOfDay(eat.windowStart)} to ${timeOfDay(eat.windowEnd)})` : ''}.` : ''}
          </p>
        )}
        <button type="button" className="fa-btn fa-btn-small fa-btn-quiet mt-3" onClick={ctx.openEat}>
          <Utensils className="h-4 w-4" aria-hidden="true" /> Open Eat
        </button>
      </section>

      <SectionTitle>Break your fast well</SectionTitle>
      <RefeedGuide hours={len} onHours={setLen} />

      <SectionTitle>Does it break a fast?</SectionTitle>
      <WhatBreaksList />

      <SectionTitle>Water and salts</SectionTitle>
      <section className="fa-card">
        <p className="text-sm leading-relaxed">{ELECTROLYTES.why}</p>
        <ul className="fa-dim mt-3 list-disc space-y-1 pl-5 text-sm">
          {ELECTROLYTES.tips.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        {active && (
          <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              className="fa-btn fa-btn-small"
              onClick={() => {
                ctx.onAddWater(glass.ml);
                setExtras((all) => withExtra(all, active.id, (e) => ({ ...e, water: [...e.water, { at: Date.now(), ml: glass.ml }] })));
              }}
            >
              <Droplets className="h-4 w-4" aria-hidden="true" /> Water +{glass.label}
            </button>
            <button type="button" className="fa-btn fa-btn-small fa-btn-quiet" onClick={() => setExtras((all) => withExtra(all, active.id, (e) => ({ ...e, salts: [...e.salts, { at: Date.now(), label: 'Salt in water' }] })))}>
              + Salt
            </button>
          </div>
          <p className="fa-dim mb-1.5 mt-3 text-xs">
            This fast so far: {waterText(waterTotalMl(extras[active.id]), units)} water. Tap the x to take an entry back.
          </p>
          <IntakeList extra={extras[active.id]} units={units} onRemoveWater={(i) => ctx.removeWater(active.id, i)} onRemoveSalt={(i) => ctx.removeSalt(active.id, i)} />
          </>
        )}
        <p className="fa-note mt-3 text-xs leading-relaxed">{ELECTROLYTES.care}</p>
      </section>

      <SectionTitle>Before you fast</SectionTitle>
      <ul className="space-y-2">
        {BEFORE.map((b) => (
          <li key={b} className="fa-card !py-3 text-sm leading-relaxed">
            {b}
          </li>
        ))}
      </ul>
      <div className="h-6" />
    </div>
  );
};
