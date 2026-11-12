import React, { useEffect, useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { Modal } from './ui/Modal';
import { ColorPalette } from '../types/theme';
import { ActivePlan, MealType, SavedMeal } from '../types/tracking';
import { PlannedMeal, weekDates } from '../lib/mealPlan';
import { DeviceCalendar, isAndroidApp } from '../lib/native';
import { CalEvent, TrackedEvent, atTime, diffEvents, mealEvents, workoutEvents } from '../lib/calendarSync';
import { addDays, startOfWeek, toDateKey, todayKey } from '../lib/dates';
import { readStored, usePersistentState } from '../hooks/usePersistentState';

interface Cal {
  id: string;
  name: string;
  account: string;
  google: boolean;
}

const MEAL_TIMES: Record<MealType, string> = { Breakfast: '08:00', Lunch: '12:30', Dinner: '18:30', Snack: '15:30' };

/**
 * Add what you have planned to a calendar on this phone: the training days of the plan you follow, and the meals in your meal plan. It
 * uses the phone's own calendar storage (so nothing is sent by this app), shows only Google account and on-phone calendars, and can undo
 * what it added. Running it again updates instead of doubling up.
 */
export const CalendarSheet: React.FC<{ isOpen: boolean; onClose: () => void; theme: ColorPalette }> = ({ isOpen, onClose, theme }) => {
  const [calendars, setCalendars] = useState<Cal[] | null>(null);
  const [error, setError] = useState('');
  const [calId, setCalId] = usePersistentState<string>('calendar_pick', '');
  const [workoutTime, setWorkoutTime] = usePersistentState<string>('calendar_workout_time', '07:00');
  const [withWorkouts, setWithWorkouts] = usePersistentState<boolean>('calendar_with_workouts', true);
  const [withMeals, setWithMeals] = usePersistentState<boolean>('calendar_with_meals', false);
  const [days, setDays] = usePersistentState<number>('calendar_days', 14);
  const [tracked, setTracked] = usePersistentState<Record<string, TrackedEvent>>('calendar_events', {});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setNote('');
    setError('');
    if (!isAndroidApp()) {
      setError('Adding to a calendar works in the Android app.');
      return;
    }
    let live = true;
    setCalendars(null);
    DeviceCalendar.listCalendars()
      .then((r) => {
        if (!live) return;
        setCalendars(r.calendars);
        if (r.calendars.length > 0 && !r.calendars.some((c) => c.id === calId)) setCalId(r.calendars.find((c) => c.google)?.id ?? r.calendars[0].id);
      })
      .catch((e: { message?: string }) => live && setError(e?.message || 'Could not read your calendars.'));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const run = async () => {
    setBusy(true);
    setNote('');
    try {
      const today = todayKey();
      const from = atTime(today, '00:00');
      const toW = atTime(addDays(today, days), '00:00');
      const active = readStored<ActivePlan | null>('active_plan', null);
      const wantedW: CalEvent[] = withWorkouts ? workoutEvents(active, workoutTime, days, today) : [];
      const weekStart = toDateKey(startOfWeek(new Date()));
      const dates = [...weekDates(weekStart), ...weekDates(addDays(weekStart, 7))].filter((d) => d >= today);
      const wantedM: CalEvent[] = withMeals ? mealEvents(readStored<PlannedMeal[]>('meal_plan', []), readStored<SavedMeal[]>('saved_meals', []), dates, MEAL_TIMES) : [];
      const planW = diffEvents(tracked, wantedW, from, toW, 'w');
      const planM = diffEvents(tracked, wantedM, from, atTime(addDays(weekStart, 14), '00:00'), 'm');
      const remove = [...planW.remove, ...planM.remove];
      const add = [...planW.add, ...planM.add];
      const next = { ...tracked };
      if (remove.length > 0) {
        await DeviceCalendar.removeEvents({ ids: remove });
        for (const [k, t] of Object.entries(next)) if (remove.includes(t.id)) delete next[k];
      }
      if (add.length > 0) {
        const r = await DeviceCalendar.addEvents({ calendarId: calId, events: add.map((e) => ({ key: e.key, title: e.title, startMs: e.start, endMs: e.end, description: e.description })) });
        for (const a of r.added) {
          const e = add.find((x) => x.key === a.key);
          if (e) next[a.key] = { id: a.id, start: e.start, title: e.title };
        }
      }
      setTracked(next);
      const kept = planW.kept + planM.kept;
      setNote(add.length === 0 && remove.length === 0 ? (kept > 0 ? 'Your calendar is already up to date.' : 'Nothing planned in that time.') : `Added ${add.length}, removed ${remove.length}${kept > 0 ? `, ${kept} already there` : ''}.`);
    } catch (e) {
      setError((e as { message?: string })?.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const removeAll = async () => {
    setBusy(true);
    try {
      const ids = Object.values(tracked).map((t) => t.id);
      if (ids.length > 0) await DeviceCalendar.removeEvents({ ids });
      setTracked({});
      setNote(`Removed ${ids.length} event${ids.length === 1 ? '' : 's'} this app added.`);
    } catch (e) {
      setError((e as { message?: string })?.message || 'Could not remove them.');
    } finally {
      setBusy(false);
    }
  };

  const trackedCount = Object.keys(tracked).length;
  const field = 'mt-1 w-full min-h-11 rounded-xl border bg-black/40 px-3 text-sm text-white';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add to your calendar" icon={<CalendarPlus className="h-4 w-4" style={{ color: theme.primary }} />}>
      <div className="space-y-4 text-sm text-neutral-200">
        <p className="text-xs leading-relaxed text-neutral-400">
          Puts your planned workouts and meals into a calendar on this phone. Nothing is sent by this app: a Google calendar is synced by Google's Calendar app as usual. Only Google account and on-phone calendars are offered.
        </p>
        {error && (
          <p role="alert" className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-3 text-xs text-amber-200">
            {error}
          </p>
        )}
        {calendars && calendars.length === 0 && !error && <p className="text-xs text-neutral-400">No writable Google or on-phone calendar was found.</p>}
        {calendars && calendars.length > 0 && (
          <>
            <label className="block text-xs text-neutral-400">
              Calendar
              <select value={calId} onChange={(e) => setCalId(e.target.value)} className={field} style={{ borderColor: theme.surfaceBorder }}>
                {calendars.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.google ? c.account : 'on this phone'})
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center justify-between gap-3">
              <label className="flex min-h-11 flex-1 items-center gap-3 text-sm">
                <input type="checkbox" checked={withWorkouts} onChange={(e) => setWithWorkouts(e.target.checked)} className="h-5 w-5" />
                Workouts from my plan
              </label>
              <label className="text-xs text-neutral-400">
                At
                <input type="time" value={workoutTime} onChange={(e) => e.target.value && setWorkoutTime(e.target.value)} className="ml-2 min-h-11 rounded-xl border bg-black/40 px-2 text-sm text-white" style={{ borderColor: theme.surfaceBorder }} />
              </label>
            </div>
            {withWorkouts && (
              <div className="flex flex-wrap gap-2" role="group" aria-label="How far ahead">
                {[7, 14, 28].map((n) => (
                  <button key={n} type="button" aria-pressed={days === n} onClick={() => setDays(n)} className="min-h-11 rounded-full border px-4 text-xs font-bold" style={{ borderColor: days === n ? theme.primary : theme.surfaceBorder, color: days === n ? theme.primary : '#D4D4D8' }}>
                    Next {n} days
                  </button>
                ))}
              </div>
            )}
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input type="checkbox" checked={withMeals} onChange={(e) => setWithMeals(e.target.checked)} className="h-5 w-5" />
              Meals from my meal plan (this week and next)
            </label>
            <button type="button" disabled={busy || (!withWorkouts && !withMeals)} onClick={() => void run()} className="min-h-12 w-full rounded-2xl text-sm font-extrabold text-black disabled:opacity-40" style={{ backgroundColor: theme.primary }}>
              {busy ? 'Working…' : 'Add to calendar'}
            </button>
          </>
        )}
        {note && (
          <p role="status" className="text-xs font-semibold" style={{ color: theme.primary }}>
            {note}
          </p>
        )}
        {trackedCount > 0 && (
          <button type="button" disabled={busy} onClick={() => void removeAll()} className="min-h-11 text-xs font-bold underline text-neutral-300">
            Remove the {trackedCount} event{trackedCount === 1 ? '' : 's'} this app added
          </button>
        )}
      </div>
    </Modal>
  );
};
