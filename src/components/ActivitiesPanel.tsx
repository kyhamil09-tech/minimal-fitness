import React, { useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, MapPin, Share2, Trash2, Trophy } from 'lucide-react';
import { WorkoutSession } from '../types/health';
import { UnitSystem } from '../types/tracking';
import { ColorPalette } from '../types/theme';
import { RecordsCard } from './RecordsCard';
import { workoutDateKeys, workoutsOnDay, workoutVolumeKg } from '../lib/calc';
import { formatTimestamp, toDateKey, todayKey, weekStartsOnSunday } from '../lib/dates';
import { distanceUnit, formatDistance, formatPace, formatWeight, kmToDisplay } from '../lib/units';
import { routeToSvgPoints } from '../lib/geo';

interface ActivitiesPanelProps {
  workouts: WorkoutSession[];
  units: UnitSystem;
  theme: ColorPalette;
  /** Open one workout's full breakdown and route map. */
  onOpenDetail: (workout: WorkoutSession) => void;
  onDeleteWorkout: (id: string) => void;
}

const RouteMini: React.FC<{ route: [number, number][]; color: string }> = ({ route, color }) => {
  const pts = routeToSvgPoints(route, 280, 110);
  if (!pts) return null;
  return (
    <svg viewBox="0 0 280 110" className="w-full h-24 rounded-xl bg-black/60 border border-neutral-900" role="img" aria-label="Route map">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
};

/** Run > Activities: your records, a month calendar that filters the list to a day, and every workout with its details. */
export const ActivitiesPanel: React.FC<ActivitiesPanelProps> = ({ workouts, units, theme, onOpenDetail, onDeleteWorkout }) => {
  const [monthOffset, setMonthOffset] = useState(0);
  const [dayFilter, setDayFilter] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'All' | 'Runs' | 'Walks' | 'Cycles' | 'Strength/HIIT' | 'Manual'>('All');
  const [expandedWorkoutId, setExpandedWorkoutId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [shareNote, setShareNote] = useState('');
  const doneKeys = workoutDateKeys(workouts);

  const handleShare = async (w: WorkoutSession) => {
    const text =
      `${w.type} · ${w.durationMinutes} min` +
      (w.distanceKm ? ` · ${formatDistance(w.distanceKm, units)}` : '') +
      ` · ${w.caloriesBurned} kcal — logged with Minimal Fitness`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'My workout', text });
      } else {
        await navigator.clipboard.writeText(text);
        setShareNote('Workout summary copied to clipboard');
        setTimeout(() => setShareNote(''), 2500);
      }
    } catch {
      // user cancelled the share sheet
    }
  };


  const filteredWorkouts = workouts.filter((w) => {
    if (dayFilter && workoutsOnDay([w], dayFilter).length === 0) return false;
    if (activeFilter === 'All') return true;
    if (activeFilter === 'Runs') return w.type === 'Running' || w.type === 'Treadmill';
    if (activeFilter === 'Walks') return w.type === 'Walking' || w.type === 'Hiking';
    if (activeFilter === 'Cycles') return w.type === 'Cycling' || w.type === 'IndoorCycling';
    if (activeFilter === 'Strength/HIIT')
      return w.type === 'Strength' || w.type === 'HIIT' || w.type === 'Calisthenics' || w.type === 'Core';
    if (activeFilter === 'Manual') return !!w.isManualEntry;
    return true;
  });


  // Month calendar for the Activities view
  const monthBase = new Date();
  monthBase.setDate(1);
  monthBase.setMonth(monthBase.getMonth() + monthOffset);
  const calYear = monthBase.getFullYear();
  const calMonth = monthBase.getMonth();
  const calLeading = weekStartsOnSunday() ? monthBase.getDay() : (monthBase.getDay() + 6) % 7;
  const calDays = new Date(calYear, calMonth + 1, 0).getDate();
  const calCells: (string | null)[] = [
    ...Array<null>(calLeading).fill(null),
    ...Array.from({ length: calDays }, (_, i) => toDateKey(new Date(calYear, calMonth, i + 1))),
  ];


  return (
    <>
      <RecordsCard workouts={workouts} units={units} theme={theme} onOpen={onOpenDetail} />

      <section className="rounded-[28px] border p-4" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setMonthOffset((m) => m - 1)} aria-label="Previous month" className="w-9 h-9 rounded-full glass-chip flex items-center justify-center">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="gh-title">{monthBase.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
          <button
            onClick={() => setMonthOffset((m) => Math.min(0, m + 1))}
            disabled={monthOffset >= 0}
            aria-label="Next month"
            className="w-9 h-9 rounded-full glass-chip flex items-center justify-center disabled:opacity-30"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {(weekStartsOnSunday() ? ['S', 'M', 'T', 'W', 'T', 'F', 'S'] : ['M', 'T', 'W', 'T', 'F', 'S', 'S']).map((d, i) => (
            <div key={i} className="text-center stat-label pb-1">
              {d}
            </div>
          ))}
          {calCells.map((key, i) =>
            key === null ? (
              <div key={`b${i}`} />
            ) : (
              <button
                key={key}
                onClick={() => setDayFilter((cur) => (cur === key ? null : key))}
                aria-pressed={dayFilter === key}
                aria-label={key}
                className="week-dot !text-[11px]"
                data-done={doneKeys.has(key)}
                data-today={key === todayKey()}
                style={dayFilter === key ? { outline: `2px solid ${theme.primary}`, outlineOffset: 2 } : undefined}
              >
                {Number(key.slice(8))}
              </button>
            )
          )}
        </div>
        {dayFilter && (
          <button onClick={() => setDayFilter(null)} className="mt-3 text-[11px] font-bold uppercase tracking-wider" style={{ color: theme.primary }}>
            Showing {dayFilter} · clear
          </button>
        )}
      </section>

      {/* WORKOUT HISTORY FEED WITH FILTER CHIPS */}
      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-semibold text-[#7E889B] tracking-wider uppercase">
            Activities · {filteredWorkouts.length}
          </span>
          <span className="text-[11px] font-semibold text-[#7E889B]">Saved on this device</span>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {(['All', 'Runs', 'Walks', 'Cycles', 'Strength/HIIT', 'Manual'] as const).map((chip) => (
            <button
              key={chip}
              onClick={() => setActiveFilter(chip)}
              aria-pressed={activeFilter === chip}
              className="sport-pill !py-2 !text-xs"
            >
              {chip}
            </button>
          ))}
        </div>

        {shareNote && (
          <p role="status" className="text-[11px] text-emerald-400 px-1">
            {shareNote}
          </p>
        )}

        {filteredWorkouts.length === 0 && (
          <p className="text-center text-xs text-[#7E889B] py-6">
            {workouts.length === 0 ? 'No activities yet. Open the Start tab and press GO.' : 'Nothing matches this filter.'}
          </p>
        )}

        <div className="space-y-2.5">
          {filteredWorkouts.map((workout) => {
            const isExpanded = expandedWorkoutId === workout.id;
            const volume = workoutVolumeKg(workout);

            return (
              <article
                key={workout.id}
                className="rounded-3xl border p-4 space-y-3 transition-colors hover:border-neutral-700"
                style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}
              >
                <button
                  onClick={() => setExpandedWorkoutId(isExpanded ? null : workout.id)}
                  aria-expanded={isExpanded}
                  className="w-full flex items-center justify-between text-left"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-white">{workout.type}</span>
                      {workout.planDayTitle && (
                        <span className="text-[9px] font-mono px-1.5 rounded bg-neutral-900 border border-neutral-800 text-neutral-300">
                          {workout.planDayTitle}
                        </span>
                      )}
                      {workout.isManualEntry ? (
                        <span className="text-[9px] font-mono px-1.5 rounded bg-neutral-900 border border-neutral-800 text-neutral-400">
                          Manual Log
                        </span>
                      ) : workout.gpsTracked ? (
                        <span className="text-[9px] font-mono px-1.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-900">
                          GPS Tracked
                        </span>
                      ) : (
                        <span className="text-[9px] font-mono px-1.5 rounded bg-neutral-900 border border-neutral-800 text-neutral-400">
                          Timed
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-[#7E889B] block font-mono">
                      {workout.startedAt ? formatTimestamp(workout.startedAt) : workout.timestamp}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      {workout.distanceKm ? (
                        <span className="hero-num text-[2.4rem] block">
                          {kmToDisplay(workout.distanceKm, units)}
                          <span className="hero-unit text-base"> {distanceUnit(units)}</span>
                        </span>
                      ) : (
                        <span className="hero-num text-[2.4rem] block">
                          {workout.durationMinutes}
                          <span className="hero-unit text-base"> min</span>
                        </span>
                      )}
                      <span className="text-[11px] font-semibold text-[#7E889B]">
                        {workout.distanceKm ? `${workout.durationMinutes} min · ` : ''}
                        {workout.caloriesBurned} kcal
                      </span>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-neutral-500" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-neutral-500" />
                    )}
                  </div>
                </button>

                <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono pt-2 border-t border-[#1A1E26]">
                  <div className="bg-black/50 p-2 rounded-xl border border-neutral-900">
                    <span className="text-[10px] text-neutral-400 block">
                      Avg HR{workout.hrFromSensor ? '' : ' (est.)'}
                    </span>
                    <span className="text-white font-bold block mt-0.5">{workout.avgHeartRate} bpm</span>
                  </div>

                  <div className="bg-black/50 p-2 rounded-xl border border-neutral-900">
                    <span className="text-[10px] text-neutral-400 block">{volume > 0 ? 'Volume' : 'Distance'}</span>
                    <span className="text-white font-bold block mt-0.5">
                      {volume > 0
                        ? formatWeight(volume, units, 0)
                        : workout.distanceKm
                          ? formatDistance(workout.distanceKm, units)
                          : 'N/A'}
                    </span>
                  </div>

                  <div className="bg-black/50 p-2 rounded-xl border border-neutral-900">
                    <span className="text-[10px] text-neutral-400 block">Exertion (RPE)</span>
                    <span className="font-bold block mt-0.5" style={{ color: theme.primary }}>
                      {workout.perceivedExertion ? `${workout.perceivedExertion}/10` : '—'}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => onOpenDetail(workout)}
                  className="w-full py-2.5 rounded-2xl glass-inset text-xs font-semibold text-white flex items-center justify-center gap-2"
                >
                  <MapPin className="w-4 h-4" style={{ color: theme.primary }} />
                  {workout.track || (workout.route && workout.route.length > 1) ? 'Route map and full breakdown' : 'Full breakdown'}
                </button>

                {isExpanded && (
                  <div className="space-y-2 pt-1 text-xs">
                    {workout.route && workout.route.length > 1 && <RouteMini route={workout.route} color={theme.primary} />}
                    {workout.distanceKm && workout.durationMinutes > 0 && (
                      <p className="text-[11px] font-mono text-neutral-300 px-1">
                        Pace {formatPace(workout.durationMinutes, workout.distanceKm, units)} /{distanceUnit(units)}
                        {workout.elevationGainM ? ` · +${workout.elevationGainM} m climbed` : ''}
                      </p>
                    )}
                    {workout.exercises && workout.exercises.length > 0 && (
                      <ul className="space-y-1.5">
                        {workout.exercises.map((ex) => (
                          <li key={ex.exerciseId} className="bg-black/50 border border-neutral-900 rounded-xl p-2.5">
                            <div className="text-[11px] font-semibold text-white flex items-center gap-1.5">
                              <Trophy className="w-3 h-3 text-neutral-600" />
                              {ex.name}
                            </div>
                            <div className="text-[10px] font-mono text-[#7E889B] mt-0.5">
                              {ex.sets.map((s) => `${formatWeight(s.weightKg, units, 1)}×${s.reps}`).join(' · ')}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                    {workout.notes && (
                      <p className="text-[11px] text-neutral-300 bg-neutral-950 p-2.5 rounded-xl border border-neutral-900">
                        “{workout.notes}”
                      </p>
                    )}
                    <div className="flex items-center justify-between text-[11px] text-[#7E889B] font-mono px-1">
                      <span>Cardio Load: {workout.cardioLoadPoints ?? Math.round(workout.durationMinutes * 1.3)} TRIMP</span>
                    </div>
                    <div className="flex items-center justify-end gap-3 pt-1">
                      <button
                        onClick={() => handleShare(workout)}
                        className="text-[11px] flex items-center gap-1 text-neutral-300 hover:text-white"
                      >
                        <Share2 className="w-3.5 h-3.5" /> Share
                      </button>
                      {confirmDeleteId === workout.id ? (
                        <span className="flex items-center gap-2 text-[11px]">
                          <span className="text-neutral-400">Delete?</span>
                          <button
                            onClick={() => {
                              onDeleteWorkout(workout.id);
                              setConfirmDeleteId(null);
                            }}
                            className="text-rose-400 font-bold"
                          >
                            Yes
                          </button>
                          <button onClick={() => setConfirmDeleteId(null)} className="text-neutral-400">
                            No
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(workout.id)}
                          className="text-[11px] flex items-center gap-1 text-neutral-500 hover:text-rose-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
};
