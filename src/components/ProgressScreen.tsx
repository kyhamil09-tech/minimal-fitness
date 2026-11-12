import React, { useMemo, useState } from 'react';
import { Award, BarChart3, Flame, HeartPulse, Scale, Share2, Trash2, Trophy } from 'lucide-react';
import { StoryData, buildMilestoneStory, buildStreakStory, weekDots } from '../lib/storyCards';
import { StoryShareModal } from './StoryShareModal';
import { YearInReview } from './YearInReview';
import { FastingSession, SleepLogEntry, WorkoutSession } from '../types/health';
import { RewardsPanel } from './RewardsPanel';
import { BestsPanel } from './BestsPanel';
import { ProgressPhotos } from './ProgressPhotos';
import { Achievement, ActivePlan, BodyEntry, FoodEntry, Goals, UserProfile, WaterEntry } from '../types/tracking';
import { WorkoutCalendar } from './WorkoutCalendar';
import { NutritionTrendsCard } from './NutritionTrendsCard';
import { WeeklyCoachCard } from './WeeklyCoachCard';
import { CalorieGuide } from './CalorieGuide';
import { PROGRESS_GROUPS, ProgressSection, progressGroupOf } from '../lib/appMap';
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

type Segment = ProgressSection;

const SECTION_LABEL: Record<ProgressSection, string> = {
  trends: 'Trends & coach',
  calendar: 'Calendar',
  vitals: 'Vitals',
  insights: 'Insights',
  body: 'Measurements',
  awards: 'Awards',
};

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
  /** Saves new daily targets (the calorie guide). */
  onSetGoals?: (patch: Partial<Goals>) => void;
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
  onSetGoals,
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
        <h3 className="text-sm font-bold text-neutral-200">{title}</h3>
        <span className="text-xs font-mono text-neutral-400">{sub}</span>
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
        <p className="text-xs text-[#9AA3B2] mt-0.5">How it is going: trends, your body, and your streaks.</p>
      </div>

      <Segmented<(typeof PROGRESS_GROUPS)[number]['id']>
        ariaLabel="Progress parts"
        theme={theme}
        value={progressGroupOf(segment).id}
        onChange={(id) => setSegment(PROGRESS_GROUPS.find((g) => g.id === id)!.sections[0])}
        options={PROGRESS_GROUPS.map((g) => ({ id: g.id, label: g.label }))}
      />
      <Segmented<Segment>
        ariaLabel="Progress sections"
        theme={theme}
        value={segment}
        onChange={setSegment}
        options={progressGroupOf(segment).sections.map((id) => ({ id, label: SECTION_LABEL[id] }))}
      />

      {segment === 'trends' && (
        <>
          <WeeklyCoachCard theme={theme} workouts={workouts} sleepLogs={sleepLogs} food={food} stepsLog={stepsLog} goals={goals} activePlan={activePlan} />
          <WeeklyRecapCard theme={theme} workouts={workouts} sleepLogs={sleepLogs} units={units} goals={goals} />
          <Segmented<TrendRange>
            ariaLabel="Time range"
            size="sm"
            semantics="group"
            value={range}
            onChange={setRange}
            options={[
              { id: '7d', label: 'Week' },
              { id: '30d', label: 'Month' },
              { id: '1y', label: 'Year' },
            ]}
          />

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
          <NutritionTrendsCard theme={theme} food={food} goals={goals} />
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
                <div className="text-xs text-neutral-400 uppercase">Weight</div>
                <div className="text-lg font-bold font-mono text-white">{formatWeight(currentWeightKg, units)}</div>
              </div>
              <div className="bg-black/50 rounded-2xl border border-neutral-900 p-3">
                <div className="text-xs text-neutral-400 uppercase">BMI</div>
                <div className="text-lg font-bold font-mono text-white">{bmiVal.toFixed(1)}</div>
                <div className="text-xs" style={{ color: theme.primary }}>
                  {bmiCategory(bmiVal)}
                </div>
              </div>
              <div className="bg-black/50 rounded-2xl border border-neutral-900 p-3">
                <div className="text-xs text-neutral-400 uppercase">Target</div>
                <div className="text-lg font-bold font-mono text-white">{formatWeight(targetKg, units)}</div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs font-mono text-neutral-400">
                <span>Goal progress</span>
                <span>{Math.round(goalPct * 100)}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-black/60 border border-[#1A1E26] overflow-hidden mt-1">
                <div className="h-full rounded-full" style={{ width: `${goalPct * 100}%`, backgroundColor: theme.primary }} />
              </div>
            </div>
            <p className="text-xs text-neutral-400">BMI is a rough screening number and ignores muscle mass.</p>
          </section>

          {onSetGoals && <CalorieGuide theme={theme} profile={profile} goals={goals} currentKg={currentWeightKg} body={body} food={food} onSetGoals={onSetGoals} />}

          <section className="rounded-3xl border p-4 space-y-2" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
            <h3 className="text-sm font-bold text-neutral-200">Weight trend ({weightUnit(units)})</h3>
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
            <h3 className="text-sm font-bold text-neutral-200">Add measurement</h3>
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
              <h3 className="text-sm font-bold text-neutral-200">History</h3>
              <ul className="divide-y divide-[#1A1E26]">
                {[...sortedBody].reverse().map((b) => (
                  <li key={b.id} className="py-2 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs text-white font-mono">
                        {shortMonthDay(b.date)} · {formatWeight(b.weightKg, units)}
                      </div>
                      <div className="text-xs text-neutral-400 font-mono">
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
                      className="text-neutral-400 hover:text-rose-400"
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
              <div className="text-xs text-neutral-400">day streak</div>
            </div>
            <div className="bg-black/50 rounded-2xl border border-neutral-900 p-3">
              <Trophy className="w-4 h-4 mx-auto text-amber-400" />
              <div className="text-xl font-bold font-mono text-white">{best}</div>
              <div className="text-xs text-neutral-400">best streak</div>
            </div>
            <div className="bg-black/50 rounded-2xl border border-neutral-900 p-3">
              <Award className="w-4 h-4 mx-auto" style={{ color: theme.primary }} />
              <div className="text-xl font-bold font-mono text-white">
                {weekCount}/{goals.weeklyWorkouts}
              </div>
              <div className="text-xs text-neutral-400">this week</div>
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

          <YearInReview theme={theme} workouts={workouts} fasts={fasts} units={units} onShare={(data) => setStory({ data, name: 'year' })} />

          <RewardsPanel theme={theme} workouts={workouts} fasts={fasts} goals={goals} onShare={(a) => setStory({ data: buildMilestoneStory(a), name: 'milestone' })} />

          <section className="rounded-3xl border p-4 space-y-3" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
            <h3 className="text-sm font-bold text-neutral-200">
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
                      <div className="text-xs text-[#9AA3B2]">{a.description}</div>
                    </div>
                    <span className="text-xs font-mono text-neutral-400 shrink-0">{a.progressLabel}</span>
                  </div>
                  <div className="h-1 rounded-full bg-black/60 overflow-hidden mt-2">
                    <div className="h-full rounded-full" style={{ width: `${a.progress * 100}%`, backgroundColor: a.unlocked ? theme.primary : '#475569' }} />
                  </div>
                  {a.unlocked && (
                    <button
                      type="button"
                      onClick={() => setStory({ data: buildMilestoneStory(a), name: 'milestone' })}
                      className="mt-2 text-xs font-bold flex items-center gap-1"
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
      {segment === 'vitals' && (
        <div className="space-y-6">
          {healthSlot}
          {fitnessSlot}
        </div>
      )}
    </div>
  );
};
