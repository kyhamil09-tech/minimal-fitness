import React, { useState } from 'react';
import { CalendarDays, Dumbbell, Flame, Info, Timer, Zap } from 'lucide-react';
import { Modal } from './ui/Modal';
import { ExerciseGuide } from './ExerciseDemo';
import { Exercise, PlanDay, WorkoutPlan } from '../types/tracking';
import { QuickWorkoutTemplate } from '../types/health';
import { ColorPalette } from '../types/theme';
import { getExercise } from '../data/exercises';
import { INTERVAL_WORKOUTS, IntervalStep, IntervalStepKind, StepLine, plannedSeconds, shortTime, summarizeSteps } from '../data/intervals';
import { planDaysForWeek } from '../lib/planBuilder';

/** Anything that can be read through before it is started. */
export type Preset =
  | { kind: 'strength'; title: string; blurb?: string; exerciseIds: string[] }
  | { kind: 'plan'; plan: WorkoutPlan }
  | { kind: 'intervals'; name: string; description: string; steps: IntervalStep[] }
  | { kind: 'quick'; template: QuickWorkoutTemplate }
  | { kind: 'day'; day: PlanDay };

export interface PreviewAction {
  label: string;
  onClick: () => void;
  primary?: boolean;
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** A set is about a minute of work and a minute and a half of rest, three sets to an exercise. */
export const MIN_PER_EXERCISE = 7;

const KIND_COLOR: Record<IntervalStepKind, string> = { warmup: '#7dd3fc', work: '#FF5500', recover: '#4ADE80', cooldown: '#B794FF' };
const KIND_NAME: Record<IntervalStepKind, string> = { warmup: 'Warm-up', work: 'Effort', recover: 'Easy', cooldown: 'Cool-down' };

const Chip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="rounded-full border border-neutral-800 bg-neutral-900 px-2.5 py-0.5 text-xs font-bold text-neutral-300">{children}</span>
);

/** The exercises of a strength session, each opening its how-to sheet. */
const ExerciseList: React.FC<{ ids: string[]; onOpen: (e: Exercise) => void }> = ({ ids, onOpen }) => {
  const list = ids.map((id) => getExercise(id)).filter((e): e is Exercise => !!e);
  const muscles = [...new Set(list.map((e) => e.muscle))];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip>{list.length} exercises</Chip>
        <Chip>about {list.length * MIN_PER_EXERCISE} min</Chip>
        {muscles.map((m) => (
          <Chip key={m}>{m}</Chip>
        ))}
      </div>
      <ol className="space-y-1.5">
        {list.map((e, i) => (
          <li key={e.id}>
            <button onClick={() => onOpen(e)} aria-label={`How to do ${e.name}`} className="flex w-full items-center gap-3 rounded-2xl glass-inset px-3.5 py-2.5 text-left">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-extrabold text-white">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-white">{e.name}</span>
                <span className="block text-xs text-[#9AA3B2]">
                  {e.muscle} · {e.equipment} · 3 sets of 8
                </span>
              </span>
              <Info className="h-4 w-4 shrink-0 text-neutral-400" />
            </button>
          </li>
        ))}
      </ol>
      <p className="text-xs leading-relaxed text-neutral-400">Tap an exercise to see it move. Sets and reps are filled in from what you did last time, or three sets of eight.</p>
    </div>
  );
};

/** A bar of the whole workout, one colored block per step, wide in proportion to its time. */
const Timeline: React.FC<{ steps: IntervalStep[] }> = ({ steps }) => {
  // A step measured by distance has no planned time: give it a share about the size of a short effort.
  const weight = (s: IntervalStep) => s.durationSec ?? Math.max(60, Math.round((s.distanceKm ?? 0.4) * 300));
  const total = steps.reduce((a, s) => a + weight(s), 0) || 1;
  return (
    <div>
      <div className="flex h-5 overflow-hidden rounded-full bg-white/5" role="img" aria-label="Timeline of the workout">
        {steps.map((s, i) => (
          <div key={i} style={{ width: `${(weight(s) / total) * 100}%`, background: KIND_COLOR[s.kind], opacity: s.kind === 'recover' ? 0.55 : 1, marginRight: 1 }} title={s.label} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {(Object.keys(KIND_NAME) as IntervalStepKind[])
          .filter((k) => steps.some((s) => s.kind === k))
          .map((k) => (
            <span key={k} className="flex items-center gap-1.5 text-xs text-neutral-300">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: KIND_COLOR[k], opacity: k === 'recover' ? 0.55 : 1 }} />
              {KIND_NAME[k]}
            </span>
          ))}
      </div>
    </div>
  );
};

const IntervalOutline: React.FC<{ steps: IntervalStep[] }> = ({ steps }) => {
  const lines: StepLine[] = summarizeSteps(steps);
  const secs = plannedSeconds(steps);
  const hasDistance = steps.some((s) => s.distanceKm !== undefined);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        <Chip>{hasDistance ? `${Math.round(secs / 60)}+ min` : `${Math.round(secs / 60)} min`}</Chip>
        <Chip>{steps.length} steps</Chip>
      </div>
      <Timeline steps={steps} />
      <ul className="space-y-1.5">
        {lines.map((l, i) => (
          <li key={i} className="flex items-center justify-between gap-3 rounded-2xl glass-inset px-3.5 py-2.5">
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: KIND_COLOR[l.kind === 'repeat' ? 'work' : l.kind] }} />
              <span className="text-sm font-semibold text-white">{l.text}</span>
            </span>
            {l.seconds > 0 && <span className="shrink-0 text-xs font-bold tabular-nums text-neutral-400">{shortTime(l.seconds)}</span>}
          </li>
        ))}
      </ul>
      <p className="text-xs leading-relaxed text-neutral-400">The app says each step out loud and buzzes before it changes. Both can be set in Settings.</p>
    </div>
  );
};

const cardioLine = (d: PlanDay): string => {
  const parts: string[] = [d.cardioType ?? ''];
  if (d.targetKm) parts.push(`${d.targetKm} km`);
  else if (d.targetMinutes) parts.push(`${d.targetMinutes} min`);
  return parts.filter(Boolean).join(' · ');
};

/** One day of a plan: strength days list their exercises, others say what to do. */
const DayBody: React.FC<{ day: PlanDay; onOpen: (e: Exercise) => void }> = ({ day, onOpen }) => {
  if (day.kind === 'rest') return <p className="text-sm text-neutral-300">A rest day: let the work you have done settle in. A short walk is fine.</p>;
  if (day.kind === 'strength' && day.exerciseIds) return <ExerciseList ids={day.exerciseIds} onOpen={onOpen} />;
  const interval = day.intervalId ? INTERVAL_WORKOUTS.find((w) => w.id === day.intervalId) : undefined;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        <Chip>{cardioLine(day)}</Chip>
      </div>
      {interval && (
        <div className="space-y-2">
          <div className="text-sm font-bold text-white">{interval.name}</div>
          <p className="text-xs text-[#9AA3B2]">{interval.description}</p>
          <IntervalOutline steps={interval.steps} />
        </div>
      )}
      {!interval && <p className="text-sm text-neutral-300">Keep it comfortable: you should be able to hold a conversation.</p>}
    </div>
  );
};

const PlanBody: React.FC<{ plan: WorkoutPlan; theme: ColorPalette; onOpen: (e: Exercise) => void }> = ({ plan, theme, onOpen }) => {
  const [week, setWeek] = useState(1);
  const [openDay, setOpenDay] = useState<number | null>(null);
  const progresses = !!plan.weekly && plan.weekly.length > 1;
  const days = planDaysForWeek(plan, week);
  const sessions = days.filter((d) => d.kind !== 'rest').length;
  return (
    <div className="space-y-3">
      <p className="text-[12px] leading-relaxed text-neutral-300">{plan.description}</p>
      <div className="flex flex-wrap gap-1.5">
        <Chip>{plan.weeks} weeks</Chip>
        <Chip>{plan.level}</Chip>
        <Chip>{sessions} sessions a week</Chip>
      </div>
      {progresses && (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1" role="group" aria-label="Week">
          {Array.from({ length: plan.weeks }, (_, i) => i + 1).map((n) => (
            <button key={n} onClick={() => setWeek(n)} aria-pressed={week === n} className="sport-pill !py-1.5 !px-3 !text-xs shrink-0">
              Week {n}
            </button>
          ))}
        </div>
      )}
      <ul className="space-y-1.5">
        {days.map((d) => {
          const open = openDay === d.day;
          return (
            <li key={d.day} className="rounded-2xl glass-inset">
              <button onClick={() => setOpenDay(open ? null : d.day)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left">
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-neutral-200">{DAY_NAMES[d.day]}</span>
                  <span className="block truncate text-sm font-semibold text-white">{d.title}</span>
                  <span className="block truncate text-xs text-[#9AA3B2]">
                    {d.kind === 'strength' ? `${d.exerciseIds?.length ?? 0} exercises` : d.kind === 'rest' ? 'Recovery day' : cardioLine(d)}
                  </span>
                </span>
                <span className="text-xs font-bold" style={{ color: theme.primary }}>
                  {open ? 'Hide' : 'See'}
                </span>
              </button>
              {open && (
                <div className="px-3.5 pb-3">
                  <DayBody day={d} onOpen={onOpen} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

const QuickBody: React.FC<{ t: QuickWorkoutTemplate }> = ({ t }) => (
  <div className="space-y-3">
    <p className="text-[13px] leading-relaxed text-neutral-200">{t.description}</p>
    <div className="grid grid-cols-3 gap-2 text-center">
      <div className="rounded-2xl glass-inset px-2 py-3">
        <Timer className="mx-auto h-4 w-4 text-sky-300" />
        <div className="mt-1 text-base font-bold tabular-nums text-white">{t.durationMinutes}</div>
        <div className="text-xs text-neutral-400">minutes</div>
      </div>
      <div className="rounded-2xl glass-inset px-2 py-3">
        <Flame className="mx-auto h-4 w-4 text-orange-300" />
        <div className="mt-1 text-base font-bold tabular-nums text-white">~{t.estimatedCalories}</div>
        <div className="text-xs text-neutral-400">kcal</div>
      </div>
      <div className="rounded-2xl glass-inset px-2 py-3">
        <Zap className="mx-auto h-4 w-4 text-amber-300" />
        <div className="mt-1 text-base font-bold tabular-nums text-white">{t.rpe} / 10</div>
        <div className="text-xs text-neutral-400">effort</div>
      </div>
    </div>
    <p className="text-xs leading-relaxed text-neutral-400">Logging it saves a {t.category.toLowerCase()} session of {t.durationMinutes} minutes with these estimates, for when you did the workout away from the app.</p>
  </div>
);

/** A read-through of any workout preset before it is started, saved or logged. */
export const PresetPreview: React.FC<{ preset: Preset | null; theme: ColorPalette; onClose: () => void; actions?: PreviewAction[] }> = ({ preset, theme, onClose, actions = [] }) => {
  const [guide, setGuide] = useState<Exercise | null>(null);
  if (!preset) return null;
  const title =
    preset.kind === 'strength' ? preset.title : preset.kind === 'plan' ? preset.plan.name : preset.kind === 'intervals' ? preset.name : preset.kind === 'quick' ? preset.template.title : preset.day.title;
  const icon =
    preset.kind === 'plan' ? <CalendarDays className="h-4 w-4" style={{ color: theme.primary }} /> : preset.kind === 'strength' || preset.kind === 'day' ? <Dumbbell className="h-4 w-4" style={{ color: theme.primary }} /> : <Timer className="h-4 w-4" style={{ color: theme.primary }} />;
  return (
    <>
      <Modal
        isOpen
        onClose={onClose}
        title={title}
        icon={icon}
        footer={
          actions.length > 0 ? (
            <div className="flex gap-2">
              {actions.map((a) => (
                <button
                  key={a.label}
                  onClick={a.onClick}
                  className={`${a.primary ? 'flex-1' : ''} rounded-full px-4 py-3 text-sm font-extrabold`}
                  style={a.primary ? { backgroundColor: theme.primary, color: '#000' } : { border: '1px solid #2A3040', color: '#E5E7EB' }}
                >
                  {a.label}
                </button>
              ))}
            </div>
          ) : undefined
        }
      >
        {preset.kind === 'strength' && (
          <div className="space-y-3">
            {preset.blurb && <p className="text-[12px] leading-relaxed text-neutral-300">{preset.blurb}</p>}
            <ExerciseList ids={preset.exerciseIds} onOpen={setGuide} />
          </div>
        )}
        {preset.kind === 'plan' && <PlanBody plan={preset.plan} theme={theme} onOpen={setGuide} />}
        {preset.kind === 'intervals' && (
          <div className="space-y-3">
            <p className="text-[12px] leading-relaxed text-neutral-300">{preset.description}</p>
            <IntervalOutline steps={preset.steps} />
          </div>
        )}
        {preset.kind === 'quick' && <QuickBody t={preset.template} />}
        {preset.kind === 'day' && <DayBody day={preset.day} onOpen={setGuide} />}
      </Modal>
      <ExerciseGuide exercise={guide} onClose={() => setGuide(null)} />
    </>
  );
};
