import React, { useMemo } from 'react';
import { Activity, BatteryCharging, Gauge, Timer, TrendingUp } from 'lucide-react';
import { ColorPalette } from '../types/theme';
import { UnitSystem } from '../types/tracking';
import { WorkoutSession } from '../types/health';
import { LineChart } from './ui/charts';
import { banister, formState } from '../lib/banister';
import { dailyLoad } from '../lib/trainingLoad';
import { personalBests } from '../lib/workoutStats';
import { formatRaceTime, predictRaces } from '../lib/racePrediction';
import { efficiencyTrend } from '../lib/aerobicTrend';
import { recoveryNow } from '../lib/recovery';
import { driftLabel } from '../lib/efficiency';
import { shortMonthDay, toDateKey, todayKey } from '../lib/dates';
import { distanceUnit } from '../lib/units';

const TONE = { neutral: '#8AB4F8', good: '#81C995', warn: '#FDD663', bad: '#F28B82' } as const;

const Shell: React.FC<{ theme: ColorPalette; icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ theme, icon, title, children }) => (
  <section className="rounded-3xl border p-5" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-neutral-400">
      {icon}
      {title}
    </div>
    <div className="mt-3">{children}</div>
  </section>
);

/** How long until the hardest session of the last three days is recovered from, counting down. Hidden when nothing recent has a load. */
export const RecoveryNowCard: React.FC<{ theme: ColorPalette; workouts: WorkoutSession[] }> = ({ theme, workouts }) => {
  const r = useMemo(() => recoveryNow(workouts, Date.now()), [workouts]);
  if (!r) return null;
  const done = r.hoursLeft <= 0;
  const tone = done ? TONE.good : r.hoursLeft > 30 ? TONE.warn : TONE.neutral;
  return (
    <Shell theme={theme} icon={<BatteryCharging className="h-3.5 w-3.5" />} title="Recovery">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-3xl font-black italic tabular-nums" style={{ color: tone }}>
            {done ? 'Recovered' : `${r.hoursLeft} h`}
          </div>
          <div className="text-xs text-neutral-400">{done ? 'Ready for another hard session.' : 'until another hard session feels good'}</div>
        </div>
        <div className="text-right text-xs text-neutral-400">
          Set by your {r.workout.type.toLowerCase()}
          <br />
          {shortMonthDay(toDateKey(r.workout.startedAt as number))} · {r.label.replace('-', ' ')}
        </div>
      </div>
      <p className="mt-2 text-xs text-neutral-400">A rule of thumb from how hard each session was for you. An easy day is always fine. Not medical advice.</p>
    </Shell>
  );
};

/** Fitness, fatigue and form from the Banister model, over the last 90 days. */
export const FormCard: React.FC<{ theme: ColorPalette; workouts: WorkoutSession[] }> = ({ theme, workouts }) => {
  const model = useMemo(() => {
    const today = todayKey();
    const loaded = workouts.filter((w) => w.startedAt && w.cardioLoadPoints);
    if (loaded.length < 3) return null;
    const first = toDateKey(Math.min(...loaded.map((w) => w.startedAt as number)));
    const spanDays = Math.round((new Date(`${today}T12:00:00`).getTime() - new Date(`${first}T12:00:00`).getTime()) / 86_400_000) + 1;
    if (spanDays < 14) return null;
    // Start far enough back for the 42-day average to settle, show the last 90 days.
    const series = banister(dailyLoad(workouts, Math.min(180, spanDays + 7), today));
    const last = series[series.length - 1];
    return { shown: series.slice(-90), last, state: formState(last.form, last.fitness) };
  }, [workouts]);

  if (!model) return null;
  const { shown, last, state } = model;
  const color = TONE[state.tone];
  return (
    <Shell theme={theme} icon={<TrendingUp className="h-3.5 w-3.5" />} title="Fitness, fatigue and form">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-2xl glass-inset p-2.5">
          <div className="text-xs text-neutral-400">Fitness</div>
          <div className="text-xl font-semibold text-white tabular-nums">{Math.round(last.fitness)}</div>
          <div className="text-xs text-neutral-400">6-week build</div>
        </div>
        <div className="rounded-2xl glass-inset p-2.5">
          <div className="text-xs text-neutral-400">Fatigue</div>
          <div className="text-xl font-semibold text-white tabular-nums">{Math.round(last.fatigue)}</div>
          <div className="text-xs text-neutral-400">1-week load</div>
        </div>
        <div className="rounded-2xl glass-inset p-2.5">
          <div className="text-xs text-neutral-400">Form</div>
          <div className="text-xl font-semibold tabular-nums" style={{ color }}>
            {last.form > 0 ? '+' : ''}
            {Math.round(last.form)}
          </div>
          <div className="text-xs" style={{ color }}>
            {state.label}
          </div>
        </div>
      </div>
      <div className="mt-3">
        <div className="text-xs text-neutral-400 mb-1">Form over 90 days (above zero is rested)</div>
        <LineChart
          points={shown.filter((_, i) => i % 3 === 0 || i === shown.length - 1).map((d) => ({ label: shortMonthDay(d.date), value: Math.round(d.form * 10) / 10 }))}
          color={color}
          unit=""
          ariaLabel="Form over the last 90 days"
        />
      </div>
      <p className="mt-2 text-xs leading-relaxed text-neutral-300">{state.message}</p>
      <p className="mt-1 text-xs text-neutral-400">
        The Banister model: each workout's load builds fitness slowly (42-day average) and fatigue quickly (7-day average). Form is fitness minus fatigue.
      </p>
    </Shell>
  );
};

/** Race times from your best recent efforts (VDOT, with Riegel for comparison). */
export const RacePredictionsCard: React.FC<{ theme: ColorPalette; workouts: WorkoutSession[]; units: UnitSystem }> = ({ theme, workouts }) => {
  const result = useMemo(() => {
    const cutoff = Date.now() - 120 * 86_400_000;
    const recent = workouts.filter((w) => (w.startedAt ?? 0) >= cutoff);
    const bests = personalBests(recent.length ? recent : workouts);
    return predictRaces(bests.map((b) => ({ distanceM: b.target.km * 1000, seconds: b.seconds })));
  }, [workouts]);
  if (!result) return null;
  const { basis, predictions } = result;
  return (
    <Shell theme={theme} icon={<Timer className="h-3.5 w-3.5" />} title="Race predictions">
      <div className="grid grid-cols-2 gap-2">
        {predictions.map((p) => (
          <div key={p.id} className="rounded-2xl glass-inset p-3">
            <div className="text-xs text-neutral-400">{p.label}</div>
            <div className="text-xl font-semibold text-white tabular-nums mt-0.5">{formatRaceTime(p.seconds)}</div>
            <div className="text-xs text-neutral-400 tabular-nums">Riegel {formatRaceTime(p.riegelSeconds)}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-neutral-300">
        Based on your best {basis.distanceM >= 1000 ? `${(basis.distanceM / 1000).toFixed(basis.distanceM % 1000 ? 1 : 0)} km` : `${basis.distanceM} m`} in {formatRaceTime(basis.seconds)} (VDOT {basis.vdot}).
        {basis.confidence === 'rough' ? ' This effort is short, so the longer races are only rough guesses.' : ''}
      </p>
      <p className="mt-1 text-xs text-neutral-400">VDOT is Jack Daniels' method. Predictions assume you have trained for the distance, a flat course and good conditions.</p>
    </Shell>
  );
};

/** Aerobic efficiency: speed per heartbeat across your runs, and cardiac drift on the latest long one. */
export const EfficiencyCard: React.FC<{ theme: ColorPalette; workouts: WorkoutSession[]; units: UnitSystem }> = ({ theme, workouts, units }) => {
  const trend = useMemo(() => efficiencyTrend(workouts), [workouts]);
  if (trend.history.length < 2 && !trend.latestDrift) return null;
  const pts = trend.history.slice(-14).map((h) => ({ label: shortMonthDay(toDateKey(h.at)), value: Math.round(h.adjustedEf * 100) / 100 }));
  const drift = trend.latestDrift?.drift;
  const dl = drift ? driftLabel(drift.decouplingPct) : null;
  void distanceUnit;
  void units;
  return (
    <Shell theme={theme} icon={<Gauge className="h-3.5 w-3.5" />} title="Aerobic efficiency">
      {trend.latest && (
        <div className="flex items-baseline gap-2">
          <span className="hero-num text-[2.4rem] leading-none text-white">{trend.latest.adjustedEf.toFixed(2)}</span>
          <span className="text-xs text-neutral-400">m per beat · latest run</span>
          {trend.changePct !== undefined && (
            <span className="ml-auto rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: trend.changePct >= 0 ? '#81C99524' : '#F28B8224', color: trend.changePct >= 0 ? '#81C995' : '#F28B82' }}>
              {trend.changePct >= 0 ? '+' : ''}
              {trend.changePct}%
            </span>
          )}
        </div>
      )}
      {pts.length >= 2 && (
        <div className="mt-2">
          <LineChart points={pts} color="#81C995" unit="" ariaLabel="Aerobic efficiency across recent runs" />
        </div>
      )}
      {drift && dl && (
        <div className="mt-3 rounded-2xl glass-inset p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-400">Heart-rate drift on your latest long run</span>
            <span className="text-xs font-bold" style={{ color: TONE[dl.tone] }}>
              {dl.label}
            </span>
          </div>
          <div className="mt-1 text-lg font-semibold text-white tabular-nums">
            {drift.decouplingPct > 0 ? '+' : ''}
            {drift.decouplingPct.toFixed(1)}%
            <span className="ml-2 text-xs font-normal text-neutral-400">
              heart rate {Math.round(drift.firstHr)} then {Math.round(drift.secondHr)} bpm
            </span>
          </div>
        </div>
      )}
      <p className="mt-2 text-xs leading-relaxed text-neutral-300">
        Higher means you cover more ground per heartbeat, which is what getting fitter looks like. Hills are adjusted for, so a hilly run and a flat one compare fairly.
        Drift under 5% means the run stayed inside your aerobic base.
      </p>
      <p className="mt-1 text-xs text-neutral-400 flex items-center gap-1">
        <Activity className="h-3 w-3" /> Needs runs or walks of 20+ minutes with a heart rate sensor.
      </p>
    </Shell>
  );
};
