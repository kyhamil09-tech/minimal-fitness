import React, { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowDown, ArrowUp, Droplets, Flame, Footprints, HeartPulse, Mountain, Route, Scale, Timer, Utensils, X } from 'lucide-react';
import { ColorPalette } from '../types/theme';
import { Goals, UnitSystem } from '../types/tracking';
import { BarChart, EmptyState, LineChart } from './ui/charts';
import { MetricId, SeriesInput, buildSeries, seriesStats } from '../lib/metricSeries';
import { distanceUnit, kgToDisplay, kmToDisplay, mlToDisplay, volumeUnit, weightUnit } from '../lib/units';
import { shortMonthDay, shortWeekday, todayKey } from '../lib/dates';

interface MetricDef {
  title: string;
  color: string;
  icon: React.ReactNode;
  /** Bars for amounts added up over a day, a line for readings. */
  chart: 'bar' | 'line';
  /** Whether a rise is good news (for the trend badge). */
  upIsGood: boolean;
  /** Whether the days add up to a total worth showing. */
  sums: boolean;
  explain: string;
}

const DEFS: Record<MetricId, MetricDef> = {
  steps: { title: 'Steps', color: '#8AB4F8', icon: <Footprints className="h-4 w-4" />, chart: 'bar', upIsGood: true, sums: true, explain: 'Counted by the source you chose in Settings, with any day or period you corrected already applied.' },
  distance: { title: 'Distance', color: '#78D9EC', icon: <Route className="h-4 w-4" />, chart: 'bar', upIsGood: true, sums: true, explain: 'Distance moved each day, from Health Connect, your watch and your recorded workouts. The largest source is used.' },
  kcal: { title: 'Calories burned', color: '#FCAD70', icon: <Flame className="h-4 w-4" />, chart: 'bar', upIsGood: true, sums: false, explain: 'Total energy your body used each day: resting plus active. The watch or Health Connect supplies it.' },
  active: { title: 'Active calories', color: '#FCAD70', icon: <Flame className="h-4 w-4" />, chart: 'bar', upIsGood: true, sums: true, explain: 'Calories burned by movement and exercise, not counting what your body uses at rest.' },
  exercise: { title: 'Exercise minutes', color: '#81C995', icon: <Timer className="h-4 w-4" />, chart: 'bar', upIsGood: true, sums: true, explain: 'Workout time from your watch, other apps and this app. The dashed line is 30 minutes, a common daily target.' },
  floors: { title: 'Floors climbed', color: '#C58AF9', icon: <Mountain className="h-4 w-4" />, chart: 'bar', upIsGood: true, sums: true, explain: 'Flights of stairs counted by the watch’s altimeter.' },
  resting: { title: 'Resting heart rate', color: '#F28B82', icon: <HeartPulse className="h-4 w-4" />, chart: 'line', upIsGood: false, sums: false, explain: 'Your lowest calm heart rate. A steadily falling number usually means your fitness is improving; a sudden rise can mean stress, illness or poor sleep.' },
  heart: { title: 'Average heart rate', color: '#F28B82', icon: <Activity className="h-4 w-4" />, chart: 'line', upIsGood: false, sums: false, explain: 'Your average heart rate over each whole day, including exercise.' },
  hrv: { title: 'Heart rate variability', color: '#81C995', icon: <Activity className="h-4 w-4" />, chart: 'line', upIsGood: true, sums: false, explain: 'The small beat-to-beat variation in your heart rate. It is personal: watch your own trend, not other people’s numbers.' },
  weight: { title: 'Weight', color: '#FDD663', icon: <Scale className="h-4 w-4" />, chart: 'line', upIsGood: false, sums: false, explain: 'Your weigh-ins from this app and from Health Connect. Day-to-day changes are mostly water, so look at the trend.' },
  water: { title: 'Water', color: '#7dd3fc', icon: <Droplets className="h-4 w-4" />, chart: 'bar', upIsGood: true, sums: true, explain: 'Water you logged each day.' },
  eaten: { title: 'Calories eaten', color: '#ffd23f', icon: <Utensils className="h-4 w-4" />, chart: 'bar', upIsGood: true, sums: true, explain: 'Food you logged each day. Days with nothing logged are left out of the average.' },
};

const RANGES = [7, 30, 90] as const;
type Range = (typeof RANGES)[number];

interface MetricDetailSheetProps {
  metric: MetricId;
  theme: ColorPalette;
  units: UnitSystem;
  goals: Goals;
  input: SeriesInput;
  onClose: () => void;
  /** An extra button under the numbers, such as "Edit today's steps". */
  action?: { label: string; onClick: () => void };
}

export const MetricDetailSheet: React.FC<MetricDetailSheetProps> = ({ metric, theme, units, goals, input, onClose, action }) => {
  const def = DEFS[metric];
  const [range, setRange] = useState<Range>(7);
  const today = todayKey();

  // The back button and Escape close the sheet.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const series = useMemo(() => buildSeries(metric, input, range, today), [metric, input, range, today]);
  const stats = useMemo(() => seriesStats(series), [series]);

  // Values are shown in the person's units and with the precision that suits the number.
  const show = (v: number | undefined): string => {
    if (v === undefined) return '—';
    switch (metric) {
      case 'distance':
        return kmToDisplay(v, units, 1).toFixed(1);
      case 'weight':
        return kgToDisplay(v, units, 1).toFixed(1);
      case 'water':
        return Math.round(mlToDisplay(v, units)).toLocaleString();
      case 'hrv':
        return v.toFixed(0);
      default:
        return Math.round(v).toLocaleString();
    }
  };
  const unit =
    metric === 'steps' ? 'steps'
      : metric === 'distance' ? distanceUnit(units)
        : metric === 'kcal' || metric === 'active' || metric === 'eaten' ? 'kcal'
          : metric === 'exercise' ? 'min'
            : metric === 'floors' ? 'floors'
              : metric === 'resting' || metric === 'heart' ? 'bpm'
                : metric === 'hrv' ? 'ms'
                  : metric === 'weight' ? weightUnit(units)
                    : volumeUnit(units);

  const goal =
    metric === 'steps' ? goals.dailySteps
      : metric === 'exercise' ? 30
        : metric === 'eaten' ? goals.dailyCalories
          : metric === 'water' ? goals.dailyWaterMl
            : undefined;
  const goalShown = goal === undefined ? undefined : metric === 'water' ? mlToDisplay(goal, units) : goal;

  // Convert once for charts so distance, weight and water read in the chosen units.
  const toUnit = (v: number) =>
    metric === 'distance' ? kmToDisplay(v, units, 2) : metric === 'weight' ? kgToDisplay(v, units, 2) : metric === 'water' ? mlToDisplay(v, units) : v;

  const label = (date: string) => (range <= 7 ? shortWeekday(date) : String(Number(date.slice(8, 10))));
  const bars = series.map((p, i) => ({ label: label(p.date), value: toUnit(p.value ?? 0), highlight: i === series.length - 1 }));
  const points = series.filter((p) => p.value !== undefined).map((p) => ({ label: shortMonthDay(p.date), value: toUnit(p.value as number) }));

  const trend = stats.trendPct;
  const trendGood = trend === undefined ? true : def.upIsGood ? trend >= 0 : trend <= 0;
  // For heart rate lower is the better extreme; for everything else higher is.
  const lowerIsBetter = metric === 'resting' || metric === 'heart';
  const bestLabel = lowerIsBetter ? 'Lowest' : metric === 'weight' || metric === 'hrv' ? 'Highest' : 'Best day';
  const bestValue = lowerIsBetter ? stats.min : stats.max;
  const when = (date?: string) => (!date ? '' : date === today ? 'Today' : shortMonthDay(date));

  const cell = 'rounded-2xl bg-black/40 border border-[#1A1E26] p-3';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={def.title}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm animate-fadeIn"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg max-h-[92dvh] overflow-y-auto rounded-t-[32px] border border-b-0 border-[#1A1E26] bg-[#0B0D11] p-5 pb-8 text-white shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: `${def.color}22`, color: def.color }}>
              {def.icon}
            </span>
            <h2 className="text-base font-bold">{def.title}</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-2 text-neutral-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 flex items-end justify-between gap-3">
          <div className="flex items-baseline gap-1.5">
            <span className="hero-num text-[3rem] leading-none">{show(stats.latest)}</span>
            <span className="text-sm text-[#7E889B]">{unit}</span>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-[#7E889B]">{when(stats.latestDate)}</div>
            {trend !== undefined && trend !== 0 && (
              <span
                className="mt-1 inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold"
                style={{ background: trendGood ? '#81C99524' : '#F28B8224', color: trendGood ? '#81C995' : '#F28B82' }}
                title="The last 7 days compared with the days before"
              >
                {trend > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                {Math.abs(trend)}% vs before
              </span>
            )}
          </div>
        </div>

        <div className="mt-4 flex gap-1 rounded-full bg-white/[0.06] p-0.5" role="group" aria-label="Time range">
          {RANGES.map((n) => (
            <button
              key={n}
              onClick={() => setRange(n)}
              aria-pressed={range === n}
              className="flex-1 rounded-full py-1.5 text-[11px] font-bold"
              style={{ background: range === n ? '#fff' : 'transparent', color: range === n ? '#000' : '#9AA3B2' }}
            >
              {n} days
            </button>
          ))}
        </div>

        <div className="mt-3">
          {stats.count === 0 ? (
            <EmptyState title={`No ${def.title.toLowerCase()} recorded in the last ${range} days`} hint="It appears here once your watch, Health Connect or a log entry provides it." />
          ) : def.chart === 'bar' ? (
            <BarChart data={bars} color={def.color} goal={goalShown} format={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v * 10) / 10))} ariaLabel={`${def.title} per day`} />
          ) : (
            <LineChart points={points} color={def.color} ariaLabel={`${def.title} per day`} />
          )}
        </div>

        {stats.count > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className={cell}>
              <div className="stat-label">Average</div>
              <div className="mt-1 text-lg font-bold tabular-nums">
                {show(stats.avg)} <span className="text-xs font-normal text-[#7E889B]">{unit}</span>
              </div>
              <div className="text-[10px] text-neutral-500">{stats.count} day{stats.count === 1 ? '' : 's'} with data</div>
            </div>
            <div className={cell}>
              <div className="stat-label">{bestLabel}</div>
              <div className="mt-1 text-lg font-bold tabular-nums">
                {show(bestValue)} <span className="text-xs font-normal text-[#7E889B]">{unit}</span>
              </div>
              <div className="text-[10px] text-neutral-500">{when(lowerIsBetter ? series.find((p) => p.value === stats.min)?.date : stats.maxDate)}</div>
            </div>
            {def.sums && (
              <div className={cell}>
                <div className="stat-label">Total, {range} days</div>
                <div className="mt-1 text-lg font-bold tabular-nums">
                  {show(stats.total)} <span className="text-xs font-normal text-[#7E889B]">{unit}</span>
                </div>
              </div>
            )}
            {goal !== undefined && (
              <div className={cell}>
                <div className="stat-label">Goal reached</div>
                <div className="mt-1 text-lg font-bold tabular-nums">
                  {series.filter((p) => (p.value ?? 0) >= goal).length}
                  <span className="text-xs font-normal text-[#7E889B]"> of {range} days</span>
                </div>
              </div>
            )}
          </div>
        )}

        {action && (
          <button onClick={action.onClick} className="mt-4 w-full rounded-xl border border-neutral-700 py-2.5 text-xs font-semibold text-neutral-100 hover:text-white">
            {action.label}
          </button>
        )}

        <p className="mt-4 text-[11px] leading-relaxed text-neutral-400">{def.explain}</p>
        <p className="mt-2 text-[10px] leading-relaxed text-neutral-600">For general information, not medical advice.</p>
      </div>
    </div>
  );
};
