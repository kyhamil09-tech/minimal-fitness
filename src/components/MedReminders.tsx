import React, { useEffect, useState } from 'react';
import { BellRing, Plus, Trash2, X } from 'lucide-react';
import { usePersistentState } from '../hooks/usePersistentState';
import { MedReminder, addTime } from '../lib/medReminders';
import { syncMedReminders } from '../lib/notifications';
import { LearnMore } from './ui/LearnMore';

const field = 'w-full px-3 py-2.5 text-sm text-white';

/**
 * Daily reminders for medications and supplements, set inside the Health log. Each one has a name and one or more times of day; Android
 * fires them with the app closed. Nothing leaves the phone, and the name can be kept off the lock screen.
 */
export const MedReminders: React.FC<{ suggestions: string[]; primary: string }> = ({ suggestions, primary }) => {
  const [meds, setMeds] = usePersistentState<MedReminder[]>('med_reminders', []);
  const [hideName, setHideName] = usePersistentState<boolean>('med_reminders_hide_name', false);
  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [time, setTime] = useState('08:00');
  const [times, setTimes] = useState<string[]>([]);

  useEffect(() => {
    void syncMedReminders(meds, hideName);
  }, [meds, hideName]);

  const add = () => {
    const all = addTime(times, time);
    if (!name.trim() || all.length === 0) return;
    setMeds([...meds, { id: `${Date.now()}`, name: name.trim(), dose: dose.trim() || undefined, times: all, enabled: true }]);
    setName('');
    setDose('');
    setTimes([]);
  };
  const update = (id: string, patch: Partial<MedReminder>) => setMeds(meds.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  return (
    <div className="space-y-3 border-t pt-3" style={{ borderColor: 'var(--hairline)' }}>
      <div className="flex items-center gap-2">
        <BellRing className="h-4 w-4" style={{ color: primary }} aria-hidden="true" />
        <span className="stat-label">Reminders</span>
        <LearnMore text="A daily notification at the times you choose, from Android itself, so it arrives with the app closed. The names stay on this phone." />
      </div>

      {meds.map((m) => (
        <div key={m.id} className="flex items-center justify-between gap-2 rounded-2xl border px-3 py-2" style={{ backgroundColor: 'var(--card2)', borderColor: 'var(--hairline)' }}>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-white">
              {m.name}
              {m.dose ? <span className="font-normal text-neutral-400"> · {m.dose}</span> : null}
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {m.times.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold" style={{ backgroundColor: 'var(--card)', color: m.enabled ? primary : '#A1A1AA' }}>
                  {t}
                  <button type="button" aria-label={`Remove ${t} for ${m.name}`} onClick={() => update(m.id, { times: m.times.filter((x) => x !== t) })} className="inline-flex h-5 w-5 items-center justify-center">
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" role="switch" aria-checked={m.enabled} aria-label={`Reminders for ${m.name}`} onClick={() => update(m.id, { enabled: !m.enabled })} className="sport-pill !px-3 !py-1.5 !text-xs">
              {m.enabled ? 'On' : 'Off'}
            </button>
            <button type="button" aria-label={`Delete reminders for ${m.name}`} onClick={() => setMeds(meds.filter((x) => x.id !== m.id))} className="inline-flex h-11 w-11 items-center justify-center text-neutral-400">
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ))}

      <div className="grid grid-cols-2 gap-2">
        <input aria-label="Reminder name" placeholder="Name" list="med-suggestions" value={name} onChange={(e) => setName(e.target.value)} className={field} />
        <input aria-label="Reminder dose" placeholder="Dose (optional)" value={dose} onChange={(e) => setDose(e.target.value)} className={field} />
        <datalist id="med-suggestions">
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>
      <div className="flex items-center gap-2">
        <input aria-label="Reminder time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className={field + ' !w-32'} />
        <button type="button" onClick={() => setTimes(addTime(times, time))} className="sport-pill !px-3 !py-2 !text-xs">
          <Plus className="mr-1 inline h-3 w-3" aria-hidden="true" />
          Add time
        </button>
        <span className="min-w-0 flex-1 truncate text-xs text-neutral-400">{times.join(', ')}</span>
      </div>
      <button type="button" onClick={add} disabled={!name.trim()} className="w-full rounded-full py-3 text-sm font-extrabold disabled:opacity-40" style={{ backgroundColor: primary, color: '#09090B' }}>
        Set reminder
      </button>
      <label className="flex items-center justify-between gap-3 text-xs text-neutral-300">
        Keep the name off the lock screen
        <button type="button" role="switch" aria-checked={hideName} aria-label="Hide medication names in notifications" onClick={() => setHideName(!hideName)} className="sport-pill !px-3 !py-1.5 !text-xs">
          {hideName ? 'On' : 'Off'}
        </button>
      </label>
    </div>
  );
};
