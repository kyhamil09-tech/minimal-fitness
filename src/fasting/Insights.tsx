import React, { useMemo, useState } from 'react';
import { FlaskConical, ShieldCheck } from 'lucide-react';
import { FEELING_TAGS, feelingMap, fastingByDay, fastingStats } from '../lib/fasting';
import { todayKey } from '../lib/dates';
import { STAGES } from './content';
import { kgToDisplay, weightUnit } from '../lib/units';
import { byProtocol, fastedWorkouts, glucoseFromDisplay, glucoseSeries, glucoseToDisplay, glucoseUnit, hungerStats, ketoneSeries, mealToBed, stageHours, startSpread, weeklyWeight, withExtra } from './model';
import { FastCtx } from './state';
import { LookPicker } from '../components/ui/LookPicker';
import { FaToggle, SectionTitle, hoursText } from './ui';

const Bars: React.FC<{ values: { key: string; hours: number }[]; hue: string; label: string }> = ({ values, hue, label }) => {
  const max = Math.max(8, ...values.map((v) => v.hours));
  return (
    <div className="flex h-28 items-end gap-1" role="img" aria-label={label}>
      {values.map((v) => (
        <div key={v.key} className="flex flex-1 flex-col items-center gap-1.5">
          <div className="w-full rounded-t-md" style={{ height: `${v.hours === 0 ? 3 : 8 + (v.hours / max) * 80}px`, background: hue, opacity: v.hours === 0 ? 0.2 : 0.95 }} />
          <span className="fa-dim text-[10px]">{new Date(`${v.key}T12:00:00`).getDate()}</span>
        </div>
      ))}
    </div>
  );
};

/** Points of hours-into-the-fast against a reading, as a small scatter with a line through it. */
const Scatter: React.FC<{ points: { x: number; y: number }[]; hue: string; unit: string; label: string }> = ({ points, hue, unit, label }) => {
  if (points.length === 0) return null;
  const w = 300;
  const h = 100;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x0 = 0;
  const x1 = Math.max(24, ...xs);
  const y0 = Math.min(...ys) * 0.9;
  const y1 = Math.max(...ys) * 1.1 || 1;
  const px = (x: number) => ((x - x0) / (x1 - x0)) * (w - 16) + 8;
  const py = (y: number) => h - 8 - ((y - y0) / Math.max(0.0001, y1 - y0)) * (h - 16);
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-full" role="img" aria-label={label} preserveAspectRatio="none">
        <polyline points={points.map((p) => `${px(p.x)},${py(p.y)}`).join(' ')} fill="none" stroke={hue} strokeWidth="2" strokeOpacity="0.6" vectorEffect="non-scaling-stroke" />
        {points.map((p, i) => (
          <circle key={i} cx={px(p.x)} cy={py(p.y)} r="3.5" fill={hue} />
        ))}
      </svg>
      <figcaption className="fa-dim mt-1 flex justify-between text-xs">
        <span>0 h</span>
        <span>{unit}</span>
        <span>{Math.round(x1)} h</span>
      </figcaption>
    </figure>
  );
};

/**
 * Insights: how it is going (streak, success, hours, steadiness), what you spend time in, what you feel at each stage, and the
 * experimental Lab: patterns from your own sleep, workouts, weight and readings, always worded as patterns and never as causes.
 */
export const Insights: React.FC<{ ctx: FastCtx; onScreening: () => void }> = ({ ctx, onScreening }) => {
  const { sessions, extras, setExtras, sleepLogs, workouts, body, prefs, setPrefs } = ctx;
  const today = todayKey();
  const gentle = prefs.gentle;
  const stats = useMemo(() => fastingStats(sessions, today), [sessions, today]);
  const days = useMemo(() => fastingByDay(sessions, today, 14), [sessions, today]);
  const stages = useMemo(() => stageHours(sessions), [sessions]);
  const spread = useMemo(() => startSpread(sessions), [sessions]);
  const protocols = useMemo(() => byProtocol(sessions), [sessions]);
  const feelings = useMemo(() => feelingMap(sessions).filter((f) => f.checkIns > 0), [sessions]);
  const bed = useMemo(() => mealToBed(sessions, sleepLogs), [sessions, sleepLogs]);
  const workout = useMemo(() => fastedWorkouts(sessions, workouts), [sessions, workouts]);
  const weeks = useMemo(() => weeklyWeight(sessions, body, today, 8), [sessions, body, today]);
  const ketones = useMemo(() => ketoneSeries(sessions, extras), [sessions, extras]);
  const glucose = useMemo(() => glucoseSeries(sessions, extras), [sessions, extras]);
  const waves = useMemo(() => hungerStats(extras), [extras]);
  const active = sessions.find((s) => !s.isCompleted);
  const [ketone, setKetone] = useState('');
  const [gluc, setGluc] = useState('');
  const done = sessions.filter((s) => s.isCompleted).length;
  const maxStage = Math.max(1, ...stages.map((s) => s.hours));
  const weighed = weeks.filter((w) => w.avgWeightKg !== null);

  return (
    <div className="fa-scroll">
      <h1 className="fa-h1 mt-3">Insights</h1>
      {done === 0 ? (
        <p className="fa-dim mt-2 text-sm leading-relaxed">Finish a fast and this fills in: how steady you are, what you feel at each stage, and patterns with your sleep and workouts.</p>
      ) : (
        <>
          {!gentle && (
            <div className="fa-card mt-4 grid grid-cols-3 gap-y-4 text-center">
              <div>
                <div className="fa-num">{stats.streakDays}</div>
                <div className="fa-dim text-xs">day streak</div>
              </div>
              <div>
                <div className="fa-num">{stats.successRate}%</div>
                <div className="fa-dim text-xs">goals met</div>
              </div>
              <div>
                <div className="fa-num">{stats.total}</div>
                <div className="fa-dim text-xs">fasts</div>
              </div>
              <div>
                <div className="fa-num">{hoursText(stats.avgHours)}</div>
                <div className="fa-dim text-xs">average</div>
              </div>
              <div>
                <div className="fa-num">{hoursText(stats.longestHours)}</div>
                <div className="fa-dim text-xs">longest</div>
              </div>
              <div>
                <div className="fa-num">{Math.round(stats.totalHours)}</div>
                <div className="fa-dim text-xs">hours in all</div>
              </div>
            </div>
          )}

          <SectionTitle>The last 14 days</SectionTitle>
          <div className="fa-card">
            <Bars values={days} hue={ctx.accent} label={`Hours fasted each day for the last 14 days`} />
          </div>

          {!gentle && (
            <>
              <SectionTitle>Time in each stage</SectionTitle>
              <div className="fa-card space-y-2.5">
                {stages.map((s) => {
                  const st = STAGES.find((x) => x.id === s.id);
                  return (
                    <div key={s.id}>
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold">{s.name}</span>
                        <span className="fa-dim tabular-nums">{Math.round(s.hours)} h</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full" style={{ background: 'rgba(var(--fa-tint),0.08)' }}>
                        <div className="h-full rounded-full" style={{ width: `${(s.hours / maxStage) * 100}%`, background: st?.hue }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {spread && (
            <>
              <SectionTitle>How steady you are</SectionTitle>
              <div className="fa-card">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-lg font-extrabold">{spread.label}</span>
                  <span className="fa-dim text-xs">usually start around {spread.avgStart}</span>
                </div>
                <p className="fa-dim mt-1 text-xs leading-relaxed">Your start time varies by about {spread.stdMin} minutes across your last {spread.n} fasts. A steadier rhythm is easier to keep.</p>
              </div>
            </>
          )}

          {protocols.length > 0 && !gentle && (
            <>
              <SectionTitle>By fast</SectionTitle>
              <ul className="space-y-2">
                {protocols.map((p) => (
                  <li key={p.name} className="fa-card flex items-center justify-between gap-3 !py-3">
                    <span className="text-sm font-bold">{p.name}</span>
                    <span className="fa-dim text-xs">
                      {p.count} {p.count === 1 ? 'fast' : 'fasts'} · {p.rate}% reached the goal
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {feelings.length > 0 && (
            <>
              <SectionTitle>How you feel at each stage</SectionTitle>
              <ul className="space-y-2">
                {feelings.map((f) => (
                  <li key={f.stageId} className="fa-card !py-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-bold">{f.name}</span>
                      <span className="fa-dim text-xs">{f.checkIns} check-ins</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {f.tags.slice(0, 4).map((t) => {
                        const tag = FEELING_TAGS.find((x) => x.id === t.id);
                        return (
                          <span key={t.id} className="fa-tag" style={{ color: tag?.tone === 'good' ? 'var(--fa-good)' : 'var(--fa-warn)' }}>
                            {tag?.label ?? t.id} {t.share}%
                          </span>
                        );
                      })}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      <SectionTitle right={<span className="fa-tag inline-flex items-center gap-1" style={{ color: 'var(--fa-lab)' }}><FlaskConical className="h-3 w-3" aria-hidden="true" /> Experimental</span>}>
        Lab
      </SectionTitle>
      <p className="fa-dim -mt-1 mb-3 px-1 text-xs leading-relaxed">Patterns found in your own numbers, on this phone. They show what went together, not what caused what, and they need enough days to say anything.</p>

      <section className="fa-card" aria-label="Last meal and sleep">
        <h3 className="text-sm font-bold">Last meal and sleep</h3>
        {bed ? (
          <p className="mt-2 text-sm leading-relaxed">
            On the {bed.longGap.n} nights you went to bed three or more hours after your last meal you slept {hoursText(bed.longGap.avg / 60)} (quality {bed.longGap.avgQuality}/5). On the {bed.shortGap.n} nights with a shorter gap, {hoursText(bed.shortGap.avg / 60)} (quality {bed.shortGap.avgQuality}/5).
            {Math.abs(bed.diffMin) >= 10 ? ` That is ${Math.abs(bed.diffMin)} minutes ${bed.diffMin > 0 ? 'more' : 'less'} after the longer gap.` : ' Not much different.'}
          </p>
        ) : (
          <p className="fa-dim mt-2 text-sm">Needs at least three evening fasts on each side and the matching nights of sleep. Start your fast when you finish your last meal for this to work.</p>
        )}
      </section>

      <section className="fa-card mt-3" aria-label="Fasted workouts">
        <h3 className="text-sm font-bold">Workouts while fasting</h3>
        {workout ? (
          <p className="mt-2 text-sm leading-relaxed">
            {workout.fasted.n} workouts 12 or more hours into a fast averaged {workout.fasted.avg} minutes{workout.fasted.avgHr ? ` at ${workout.fasted.avgHr} bpm` : ''}; {workout.fed.n} others averaged {workout.fed.avg} minutes{workout.fed.avgHr ? ` at ${workout.fed.avgHr} bpm` : ''}.
          </p>
        ) : (
          <p className="fa-dim mt-2 text-sm">Needs three workouts done well into a fast (12 hours or more) and three outside one. Strength sessions are left out.</p>
        )}
      </section>

      <section className="fa-card mt-3" aria-label="Weight and fasting">
        <h3 className="text-sm font-bold">Weight and fasted hours, by week</h3>
        {weighed.length >= 2 ? (
          <ul className="mt-2 space-y-1.5">
            {weeks.map((w) => (
              <li key={w.weekStart} className="flex items-center justify-between gap-3 text-xs tabular-nums">
                <span className="fa-dim w-16">{new Date(`${w.weekStart}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                <span className="flex-1 text-right">{w.fastedHours} h fasted</span>
                <span className="w-16 text-right font-semibold">{w.avgWeightKg !== null ? `${kgToDisplay(w.avgWeightKg, ctx.units)} ${weightUnit(ctx.units)}` : '–'}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="fa-dim mt-2 text-sm">Log your weight on two different weeks (Progress, Body) and the weeks line up here with the hours you fasted. Weight moves for many reasons, so read it over months.</p>
        )}
      </section>

      <section className="fa-card mt-3" aria-label="Ketones and glucose">
        <h3 className="text-sm font-bold">Ketones and glucose</h3>
        <p className="fa-dim mt-1 text-xs leading-relaxed">For people who measure with a meter. Log a reading during a fast and it is charted by how many hours in you were. This app does not interpret readings.</p>
        {active ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const v = Number(ketone.replace(',', '.'));
                if (!(v > 0 && v < 10)) return;
                setExtras((all) => withExtra(all, active.id, (x) => ({ ...x, ketones: [...x.ketones, { at: Date.now(), mmol: v }] })));
                setKetone('');
              }}
            >
              <input className="fa-input !min-h-11 min-w-0" inputMode="decimal" placeholder="Ketones mmol/L" value={ketone} onChange={(e) => setKetone(e.target.value)} aria-label="Ketone reading in millimoles per liter" />
              <button type="submit" className="fa-btn fa-btn-small shrink-0" disabled={!ketone}>
                Log
              </button>
            </form>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const v = Number(gluc.replace(',', '.'));
                const mgdl = glucoseFromDisplay(v, ctx.units);
                if (!(mgdl >= 20 && mgdl < 600)) return;
                setExtras((all) => withExtra(all, active.id, (x) => ({ ...x, glucose: [...x.glucose, { at: Date.now(), mgdl: Math.round(mgdl * 10) / 10 }] })));
                setGluc('');
              }}
            >
              <input className="fa-input !min-h-11 min-w-0" inputMode="decimal" placeholder={`Glucose ${glucoseUnit(ctx.units)}`} value={gluc} onChange={(e) => setGluc(e.target.value)} aria-label={`Glucose reading in ${ctx.units === 'imperial' ? 'milligrams per deciliter' : 'millimoles per liter'}`} />
              <button type="submit" className="fa-btn fa-btn-small shrink-0" disabled={!gluc}>
                Log
              </button>
            </form>
          </div>
        ) : (
          <p className="fa-dim mt-2 text-xs">Start a fast to log a reading.</p>
        )}
        {ketones.length > 0 && (
          <div className="mt-3">
            <div className="fa-eyebrow mb-1">Ketones</div>
            <Scatter points={ketones.map((k) => ({ x: k.hours, y: k.mmol }))} hue={ctx.accent} unit="mmol/L" label="Ketone readings by hours into the fast" />
          </div>
        )}
        {glucose.length > 0 && (
          <div className="mt-3">
            <div className="fa-eyebrow mb-1">Glucose</div>
            <Scatter points={glucose.map((g) => ({ x: g.hours, y: glucoseToDisplay(g.mgdl, ctx.units) }))} hue="var(--fa-info)" unit={glucoseUnit(ctx.units)} label="Glucose readings by hours into the fast" />
          </div>
        )}
        <p className="fa-dim mt-3 text-xs">If you have diabetes or take medicines that lower blood sugar, talk to your doctor about fasting and about what your readings mean.</p>
      </section>

      <section className="fa-card mt-3" aria-label="Hunger waves">
        <h3 className="text-sm font-bold">Hunger waves</h3>
        {waves.total > 0 ? (
          <p className="mt-2 text-sm leading-relaxed">
            You paused for {waves.total} hunger {waves.total === 1 ? 'wave' : 'waves'} and rode out {waves.rode} of them.
          </p>
        ) : (
          <p className="fa-dim mt-2 text-sm">When hunger hits during a fast, tap "Hunger wave" for a ten-minute pause. It keeps count of how many you ride out.</p>
        )}
      </section>

      <SectionTitle>Settings</SectionTitle>
      <LookPicker app="fasting" p="fa" look={ctx.miniLook.look} onChange={ctx.miniLook.setLook} appAccent={ctx.appAccent} />
      <div className="h-3" />
      <section className="fa-card" aria-label="Units">
        <h3 className="text-sm font-bold">Units</h3>
        <p className="fa-dim mt-1 text-xs leading-relaxed">For water, weight and glucose in Fasting. Your logs are kept the same either way.</p>
        <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label="Units">
          <button type="button" className="fa-chip justify-center" aria-pressed={ctx.units === 'imperial'} onClick={() => setPrefs({ ...prefs, units: 'imperial' })}>
            Imperial · lb, fl oz
          </button>
          <button type="button" className="fa-chip justify-center" aria-pressed={ctx.units === 'metric'} onClick={() => setPrefs({ ...prefs, units: 'metric' })}>
            Metric · kg, ml
          </button>
        </div>
      </section>
      <div className="fa-card mt-3 !p-0">
        <FaToggle label="Electrolyte reminders" sub="Water and salts check every few hours on fasts of 24 hours or more" on={prefs.electrolytes !== false} onChange={(v) => { setPrefs({ ...prefs, electrolytes: v }); window.dispatchEvent(new CustomEvent('kyfit-fasting-prefs')); }} />
        <FaToggle label="Gentle mode" sub="Show times and your plan only: no stages, percentages, streaks or success rates" on={gentle} onChange={(v) => setPrefs({ ...prefs, gentle: v })} />
      </div>
      <button type="button" className="fa-btn fa-btn-quiet mt-3 w-full" onClick={onScreening}>
        <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Before you start: review my answers
      </button>
      <p className="fa-dim mt-4 px-1 text-xs leading-relaxed">This app tracks fasting. It does not give medical advice and is not a treatment. Fasting is not right for everyone. Stop at any time and eat if you feel unwell.</p>
      <div className="h-6" />
    </div>
  );
};
