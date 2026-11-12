import React, { useRef, useState } from 'react';
import { FileUp, ShieldCheck } from 'lucide-react';
import { Modal } from './ui/Modal';
import { ColorPalette } from '../types/theme';
import { Exercise, UserProfile } from '../types/tracking';
import { SleepLogEntry, WorkoutSession } from '../types/health';
import { ImportOutcome, importFiles } from '../lib/importers';
import { mergeImportedNights, mergeImportedWorkouts } from '../lib/importers/merge';
import { ImportProgress } from '../lib/importers/types';
import { distanceUnit, kmToDisplay } from '../lib/units';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  theme: ColorPalette;
  profile: UserProfile;
  workouts: WorkoutSession[];
  sleepLogs: SleepLogEntry[];
  onApply: (workouts: WorkoutSession[], nights: SleepLogEntry[], exercises: Exercise[]) => void;
}

const SOURCES: { name: string; how: string }[] = [
  { name: 'Strava', how: 'Settings → My Account → Download or Delete Your Account → Request Your Archive. Choose the zip you are emailed.' },
  { name: 'Google Takeout (Fitbit, Google Fit)', how: 'takeout.google.com → pick Fitbit and/or Google Fit → export. Choose the zip. Fitbit sleep and exercise come across; Google Fit activities come as TCX.' },
  { name: 'Nike Run Club', how: 'Nike Privacy settings → request your data. Choose the zip you are sent. This format is read on a best-effort basis: tell me if yours is skipped.' },
  { name: 'Hevy', how: 'Profile → Settings → Export & Import Data → Export Data. Choose the CSV file. Every set comes across, with warm-up, drop and failure sets, supersets, notes and effort.' },
  { name: 'Strong', how: 'Settings → Export Strong Data. Choose the CSV file, and say below whether its weights are in kg or lb (Strong does not write the unit in the file).' },
  { name: 'Garmin, Wahoo, Coros, Polar, Suunto and others', how: 'Export the activity as FIT, TCX or GPX, or the account export zip, and choose those files.' },
];

const fmtDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });

/** Reads your history from another app's export, shows what it found, and adds it only when you say so. */
export const ImportModal: React.FC<Props> = ({ isOpen, onClose, theme, profile, workouts, sleepLogs, onApply }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [showSkipped, setShowSkipped] = useState(false);
  // Strong files carry no unit, so the person says which one their weights are in.
  const [liftUnit, setLiftUnit] = useState<'kg' | 'lb'>(profile.units === 'imperial' ? 'lb' : 'kg');

  const reset = () => {
    setOutcome(null);
    setProgress(null);
    setError('');
    setDone('');
    setShowSkipped(false);
  };

  const pick = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    reset();
    setBusy(true);
    try {
      setOutcome(await importFiles(Array.from(list), profile, setProgress, { liftUnit }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read those files.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const preview = outcome ? mergeImportedWorkouts(workouts, outcome.workouts) : null;
  const nightPreview = outcome ? mergeImportedNights(sleepLogs, outcome.nights) : null;
  const newWorkouts = preview?.added ?? [];
  const byType = newWorkouts.reduce<Record<string, number>>((m, w) => ({ ...m, [w.type]: (m[w.type] ?? 0) + 1 }), {});
  const times = newWorkouts.map((w) => w.startedAt ?? 0).filter(Boolean);
  const km = newWorkouts.reduce((s, w) => s + (w.distanceKm ?? 0), 0);
  const nothing = !!outcome && newWorkouts.length === 0 && (nightPreview?.added ?? 0) === 0;

  const apply = () => {
    if (!outcome || !preview || !nightPreview) return;
    onApply(newWorkouts, outcome.nights, outcome.exercises);
    setDone(`Added ${newWorkouts.length} workout${newWorkouts.length === 1 ? '' : 's'} and ${nightPreview.added} night${nightPreview.added === 1 ? '' : 's'}.`);
    setOutcome(null);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Import your history" icon={<FileUp className="w-4 h-4" style={{ color: theme.primary }} />}>
      <div className="space-y-4">
        <div className="rounded-2xl glass-inset p-3.5 flex items-start gap-2.5 text-[12px] text-neutral-300 leading-relaxed">
          <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" style={{ color: theme.primary }} />
          <span>The files are read on this phone and go nowhere. Nothing is added until you confirm, and anything already in the app is skipped.</span>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-2xl glass-inset p-3" role="group" aria-label="Weights in a Strong file">
          <span className="text-xs text-neutral-300">Weights in a Strong file are in</span>
          <span className="flex gap-1.5">
            {(['kg', 'lb'] as const).map((u) => (
              <button key={u} type="button" onClick={() => setLiftUnit(u)} aria-pressed={liftUnit === u} className="sport-pill !py-1.5 !px-3.5 !text-xs">
                {u}
              </button>
            ))}
          </span>
        </div>

        <input ref={inputRef} type="file" multiple accept=".zip,.gpx,.tcx,.fit,.gz,.json,.csv,application/zip,application/json" className="hidden" onChange={(e) => void pick(e.target.files)} aria-label="Choose export files" />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="w-full py-3 rounded-2xl text-sm font-extrabold text-black disabled:opacity-50"
          style={{ backgroundColor: theme.primary }}
        >
          {busy ? 'Reading…' : outcome ? 'Choose different files' : 'Choose files or a zip'}
        </button>

        {busy && progress && (
          <p className="text-xs text-neutral-400 text-center" role="status">
            {progress.seen} files looked at · {progress.workouts} workouts · {progress.nights} nights found
            {progress.current ? ` · ${progress.current.split('/').pop()}` : ''}
          </p>
        )}
        {error && <p className="text-xs text-rose-300">{error}</p>}
        {done && <p className="text-sm text-emerald-300 font-semibold">{done}</p>}

        {outcome && (
          <div className="space-y-3">
            <div className="rounded-2xl glass-inset p-4 space-y-2">
              <div className="text-sm font-bold text-white">Found in {outcome.filesSeen} file{outcome.filesSeen === 1 ? '' : 's'}</div>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-xl bg-white/5 p-2.5">
                  <div className="text-xl font-semibold text-white tabular-nums">{newWorkouts.length}</div>
                  <div className="text-xs text-neutral-400">new workouts</div>
                </div>
                <div className="rounded-xl bg-white/5 p-2.5">
                  <div className="text-xl font-semibold text-white tabular-nums">{nightPreview?.added ?? 0}</div>
                  <div className="text-xs text-neutral-400">new nights</div>
                </div>
              </div>
              {outcome.lift && (
                <p className="text-xs text-neutral-300 leading-relaxed">
                  {outcome.lift.source} lifting file: {outcome.lift.matched} sets matched to exercises in the library{outcome.lift.created > 0 ? `, ${outcome.lift.created} exercise${outcome.lift.created === 1 ? '' : 's'} added as your own` : ''}.
                </p>
              )}
              {newWorkouts.length > 0 && (
                <p className="text-xs text-neutral-400 leading-relaxed">
                  {Object.entries(byType).map(([t, n]) => `${n} ${t.toLowerCase()}`).join(', ')} · {kmToDisplay(km, profile.units, 0)} {distanceUnit(profile.units)} in total
                  {times.length ? ` · ${fmtDate(Math.min(...times))} to ${fmtDate(Math.max(...times))}` : ''}
                </p>
              )}
              {((preview?.duplicates ?? 0) > 0 || (nightPreview?.duplicates ?? 0) > 0) && (
                <p className="text-xs text-neutral-400">
                  Skipped as already in the app: {preview?.duplicates ?? 0} workouts, {nightPreview?.duplicates ?? 0} nights.
                </p>
              )}
            </div>

            {nothing ? (
              <p className="text-xs text-neutral-300 leading-relaxed">Nothing new to add. Everything in those files is already in the app, or the files had no activities this app can read.</p>
            ) : (
              <button type="button" onClick={apply} className="w-full py-3 rounded-2xl text-sm font-extrabold text-black" style={{ backgroundColor: theme.primary }}>
                Add {newWorkouts.length} workout{newWorkouts.length === 1 ? '' : 's'}
                {(nightPreview?.added ?? 0) > 0 ? ` and ${nightPreview?.added} night${nightPreview?.added === 1 ? '' : 's'}` : ''}
              </button>
            )}

            {outcome.skipped.length > 0 && (
              <div>
                <button type="button" onClick={() => setShowSkipped((v) => !v)} className="text-xs text-neutral-400 underline">
                  {outcome.skipped.length} file{outcome.skipped.length === 1 ? '' : 's'} skipped {showSkipped ? '(hide)' : '(why?)'}
                </button>
                {showSkipped && (
                  <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto text-xs text-neutral-400">
                    {outcome.skipped.slice(0, 80).map((s, i) => (
                      <li key={i}>
                        <span className="text-neutral-300">{s.name.split('/').pop()}</span>: {s.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {!outcome && !busy && (
          <div className="space-y-2.5">
            <div className="text-sm text-neutral-200 font-bold">Where to get your data</div>
            {SOURCES.map((s) => (
              <div key={s.name} className="rounded-2xl glass-inset p-3">
                <div className="text-xs font-bold text-white">{s.name}</div>
                <p className="text-xs text-neutral-400 mt-1 leading-relaxed">{s.how}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};
