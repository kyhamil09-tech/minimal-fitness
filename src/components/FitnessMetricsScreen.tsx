import React, { useMemo, useState } from 'react';
import { Activity, ArrowDown, ArrowUp, Flame, Footprints, Gauge, HeartPulse, Mountain, Route, Timer } from 'lucide-react';
import { ColorPalette } from '../types/theme';
import { Goals, UnitSystem, UserProfile } from '../types/tracking';
import { WorkoutSession } from '../types/health';
import type { HcVitals } from '../hooks/useAutomaticData';
import { BarChart, EmptyState, LineChart, RangeChart } from './ui/charts';
import { DayFitness, OwnDay, buildFitnessDays, summarize } from '../lib/fitnessMetrics';
import { distanceUnit, kmToDisplay } from '../lib/units';
import { currentRestingHr, getMaxHr } from '../lib/calc';
import { trainingLoadStatus } from '../lib/trainingLoad';
import { EfficiencyCard, FormCard, RacePredictionsCard, RecoveryNowCard } from './TrainingModelCards';
import { estimateVo2Max } from '../lib/vo2Estimate';
import { shortMonthDay, shortWeekday, toDateKey, todayKey } from '../lib/dates';
import { Segmented } from './ui/Segmented';

interface FitnessMetricsScreenProps {
  theme: ColorPalette;
  goals: Goals;
  profile: UserProfile;
  /** Steps per day from every source (phone, watch, Health Connect). */
  steps: Record<string, number>;
  vitals: HcVitals | null;
  /** Daily numbers measured by the app's own watch and phone sensors. */
  own: Record<string, OwnDay>;
  workouts: WorkoutSession[];
  /** Health Connect is connected and readable. */
  hcConnected: boolean;
}

type Range = 7 | 14 | 30;

interface MetricCardProps {
  theme: ColorPalette;
  icon: React.ReactNode;
  title: string;
  color: string;
  value: string;
  unit: string;
  caption: string;
  stats: string;
  trendPct?: number;
  /** Whether a rise in this number is a good thing. */
  upIsGood?: boolean;
  children: React.ReactNode;
}

const MetricCard: React.FC<MetricCardProps> = ({ theme, icon, title, color, value, unit, caption, stats, trendPct, upIsGood = true, children }) => {
  const trendGood = trendPct === undefined ? true : upIsGood ? trendPct >= 0 : trendPct <= 0;
  return (
    <section className="rounded-3xl border p-5" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }} aria-label={title}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: `${color}22`, color }}>
            {icon}
          </span>
          <span className="text-sm font-bold text-neutral-200">{title}</span>
        </div>
        {trendPct !== undefined && trendPct !== 0 && (
          <span
            className="flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-bold"
            style={{ background: trendGood ? '#81C99524' : '#F28B8224', color: trendGood ? '#81C995' : '#F28B82' }}
            title="Last 7 days compared with the days before"
          >
            {trendPct > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
            {Math.abs(trendPct)}%
          </span>
        )}
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="hero-num text-[2.6rem] leading-none text-white">{value}</span>
        <span className="text-sm text-[#9AA3B2]">{unit}</span>
        <span className="ml-auto text-xs text-[#9AA3B2]">{caption}</span>
      </div>
      <p className="mt-1 text-xs text-neutral-400">{stats}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
};

const int = (v: number) => Math.round(v).toLocaleString();

export const FitnessMetricsScreen: React.FC<FitnessMetricsScreenProps> = ({ theme, goals, profile, steps, vitals, own, workouts, hcConnected }) => {
  const [range, setRange] = useState<Range>(7);
  const today = todayKey();
  const units: UnitSystem = profile.units;

  const days = useMemo(
    () =>
      buildFitnessDays({
        days: range,
        today,
        steps,
        hcDaily: vitals?.daily ?? {},
        hcFitness: vitals?.fitness ?? {},
        own,
        workouts,
      }),
    [range, today, steps, vitals, own, workouts]
  );

  const label = (d: DayFitness) => (range <= 7 ? shortWeekday(d.date) : String(Number(d.date.slice(8, 10))));
  const caption = (date?: string) => (!date ? '' : date === today ? 'Today' : shortMonthDay(date));
  const bars = (pick: (d: DayFitness) => number | undefined, scale = (v: number) => v) =>
    days.map((d, i) => ({ label: label(d), value: scale(pick(d) ?? 0), highlight: i === days.length - 1 }));
  const points = (pick: (d: DayFitness) => number | undefined) =>
    days.filter((d) => pick(d) !== undefined).map((d) => ({ label: shortMonthDay(d.date), value: pick(d) as number }));

  const stepsS = summarize(days, (d) => d.steps);
  const distS = summarize(days, (d) => d.distanceKm);
  const kcalS = summarize(days, (d) => d.kcalTotal ?? d.kcalActive);
  const activeS = summarize(days, (d) => d.kcalActive);
  const exS = summarize(days, (d) => d.exerciseMin);
  const floorsS = summarize(days, (d) => d.floors);
  const restS = summarize(days, (d) => d.restingHr);
  const hrS = summarize(days, (d) => d.hrAvg);
  const hrvS = summarize(days, (d) => d.hrvMs);
  const load = useMemo(() => trainingLoadStatus(workouts, today), [workouts, today]);
  const loadColor = { neutral: '#8AB4F8', good: '#81C995', warn: '#FDD663', bad: '#F28B82' }[load.tone];
  const vo2 = vitals?.vo2 ?? [];
  // Google does not always write VO2 max: fall back to an estimate from your own runs.
  const vo2Own = useMemo(() => (vo2.length === 0 ? estimateVo2Max(workouts, getMaxHr(profile), currentRestingHr()) : null), [vo2.length, workouts, profile]);
  const vo2Points = vo2.slice(-12).map(([t, v]) => ({ label: shortMonthDay(toDateKey(t)), value: v }));
  const vo2Latest = vo2.length ? vo2[vo2.length - 1] : undefined;
  const dist = (km: number) => kmToDisplay(km, units, 1);

  const latestHr = [...days].reverse().find((d) => d.hrMin !== undefined && d.hrMax !== undefined);
  const missing: string[] = [];
  if (floorsS.count === 0) missing.push('Floors climbed');
  if (hrvS.count === 0) missing.push('Heart rate variability');
  if (vo2.length === 0 && !vo2Own) missing.push('Cardio fitness (VO2 max)');
  if (restS.count === 0) missing.push('Resting heart rate');

  const anyData = [stepsS, distS, kcalS, exS, restS, hrS].some((s) => s.count > 0) || vo2.length > 0 || load.id !== 'none' || !!vo2Own;

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="gh-title">Fitness metrics</h2>
          <p className="mt-0.5 text-xs text-[#9AA3B2]">From Health Connect, your watch and this app's own sensors.</p>
        </div>
        <Segmented<string>
          ariaLabel="Time range"
          size="sm"
          semantics="group"
          fill={false}
          value={String(range)}
          onChange={(id) => setRange(Number(id) as typeof range)}
          options={['7', '14', '30'].map((n) => ({ id: n, label: `${n}d` }))}
        />
      </div>

      {!anyData && (
        <section className="rounded-3xl border p-6" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
          <EmptyState
            title="No fitness data yet"
            hint={
              hcConnected
                ? 'Health Connect is connected. Wear your watch and the numbers appear after the next sync.'
                : 'Connect Health Connect in Settings, or wear your watch with the app so it can collect its own readings.'
            }
          />
        </section>
      )}

      {stepsS.count > 0 && (
        <MetricCard
          theme={theme}
          icon={<Footprints className="h-3.5 w-3.5" />}
          title="Steps"
          color="#8AB4F8"
          value={int(stepsS.latest ?? 0)}
          unit="steps"
          caption={caption(stepsS.latestDate)}
          stats={`${Math.round(((stepsS.latest ?? 0) / Math.max(1, goals.dailySteps)) * 100)}% of ${int(goals.dailySteps)} goal · avg ${int(stepsS.avg ?? 0)} · best ${int(stepsS.max ?? 0)}`}
          trendPct={stepsS.trendPct}
        >
          <BarChart data={bars((d) => d.steps)} color="#8AB4F8" goal={goals.dailySteps} format={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))} ariaLabel="Steps per day" />
        </MetricCard>
      )}

      {distS.count > 0 && (
        <MetricCard
          theme={theme}
          icon={<Route className="h-3.5 w-3.5" />}
          title="Distance"
          color="#78D9EC"
          value={dist(distS.latest ?? 0).toFixed(1)}
          unit={distanceUnit(units)}
          caption={caption(distS.latestDate)}
          stats={`Avg ${dist(distS.avg ?? 0).toFixed(1)} ${distanceUnit(units)} · best ${dist(distS.max ?? 0).toFixed(1)} ${distanceUnit(units)}`}
          trendPct={distS.trendPct}
        >
          <BarChart data={bars((d) => d.distanceKm, dist)} color="#78D9EC" format={(v) => v.toFixed(1)} ariaLabel="Distance per day" />
        </MetricCard>
      )}

      {kcalS.count > 0 && (
        <MetricCard
          theme={theme}
          icon={<Flame className="h-3.5 w-3.5" />}
          title="Calories burned"
          color="#FCAD70"
          value={int(kcalS.latest ?? 0)}
          unit="kcal"
          caption={caption(kcalS.latestDate)}
          stats={`${activeS.count > 0 ? `Active ${int(activeS.latest ?? 0)} kcal · ` : ''}avg ${int(kcalS.avg ?? 0)} per day`}
          trendPct={kcalS.trendPct}
        >
          <BarChart data={bars((d) => d.kcalTotal ?? d.kcalActive)} color="#FCAD70" format={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))} ariaLabel="Calories burned per day" />
        </MetricCard>
      )}

      {exS.count > 0 && (
        <MetricCard
          theme={theme}
          icon={<Timer className="h-3.5 w-3.5" />}
          title="Exercise minutes"
          color={theme.primary}
          value={int(exS.latest ?? 0)}
          unit="min"
          caption={caption(exS.latestDate)}
          stats={`Avg ${int(exS.avg ?? 0)} min · ${int(days.reduce((s, d) => s + (d.exerciseMin ?? 0), 0))} min in ${range} days`}
          trendPct={exS.trendPct}
        >
          <BarChart data={bars((d) => d.exerciseMin)} color={theme.primary} goal={30} ariaLabel="Exercise minutes per day" />
          <p className="mt-1 text-xs text-neutral-400">Workout time from your watch, other apps and this app. Dashed line is 30 minutes.</p>
        </MetricCard>
      )}

      {load.id !== 'none' && (
        <MetricCard
          theme={theme}
          icon={<Activity className="h-3.5 w-3.5" />}
          title="Training load"
          color={loadColor}
          value={int(load.acute)}
          unit="load · last 7 days"
          caption={load.ratio !== undefined ? `${load.ratio.toFixed(2)}× your usual` : 'Building'}
          stats={`Your usual week is about ${int(load.chronicWeekly)} · ${load.label}`}
        >
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: `${loadColor}26`, color: loadColor }}>
              {load.label}
            </span>
          </div>
          <BarChart
            data={load.daily.map((d, i) => ({ label: i % 7 === 0 ? shortMonthDay(d.date) : '', value: d.load, highlight: i === load.daily.length - 1 }))}
            color={loadColor}
            format={(v) => String(Math.round(v))}
            ariaLabel="Training load per day over the last four weeks"
          />
          <p className="mt-1.5 text-xs leading-relaxed text-neutral-300">{load.message}</p>
          <p className="mt-1 text-xs text-neutral-400">
            Load is each workout's score from its length and heart rate (TRIMP). The last seven days are compared with your usual week over the past four. General guidance, not medical advice.
          </p>
        </MetricCard>
      )}

      <RecoveryNowCard theme={theme} workouts={workouts} />
      <FormCard theme={theme} workouts={workouts} />
      <EfficiencyCard theme={theme} workouts={workouts} units={units} />
      <RacePredictionsCard theme={theme} workouts={workouts} units={units} />

      {floorsS.count > 0 && (
        <MetricCard
          theme={theme}
          icon={<Mountain className="h-3.5 w-3.5" />}
          title="Floors climbed"
          color="#C58AF9"
          value={int(floorsS.latest ?? 0)}
          unit="floors"
          caption={caption(floorsS.latestDate)}
          stats={`Avg ${int(floorsS.avg ?? 0)} per day · best ${int(floorsS.max ?? 0)}`}
          trendPct={floorsS.trendPct}
        >
          <BarChart data={bars((d) => d.floors)} color="#C58AF9" ariaLabel="Floors climbed per day" />
        </MetricCard>
      )}

      {restS.count > 0 && (
        <MetricCard
          theme={theme}
          icon={<HeartPulse className="h-3.5 w-3.5" />}
          title="Resting heart rate"
          color="#F28B82"
          value={int(restS.latest ?? 0)}
          unit="bpm"
          caption={caption(restS.latestDate)}
          stats={`Avg ${int(restS.avg ?? 0)} · lowest ${int(restS.min ?? 0)} · highest ${int(restS.max ?? 0)}`}
          trendPct={restS.trendPct}
          upIsGood={false}
        >
          <LineChart points={points((d) => d.restingHr)} color="#F28B82" unit="" ariaLabel="Resting heart rate per day" />
          <p className="mt-1 text-xs text-neutral-400">A steadily falling resting heart rate usually means your fitness is improving.</p>
        </MetricCard>
      )}

      {latestHr && (
        <MetricCard
          theme={theme}
          icon={<Activity className="h-3.5 w-3.5" />}
          title="Heart rate range"
          color="#F28B82"
          value={`${latestHr.hrMin}–${latestHr.hrMax}`}
          unit="bpm"
          caption={caption(latestHr.date)}
          stats={hrS.count > 0 ? `Daily average ${int(hrS.avg ?? 0)} bpm` : 'Lowest to highest reading each day'}
        >
          <RangeChart data={days.map((d) => ({ label: label(d), min: d.hrMin, max: d.hrMax, avg: d.hrAvg }))} color="#F28B82" ariaLabel="Heart rate range per day" />
          <p className="mt-1 text-xs text-neutral-400">Each bar runs from the day's lowest to highest reading; the white tick is the average.</p>
        </MetricCard>
      )}

      {hrvS.count > 0 && (
        <MetricCard
          theme={theme}
          icon={<Activity className="h-3.5 w-3.5" />}
          title="Heart rate variability"
          color="#81C995"
          value={int(hrvS.latest ?? 0)}
          unit="ms"
          caption={caption(hrvS.latestDate)}
          stats={`Avg ${int(hrvS.avg ?? 0)} ms · range ${int(hrvS.min ?? 0)}–${int(hrvS.max ?? 0)}`}
          trendPct={hrvS.trendPct}
        >
          <LineChart points={points((d) => d.hrvMs)} color="#81C995" unit="" ariaLabel="Heart rate variability per day" />
          <p className="mt-1 text-xs text-neutral-400">HRV is personal: watch your own trend, not other people's numbers.</p>
        </MetricCard>
      )}

      {vo2Latest && (
        <MetricCard
          theme={theme}
          icon={<Gauge className="h-3.5 w-3.5" />}
          title="Cardio fitness (VO2 max)"
          color="#FDD663"
          value={vo2Latest[1].toFixed(1)}
          unit="ml/kg/min"
          caption={shortMonthDay(toDateKey(vo2Latest[0]))}
          stats={vo2.length > 1 ? `${vo2.length} readings · first ${vo2[0][1].toFixed(1)} · best ${Math.max(...vo2.map((r) => r[1])).toFixed(1)}` : 'First reading'}
        >
          <LineChart points={vo2Points} color="#FDD663" unit="" ariaLabel="VO2 max over time" />
          <p className="mt-1 text-xs text-neutral-400">Estimated by your watch from outdoor runs and walks; higher is fitter.</p>
        </MetricCard>
      )}

      {vo2Own && (
        <MetricCard
          theme={theme}
          icon={<Gauge className="h-3.5 w-3.5" />}
          title="Cardio fitness (estimate)"
          color="#FDD663"
          value={vo2Own.value.toFixed(1)}
          unit="ml/kg/min"
          caption={shortMonthDay(toDateKey(vo2Own.at))}
          stats={`Estimated from your last ${vo2Own.runs} run${vo2Own.runs === 1 ? '' : 's'} with a heart-rate sensor`}
        >
          <p className="text-xs leading-relaxed text-neutral-400">
            Your watch has not shared a VO2 max, so this is the app's own estimate from your running pace against how hard your heart worked. It assumes steady, flat runs, so treat it as a rough guide; a watch's own figure or a lab test is more accurate.
          </p>
        </MetricCard>
      )}

      {anyData && missing.length > 0 && (
        <section className="rounded-3xl border p-5" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
          <div className="text-sm font-bold text-neutral-200">Not available yet</div>
          <p className="mt-2 text-xs leading-relaxed text-neutral-300">{missing.join(' · ')}</p>
          <p className="mt-2 text-xs leading-relaxed text-neutral-400">
            {hcConnected
              ? 'Health Connect has no readings for these. Your watch records them over time, and some need a recent outdoor workout or a night of wear.'
              : 'Connect Health Connect in Settings to read these from your watch.'}
          </p>
        </section>
      )}

      <p className="px-4 text-center text-xs leading-relaxed text-neutral-400">
        Google's own scores such as Daily Readiness, Cardio Load and Active Zone Minutes are not shared with other apps, so they are not shown here. Fitness numbers are
        for general information, not medical advice.
      </p>
    </div>
  );
};
