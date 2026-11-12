import React, { useState } from 'react';
import { ChevronDown, ClipboardList, EllipsisVertical, Flame, FolderPlus, Plus } from 'lucide-react';
import { WorkoutSession } from '../types/health';
import { Exercise, ExerciseLog, Routine, RoutineSet, UserProfile } from '../types/tracking';
import { getExercise } from '../data/exercises';
import { STRENGTH_TEMPLATES } from '../data/templates';
import { liftingWorkouts, logsToRepeat, workoutTotals, workoutsPerWeek } from '../lib/lifting';
import { daysAgoText, weekVolumeKg, weeklyStreak } from '../lib/liftStats';
import { routineLogs } from '../lib/routines';
import { dayIndex, daysText, routinesForDay } from '../lib/liftSchedule';
import { RoutineEditor } from './RoutineEditor';
import { ProgramsCard } from './Programs';
import { DeloadCard } from './DeloadCard';
import type { ProgramState } from '../lib/programs';
import { ImportRoutineSheet, ShareRoutineSheet } from './RoutineShare';
import { EmptyState, MuscleBadge, ProgressRing } from './visuals';
import { usePrefs } from '../lib/prefs';
import { addFolder, deleteFolder, groupRoutines, moveRoutine, renameFolder } from '../lib/routineFolders';
import { formatWeight } from '../lib/units';
import { ExercisePicker } from './ExercisePicker';
import { Header, Sheet } from './ui';
import { useT } from '../lib/i18n';

export interface StartOptions {
  title?: string;
  logs?: ExerciseLog[];
  /** Set when the workout is the next one of a program (see lib/programs). */
  program?: { id: string; index: number };
}

interface LiftHomeProps {
  profile: UserProfile;
  workouts: WorkoutSession[];
  routines: Routine[];
  /** Folder names, in order. Empty folders are kept. */
  folders: string[];
  custom: Exercise[];
  onCustomChange: (list: Exercise[]) => void;
  onStart: (ids: string[], opts?: StartOptions) => void;
  program: ProgramState | null;
  onProgramChange: (p: ProgramState | null) => void;
  onSaveRoutine: (name: string, exerciseIds: string[], folder?: string, targets?: Record<string, RoutineSet[]>) => void;
  /** Replaces the whole list of routines (after a rename, a move or a delete). */
  onRoutinesChange: (routines: Routine[]) => void;
  onFoldersChange: (folders: string[]) => void;
}

const names = (ids: string[], max = 3): string => {
  const n = ids.map((id) => getExercise(id)?.name).filter(Boolean) as string[];
  return n.slice(0, max).join(', ') + (n.length > max ? ` +${n.length - max} more` : '');
};

const when = (ms: number): string => new Date(ms).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

type FolderEdit = { mode: 'new' } | { mode: 'rename'; from: string } | { mode: 'new-for-routine'; routineId: string };

/** The Workout tab: start an empty workout, a routine of yours (kept in folders if you like), a starter routine, or repeat a recent one. */
export const LiftHome: React.FC<LiftHomeProps> = ({ profile, workouts, routines, folders, custom, onCustomChange, onStart, program, onProgramChange, onSaveRoutine, onRoutinesChange, onFoldersChange }) => {
  const [building, setBuilding] = useState(false);
  const tr = useT();
  const { prefs } = usePrefs();
  const [pending, setPending] = useState<string[] | null>(null);
  const [routineName, setRoutineName] = useState('');
  const [routineFolder, setRoutineFolder] = useState<string | undefined>(undefined);
  const [menuFor, setMenuFor] = useState<Routine | null>(null);
  const [moving, setMoving] = useState<Routine | null>(null);
  const [renaming, setRenaming] = useState<Routine | null>(null);
  const [renameText, setRenameText] = useState('');
  const [deleting, setDeleting] = useState<Routine | null>(null);
  const [editing, setEditing] = useState<Routine | null>(null);
  const [sharing, setSharing] = useState<Routine | null>(null);
  const [importing, setImporting] = useState(false);
  const [folderEdit, setFolderEdit] = useState<FolderEdit | null>(null);
  const [folderText, setFolderText] = useState('');
  const [folderError, setFolderError] = useState('');
  const [folderMenu, setFolderMenu] = useState<string | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const recent = liftingWorkouts(workouts).slice(0, 3);
  const groups = groupRoutines(routines, folders);
  const hasFolders = folders.length > 0;

  const saveNew = () => {
    const name = routineName.trim();
    if (!name || !pending?.length) return;
    onSaveRoutine(name, pending, routineFolder);
    setPending(null);
    setRoutineName('');
    setRoutineFolder(undefined);
  };

  const submitFolder = () => {
    if (!folderEdit) return;
    if (folderEdit.mode === 'rename') {
      const r = renameFolder(folders, routines, folderEdit.from, folderText);
      if ('error' in r) return setFolderError(r.error);
      onFoldersChange(r.folders);
      onRoutinesChange(r.routines);
    } else {
      const next = addFolder(folders, folderText);
      if ('error' in next) return setFolderError(next.error);
      onFoldersChange(next);
      const made = next[next.length - 1];
      if (folderEdit.mode === 'new-for-routine') onRoutinesChange(moveRoutine(routines, folderEdit.routineId, made));
    }
    setFolderEdit(null);
    setFolderText('');
    setFolderError('');
  };

  const openFolderForm = (edit: FolderEdit, text = '') => {
    setFolderEdit(edit);
    setFolderText(text);
    setFolderError('');
  };

  const card = (r: Routine) => (
    <li key={r.id} className="l-card p-3">
      <div className="flex items-start justify-between gap-3">
        <MuscleBadge group={getExercise(r.exerciseIds[0])?.muscle ?? 'Full Body'} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-bold">{r.name}</div>
          <div className="l-dim line-clamp-2 text-xs">{names(r.exerciseIds)}</div>
          {r.days?.length ? <div className="mt-0.5 text-xs font-semibold" style={{ color: 'var(--l-accent)' }}>{daysText(r.days)}</div> : null}
        </div>
        <button type="button" className="l-icon-btn -mr-2 -mt-2" onClick={() => setMenuFor(r)} aria-label={`Options for ${r.name}`}>
          <EllipsisVertical className="l-dim h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <button type="button" className="l-btn mt-2 w-full" onClick={() => onStart(r.exerciseIds, { title: r.name, logs: routineLogs(r) })}>
        {tr('lift.home.startRoutine')}
      </button>
    </li>
  );

  return (
    <>
      <Header title={tr('lift.tab.workout')} />
      <div className="l-scroll">
        {(() => {
          const now = Date.now();
          const all = liftingWorkouts(workouts);
          if (all.length === 0) return null;
          const week = workoutsPerWeek(workouts, now, 1)[0]?.count ?? 0;
          const streak = weeklyStreak(workouts, now, 2).current;
          const goal = Math.max(1, prefs.liftWeekGoal);
          const last = all[0];
          const lastAt = last.startedAt ?? Date.parse(last.timestamp);
          return (
            <section className="l-card l-hero l-rise mt-4 p-4" aria-label="This week">
              <div className="flex items-center gap-4">
                <ProgressRing value={week} goal={goal} label={`${week} of ${goal} workouts this week`}>
                  <span className="l-stat-big text-2xl leading-none">{week}</span>
                  <span className="l-dim text-[11px]">{tr('lift.home.ofGoal', { n: goal })}</span>
                </ProgressRing>
                <div className="min-w-0 flex-1">
                  <div className="text-lg font-extrabold leading-tight">{week >= goal ? tr('lift.home.goalDone') : tr('lift.home.goalMore', { n: goal - week })}</div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    <span className="flex items-center gap-1.5" style={{ color: streak > 0 ? 'var(--l-accent)' : 'var(--l-dim)' }}>
                      <Flame className="h-4 w-4" aria-hidden="true" />
                      <span className="l-stat-big">{streak}</span> <span className="l-dim text-xs">{tr('lift.home.weekStreak')}</span>
                    </span>
                    <span className="whitespace-nowrap">
                      <span className="l-stat-big">{formatWeight(weekVolumeKg(workouts, now), profile.units, 0)}</span> <span className="l-dim text-xs">{tr('lift.home.weekLifted')}</span>
                    </span>
                  </div>
                </div>
              </div>
              <div className="l-dim mt-3 border-t pt-3 text-center text-xs" style={{ borderColor: 'var(--l-line)' }}>
                {tr('lift.home.last')} <span style={{ color: 'var(--l-text)' }}>{last.title || last.planDayTitle || 'Workout'}</span> · {daysAgoText(lastAt, now)}
              </div>
            </section>
          );
        })()}

        <DeloadCard workouts={workouts} />

        <ProgramsCard profile={profile} workouts={workouts} program={program} onProgramChange={onProgramChange} onStart={onStart} />

        {(() => {
          const today = routinesForDay(routines, dayIndex(new Date()));
          if (today.length === 0) return null;
          return (
            <section aria-label={tr('lift.home.today')} className="mt-4">
              <h2 className="l-h2 !mt-0">{tr('lift.home.today')}</h2>
              <ul className="space-y-2">
                {today.map((r) => (
                  <li key={r.id} className="l-card l-rise flex items-center gap-3 p-3" style={{ borderLeft: '3px solid var(--l-accent)' }}>
                    <MuscleBadge group={getExercise(r.exerciseIds[0])?.muscle ?? 'Full Body'} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-bold">{r.name}</div>
                      <div className="l-dim line-clamp-1 text-xs">{names(r.exerciseIds)}</div>
                    </div>
                    <button type="button" className="l-btn l-btn-primary shrink-0" onClick={() => onStart(r.exerciseIds, { title: r.name, logs: routineLogs(r) })}>
                      {tr('lift.home.start')}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })()}

        <h2 className="l-h2">{tr('lift.home.quickStart')}</h2>
        <button type="button" className="l-btn l-btn-primary w-full" onClick={() => onStart([])}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {tr('lift.home.startEmpty')}
        </button>

        <div className="flex items-end justify-between">
          <h2 className="l-h2">{tr('lift.home.routines')}</h2>
          <div className="flex gap-1">
            <button type="button" className="l-btn l-btn-quiet !min-h-9 !px-3" onClick={() => openFolderForm({ mode: 'new' })}>
              <FolderPlus className="h-4 w-4" aria-hidden="true" />
              {tr('lift.home.newFolder')}
            </button>
            <button type="button" className="l-btn l-btn-quiet !min-h-9 !px-3" onClick={() => setBuilding(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {tr('lift.home.newRoutine')}
            </button>
          </div>
        </div>
        {routines.length === 0 && !hasFolders && <EmptyState icon={<ClipboardList className="h-7 w-7" />} title={tr('lift.home.routines')} text={tr('lift.home.emptyRoutines')} />}
        <button type="button" className="l-btn l-btn-quiet !min-h-9 !px-1 !text-xs" onClick={() => setImporting(true)}>
          {tr('lift.home.import')}
        </button>
        {groups.map((g) => {
          if (g.folder === null) {
            if (g.routines.length === 0) return null;
            return (
              <section key="none" aria-label={hasFolders ? 'Routines in no folder' : 'Routines'}>
                {hasFolders && <div className="l-dim mb-2 mt-4 text-xs font-bold uppercase">No folder</div>}
                <ul className="space-y-2">{g.routines.map(card)}</ul>
              </section>
            );
          }
          const open = !collapsed.includes(g.folder);
          return (
            <section key={g.folder} className="mt-3" aria-label={`Folder ${g.folder}`}>
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  className="flex min-h-11 flex-1 items-center gap-2 text-left"
                  style={{ background: 'transparent', border: 0, color: 'var(--l-text)' }}
                  aria-expanded={open}
                  onClick={() => setCollapsed((c) => (open ? [...c, g.folder as string] : c.filter((x) => x !== g.folder)))}
                >
                  <ChevronDown className={`h-4 w-4 transition-transform ${open ? '' : '-rotate-90'}`} aria-hidden="true" />
                  <span className="text-[15px] font-bold">{g.folder}</span>
                  <span className="l-dim text-xs">{g.routines.length}</span>
                </button>
                <button type="button" className="l-icon-btn -mr-2" onClick={() => setFolderMenu(g.folder)} aria-label={`Options for folder ${g.folder}`}>
                  <EllipsisVertical className="l-dim h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              {open && (g.routines.length === 0 ? <p className="l-dim pb-2 pl-6 text-sm">Empty. Open a routine’s options and choose “Move to folder”.</p> : <ul className="space-y-2">{g.routines.map(card)}</ul>)}
            </section>
          );
        })}

        {recent.length > 0 && (
          <>
            <h2 className="l-h2">{tr('lift.home.recent')}</h2>
            <ul className="space-y-2">
              {recent.map((w) => {
                const t = workoutTotals(w);
                return (
                  <li key={w.id} className="l-card flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <div className="truncate text-[15px] font-bold">{w.title || w.planDayTitle || 'Workout'}</div>
                      <div className="l-dim truncate text-xs">
                        {when(w.startedAt ?? 0)} · {t.exercises} exercises · {formatWeight(t.volumeKg, profile.units, 0)}
                      </div>
                    </div>
                    <button type="button" className="l-btn shrink-0" onClick={() => onStart(logsToRepeat(w).map((l) => l.exerciseId), { title: w.title || w.planDayTitle, logs: logsToRepeat(w) })}>
                      {tr('lift.home.repeat')}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <h2 className="l-h2">{tr('lift.home.starters')}</h2>
        <ul className="space-y-2">
          {STRENGTH_TEMPLATES.map((t) => (
            <li key={t.id} className="l-card flex items-center gap-3 p-3">
              <MuscleBadge group={getExercise(t.exerciseIds[0])?.muscle ?? 'Full Body'} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-bold">{t.name}</div>
                <div className="l-dim line-clamp-2 text-xs">{names(t.exerciseIds)}</div>
              </div>
              <button type="button" className="l-btn shrink-0" onClick={() => onStart(t.exerciseIds, { title: t.name })}>
                {tr('lift.home.start')}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {building && (
        <ExercisePicker
          title="New routine"
          workouts={workouts}
          custom={custom}
          onCustomChange={onCustomChange}
          onClose={() => setBuilding(false)}
          onPick={(ids) => {
            setBuilding(false);
            setPending(ids);
          }}
        />
      )}

      <ShareRoutineSheet routine={sharing} units={profile.units} onClose={() => setSharing(null)} />
      <ImportRoutineSheet open={importing} onClose={() => setImporting(false)} routines={routines} onRoutinesChange={onRoutinesChange} custom={custom} onCustomChange={onCustomChange} />

      {editing && (
        <RoutineEditor
          routine={editing}
          profile={profile}
          workouts={workouts}
          custom={custom}
          onCustomChange={onCustomChange}
          onClose={() => setEditing(null)}
          onSave={(r) => {
            onRoutinesChange(routines.map((x) => (x.id === r.id ? r : x)));
            setEditing(null);
          }}
        />
      )}

      {/* Name a new routine, and pick its folder */}
      <Sheet open={!!pending} onClose={() => setPending(null)} title="Name your routine">
        <p className="l-dim mb-3 text-sm">{pending ? names(pending, 5) : ''}</p>
        <label htmlFor="lh-routine" className="sr-only">
          Routine name
        </label>
        <input id="lh-routine" className="h-11 w-full px-3 text-base" value={routineName} onChange={(e) => setRoutineName(e.target.value)} placeholder="Push day" autoFocus />
        {hasFolders && (
          <div className="mt-3">
            <div className="l-dim mb-1 text-xs font-semibold">Folder</div>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Folder">
              <button type="button" role="radio" aria-checked={!routineFolder} className="l-chip" onClick={() => setRoutineFolder(undefined)}>
                No folder
              </button>
              {folders.map((f) => (
                <button key={f} type="button" role="radio" aria-checked={routineFolder === f} className="l-chip" onClick={() => setRoutineFolder(f)}>
                  {f}
                </button>
              ))}
            </div>
          </div>
        )}
        <button type="button" className="l-btn l-btn-primary mt-3 w-full" disabled={!routineName.trim()} onClick={saveNew}>
          Save routine
        </button>
      </Sheet>

      {/* One routine's options */}
      <Sheet open={!!menuFor} onClose={() => setMenuFor(null)} title={menuFor?.name ?? 'Routine'}>
        {menuFor && (
          <div className="space-y-1">
            <button type="button" className="l-btn w-full !justify-start" onClick={() => { setEditing(menuFor); setMenuFor(null); }}>
              Edit exercises and sets
            </button>
            <button type="button" className="l-btn w-full !justify-start" onClick={() => { setSharing(menuFor); setMenuFor(null); }}>
              Share routine
            </button>
            <button type="button" className="l-btn w-full !justify-start" onClick={() => { setRenameText(menuFor.name); setRenaming(menuFor); setMenuFor(null); }}>
              Rename
            </button>
            <button type="button" className="l-btn w-full !justify-start" onClick={() => { setMoving(menuFor); setMenuFor(null); }}>
              Move to folder{menuFor.folder ? ` (now in ${menuFor.folder})` : ''}
            </button>
            <button type="button" className="l-btn l-btn-danger w-full !justify-start" onClick={() => { setDeleting(menuFor); setMenuFor(null); }}>
              Delete routine
            </button>
          </div>
        )}
      </Sheet>

      <Sheet open={!!moving} onClose={() => setMoving(null)} title="Move to folder">
        {moving && (
          <div className="flex flex-col gap-2">
            <button type="button" className="l-btn w-full !justify-start" aria-pressed={!moving.folder} onClick={() => { onRoutinesChange(moveRoutine(routines, moving.id, undefined)); setMoving(null); }}>
              No folder
            </button>
            {folders.map((f) => (
              <button key={f} type="button" className="l-btn w-full !justify-start" aria-pressed={moving.folder === f} onClick={() => { onRoutinesChange(moveRoutine(routines, moving.id, f)); setMoving(null); }}>
                {f}
              </button>
            ))}
            <button type="button" className="l-btn l-btn-quiet w-full !justify-start" onClick={() => { openFolderForm({ mode: 'new-for-routine', routineId: moving.id }); setMoving(null); }}>
              <FolderPlus className="h-4 w-4" aria-hidden="true" />
              New folder…
            </button>
          </div>
        )}
      </Sheet>

      <Sheet open={!!renaming} onClose={() => setRenaming(null)} title="Rename routine">
        <label htmlFor="lh-rename" className="sr-only">
          Routine name
        </label>
        <input id="lh-rename" className="h-11 w-full px-3 text-base" value={renameText} maxLength={60} onChange={(e) => setRenameText(e.target.value)} />
        <button
          type="button"
          className="l-btn l-btn-primary mt-3 w-full"
          disabled={!renameText.trim()}
          onClick={() => {
            if (renaming) onRoutinesChange(routines.map((r) => (r.id === renaming.id ? { ...r, name: renameText.trim() } : r)));
            setRenaming(null);
          }}
        >
          Save
        </button>
      </Sheet>

      <Sheet open={!!deleting} onClose={() => setDeleting(null)} title="Delete routine?">
        <p className="l-dim mb-4 text-sm">“{deleting?.name}” will be removed. Workouts you already did with it stay in your history.</p>
        <div className="flex gap-2">
          <button type="button" className="l-btn flex-1" onClick={() => setDeleting(null)}>
            Keep it
          </button>
          <button
            type="button"
            className="l-btn flex-1"
            style={{ background: 'var(--l-fail)', borderColor: 'var(--l-fail)', color: 'var(--l-on-fail)' }}
            onClick={() => {
              if (deleting) onRoutinesChange(routines.filter((r) => r.id !== deleting.id));
              setDeleting(null);
            }}
          >
            Delete
          </button>
        </div>
      </Sheet>

      {/* Folders */}
      <Sheet open={!!folderEdit} onClose={() => setFolderEdit(null)} title={folderEdit?.mode === 'rename' ? 'Rename folder' : 'New folder'}>
        <label htmlFor="lh-folder" className="sr-only">
          Folder name
        </label>
        <input id="lh-folder" className="h-11 w-full px-3 text-base" value={folderText} maxLength={30} onChange={(e) => { setFolderText(e.target.value); setFolderError(''); }} placeholder="Push Pull Legs" autoFocus />
        {folderError && (
          <p role="alert" className="mt-2 text-sm" style={{ color: 'var(--l-fail)' }}>
            {folderError}
          </p>
        )}
        <button type="button" className="l-btn l-btn-primary mt-3 w-full" disabled={!folderText.trim()} onClick={submitFolder}>
          {folderEdit?.mode === 'rename' ? 'Save' : 'Create folder'}
        </button>
      </Sheet>

      <Sheet open={!!folderMenu} onClose={() => setFolderMenu(null)} title={folderMenu ?? 'Folder'}>
        {folderMenu && (
          <div className="space-y-1">
            <button type="button" className="l-btn w-full !justify-start" onClick={() => { openFolderForm({ mode: 'rename', from: folderMenu }, folderMenu); setFolderMenu(null); }}>
              Rename folder
            </button>
            <button type="button" className="l-btn l-btn-danger w-full !justify-start" onClick={() => { setDeletingFolder(folderMenu); setFolderMenu(null); }}>
              Delete folder
            </button>
          </div>
        )}
      </Sheet>

      <Sheet open={!!deletingFolder} onClose={() => setDeletingFolder(null)} title="Delete folder?">
        <p className="l-dim mb-4 text-sm">The folder “{deletingFolder}” goes away. Its routines are kept and move to the main list.</p>
        <div className="flex gap-2">
          <button type="button" className="l-btn flex-1" onClick={() => setDeletingFolder(null)}>
            Keep it
          </button>
          <button
            type="button"
            className="l-btn flex-1"
            style={{ background: 'var(--l-fail)', borderColor: 'var(--l-fail)', color: 'var(--l-on-fail)' }}
            onClick={() => {
              if (deletingFolder) {
                const r = deleteFolder(folders, routines, deletingFolder);
                onFoldersChange(r.folders);
                onRoutinesChange(r.routines);
              }
              setDeletingFolder(null);
            }}
          >
            Delete folder
          </button>
        </div>
      </Sheet>
    </>
  );
};
