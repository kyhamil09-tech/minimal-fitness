import React from 'react';
import { usePrefs } from '../lib/prefs';
import { useT } from '../lib/i18n';
import { BAR_CHOICES_KG, BAR_CHOICES_LB, PLATE_CATALOG_KG, PLATE_CATALOG_LB, gearFor } from '../lib/gear';

const Switch: React.FC<{ on: boolean; label: string; sub: string; onToggle: () => void }> = ({ on, label, sub, onToggle }) => (
  <button type="button" role="switch" aria-checked={on} className="flex min-h-11 w-full items-center justify-between text-left" style={{ background: 'transparent', border: 0, color: 'var(--l-text)' }} onClick={onToggle}>
    <span>
      <span className="block text-sm font-semibold">{label}</span>
      <span className="l-dim block text-xs">{sub}</span>
    </span>
    <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: on ? 'var(--l-fill)' : 'var(--l-s2)', color: on ? 'var(--l-on-fill)' : 'var(--l-dim-s2)' }}>
      {on ? 'On' : 'Off'}
    </span>
  </button>
);

/** What happens when a rest ends, and keeping the screen on. Shown in the workout's settings and on the Profile tab. */
export const AlertSettings: React.FC = () => {
  const { prefs, setPrefs } = usePrefs();
  const tr = useT();
  const modes: { id: typeof prefs.liftRestAlert; label: string }[] = [
    { id: 'vibrate', label: tr('lift.set.vibrate') },
    { id: 'sound', label: tr('lift.set.beep') },
    { id: 'both', label: tr('lift.set.both') },
    { id: 'silent', label: tr('lift.set.silent') },
  ];
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 text-sm font-semibold">{tr('lift.set.restAlert')}</div>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="When a rest ends">
          {modes.map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={prefs.liftRestAlert === m.id} className="l-chip" onClick={() => setPrefs({ liftRestAlert: m.id })}>
              {m.label}
            </button>
          ))}
        </div>
        <p className="l-dim mt-2 text-xs">The phone does the same from the notification when the app is away.</p>
      </div>
      <Switch on={prefs.liftKeepAwake} label={tr('lift.set.keepAwake')} sub="While a workout is open (uses more battery)" onToggle={() => setPrefs({ liftKeepAwake: !prefs.liftKeepAwake })} />
    </div>
  );
};

/** The barbell and the plates you have, for the plate calculator and the warm-up sets. Kept for the unit you use. */
export const GearSettings: React.FC<{ unit: 'kg' | 'lb' }> = ({ unit }) => {
  const { prefs, setPrefs } = usePrefs();
  const { bar, plates } = gearFor(unit, prefs);
  const catalog = unit === 'lb' ? PLATE_CATALOG_LB : PLATE_CATALOG_KG;
  const choices = unit === 'lb' ? BAR_CHOICES_LB : BAR_CHOICES_KG;
  const setBar = (v: number) => setPrefs(unit === 'lb' ? { liftBarLb: v } : { liftBarKg: v });
  const togglePlate = (p: number) => {
    const next = plates.includes(p) ? plates.filter((x) => x !== p) : [...plates, p];
    if (next.length === 0) return; // at least one plate
    setPrefs(unit === 'lb' ? { liftPlatesLb: next } : { liftPlatesKg: next });
  };
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 text-sm font-semibold">Barbell weight</div>
        <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Barbell weight">
          {choices.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={bar === c} className="l-chip" onClick={() => setBar(c)}>
              {c} {unit}
            </button>
          ))}
          <label className="flex items-center gap-1.5 text-sm">
            <span className="l-dim">Other</span>
            <input
              aria-label={`Barbell weight in ${unit}`}
              inputMode="decimal"
              className="l-num-input !h-10 !w-20"
              defaultValue={choices.includes(bar) ? '' : String(bar)}
              placeholder={String(bar)}
              onFocus={(e) => e.target.select()}
              onChange={(e) => {
                const v = parseFloat(e.target.value.replace(',', '.'));
                if (Number.isFinite(v) && v >= 0 && v <= (unit === 'lb' ? 135 : 60)) setBar(v);
              }}
            />
          </label>
        </div>
      </div>
      <div>
        <div className="mb-2 text-sm font-semibold">Plates you have</div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Plates you have">
          {catalog.map((p) => (
            <button key={p} type="button" className="l-chip" aria-pressed={plates.includes(p)} onClick={() => togglePlate(p)}>
              {p} {unit}
            </button>
          ))}
        </div>
        <p className="l-dim mt-2 text-xs">The plate calculator only uses these, in pairs, so the bar is always loaded evenly.</p>
      </div>
    </div>
  );
};

/** Reminders for the days routines are scheduled (set the days on each routine). */
export const ReminderSettings: React.FC = () => {
  const { prefs, setPrefs } = usePrefs();
  return (
    <div className="space-y-3">
      <Switch on={prefs.liftRemind} label="Training day reminders" sub="A notification on the days you scheduled a routine" onToggle={() => setPrefs({ liftRemind: !prefs.liftRemind })} />
      {prefs.liftRemind && (
        <label className="flex items-center justify-between text-sm">
          <span className="font-semibold">Remind me at</span>
          <input type="time" aria-label="Reminder time" className="h-11 px-3" value={prefs.liftRemindTime} onChange={(e) => e.target.value && setPrefs({ liftRemindTime: e.target.value })} />
        </label>
      )}
    </div>
  );
};
