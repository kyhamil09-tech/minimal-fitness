import React, { useMemo, useState } from 'react';
import { Download, Scale } from 'lucide-react';
import { adaptiveTdee, intakeByDay } from '../lib/adaptiveTdee';
import { buildNutrition } from '../lib/nutritionTrends';
import { tdee } from '../lib/calc';
import { downloadTextFile } from '../lib/backup';
import { kgToDisplay, weightUnit } from '../lib/units';
import { shortWeekday } from '../lib/dates';
import { FEELINGS, styleById } from './content';
import { feelingCounts, foodToCsv, macroTargets, mealShares, microAverages, topFoods, weekdayAverages, weekendGap, windowAverage } from './model';
import { EatCtx } from './state';
import { SectionTitle, num, timeOfDay } from './ui';

const RANGES = [7, 14, 30] as const;
const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const clock = (min: number) => {
  const d = new Date();
  d.setHours(Math.floor(min / 60), min % 60, 0, 0);
  return timeOfDay(d.getTime());
};

/** Insights: how the days add up, where the calories come from, the weekly rhythm, what your body really burns, and a spreadsheet of it all. */
export const Insights: React.FC<{ ctx: EatCtx }> = ({ ctx }) => {
  const { food, goals, today, units } = ctx;
  const [range, setRange] = useState<(typeof RANGES)[number]>(14);
  const s = useMemo(() => buildNutrition(food, goals, range, today), [food, goals, range, today]);
  const targets = macroTargets(goals.dailyCalories, goals.dailyProteinG, styleById(ctx.prefs.style));
  const shares = useMemo(() => mealShares(food, today, range), [food, today, range]);
  const tops = useMemo(() => topFoods(food, today, range, 6), [food, today, range]);
  const avgs = useMemo(() => weekdayAverages(food, today, Math.max(range, 28)), [food, today, range]);
  const gap = weekendGap(avgs);
  const micro = useMemo(() => microAverages(food, today, range), [food, today, range]);
  const win = useMemo(() => windowAverage(food, today, range), [food, today, range]);
  const feel = useMemo(() => feelingCounts(ctx.notes, today, range), [ctx.notes, today, range]);

  const currentKg = ctx.body.length > 0 ? [...ctx.body].sort((a, b) => (a.date < b.date ? 1 : -1))[0].weightKg : ctx.profile.weightKg;
  const formula = tdee({ ...ctx.profile, weightKg: currentKg });
  const adaptive = useMemo(() => adaptiveTdee(ctx.body, intakeByDay(food), today, formula), [ctx.body, food, today, formula]);

  const maxDay = Math.max(goals.dailyCalories * 1.3, ...s.days.map((d) => d.calories), 1);
  const planPct = (goals.dailyCalories / maxDay) * 100;
  const maxAvg = Math.max(...avgs.map((a) => a.avg), 1);
  const maxShare = Math.max(...shares.map((m) => m.pct), 1);

  const exportCsv = () => void downloadTextFile(`eating-${today}.csv`, foodToCsv(food), 'text/csv').catch(() => undefined);

  return (
    <div className="ea-scroll">
      <div className="ea-wrap">
        <h1 className="ea-h1 mt-3">
          How you <em>eat</em>
        </h1>
        <p className="ea-dim mt-1 text-sm">Patterns, not grades. Days you did not log are left out of every average.</p>

        <div className="mt-4 grid grid-cols-3 gap-2" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button key={r} type="button" className="ea-chip" aria-pressed={range === r} onClick={() => setRange(r)}>
              {r} days
            </button>
          ))}
        </div>

        {s.loggedDays === 0 ? (
          <div className="ea-card ea-note mt-4 text-sm leading-relaxed">Nothing logged in the last {range} days. Log a few meals and this page fills in.</div>
        ) : (
          <>
            <section className="ea-card ea-card-gold mt-4" aria-label="Summary">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="ea-serif text-2xl font-semibold tabular-nums">{num(s.avgCalories)}</div>
                  <div className="ea-dim text-xs">avg kcal a day</div>
                </div>
                <div>
                  <div className="ea-serif text-2xl font-semibold tabular-nums">{Math.round(s.avgProteinG)} g</div>
                  <div className="ea-dim text-xs">avg protein</div>
                </div>
                <div>
                  <div className="ea-serif text-2xl font-semibold tabular-nums">
                    {s.loggedDays}
                    <span className="ea-dim text-base font-normal">/{range}</span>
                  </div>
                  <div className="ea-dim text-xs">days logged</div>
                </div>
              </div>
              <p className="mt-3 text-center text-sm leading-relaxed">
                {s.calorieDelta === undefined
                  ? ''
                  : Math.abs(s.calorieDelta) <= goals.dailyCalories * 0.05
                    ? 'Right around your plan on average. Beautifully steady.'
                    : s.calorieDelta > 0
                      ? `About ${num(s.calorieDelta)} above your plan on an average day.`
                      : `About ${num(-s.calorieDelta)} below your plan on an average day.`}
                {s.daysOnCalories > 0 ? ` ${s.daysOnCalories} day${s.daysOnCalories === 1 ? '' : 's'} landed within 10% of it.` : ''}
              </p>
            </section>

            <SectionTitle eyebrow="Day by day">Calories</SectionTitle>
            <section className="ea-card" aria-label="Calories by day">
              <div className="relative flex h-32 items-end gap-[3px]" role="img" aria-label={`Calories for each of the last ${range} days, with your plan of ${num(goals.dailyCalories)} marked`}>
                <div className="pointer-events-none absolute left-0 right-0 border-t border-dashed" style={{ bottom: `${planPct}%`, borderColor: 'rgba(var(--ea-gold-rgb),0.6)' }} />
                {s.days.map((d) => (
                  <div key={d.date} className="flex h-full min-w-0 flex-1 items-end">
                    <div
                      className="w-full rounded-t-[4px]"
                      style={{
                        height: d.logged ? `${Math.max(3, (d.calories / maxDay) * 100)}%` : '2px',
                        background: !d.logged ? 'rgba(var(--ea-tint),0.15)' : d.calories > goals.dailyCalories * 1.1 ? 'var(--ea-c)' : 'var(--ea-p)',
                      }}
                    />
                  </div>
                ))}
              </div>
              <div className="ea-dim mt-2 flex justify-between text-xs">
                <span>{shortWeekday(s.days[0].date)}</span>
                <span>dashed line is your plan</span>
                <span>Today</span>
              </div>
            </section>

            <SectionTitle eyebrow="Where it comes from">Macros</SectionTitle>
            <section className="ea-card" aria-label="Macros">
              {s.split && (
                <>
                  <div className="flex h-4 overflow-hidden rounded-full" role="img" aria-label={`Calories from protein ${s.split.protein} percent, carbs ${s.split.carbs} percent, fat ${s.split.fat} percent`}>
                    <div style={{ width: `${s.split.protein}%`, background: 'var(--ea-p)' }} />
                    <div style={{ width: `${s.split.carbs}%`, background: 'var(--ea-c)' }} />
                    <div style={{ width: `${s.split.fat}%`, background: 'var(--ea-f)' }} />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
                    {[
                      ['Protein', s.split.protein, s.avgProteinG, targets.proteinG, 'var(--ea-p)'],
                      ['Carbs', s.split.carbs, s.avgCarbsG, targets.carbsG, 'var(--ea-c)'],
                      ['Fat', s.split.fat, s.avgFatG, targets.fatG, 'var(--ea-f)'],
                    ].map(([label, pct, g, target, color]) => (
                      <div key={label as string}>
                        <div className="ea-serif text-xl font-semibold" style={{ color: color as string }}>
                          {pct as number}%
                        </div>
                        <div className="text-xs font-semibold">{label as string}</div>
                        <div className="ea-dim text-xs tabular-nums">
                          {Math.round(g as number)} g of {target as number}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <p className="ea-dim mt-3 text-xs leading-relaxed">Your style is {styleById(ctx.prefs.style).name}. Change it in You.</p>
            </section>

            <SectionTitle eyebrow="Across the day">Meals</SectionTitle>
            <section className="ea-card" aria-label="Calories by meal">
              {shares.map((m) => (
                <div key={m.meal} className="ea-macro">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-semibold">{m.meal}</span>
                    <span className="ea-dim tabular-nums text-xs">
                      {m.pct}% · {num(m.kcal / Math.max(1, s.loggedDays))} kcal a day
                    </span>
                  </div>
                  <div className="ea-track" aria-hidden="true">
                    <div className="ea-fill" style={{ width: `${(m.pct / maxShare) * 100}%`, background: 'var(--ea-lilac)' }} />
                  </div>
                </div>
              ))}
              {win && (
                <p className="ea-dim mt-3 text-xs leading-relaxed">
                  Over {win.days} days your first bite was around {clock(win.firstMin)} and your last around {clock(win.lastMin)}.
                </p>
              )}
            </section>

            <SectionTitle eyebrow="Your week">Rhythm</SectionTitle>
            <section className="ea-card" aria-label="Average calories by weekday">
              <div className="flex h-24 items-end gap-2" role="img" aria-label="Average calories for each weekday">
                {avgs.map((a) => (
                  <div key={a.weekday} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                    <div className="w-full rounded-t-[5px]" style={{ height: `${a.avg > 0 ? Math.max(6, (a.avg / maxAvg) * 100) : 2}%`, background: a.weekday >= 5 ? 'var(--ea-c)' : 'var(--ea-p)', opacity: a.days === 0 ? 0.2 : 1 }} />
                  </div>
                ))}
              </div>
              <div className="mt-1 flex gap-2">
                {WD.map((w) => (
                  <div key={w} className="ea-dim flex-1 text-center text-xs">
                    {w[0]}
                  </div>
                ))}
              </div>
              {gap ? (
                <p className="mt-3 text-sm leading-relaxed">
                  {Math.abs(gap.diff) < 100
                    ? 'Weekends and weekdays eat about the same. Remarkably consistent.'
                    : gap.diff > 0
                      ? `Weekends run about ${num(gap.diff)} kcal higher than weekdays. Planning one good weekend meal can even it out.`
                      : `Weekends run about ${num(-gap.diff)} kcal lower than weekdays.`}
                </p>
              ) : (
                <p className="ea-dim mt-3 text-xs">A few more weeks of logging, and your weekend pattern shows here.</p>
              )}
            </section>

            {tops.length > 0 && (
              <>
                <SectionTitle eyebrow="On repeat">Your top foods</SectionTitle>
                <section className="ea-card" aria-label="Top foods">
                  <ol>
                    {tops.map((f, i) => (
                      <li key={f.name} className="flex items-center gap-3 py-1.5">
                        <span className="ea-serif w-5 text-lg font-semibold" style={{ color: 'var(--ea-c)' }}>
                          {i + 1}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{f.name}</span>
                        <span className="ea-dim shrink-0 text-xs tabular-nums">
                          {f.count}x · {f.avgKcal} kcal
                        </span>
                      </li>
                    ))}
                  </ol>
                </section>
              </>
            )}

            {micro.days > 0 && (
              <>
                <SectionTitle eyebrow="Vitamins and minerals">Usually low</SectionTitle>
                <section className="ea-card" aria-label="Vitamins and minerals that run low">
                  {micro.rows.slice(0, 4).map((r) => (
                    <div key={r.id} className="ea-macro">
                      <div className="flex justify-between text-sm">
                        <span className="font-semibold">{r.label}</span>
                        <span className="ea-dim text-xs tabular-nums">{r.pct}% of the daily value</span>
                      </div>
                      <div className="ea-track" aria-hidden="true">
                        <div className="ea-fill" style={{ width: `${Math.min(100, r.pct)}%`, background: 'var(--ea-lilac)' }} />
                      </div>
                    </div>
                  ))}
                  <p className="ea-dim mt-3 text-xs leading-relaxed">
                    Counted on {micro.days} day{micro.days === 1 ? '' : 's'} where foods listed them. Many foods do not, so a low bar can mean "not known" rather than "not eaten".
                  </p>
                </section>
              </>
            )}

            {feel.length > 0 && (
              <>
                <SectionTitle eyebrow="In your words">How days felt</SectionTitle>
                <section className="ea-card flex flex-wrap gap-2" aria-label="How days felt">
                  {feel.map((f) => (
                    <span key={f.id} className="ea-tag" style={{ fontSize: '0.8rem', padding: '4px 12px' }}>
                      {FEELINGS.find((x) => x.id === f.id)?.label ?? f.id} · {f.n}
                    </span>
                  ))}
                </section>
              </>
            )}
          </>
        )}

        <SectionTitle eyebrow="Your body">What you really burn</SectionTitle>
        <section className="ea-card" aria-label="Measured maintenance">
          <div className="flex items-start gap-3">
            <Scale className="mt-1 h-5 w-5 shrink-0" style={{ color: 'var(--ea-c)' }} aria-hidden="true" />
            {adaptive.confidence === 'locked' ? (
              <div>
                <div className="ea-serif text-2xl font-semibold tabular-nums">{num(adaptive.maintenanceKcal ?? formula)} kcal a day</div>
                <p className="ea-dim mt-1 text-sm leading-relaxed">
                  Measured from what you ate and how your weight moved over two weeks. The formula guessed {num(formula)}.
                  {adaptive.weeklyChangeKg !== undefined && Math.abs(adaptive.weeklyChangeKg) > 0.02
                    ? ` Your trend weight is ${adaptive.weeklyChangeKg > 0 ? 'up' : 'down'} ${Math.abs(kgToDisplay(adaptive.weeklyChangeKg, units, 2))} ${weightUnit(units)} a week.`
                    : ' Your trend weight is steady.'}
                </p>
              </div>
            ) : (
              <p className="text-sm leading-relaxed">
                Still learning. About two weeks of food logged and a handful of weigh-ins turn guesses into a measured number.
                <span className="ea-dim block pt-1 text-xs">
                  {Math.min(adaptive.foodDays, 10)} of 10 food days · {Math.min(adaptive.weighIns, 5)} of 5 weigh-ins
                </span>
              </p>
            )}
          </div>
        </section>

        <button type="button" className="ea-btn ea-btn-quiet mt-6 w-full" onClick={exportCsv}>
          <Download className="h-4 w-4" aria-hidden="true" /> Export my diary as a spreadsheet
        </button>
        <p className="ea-dim mt-2 px-1 text-xs leading-relaxed">Free, always: every food you ever logged, with calories, macros, fiber, sugar and sodium.</p>
        <div className="h-4" />
      </div>
    </div>
  );
};
