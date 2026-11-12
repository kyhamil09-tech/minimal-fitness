import React, { useMemo, useState } from 'react';
import { Pencil } from 'lucide-react';
import { WorkoutSession, WorkoutType } from '../types/health';
import { UserProfile } from '../types/tracking';
import { Modal, fieldClass, labelClass } from './ui/Modal';
import { formatDuration, trimWorkout } from '../lib/workoutStats';
import { distanceUnit, formatDistance } from '../lib/units';

interface WorkoutEditModalProps {
  workout: WorkoutSession;
  profile: UserProfile;
  onSave: (w: WorkoutSession) => void;
  onClose: () => void;
}

const TYPES: WorkoutType[] = ['Running', 'Walking', 'Hiking', 'Cycling', 'Rowing', 'Strength', 'Calisthenics', 'HIIT', 'Core', 'Mobility', 'Swimming', 'OpenWaterSwim', 'AlpineSkiing', 'CrossCountrySkiing', 'Snowboarding', 'Snowshoeing', 'IceSkating', 'Kayaking', 'Paddleboarding'];
const STEPS = 1000;

/** Fix a saved workout: change its type, notes, effort or calories, and trim the start or end of a recorded route. */
export const WorkoutEditModal: React.FC<WorkoutEditModalProps> = ({ workout, profile, onSave, onClose }) => {
  const units = profile.units;
  const track = workout.track ?? [];
  const canTrim = track.length >= 2;
  const first = canTrim ? track[0].t : 0;
  const last = canTrim ? track[track.length - 1].t : 0;

  const [type, setType] = useState<WorkoutType>(workout.type);
  const [notes, setNotes] = useState(workout.notes ?? '');
  const [rpe, setRpe] = useState(workout.perceivedExertion ?? 6);
  const [calories, setCalories] = useState(String(workout.caloriesBurned));
  const [minutes, setMinutes] = useState(String(workout.durationMinutes));
  const [distance, setDistance] = useState(workout.distanceKm ? String(Number((units === 'imperial' ? workout.distanceKm / 1.609344 : workout.distanceKm).toFixed(2))) : '');
  const [startPos, setStartPos] = useState(0);
  const [endPos, setEndPos] = useState(STEPS);

  const cutFrom = first + ((last - first) * startPos) / STEPS;
  const cutTo = first + ((last - first) * endPos) / STEPS;
  const trimmed = useMemo(
    () => (canTrim && (startPos > 0 || endPos < STEPS) ? trimWorkout(workout, cutFrom, cutTo) : null),
    [canTrim, startPos, endPos, workout, cutFrom, cutTo]
  );
  const base = trimmed ?? workout;

  const save = () => {
    let out: WorkoutSession = { ...base, type, notes: notes.trim() || undefined, perceivedExertion: rpe };
    const kcal = Math.round(Number(calories));
    // Only override calories if the user typed something different from the (trim-adjusted) value.
    if (Number.isFinite(kcal) && kcal >= 0 && String(kcal) !== String(workout.caloriesBurned)) out.caloriesBurned = kcal;
    if (!canTrim) {
      const m = Math.max(1, Math.round(Number(minutes)));
      if (Number.isFinite(m)) out = { ...out, durationMinutes: m, durationSec: m * 60 };
      const d = Number(distance);
      if (distance !== '' && Number.isFinite(d) && d >= 0) out = { ...out, distanceKm: units === 'imperial' ? d * 1.609344 : d };
    }
    onSave(out);
    onClose();
  };

  const invalid = endPos - startPos < 20;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Edit workout"
      icon={<Pencil className="w-4 h-4 text-emerald-400" />}
      footer={
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-neutral-700 text-xs font-semibold text-neutral-300">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={invalid}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold text-black disabled:opacity-40"
            style={{ backgroundColor: '#00E676' }}
          >
            Save changes
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1">
          <label className={labelClass} htmlFor="we-type">Type</label>
          <select id="we-type" value={type} onChange={(e) => setType(e.target.value as WorkoutType)} className={fieldClass}>
            {TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {canTrim ? (
          <div className="rounded-2xl glass-inset p-3 space-y-3">
            <div className="text-xs font-semibold text-white">Trim the route</div>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Cut off a forgotten stop at the end or a late start. Distance, time, climb, heart rate and calories are
              recalculated for what you keep.
            </p>
            <div className="space-y-1">
              <label className={labelClass} htmlFor="we-start">Start: {formatDuration(((cutFrom - first) / 1000))} in</label>
              <input id="we-start" type="range" min={0} max={STEPS} value={startPos} onChange={(e) => setStartPos(Math.min(Number(e.target.value), endPos - 20))} className="w-full" />
            </div>
            <div className="space-y-1">
              <label className={labelClass} htmlFor="we-end">End: {formatDuration(((cutTo - first) / 1000))} in</label>
              <input id="we-end" type="range" min={0} max={STEPS} value={endPos} onChange={(e) => setEndPos(Math.max(Number(e.target.value), startPos + 20))} className="w-full" />
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div>
                <div className="text-xs text-neutral-400">Distance</div>
                <div className="font-semibold text-white tabular-nums">{formatDistance(base.distanceKm ?? 0, units)}</div>
              </div>
              <div>
                <div className="text-xs text-neutral-400">Time</div>
                <div className="font-semibold text-white tabular-nums">{formatDuration(base.durationSec ?? base.durationMinutes * 60)}</div>
              </div>
              <div>
                <div className="text-xs text-neutral-400">Calories</div>
                <div className="font-semibold text-white tabular-nums">{base.caloriesBurned}</div>
              </div>
            </div>
            {trimmed && (
              <p className="text-xs text-amber-200">
                Trimming removes {formatDistance(Math.max(0, (workout.distanceKm ?? 0) - (trimmed.distanceKm ?? 0)), units)} and{' '}
                {formatDuration(Math.max(0, (workout.durationSec ?? workout.durationMinutes * 60) - (trimmed.durationSec ?? 0)))}. This cannot be undone.
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={labelClass} htmlFor="we-min">Duration (min)</label>
              <input id="we-min" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} className={fieldClass} />
            </div>
            {workout.distanceKm !== undefined && (
              <div className="space-y-1">
                <label className={labelClass} htmlFor="we-dist">Distance ({distanceUnit(units)})</label>
                <input id="we-dist" inputMode="decimal" value={distance} onChange={(e) => setDistance(e.target.value)} className={fieldClass} />
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className={labelClass} htmlFor="we-kcal">Calories</label>
            <input id="we-kcal" inputMode="numeric" value={calories} onChange={(e) => setCalories(e.target.value)} className={fieldClass} />
          </div>
          <div className="space-y-1">
            <label className={labelClass} htmlFor="we-rpe">Effort (RPE {rpe}/10)</label>
            <input id="we-rpe" type="range" min={1} max={10} value={rpe} onChange={(e) => setRpe(Number(e.target.value))} className="w-full mt-2" />
          </div>
        </div>

        <div className="space-y-1">
          <label className={labelClass} htmlFor="we-notes">Notes</label>
          <textarea id="we-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={fieldClass} placeholder="How did it feel?" />
        </div>
      </div>
    </Modal>
  );
};