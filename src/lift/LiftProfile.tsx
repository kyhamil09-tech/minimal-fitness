import React, { useMemo, useState } from 'react';
import { WorkoutSession } from '../types/health';
import { BodyEntry, UserProfile } from '../types/tracking';
import { MUSCLE_GROUPS } from '../data/exercises';
import { liftingWorkouts, setsByMuscle, workoutTotals, workoutsPerWeek } from '../lib/lifting';
import { personalRecords } from '../lib/calc';
import { toHevyCsv } from '../lib/importers/liftCsv';
import { downloadTextFile, workoutsToJson } from '../lib/backup';
import { usePrefs } from '../lib/prefs';
import { useT } from '../lib/i18n';
import { formatWeight } from '../lib/units';
import { Donut, Header, MiniBars, Sheet, Stat } from './ui';
import { RecoveryCard } from './RecoveryCard';
import { AlertSettings, GearSettings, ReminderSettings } from './LiftSettings';
import { BIG_LIFTS, muscleVolume, strengthScore } from '../lib/liftStats';
import { RPE_CHART, RPE_STEPS, rirFromRpe } from '../lib/oneRepMax';
import { kgToDisplay, weightUnit } from '../lib/units';

const REST_CHOICES = [0, 30, 60, 90, 120, 180];

interface ProfileProps {
  profile: UserProfile;
  workouts: WorkoutSession[];
  onOpenExercise: (id: string) => void;
  onOpenRecords: () => void;
  onOpenBody: () => void;
  latestBody?: BodyEntry;
  onOpenImport: () => void;
  onExit: () => void;
}

/** The Profile tab: how training is going, your records, and the few settings that belong to this side of the app. */
export const LiftProfile: React.FC<ProfileProps> = ({ profile, workouts, onOpenExercise, onOpenRecords, onOpenBody, latestBody, onOpenImport, onExit }) => {
  const { prefs, setPrefs } = usePrefs();
  const tr = useT();
  const units = profile.units;
  const [note, setNote] = useState('');
  const [range, setRange] = useState<7 | 30>(7);
  const [chartOpen, setChartOpen] = useState(false);
  const now = Date.now();
  const list = useMemo(() => liftingWorkouts(workouts), [workouts]);
  const total = useMemo(() => list.reduce((s, w) => s + workoutTotals(w).volumeKg, 0), [list]);
  const weeks = useMemo(() => workoutsPerWeek(workouts, now, 8), [workouts]); // eslint-disable-line react-hooks/exhaustive-deps
  const byMuscle = useMemo(() => setsByMuscle(workouts, now, range), [workouts, range]); // eslint-disable-line react-hooks/exhaustive-deps
  const volume = useMemo(() => muscleVolume(workouts, now, 30), [workouts]); // eslint-disable-line react-hooks/exhaustive-deps
  const score = useMemo(() => strengthScore(workouts), [workouts, prefs.liftFormula]);
  const volumeTotal = MUSCLE_GROUPS.reduce((n, m) => n + volume[m], 0);
  const records = useMemo(
    () =>
      Object.values(personalRecords(workouts))
        .sort((a, b) => b.oneRepMax - a.oneRepMax)
        .slice(0, 8),
    [workouts, prefs.liftFormula]
  );
  const topSets = Math.max(1, ...MUSCLE_GROUPS.map((m) => byMuscle[m]));
  const thisWeek = weeks[weeks.length - 1]?.count ?? 0;

  const exportCsv = async () => {
    try {
      await downloadTextFile('minimal-fitness-lifting.csv', toHevyCsv(list), 'text/csv');
      setNote('Exported in Hevy’s CSV layout, with weights in kg.');
    } catch {
      setNote('Could not export. Try again.');
    }
  };

  const exportJson = async () => {
    try {
      await downloadTextFile('minimal-fitness-lifting.json', workoutsToJson(list), 'application/json');
      setNote('Exported every workout with all its sets, weights in kg.');
    } catch {
      setNote('Could not export. Try again.');
    }
  };

  const seg = (value: string, options: { id: string; label: string }[], onChange: (v: string) => void, label: string) => (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} className="l-chip" onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <Header title={tr('lift.prof.title')} sub={profile.name || undefined} />
      <div className="l-scroll">
        <div className="l-card mt-4 grid grid-cols-3 gap-2 p-4 text-center">
          <Stat label={tr('lift.prof.workouts')} value={list.length} />
          <Stat label={tr('lift.prof.thisWeek')} value={thisWeek} />
          <Stat label={tr('lift.prof.totalVolume')} value={formatWeight(total, units, 0)} />
        </div>

        <h2 className="l-h2">{tr('lift.prof.perWeek')}</h2>
        <div className="l-card p-4">
          <MiniBars
            ariaLabel="Workouts per week, oldest first"
            bars={weeks.map((w) => ({ label: new Date(w.week + 'T12:00:00').toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }), value: w.count }))}
          />
        </div>

        <h2 className="l-h2">Body</h2>
        <button type="button" className="l-card flex w-full items-center justify-between gap-3 p-4 text-left" style={{ color: 'var(--l-text)' }} onClick={onOpenBody}>
          <span className="min-w-0">
            <span className="block text-[15px] font-bold">{latestBody ? `${kgToDisplay(latestBody.weightKg, units)} ${weightUnit(units)}` : 'Weight and measurements'}</span>
            <span className="l-dim block text-xs">{latestBody ? `Last logged ${latestBody.date}. Log weight, body fat and tape measurements.` : 'Log your weight, body fat and tape measurements, and see how they change.'}</span>
          </span>
          <span className="l-btn shrink-0">Open</span>
        </button>

        <h2 className="l-h2">{tr('lift.prof.strength')}</h2>
        <div className="l-card p-4">
          {score.done === 0 ? (
            <p className="l-dim text-sm">Log a squat, bench press, deadlift or overhead press and your strength total appears here. It adds up the best estimated one-rep max of each.</p>
          ) : (
            <>
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-3xl font-bold tabular-nums">
                    {Math.round(kgToDisplay(score.totalKg, units))} <span className="l-dim text-base font-semibold">{weightUnit(units)}</span>
                  </div>
                  <div className="l-dim text-xs">Strength total, {score.done} of 4 lifts</div>
                </div>
                {profile.weightKg > 0 && score.done === 4 && (
                  <div className="text-right">
                    <div className="text-xl font-bold tabular-nums">{(score.totalKg / profile.weightKg).toFixed(1)}×</div>
                    <div className="l-dim text-xs">body weight</div>
                  </div>
                )}
              </div>
              <ul className="mt-3 space-y-1.5 text-sm">
                {score.lifts.map((l) => (
                  <li key={l.id}>
                    <button type="button" className="flex w-full items-center justify-between py-1 text-left" style={{ background: 'transparent', border: 0, color: 'var(--l-text)' }} onClick={() => onOpenExercise(l.id)}>
                      <span>{l.label}</span>
                      <span className="tabular-nums">{l.e1rmKg > 0 ? `${Math.round(kgToDisplay(l.e1rmKg, units))} ${weightUnit(units)}` : '–'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <h2 className="l-h2">{tr('lift.prof.volume30')}</h2>
        <div className="l-card p-4">
          {volumeTotal > 0 ? (
            <Donut
              ariaLabel="Share of lifting volume by muscle group over 30 days"
              center={formatWeight(volumeTotal, units, 0)}
              slices={MUSCLE_GROUPS.map((m) => ({ label: m, value: volume[m] })).sort((a, b) => b.value - a.value)}
              format={(v) => (volumeTotal ? `${Math.round((v / volumeTotal) * 100)}%` : '0%')}
            />
          ) : (
            <p className="l-dim text-sm">Nothing lifted in the last 30 days.</p>
          )}
        </div>

        <div className="flex items-end justify-between">
          <h2 className="l-h2">{tr('lift.prof.hardSets')}</h2>
          <div className="flex gap-2" role="group" aria-label="Period">
            {[7, 30].map((d) => (
              <button key={d} type="button" className="l-chip" aria-pressed={range === d} onClick={() => setRange(d as 7 | 30)}>
                {d} days
              </button>
            ))}
          </div>
        </div>
        <p className="l-dim mb-2 mt-1 text-xs">A hard set is a finished working set at effort 7 or more (sets with no effort logged count). About 10 a week per muscle is a common target.</p>
        <div className="l-card space-y-2.5 p-4">
          {MUSCLE_GROUPS.map((m) => (
            <div key={m} className="flex items-center gap-3 text-sm">
              <span className="w-24 shrink-0">{m}</span>
              <div className="l-bar flex-1" aria-hidden="true">
                <span style={{ width: `${Math.round((byMuscle[m] / topSets) * 100)}%` }} />
              </div>
              <span className="w-6 text-right tabular-nums" aria-label={`${byMuscle[m]} sets`}>
                {byMuscle[m]}
              </span>
            </div>
          ))}
        </div>

        <RecoveryCard workouts={workouts} />

        <div className="flex items-end justify-between">
          <h2 className="l-h2">{tr('lift.prof.records')}</h2>
          <button type="button" className="l-btn l-btn-quiet !min-h-9 !px-2 !text-xs" onClick={onOpenRecords}>
            {tr('lift.prof.seeAll')}
          </button>
        </div>
        {records.length === 0 ? (
          <p className="l-dim text-sm">Your best lifts show up here once you have logged a few workouts.</p>
        ) : (
          <ul className="l-card divide-y" style={{ borderColor: 'var(--l-line)' }}>
            {records.map((r, i) => (
              <li key={r.exerciseId}>
                <button type="button" className="flex min-h-[52px] w-full items-center justify-between gap-3 px-4 py-2 text-left" style={{ background: 'transparent', border: 0, color: 'var(--l-text)', borderTop: i > 0 ? '1px solid var(--l-line)' : 0 }} onClick={() => onOpenExercise(r.exerciseId)}>
                  <span className="min-w-0 truncate text-[15px] font-semibold">{r.name}</span>
                  <span className="shrink-0 text-sm tabular-nums">
                    {formatWeight(r.weightKg, units)} × {r.reps}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <h2 className="l-h2">{tr('lift.prof.settings')}</h2>
        <div className="l-card space-y-5 p-4">
          <div>
            <div className="mb-2 text-sm font-semibold">{tr('lift.prof.look')}</div>
            {seg(prefs.liftTheme, [{ id: 'dark', label: tr('lift.prof.dark') }, { id: 'light', label: tr('lift.prof.light') }, { id: 'auto', label: tr('lift.prof.auto') }], (v) => setPrefs({ liftTheme: v as 'dark' | 'light' | 'auto' }), 'Look')}
          </div>
          <div>
            <div className="mb-2 text-sm font-semibold">{tr('lift.prof.restTimer')}</div>
            {seg(String(prefs.liftRest), REST_CHOICES.map((s) => ({ id: String(s), label: s === 0 ? 'Off' : s < 60 ? `${s} s` : `${s / 60} min` })), (v) => setPrefs({ liftRest: Number(v) }), 'Rest timer')}
          </div>
          <button type="button" role="switch" aria-checked={prefs.liftRpe} className="flex min-h-11 w-full items-center justify-between text-left" style={{ background: 'transparent', border: 0, color: 'var(--l-text)' }} onClick={() => setPrefs({ liftRpe: !prefs.liftRpe })}>
            <span>
              <span className="block text-sm font-semibold">Effort (RPE) for each set</span>
              <span className="l-dim block text-xs">Adds a 1 to 10 box to every set</span>
            </span>
            <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: prefs.liftRpe ? 'var(--l-fill)' : 'var(--l-s2)', color: prefs.liftRpe ? 'var(--l-on-fill)' : 'var(--l-dim-s2)' }}>
              {prefs.liftRpe ? 'On' : 'Off'}
            </span>
          </button>

          {prefs.liftRpe && (
            <div>
              <div className="mb-2 text-sm font-semibold">Target effort (RPE)</div>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Target effort">
                {[7, 7.5, 8, 8.5, 9].map((v) => (
                  <button key={v} type="button" role="radio" aria-checked={prefs.liftTargetRpe === v} className="l-chip" onClick={() => setPrefs({ liftTargetRpe: v })}>
                    {v}
                  </button>
                ))}
              </div>
              <p className="l-dim mt-1 text-xs">After a set with an effort, the next set suggests the weight that should land here.</p>
            </div>
          )}
          <button type="button" role="switch" aria-checked={prefs.startInLift} className="flex min-h-11 w-full items-center justify-between text-left" style={{ background: 'transparent', border: 0, color: 'var(--l-text)' }} onClick={() => setPrefs({ startInLift: !prefs.startInLift })}>
            <span>
              <span className="block text-sm font-semibold">Open the app on Lift</span>
              <span className="l-dim block text-xs">Skip the main app when you open it</span>
            </span>
            <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: prefs.startInLift ? 'var(--l-fill)' : 'var(--l-s2)', color: prefs.startInLift ? 'var(--l-on-fill)' : 'var(--l-dim-s2)' }}>
              {prefs.startInLift ? 'On' : 'Off'}
            </span>
          </button>
          <div>
            <div className="mb-2 text-sm font-semibold">One-rep max formula</div>
            {seg(prefs.liftFormula, [{ id: 'epley', label: 'Epley' }, { id: 'brzycki', label: 'Brzycki' }], (v) => setPrefs({ liftFormula: v as 'epley' | 'brzycki' }), 'One-rep max formula')}
            <p className="l-dim mt-2 text-xs">Used to estimate your max from a lighter set. When you log effort (RPE) for a set, the effort chart is used instead.</p>
            <button type="button" className="l-btn l-btn-quiet mt-1 !px-0 !text-xs" onClick={() => setChartOpen(true)}>
              Effort (RPE) chart
            </button>
          </div>
          <div>
            <div className="mb-2 text-sm font-semibold">Weekly goal</div>
            {seg(String(prefs.liftWeekGoal), [1, 2, 3, 4, 5, 6, 7].map((n) => ({ id: String(n), label: `${n}×` })), (v) => setPrefs({ liftWeekGoal: Number(v) }), 'Workouts a week')}
            <p className="l-dim mt-2 text-xs">The ring on the Workout tab fills toward this many workouts a week.</p>
          </div>
          <GearSettings unit={units === 'imperial' ? 'lb' : 'kg'} />
          <AlertSettings />
          <ReminderSettings />
          <p className="l-dim text-xs">Weights are shown in {units === 'imperial' ? 'pounds' : 'kilograms'}. Change this under Profile & goals in the main app.</p>
        </div>

        <h2 className="l-h2">{tr('lift.prof.yourData')}</h2>
        <div className="space-y-2">
          <button type="button" className="l-btn w-full" onClick={onOpenImport}>
            {tr('lift.prof.importHevy')}
          </button>
          <button type="button" className="l-btn w-full" onClick={() => void exportCsv()} disabled={list.length === 0}>
            {tr('lift.prof.exportCsv')}
          </button>
          <button type="button" className="l-btn w-full" onClick={() => void exportJson()} disabled={list.length === 0}>
            {tr('lift.prof.exportJson')}
          </button>
          {note && (
            <p role="status" className="l-dim text-sm">
              {note}
            </p>
          )}
          <p className="l-dim text-xs">Everything stays on this phone. Imports and exports are files you choose.</p>
        </div>

        <Sheet open={chartOpen} onClose={() => setChartOpen(false)} title="Effort (RPE) chart">
          <p className="l-dim mb-2 text-xs">Percent of your one-rep max for a number of reps at an effort. RPE 10 is nothing left; RPE 8 is two reps left (RIR 2).</p>
          <div className="overflow-x-auto">
            <table className="w-full text-center text-xs tabular-nums">
              <caption className="sr-only">Percent of one-rep max by reps and effort</caption>
              <thead>
                <tr>
                  <th scope="col" className="l-dim py-1">Reps</th>
                  {RPE_STEPS.map((r) => (
                    <th key={r} scope="col" className="py-1">
                      {r}
                      <span className="l-dim block text-[10px] font-normal">RIR {rirFromRpe(r)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {RPE_CHART.map((row, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--l-line)' }}>
                    <th scope="row" className="l-dim py-1.5">{i + 1}</th>
                    {row.map((p, j) => (
                      <td key={j} className="py-1.5">{p}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Sheet>

        <button type="button" className="l-btn mt-6 w-full" onClick={onExit}>
          {tr('lift.prof.back')}
        </button>
        <div className="h-8" />
      </div>
    </>
  );
};
