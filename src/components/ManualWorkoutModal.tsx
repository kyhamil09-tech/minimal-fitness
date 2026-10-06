import React, { useState } from 'react';
import { Dumbbell, X } from 'lucide-react';
import { WorkoutSession, WorkoutType } from '../types/health';
import { UserProfile } from '../types/tracking';
import { currentRestingHr, estimateCalories, getMaxHr, trimp } from '../lib/calc';

interface ManualWorkoutModalProps {
  /** The activity it starts on. */
  initialType?: WorkoutType;
  profile: UserProfile;
  onSave: (session: WorkoutSession) => void;
  onClose: () => void;
}

/** "Log workout": for something done without recording it, such as a gym session or a class. Length, effort and optionally calories. */
export const ManualWorkoutModal: React.FC<ManualWorkoutModalProps> = ({ initialType = 'Strength', profile, onSave, onClose }) => {
  const [type, setType] = useState<WorkoutType>(initialType);
  const [duration, setDuration] = useState('45');
  const [calories, setCalories] = useState('');
  const [rpe, setRpe] = useState(7);
  const [notes, setNotes] = useState('');
  const maxHr = getMaxHr(profile);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const minutes = Math.max(1, parseInt(duration, 10) || 30);
    const kcal = parseInt(calories, 10) || estimateCalories(type, minutes, profile.weightKg);
    // No sensor recorded this, so the average heart rate is worked out from how hard it felt.
    const avgHr = Math.round(profile.restingHr + (maxHr - profile.restingHr) * (0.3 + rpe * 0.05));
    onSave({
      id: `w-manual-${Date.now()}`,
      type,
      timestamp: '',
      startedAt: Date.now(),
      durationMinutes: minutes,
      avgHeartRate: avgHr,
      caloriesBurned: kcal,
      isManualEntry: true,
      perceivedExertion: rpe,
      notes: notes.trim() || undefined,
      cardioLoadPoints: trimp(minutes, avgHr, maxHr, currentRestingHr()),
    });
    onClose();
  };

  const field = 'w-full bg-black border border-[#1A1E26] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-400';

  return (
    <div role="dialog" aria-modal="true" aria-label="Log custom workout" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="w-full max-w-sm bg-[#0B0D11] border border-[#1A1E26] rounded-3xl p-5 text-white shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-[#1A1E26]">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Dumbbell className="w-4 h-4 text-emerald-400" />
            Log Custom Workout
          </h3>
          <button onClick={onClose} aria-label="Close" className="text-neutral-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={save} className="space-y-3 mt-3">
          <div className="space-y-1">
            <label htmlFor="mw-type" className="text-[11px] text-neutral-400">
              Activity Type
            </label>
            <select id="mw-type" value={type} onChange={(e) => setType(e.target.value as WorkoutType)} className={field}>
              <option value="Strength">Strength Training</option>
              <option value="Calisthenics">Calisthenics / Bodyweight</option>
              <option value="HIIT">HIIT / Circuit</option>
              <option value="Running">Running / Jogging</option>
              <option value="Walking">Walking / Rucking</option>
              <option value="Hiking">Hiking</option>
              <option value="Cycling">Cycling</option>
              <option value="Core">Core</option>
              <option value="Mobility">Mobility & Stretching</option>
              <option value="Rowing">Rowing</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label htmlFor="mw-dur" className="text-[11px] text-neutral-400">
                Duration (mins)
              </label>
              <input id="mw-dur" type="number" min={1} value={duration} onChange={(e) => setDuration(e.target.value)} className={`${field} font-mono`} required />
            </div>

            <div className="space-y-1">
              <label htmlFor="mw-cal" className="text-[11px] text-neutral-400">
                Calories (blank = auto)
              </label>
              <input
                id="mw-cal"
                type="number"
                min={0}
                value={calories}
                onChange={(e) => setCalories(e.target.value)}
                className={`${field} font-mono`}
                placeholder={String(estimateCalories(type, parseInt(duration, 10) || 30, profile.weightKg))}
              />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between items-center text-[11px] text-neutral-400">
              <label htmlFor="mw-rpe">Perceived Exertion (RPE)</label>
              <span className="font-mono text-emerald-400 font-bold">{rpe} / 10</span>
            </div>
            <input id="mw-rpe" type="range" min="1" max="10" value={rpe} onChange={(e) => setRpe(parseInt(e.target.value, 10))} className="w-full accent-emerald-400" />
          </div>

          <div className="space-y-1">
            <label htmlFor="mw-notes" className="text-[11px] text-neutral-400">
              Notes (optional)
            </label>
            <input id="mw-notes" type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className={field} placeholder="e.g. Yoga flow, 30 min" />
          </div>

          <button type="submit" className="w-full py-2.5 rounded-xl font-bold text-xs bg-emerald-500 text-black hover:bg-emerald-400 transition-colors shadow-lg mt-2">
            Save Workout
          </button>
        </form>
      </div>
    </div>
  );
};
