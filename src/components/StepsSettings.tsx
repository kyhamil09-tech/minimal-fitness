import React, { useState } from 'react';
import { Footprints, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { ColorPalette } from '../types/theme';
import { AutomaticData } from '../hooks/useAutomaticData';
import { usePrefs } from '../lib/prefs';
import { STEP_SOURCES, STEP_SOURCE_HELP, STEP_SOURCE_LABEL, StepSource, resolveDay } from '../lib/steps';
import { addDays, todayKey } from '../lib/dates';
import { Choice, ChoiceRow, Row } from './ui/SettingsParts';
import { StepPeriods } from './StepPeriods';

interface StepsSettingsProps {
  theme: ColorPalette;
  automation: AutomaticData;
  android: boolean;
}

const DAYS_SHOWN = 14;

const dayLabel = (key: string, today: string) => {
  if (key === today) return 'Today';
  if (key === addDays(today, -1)) return 'Yesterday';
  const d = new Date(`${key}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
};

/** Steps in Settings: which source counts, what each source says today, and a list of recent days to correct or delete. */
export const StepsSettings: React.FC<StepsSettingsProps> = ({ theme, automation, android }) => {
  const { prefs, setPrefs } = usePrefs();
  const { steps, hc, autoSteps, stepOverrides, stepsBySource, setDaySteps } = automation;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const today = todayKey();
  const source = prefs.stepSource;

  const status = !android
    ? 'Automatic step counting works in the Android app. You can still correct or delete days below.'
    : steps && !steps.permission && (source === 'auto' || source === 'phone')
      ? 'Allow physical-activity access so the phone can count your steps.'
      : steps && !steps.sensor && (source === 'auto' || source === 'phone')
        ? 'This phone has no step counter. Choose the watch or Health Connect.'
        : `Today: phone ${steps?.phone ?? 0} · watch ${steps?.watch ?? 0}${hc?.stepsGranted ? ` · Health Connect ${stepsBySource[today]?.hc ?? 0}` : ''}.`;

  const days = Array.from({ length: DAYS_SHOWN }, (_, i) => addDays(today, -i));
  const commit = (date: string) => {
    const n = Math.round(parseFloat(draft));
    if (Number.isFinite(n) && n >= 0) setDaySteps(date, n);
    setEditing(null);
  };

  const small = 'p-2 rounded-lg border border-neutral-700 text-neutral-300 hover:text-white shrink-0';

  return (
    <>
      <Row
        icon={<Footprints className="w-5 h-5 text-sky-300" />}
        title="Steps"
        sub={status}
        action={
          android && steps && !steps.permission && (source === 'auto' || source === 'phone') ? (
            <button onClick={automation.enableSteps} className="px-3 py-1.5 rounded-lg text-xs font-bold text-black shrink-0" style={{ backgroundColor: theme.primary }}>
              Allow
            </button>
          ) : undefined
        }
      />
      <ChoiceRow title="Count steps with" sub={STEP_SOURCE_HELP[source]}>
        <Choice<StepSource>
          label="Step source"
          value={source}
          options={STEP_SOURCES.map((id) => ({ id, label: STEP_SOURCE_LABEL[id] }))}
          onChange={(stepSource) => setPrefs({ stepSource })}
        />
      </ChoiceRow>
      <div className="px-4 py-3">
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="text-xs font-semibold text-neutral-300 hover:text-white">
          {open ? 'Hide step corrections' : 'Correct your steps: edit a day or remove a drive'}
        </button>
        {open && (
          <div className="mt-4 space-y-5">
            <StepPeriods theme={theme} automation={automation} />
            <h4 className="pt-1 text-sm font-semibold text-white">Recent days</h4>
          <ul className="-mt-3 divide-y divide-[#1A1E26]">
            {days.map((date) => {
              const adjusted = date in stepOverrides;
              const auto = resolveDay(stepsBySource[date], source);
              const value = autoSteps[date] ?? 0;
              return (
                <li key={date} className="py-2 flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-neutral-300">{dayLabel(date, today)}</div>
                    {adjusted && <div className="text-[10px] text-amber-300">Set by you · counted {auto.toLocaleString()}</div>}
                  </div>
                  {editing === date ? (
                    <>
                      <input
                        autoFocus
                        inputMode="numeric"
                        aria-label={`Steps for ${dayLabel(date, today)}`}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && commit(date)}
                        className="w-24 px-2 py-1.5 rounded-lg bg-black/60 border border-neutral-700 text-xs text-white tabular-nums"
                      />
                      <button onClick={() => commit(date)} className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-black" style={{ backgroundColor: theme.primary }}>
                        Save
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-sm font-semibold text-white tabular-nums w-16 text-right">{value.toLocaleString()}</span>
                      <button
                        onClick={() => {
                          setEditing(date);
                          setDraft(String(value));
                        }}
                        className={small}
                        aria-label={`Edit steps for ${dayLabel(date, today)}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {adjusted && (
                        <button onClick={() => setDaySteps(date, null)} className={small} aria-label={`Use the counted steps for ${dayLabel(date, today)}`}>
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => setDaySteps(date, 0)}
                        disabled={value === 0 && adjusted}
                        className={`${small} hover:!text-rose-300 disabled:opacity-30`}
                        aria-label={`Delete steps for ${dayLabel(date, today)}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          </div>
        )}
      </div>
    </>
  );
};
