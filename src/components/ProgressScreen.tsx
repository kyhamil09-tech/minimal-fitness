import React, { useMemo, useState } from 'react';
import { Award, BarChart3, Flame, HeartPulse, Scale, Share2, Trash2, Trophy } from 'lucide-react';
import { StoryData, buildMilestoneStory, buildStreakStory, weekDots } from '../lib/storyCards';
import { StoryShareModal } from './StoryShareModal';
import { FastingSession, SleepLogEntry, WorkoutSession } from '../types/health';
import { RewardsPanel } from './RewardsPanel';
import { BestsPanel } from './BestsPanel';
import { ProgressPhotos } from './ProgressPhotos';
import { Achievement, ActivePlan, BodyEntry, FoodEntry, Goals, UserProfile, WaterEntry } from '../types/tracking';
import { WorkoutCalendar } from './WorkoutCalendar';
import { ColorPalette } from '../types/theme';
import { BarChart, EmptyState, LineChart } from './ui/charts';
import { Segmented } from './ui/Segmented';
import { WeeklyRecapCard } from './WeeklyRecapCard';
import { LiftingCard } from './LiftingCard';
import { fieldClass, labelClass } from './ui/Modal';
import { computeAchievements } from '../lib/achievements';
import {
  bmi,
  bmiCategory,
  currentStreak,
  longestStreak,
  personalRecords,
  sortedBodyEntries,
  workoutDateKeys,
  workoutDateKey,
  workoutVolumeKg,
  workoutsInWeek,
} from '../lib/calc';
import { aggregate, TrendRange } from '../lib/trends';
import { shortMonthDay, startOfWeek, toDateKey, todayKey } from '../lib/dates';
import {
  cmToDisplay,
  displayToCm,
  displayToKg,
  formatWeight,
  kgToDisplay,
  lengthUnit,
  mlToDisplay,
  volumeUnit,
  weightUnit,
} from '../lib/units';

type Segment = 'trends' | 'calendar' | 'insights' | 'fitness' | 'body' | 'awards' | 'health';

interface ProgressScreenProps {
  initialSegment?: Segment;
  theme: ColorPalette;
  profile: UserProfile;
  goals: Goals;
  workouts: WorkoutSession[];
  sleepLogs: SleepLogEntry[];
  stepsLog: Record<string, number>;
  food: FoodEntry[];
  water: WaterEntry[];
  body: BodyEntry[];
  onAddBody: (entry: Omit<BodyEntry, 'id'>) => void;
  onDeleteBody: (id: string) => void;
  healthSlot: React.ReactNode;
  /** The Fitness tab: Google-style daily metrics with graphs. */
  fitnessSlot: React.ReactNode;
  /** The Insights tab: patterns found in your own data. */
  insightsSlot: React.ReactNode;
  /** Fasts, for the fasting streak awards. */
  fasts: FastingSession[];
  /** The training plan you are on, so the calendar can show its planned days. */
  activePlan: ActivePlan | null;
}

const RANGE_LABEL: Record<TrendRange, string> = { '7d': '7 days', '30d': '30 days', '1y': '12 months' };

export const ProgressScreen: React.FC<ProgressScreenProps> = ({
  initialSegment = 'trends',
  theme,
  profile,
  goals,
  workouts,
  sleepLogs,
  stepsLog,
  food,
  water,
  body,
  onAddBody,
  onDeleteBody,
  healthSlot,
  fitnessSlot,
  insightsSlot,
  fasts,
  activePlan,
}) => {
  const units = profile.units;
  const today = todayKey();
  const [segment, setSegment] = useState<Segment>(initialSegment);
  const [range, setRange] = useState<TrendRange>('7d');
  const [story, setStory] = useState<{ data: StoryData; name: string } | null>(null);

  /* ---------- Trends ---------- */
  const trends = useMemo(() => {
    const dated = workouts.filter((w) => w.startedAt);
    const days = (fn: (w: WorkoutSession) => number) =>
      dated.map((w) => ({ key: workoutDateKey(w), value: fn(w) }));
    const toBars = (rows: { id: string; label: string; value: number }[], highlightLast = true) =>
      rows.map((r, i) => ({ label: r.label, value: r.value, highlight: highlightLast && i === rows.length - 1 }));

    return {
      minutes: toBars(aggregate(days((w) => w.durationMinutes), range, today, 'sum')),
      burned: toBars(aggregate(days((w) => w.caloriesBurned), range, today, 'sum')),
      volume: toBars(
        aggregate(days((w) => kgToDisplay(workoutVolumeKg(w), units, 0)), range, today, 'sum')
      ),
      sleep: toBars(
        aggregate(
          sleepLogs.map((s) => ({ key: s.dateIso, value: s.durationMinutes / 60 })),
          range,
          today,
          'avg'
        )
      ),
      steps: toBars(
        aggregate(
          Object.entries(stepsLog).map(([key, value]) => ({ key, value })),
          range,
          today,
          'avg'
        )
      ),
      eaten: toBars(
        aggregate(
          food.map((f) => ({ key: f.date, value: f.calories })),
          range,
          today,
          'avg'
        )
      ),
      water: toBars(
        aggregate(
          water.map((w) => ({ key: w.date, value: w.ml })),
          range,
          today,
          'avg'
        )
      ),
    };
  }, [workouts, sleepLogs, stepsLog, food, water, range, today, units]);

  const hasAny = (rows: { value: number }[]) => rows.some((r) => r.value > 0);

  const card = (title: string, sub: string, rows: { label: string; value: number; highlight?: boolean }[], opts: {
    color: string;
    goal?: number;
    format?: (v: number) => string;
  }) => (
    <section
      key={title}
      className="rounded-3xl border p-4 space-y-2"
      style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}
    >
      <div className="flex items-baseline justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#7E889B]">{title}</h3>
        <span className="text-[10px] font-mono text-neutral-500">{sub}</span>
      </div>
      {hasAny(rows) ? (
        <BarChart
          data={rows}
          color={opts.color}
          goal={range === '1y' ? undefined : opts.goal}
          format={opts.format}
          ariaLabel={`${title}, last ${RANGE_LABEL[range]}`}
        />
      ) : (
        <EmptyState title="No data yet" hint="Log something and it will show up here." />
      )}
    </section>
  );

  /* ---------- Body ---------- */
  const sortedBody = useMemo(() => sortedBodyEntries(body), [body]);
  const latestBody = sortedBody[sortedBody.length - 1];
  const firstBody = sortedBody[0];
  const currentWeightKg = latestBody?.weightKg ?? profile.weightKg;
  const bmiVal = bmi(currentWeightKg, profile.heightCm);

  const [bDate, setBDate] = useState(today);
  const [bWeight, setBWeight] = useState('');
  const [bFat, setBFat] = useState('');
  const [bWaist, setBWaist] = useState('');
  const [bChest, setBChest] = useState('');
  const [bHips, setBHips] = useState('');
  const [bArm, setBArm] = useState('');
  const [bodyError, setBodyError] = useState('');

  const submitBody = (e: React.FormEvent) => {
    e.preventDefault();
    const w = parseFloat(bWeight);
    if (!(w > 0)) {
      setBodyError('Enter your weight.');
      return;
    }
    const opt = (s: string) => (parseFloat(s) > 0 ? parseFloat(s) : undefined);
    const lenOpt = (s: string) => {
      const v = opt(s);
      return v === undefined ? undefined : Math.round(displayToCm(v, units) * 10) / 10;
    };
    onAddBody({
      date: bDate || today,
      weightKg: Math.round(displayToKg(w, units) * 100) / 100,
      bodyFatPct: opt(bFat),
      waistCm: lenOpt(bWaist),
      chestCm: lenOpt(bChest),
      hipsCm: lenOpt(bHips),
      armCm: lenOpt(bArm),
    });
    setBodyError('');
    setBWeight('');
    setBFat('');
    setBWaist('');
    setBChest('');
    setBHips('');
    setBArm('');
  };

  const targetKg = goals.targetWeightKg;
  const startKg = firstBody?.weightKg ?? profile.weightKg;
  const totalToGo = Math.abs(startKg - targetKg);
  const doneSoFar = Math.abs(startKg - currentWeightKg);
  const movingRight = (targetKg - startKg) * (currentWeightKg - startKg) >= 0;
  const goalPct = totalToGo < 0.05 ? 1 : movingRight ? Math.min(1, doneSoFar / totalToGo) : 0;

  /* ---------- Awards ---------- */
  const keys = useMemo(() => workoutDateKeys(workouts), [workouts]);
  const streak = currentStreak(keys, today);
  const best = longestStreak(keys);
  const weekCount = workoutsInWeek(workouts).length;
  const achievements: Achievement[] = useMemo(
    () => computeAchievements({ workouts, body, food, water, goals, today }),
    [workouts, body, food, water, goals, today]
  );
  const records = Object.values(personalRecords(workouts))
    .sort((a, b) => b.oneRepMax - a.oneRepMax)
    .slice(0, 8);

  return (
    <div className="space-y-4 pb-8 max-w-lg mx-auto">
      <div>
        <h1 className="text-xl font-bold text-white tracking-tight">Progress</h1>
        <p className="text-xs text-[#7E889B] mt-0.5">Trends, body measurements, streaks and health insights.</p>
      </div>

      <Segmented<Segment>
        ariaLabel="Progress sections"
        theme={theme}
        value={segment}
        onChange={setSegment}
        options={[
          { id: 'trends', label: 'Trends' },
          { id: 'calendar', label: 'Calendar' },
          { id: 'insights', label: 'Insights' },
          { id: 'fitness', label: 'Fitness' },
          { id: 'body', label: 'Body' },
          { id: 'awards', label: 'Awards' },
          { id: 'health', label: 'Health' },
        ]}
      />

      {segment === 'trends' && (
        <>
          <WeeklyRecapCard theme={theme} workouts={workouts} sleepLogs={sleepLogs} units={units} goals={goals} />
          <div className="grid grid-cols-3 gap-1 p-1 bg-black/60 rounded-xl border border-[#1A1E26]" role="group" aria-label="Time range">
            {(['7d', '30d', '1y'] as TrendRange[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                aria-pressed={range === r}
                className={`py-1.5 rounded-lg text-xs font-semibold ${range === r ? 'bg-neutral-900 border border-neutral-700' : 'text-neutral-400'}`}
                style={{ color: range === r ? theme.primary : undefined }}
              >
                {r === '7d' ? 'Week' : r === '30d' ? 'Month' : 'Year'}
              </button>
            ))}
          </div>

          {card('Active minutes', range === '1y' ? 'per month' : 'per day', trends.minutes, { color: theme.primary })}
          {card('Calories burned', 'workouts', trends.burned, { color: theme.tertiary })}
          {card(`Strength volume (${weightUnit(units)})`, range === '1y' ? 'per month' : 'per day', trends.volume, {
            color: '#FBBF24',
            format: (v) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v))),
          })}
          {card('Sleep (hours)', 'avg per night', trends.sleep, {
            color: theme.secondary,
            goal: 8,
            format: (v) => String(Math.round(v * 10) / 10),
          })}
          {card('Steps', 'avg per day (manual entry)', trends.steps, { color: '#38BDF8', goal: goals.dailySteps })}
          {card('Calories eaten', 'avg per day logged', trends.eaten, { color: '#F472B6', goal: goals.dailyCalories })}
          {card(
            `Water (${volumeUnit(units)})`,
            'avg per day logged',
            trends.water.map((r) => ({ ...r, value: mlToDisplay(r.value, units) })),
            { color: '#38BDF8', goal: mlToDisplay(goals.dailyWaterMl, units) }
          )}
        </>
      )}

      {segment === 'body' && (
        <>
          <section className="rounded-3xl border p-5 space-y-3" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-black/50 rounded-2xl border border-neutral-900 p-3">
                <div className="text-[10px] text-neutral-400 uppercase">Weight</div>
                <div className="text-lg font-bold font-mono text-white">{formatWeight(currentWeightKg, units)}</div>
              </div>
              <div className="bg-black/50 rounded-2xl border border-neutral-900 p-3">
                <div className="text-[10px] text-neutral-400 uppercase">BMI</div>
                <div className="text-lg font-bold font-mono text-white">{bmiVal.toFixed(1)}</div>
                <div className="text-[9px]" style={{ color: theme.primary }}>
                  {bmiCategory(bmiVal)}
                </div>
              </div>
              <div className="bg-black/50 rounded-2xl border border-neutral-900 p-3">
                <div className="text-[10px] text-neutral-400 uppercase">Target</div>
                <div className="text-lg font-bold font-mono text-white">{formatWeight(targetKg, units)}</div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-[11px] font-mono text-neutral-400">
                <span>Goal progress</span>
                <span>{Math.round(goalPct * 100)}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-black/60 border border-[#1A1E26] overflow-hidden mt-1">
                <div className="h-full rounded-full" style={{ width: `${goalPct * 100}%`, backgroundColor: theme.primary }} />
              </div>
            </div>
            <p className="text-[10px] text-neutral-600">BMI is a rough screening number and ignores muscle mass.</p>
          </section>

          <section className="rounded-3xl border p-4 space-y-2" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#7E889B]">Weight trend ({weightUnit(units)})</h3>
            {sortedBody.length >= 2 ? (
              <LineChart
                ariaLabel="Weight over time"
                color={theme.primary}
                unit={` ${weightUnit(units)}`}
                goal={kgToDisplay(targetKg, units)}
                points={sortedBody.slice(-60).map((b) => ({ label: shortMonthDay(b.date), value: kgToDisplay(b.weightKg, units) }))}
              />
            ) : (
              <EmptyState title="Log at least two entries to see a trend" />
            )}
          </section>

          <ProgressPhotos theme={theme} body={body} units={units} />

          <form
            onSubmit={submitBody}
            className="rounded-3xl border p-4 space-y-3"
            style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}
          >
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#7E889B]">Add measurement</h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label htmlFor="b-date" className={labelClass}>
                  Date
                </label>
                <input id="b-date" type="date" max={today} value={bDate} onChange={(e) => setBDate(e.target.value)} className={fieldClass} />
              </div>
              <div className="space-y-1">
                <label htmlFor="b-weight" className={labelClass}>
                  Weight ({weightUnit(units)})
                </label>
                <input id="b-weight" inputMode="decimal" value={bWeight} onChange={(e) => setBWeight(e.target.value)} className={fieldClass} required />
              </div>
              {[
                ['Body fat %', bFat, setBFat],
                [`Waist (${lengthUnit(units)})`, bWaist, setBWaist],
                [`Chest (${lengthUnit(units)})`, bChest, setBChest],
                [`Hips (${lengthUnit(units)})`, bHips, setBHips],
                [`Arm (${lengthUnit(units)})`, bArm, setBArm],
              ].map(([label, val, set]) => (
                <div key={label as string} className="space-y-1">
                  <label className={labelClass}>{label as string} (optional)</label>
                  <input
                    aria-label={label as string}
                    inputMode="decimal"
                    value={val as string}
                    onChange={(e) => (set as (v: string) => void)(e.target.value)}
                    className={fieldClass}
                  />
                </div>
              ))}
            </div>
            {bodyError && (
              <p role="alert" className="text-xs text-rose-400">
                {bodyError}
              </p>
            )}
            <button type="submit" className="w-full py-2.5 rounded-xl text-xs font-bold text-black" style={{ backgroundColor: theme.primary }}>
              Save measurement
            </button>
          </form>

          {sortedBody.length > 0 && (
            <section className="rounded-3xl border p-4 space-y-2" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#7E889B]">History</h3>
              <ul className="divide-y divide-[#1A1E26]">
                {[...sortedBody].reverse().map((b) => (
                  <li key={b.id} className="py-2 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs text-white font-mono">
                        {shortMonthDay(b.date)} · {formatWeight(b.weightKg, units)}
                      </div>
                      <div className="text-[10px] text-neutral-500 font-mono">
                        {[
                          b.bodyFatPct ? `${b.bodyFatPct}% fat` : '',
                          b.waistCm ? `waist ${cmToDisplay(b.waistCm, units)}` : '',
                          b.chestCm ? `chest ${cmToDisplay(b.chestCm, units)}` : '',
                          b.hipsCm ? `hips ${cmToDisplay(b.hipsCm, units)}` : '',
                          b.armCm ? `arm ${cmToDisplay(b.armCm, units)}` : '',
                        ]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </div>
                    </div>
                    <button
                      onClick={() => onDeleteBody(b.id)}
                      aria-label={`Delete entry from ${shortMonthDay(b.date)}`}
                      className="text-neutral-600 hover:text-rose-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {segment === 'awards' && (
        <>
          <section className="rounded-3xl border p-5 grid grid-cols-3 gap-2 text-center" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
            <div className="bg-black/50 rounded-2xl border border-neutral-900 p-3">
              <Flame className="w-4 h-4 mx-auto text-orange-400" />
              <div className="text-xl font-bold font-mono text-white">{streak}</div>
              <div className="text-[10px] text-neutral-400">day streak</div>
            </div>
            <div className="bg-black/50 rounded-2xl border border-neutral-900 p-3">
              <Trophy className="w-4 h-4 mx-auto text-amber-400" />
              <div className="text-xl font-bold font-mono text-white">{best}</div>
              <div className="text-[10px] text-neutral-400">best streak</div>
            </div>
            <div className="bg-black/50 rounded-2xl border border-neutral-900 p-3">
              <Award className="w-4 h-4 mx-auto" style={{ color: theme.primary }} />
              <div className="text-xl font-bold font-mono text-white">
                {weekCount}/{goals.weeklyWorkouts}
              </div>
              <div className="text-[10px] text-neutral-400">this week</div>
            </div>
            <button
              type="button"
              onClick={() => {
                const active = new Set(keys);
                const weekStart = toDateKey(startOfWeek(new Date()));
                setStory({ data: buildStreakStory(streak, Math.max(best, streak), weekDots(weekStart, active, today)), name: 'streak' });
              }}
              className="col-span-3 py-2.5 rounded-2xl text-xs font-extrabold flex items-center justify-center gap-1.5"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}
            >
              <Share2 className="w-3.5 h-3.5" /> Share my streak
            </button>
          </section>

          <RewardsPanel theme={theme} workouts={workouts} fasts={fasts} goals={goals} onShare={(a) => setStory({ data: buildMilestoneStory(a), name: 'milestone' })} />

          <section className="rounded-3xl border p-4 space-y-3" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#7E889B]">
              Achievements ({achievements.filter((a) => a.unlocked).length}/{achievements.length})
            </h3>
            <ul className="space-y-2">
              {achievements.map((a) => (
                <li key={a.id} className="rounded-2xl border border-[#1A1E26] bg-black/40 p-3" style={{ opacity: a.unlocked ? 1 : 0.8 }}>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        {a.unlocked && <Award className="w-3.5 h-3.5" style={{ color: theme.primary }} aria-label="Unlocked" />}
                        {a.title}
                      </div>
                      <div className="text-[11px] text-[#7E889B]">{a.description}</div>
                    </div>
                    <span className="text-[10px] font-mono text-neutral-400 shrink-0">{a.progressLabel}</span>
                  </div>
                  <div className="h-1 rounded-full bg-black/60 overflow-hidden mt-2">
                    <div className="h-full rounded-full" style={{ width: `${a.progress * 100}%`, backgroundColor: a.unlocked ? theme.primary : '#475569' }} />
                  </div>
                  {a.unlocked && (
                    <button
                      type="button"
                      onClick={() => setStory({ data: buildMilestoneStory(a), name: 'milestone' })}
                      className="mt-2 text-[11px] font-bold flex items-center gap-1"
                      style={{ color: 'var(--accent)' }}
                    >
                      <Share2 className="w-3 h-3" /> Share this badge
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <BestsPanel theme={theme} workouts={workouts} units={units} onShare={(data) => setStory({ data, name: 'best' })} />

          <LiftingCard theme={theme} workouts={workouts} units={units} />
        </>
      )}

      {story && <StoryShareModal data={story.data} name={story.name} onClose={() => setStory(null)} />}
      {segment === 'calendar' && <WorkoutCalendar theme={theme} units={units} workouts={workouts} activePlan={activePlan} />}
      {segment === 'insights' && insightsSlot}
      {segment === 'fitness' && fitnessSlot}
      {segment === 'health' && healthSlot}
    </div>
  );
};
