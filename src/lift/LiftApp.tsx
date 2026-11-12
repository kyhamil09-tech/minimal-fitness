import React, { useState } from 'react';
import { BarChart3, Dumbbell, History, ListChecks } from 'lucide-react';
import { WorkoutSession } from '../types/health';
import { Exercise, Routine, RoutineSet, UserProfile } from '../types/tracking';
import { removeCustomExercise } from '../lib/lifting';
import { useBack } from './back';
import { LiftShell } from './ui';
import { LiftHome, StartOptions } from './LiftHome';
import { LiftHistory, LiftWorkoutDetail } from './LiftHistory';
import { LiftExerciseDetail, LiftExercises } from './LiftExercises';
import { LiftProfile } from './LiftProfile';
import { useT } from '../lib/i18n';
import type { MessageKey } from '../locales/en';
import { LiftRecords } from './LiftRecords';
import { LiftBody } from './LiftBody';
import type { BodyEntry } from '../types/tracking';
import type { ProgramState } from '../lib/programs';

type Tab = 'workout' | 'history' | 'exercises' | 'profile';
type Detail = { kind: 'workout' | 'exercise' | 'records' | 'body'; id: string };

export interface LiftAppProps {
  profile: UserProfile;
  workouts: WorkoutSession[];
  routines: Routine[];
  /** Folder names for the routines, in order. */
  folders: string[];
  onFoldersChange: (folders: string[]) => void;
  /** Replaces the whole list of routines (after a rename, move or delete). */
  onRoutinesChange: (routines: Routine[]) => void;
  custom: Exercise[];
  onCustomChange: (list: Exercise[]) => void;
  /** Starts the workout screen (it belongs to the app, so it also works from the main side). */
  onStart: (ids: string[], opts?: StartOptions) => void;
  /** The program being followed, if any, and how to change it. */
  /** Body measurements (the same list as the main app's Progress screen). */
  body: BodyEntry[];
  onAddBody: (e: Omit<BodyEntry, 'id'>) => void;
  onDeleteBody: (id: string) => void;
  program: ProgramState | null;
  onProgramChange: (p: ProgramState | null) => void;
  onUpdateWorkout: (w: WorkoutSession) => void;
  onDeleteWorkout: (id: string) => void;
  onSaveRoutine: (name: string, exerciseIds: string[], folder?: string, targets?: Record<string, RoutineSet[]>) => void;
  onOpenImport: () => void;
  /** Back to the main side of the app. */
  onExit: () => void;
}

const TABS: { id: Tab; label: MessageKey; icon: React.ElementType }[] = [
  { id: 'workout', label: 'lift.tab.workout', icon: Dumbbell },
  { id: 'history', label: 'lift.tab.history', icon: History },
  { id: 'exercises', label: 'lift.tab.exercises', icon: ListChecks },
  { id: 'profile', label: 'lift.tab.profile', icon: BarChart3 },
];

/**
 * The Lift side: a plain, Hevy-style app inside the app. Four tabs (Workout, History, Exercises, Profile), a workout screen that opens
 * over them, and the same data as the rest of the app, so lifting still counts toward recovery, calories and the watch.
 */
export const LiftApp: React.FC<LiftAppProps> = ({ profile, workouts, routines, folders, onFoldersChange, onRoutinesChange, custom, onCustomChange, onStart, body, onAddBody, onDeleteBody, program, onProgramChange, onUpdateWorkout, onDeleteWorkout, onSaveRoutine, onOpenImport, onExit }) => {
  const [tab, setTab] = useState<Tab>('workout');
  const tr = useT();
  const [stack, setStack] = useState<Detail[]>([]);
  const detail = stack[stack.length - 1];

  // Back: close the open detail, else go to the Workout tab, else leave Lift. Sheets and the workout screen handle their own first.
  useBack(true, () => {
    if (stack.length > 0) setStack((s) => s.slice(0, -1));
    else if (tab !== 'workout') setTab('workout');
    else onExit();
  });

  const open = (d: Detail) => setStack((s) => [...s, d]);

  let bodyNode: React.ReactNode;
  if (detail?.kind === 'workout') {
    const w = workouts.find((x) => x.id === detail.id);
    bodyNode = w ? (
      <LiftWorkoutDetail
        profile={profile}
        workout={w}
        all={workouts}
        onBack={() => setStack((s) => s.slice(0, -1))}
        onStart={(ids, opts) => {
          setStack([]);
          setTab('workout');
          onStart(ids, opts);
        }}
        onUpdate={onUpdateWorkout}
        onDelete={(id) => {
          onDeleteWorkout(id);
          setStack((s) => s.slice(0, -1));
        }}
        onSaveRoutine={onSaveRoutine}
        onOpenExercise={(id) => open({ kind: 'exercise', id })}
      />
    ) : null;
  } else if (detail?.kind === 'body') {
    bodyNode = <LiftBody profile={profile} body={body} onAdd={onAddBody} onDelete={onDeleteBody} onBack={() => setStack((s) => s.slice(0, -1))} />;
  } else if (detail?.kind === 'records') {
    bodyNode = <LiftRecords profile={profile} workouts={workouts} onBack={() => setStack((s) => s.slice(0, -1))} onOpenExercise={(id) => open({ kind: 'exercise', id })} />;
  } else if (detail?.kind === 'exercise') {
    bodyNode = (
      <LiftExerciseDetail
        profile={profile}
        workouts={workouts}
        exerciseId={detail.id}
        onBack={() => setStack((s) => s.slice(0, -1))}
        onDeleteCustom={(id) => {
          onCustomChange(removeCustomExercise(custom, id));
          setStack((s) => s.slice(0, -1));
        }}
        onOpenWorkout={(id) => open({ kind: 'workout', id })}
      />
    );
  } else if (tab === 'workout') {
    bodyNode = <LiftHome profile={profile} workouts={workouts} routines={routines} folders={folders} custom={custom} onCustomChange={onCustomChange} onStart={onStart} program={program} onProgramChange={onProgramChange} onSaveRoutine={onSaveRoutine} onRoutinesChange={onRoutinesChange} onFoldersChange={onFoldersChange} />;
  } else if (tab === 'history') {
    bodyNode = <LiftHistory profile={profile} workouts={workouts} onOpen={(id) => open({ kind: 'workout', id })} onOpenImport={onOpenImport} />;
  } else if (tab === 'exercises') {
    bodyNode = <LiftExercises workouts={workouts} custom={custom} onCustomChange={onCustomChange} onOpen={(id) => open({ kind: 'exercise', id })} />;
  } else {
    bodyNode = <LiftProfile profile={profile} workouts={workouts} onOpenExercise={(id) => open({ kind: 'exercise', id })} onOpenRecords={() => open({ kind: 'records', id: 'all' })} onOpenBody={() => open({ kind: 'body', id: 'body' })} latestBody={body.length ? [...body].sort((a, b) => (a.date < b.date ? 1 : -1))[0] : undefined} onOpenImport={onOpenImport} onExit={onExit} />;
  }

  return (
    <LiftShell label="Lift">
      {bodyNode}
      {!detail && (
        <nav className="l-tabbar" aria-label={tr('lift.tabs')}>
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.id} type="button" className="l-tab" aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
                <Icon className="h-5 w-5" aria-hidden="true" />
                {tr(t.label)}
              </button>
            );
          })}
        </nav>
      )}
    </LiftShell>
  );
};
